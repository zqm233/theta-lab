"""Portfolio endpoints — accounts, holdings, trades, snapshots."""

from __future__ import annotations

import json
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, HTTPException, Query

from backend.api.schemas import (
    CloseTradeRequest,
    CreateAccountRequest,
    CreateHoldingRequest,
    PositionQuoteRequest,
    UpdateAccountRequest,
    UpdateHoldingRequest,
)
from backend.data.market import MarketDataProvider

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_provider(ticker: str) -> MarketDataProvider:
    try:
        return MarketDataProvider(ticker.upper())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _row_to_holding(r) -> dict:
    return {
        "id": r["id"],
        "accountId": r["account_id"],
        "assetType": r["asset_type"],
        "ticker": r["ticker"],
        "side": r["side"],
        "qty": r["qty"],
        "avgCost": r["avg_cost"],
        "currentPrice": r["current_price"],
        "notes": r["notes"],
        "createdAt": r["created_at"],
        "updatedAt": r["updated_at"],
        "optionType": r["option_type"],
        "strike": r["strike"],
        "expiration": r["expiration"],
    }


def _fetch_live_prices(tickers_by_market: dict[str, set[str]]) -> dict[str, float]:
    """Batch-fetch live prices across markets. Returns {ticker: price}."""
    import ssl
    import urllib.request

    prices: dict[str, float] = {}

    def _fetch_a_share(ticker: str) -> tuple[str, float | None]:
        code = ticker.split(".")[0]
        prefix = "sh" if code.startswith(("6", "5", "9")) else "sz"
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            url = f"https://qt.gtimg.cn/q={prefix}{code}"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=5, context=ctx) as resp:
                text = resp.read().decode("gbk")
            parts = text.split("~")
            return (ticker, float(parts[3])) if len(parts) > 3 else (ticker, None)
        except Exception:
            return (ticker, None)

    def _fetch_crypto(ticker: str) -> tuple[str, float | None]:
        symbol = ticker.split(".")[0].upper()
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            url = f"https://api.binance.com/api/v3/ticker/price?symbol={symbol}USDT"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=5, context=ctx) as resp:
                data = json.loads(resp.read().decode())
            return (ticker, float(data["price"]))
        except Exception:
            return (ticker, None)

    def _fetch_us(ticker: str) -> tuple[str, float | None]:
        try:
            provider = _get_provider(ticker)
            info = provider.get_current_price()
            return (ticker, info.get("price"))
        except Exception:
            return (ticker, None)

    with ThreadPoolExecutor(max_workers=10) as pool:
        futs = []
        for t in tickers_by_market.get("a_stock", set()):
            futs.append(pool.submit(_fetch_a_share, t))
        for t in tickers_by_market.get("crypto", set()):
            futs.append(pool.submit(_fetch_crypto, t))
        for t in tickers_by_market.get("us_stock", set()):
            futs.append(pool.submit(_fetch_us, t))
        for f in futs:
            try:
                tk, price = f.result(timeout=10)
                if price is not None:
                    prices[tk] = price
            except Exception:
                pass

    return prices


# --------------- Portfolio Quotes ---------------

@router.post("/portfolio/quotes")
def get_portfolio_quotes(positions: list[PositionQuoteRequest]):
    """Look up current prices for a batch of option positions."""
    cache: dict[str, dict] = {}
    results: dict[str, float | None] = {}

    for pos in positions:
        cache_key = f"{pos.ticker}|{pos.expiration}"
        if cache_key not in cache:
            try:
                provider = _get_provider(pos.ticker)
                chain = provider.get_options_chain(pos.expiration)
                cache[cache_key] = chain
            except Exception:
                cache[cache_key] = {}

        chain = cache[cache_key]
        side_key = "puts" if pos.type == "put" else "calls"
        contracts = chain.get(side_key, [])
        matched = next(
            (c for c in contracts if abs(c["strike"] - pos.strike) < 0.01),
            None,
        )
        results[pos.id] = matched["lastPrice"] if matched else None

    return {"quotes": results}


# --------------- Trade History ---------------

@router.post("/trades/close")
def close_trade(req: CloseTradeRequest):
    """Record a closed trade and compute realized P&L."""
    from datetime import datetime, timezone as tz
    from backend.db import get_conn

    multiplier = 1 if req.side == "sell" else -1
    pnl = round(multiplier * (req.entry_price - req.exit_price) * req.qty * 100, 2)
    closed_at = datetime.now(tz.utc).isoformat()

    conn = get_conn()
    conn.execute(
        """INSERT INTO trades
           (id, ticker, type, side, strike, qty, entry_price, exit_price,
            expiration, opened_at, closed_at, pnl)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            req.id, req.ticker, req.type, req.side, req.strike, req.qty,
            req.entry_price, req.exit_price, req.expiration,
            req.opened_at, closed_at, pnl,
        ),
    )
    conn.commit()

    return {
        "id": req.id,
        "ticker": req.ticker,
        "type": req.type,
        "side": req.side,
        "strike": req.strike,
        "qty": req.qty,
        "entryPrice": req.entry_price,
        "exitPrice": req.exit_price,
        "expiration": req.expiration,
        "openedAt": req.opened_at,
        "closedAt": closed_at,
        "pnl": pnl,
    }


@router.get("/trades/history")
def get_trade_history():
    """Return all closed trades with summary statistics."""
    from backend.db import get_conn

    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM trades ORDER BY closed_at DESC"
    ).fetchall()

    trades = [
        {
            "id": r["id"],
            "ticker": r["ticker"],
            "type": r["type"],
            "side": r["side"],
            "strike": r["strike"],
            "qty": r["qty"],
            "entryPrice": r["entry_price"],
            "exitPrice": r["exit_price"],
            "expiration": r["expiration"],
            "openedAt": r["opened_at"],
            "closedAt": r["closed_at"],
            "pnl": r["pnl"],
        }
        for r in rows
    ]

    total_pnl = sum(t["pnl"] for t in trades)
    wins = sum(1 for t in trades if t["pnl"] > 0)
    losses = sum(1 for t in trades if t["pnl"] < 0)
    count = len(trades)

    return {
        "trades": trades,
        "summary": {
            "totalPnl": round(total_pnl, 2),
            "tradeCount": count,
            "wins": wins,
            "losses": losses,
            "winRate": round(wins / count * 100, 1) if count else 0,
        },
    }


@router.delete("/trades/{trade_id}")
def delete_trade(trade_id: str):
    """Delete a single trade record."""
    from backend.db import get_conn

    conn = get_conn()
    conn.execute("DELETE FROM trades WHERE id = ?", (trade_id,))
    conn.commit()
    return {"deleted": trade_id}


# --------------- Account Management ---------------

@router.get("/accounts")
def list_accounts():
    from backend.db import get_conn

    conn = get_conn()
    rows = conn.execute("SELECT * FROM accounts ORDER BY created_at DESC").fetchall()
    return {
        "accounts": [
            {
                "id": r["id"],
                "name": r["name"],
                "platform": r["platform"],
                "broker": r["broker"],
                "currency": r["currency"],
                "notes": r["notes"],
                "createdAt": r["created_at"],
                "updatedAt": r["updated_at"],
            }
            for r in rows
        ]
    }


@router.post("/accounts")
def create_account(req: CreateAccountRequest):
    from datetime import datetime, timezone as tz
    from backend.db import get_conn

    now = datetime.now(tz.utc).isoformat()
    account_id = str(uuid.uuid4())
    conn = get_conn()
    conn.execute(
        """INSERT INTO accounts (id, name, platform, broker, currency, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (account_id, req.name, req.platform, req.broker, req.currency, req.notes, now, now),
    )
    conn.commit()
    return {
        "id": account_id,
        "name": req.name,
        "platform": req.platform,
        "broker": req.broker,
        "currency": req.currency,
        "notes": req.notes,
        "createdAt": now,
        "updatedAt": now,
    }


@router.put("/accounts/{account_id}")
def update_account(account_id: str, req: UpdateAccountRequest):
    from datetime import datetime, timezone as tz
    from backend.db import get_conn

    conn = get_conn()
    existing = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Account not found")

    now = datetime.now(tz.utc).isoformat()
    name = req.name if req.name is not None else existing["name"]
    platform = req.platform if req.platform is not None else existing["platform"]
    broker = req.broker if req.broker is not None else existing["broker"]
    currency = req.currency if req.currency is not None else existing["currency"]
    notes = req.notes if req.notes is not None else existing["notes"]

    conn.execute(
        """UPDATE accounts SET name=?, platform=?, broker=?, currency=?, notes=?, updated_at=?
           WHERE id=?""",
        (name, platform, broker, currency, notes, now, account_id),
    )
    conn.commit()
    return {
        "id": account_id,
        "name": name,
        "platform": platform,
        "broker": broker,
        "currency": currency,
        "notes": notes,
        "createdAt": existing["created_at"],
        "updatedAt": now,
    }


@router.delete("/accounts/{account_id}")
def delete_account(account_id: str):
    from backend.db import get_conn

    conn = get_conn()
    conn.execute("DELETE FROM holdings WHERE account_id = ?", (account_id,))
    conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
    conn.commit()
    return {"deleted": account_id}


# --------------- Holdings Management ---------------

@router.get("/holdings")
def list_holdings(account_id: str | None = Query(None)):
    from backend.db import get_conn

    conn = get_conn()
    if account_id:
        rows = conn.execute(
            "SELECT * FROM holdings WHERE account_id = ? ORDER BY created_at DESC",
            (account_id,),
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM holdings ORDER BY created_at DESC").fetchall()
    return {"holdings": [_row_to_holding(r) for r in rows]}


@router.post("/holdings")
def create_holding(req: CreateHoldingRequest):
    from datetime import datetime, timezone as tz
    from backend.db import get_conn

    conn = get_conn()
    acct = conn.execute("SELECT id FROM accounts WHERE id = ?", (req.account_id,)).fetchone()
    if not acct:
        raise HTTPException(status_code=404, detail="Account not found")

    now = datetime.now(tz.utc).isoformat()
    holding_id = str(uuid.uuid4())
    conn.execute(
        """INSERT INTO holdings
           (id, account_id, asset_type, ticker, side, qty, avg_cost, current_price,
            notes, created_at, updated_at, option_type, strike, expiration)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            holding_id, req.account_id, req.asset_type, req.ticker.upper(),
            req.side, req.qty, req.avg_cost, req.current_price,
            req.notes, now, now,
            req.option_type, req.strike, req.expiration,
        ),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM holdings WHERE id = ?", (holding_id,)).fetchone()
    return _row_to_holding(row)


@router.put("/holdings/{holding_id}")
def update_holding(holding_id: str, req: UpdateHoldingRequest):
    from datetime import datetime, timezone as tz
    from backend.db import get_conn

    conn = get_conn()
    existing = conn.execute("SELECT * FROM holdings WHERE id = ?", (holding_id,)).fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Holding not found")

    now = datetime.now(tz.utc).isoformat()
    qty = req.qty if req.qty is not None else existing["qty"]
    avg_cost = req.avg_cost if req.avg_cost is not None else existing["avg_cost"]
    current_price = req.current_price if req.current_price is not None else existing["current_price"]
    side = req.side if req.side is not None else existing["side"]
    notes = req.notes if req.notes is not None else existing["notes"]
    ticker = req.ticker.upper() if req.ticker is not None else existing["ticker"]

    conn.execute(
        """UPDATE holdings SET qty=?, avg_cost=?, current_price=?, side=?, notes=?, ticker=?, updated_at=?
           WHERE id=?""",
        (qty, avg_cost, current_price, side, notes, ticker, now, holding_id),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM holdings WHERE id = ?", (holding_id,)).fetchone()
    return _row_to_holding(row)


@router.delete("/holdings/{holding_id}")
def delete_holding(holding_id: str):
    from backend.db import get_conn

    conn = get_conn()
    conn.execute("DELETE FROM holdings WHERE id = ?", (holding_id,))
    conn.commit()
    return {"deleted": holding_id}


# --------------- Account Summary & Snapshots ---------------

@router.get("/accounts/summary")
def accounts_summary():
    """Per-account asset summary with real-time market value and P&L."""
    from backend.db import get_conn

    conn = get_conn()
    accounts = conn.execute("SELECT * FROM accounts ORDER BY created_at DESC").fetchall()

    all_holdings: dict[str, list[dict]] = {}
    tickers_by_market: dict[str, set[str]] = {"us_stock": set(), "a_stock": set(), "crypto": set()}
    for acct in accounts:
        rows = conn.execute(
            "SELECT * FROM holdings WHERE account_id = ?", (acct["id"],)
        ).fetchall()
        holdings_list = [dict(r) for r in rows]
        all_holdings[acct["id"]] = holdings_list
        for h in holdings_list:
            market = "crypto" if h["asset_type"] == "crypto" else (
                "a_stock" if acct["platform"] == "a_stock" else "us_stock"
            )
            tickers_by_market[market].add(h["ticker"])

    live_prices = _fetch_live_prices(tickers_by_market)

    result = []
    for acct in accounts:
        holdings = all_holdings[acct["id"]]
        total_cost = 0.0
        total_market = 0.0
        has_market = False
        position_count = len(holdings)

        for h in holdings:
            multiplier = 100 if h["asset_type"] == "option" else 1
            cost = h["avg_cost"] * h["qty"] * multiplier
            total_cost += cost
            price = live_prices.get(h["ticker"]) or h["current_price"]
            if price is not None:
                total_market += price * h["qty"] * multiplier
                has_market = True

        unrealized_pnl = total_market - total_cost if has_market else None

        result.append({
            "id": acct["id"],
            "name": acct["name"],
            "platform": acct["platform"],
            "broker": acct["broker"],
            "currency": acct["currency"],
            "positionCount": position_count,
            "totalCost": round(total_cost, 2),
            "totalMarketValue": round(total_market, 2) if has_market else None,
            "unrealizedPnl": round(unrealized_pnl, 2) if unrealized_pnl is not None else None,
        })

    return {"accounts": result}


@router.post("/portfolio/snapshot")
def record_portfolio_snapshot():
    """Record today's portfolio snapshot (lazy — called on page load)."""
    from datetime import datetime, timezone as tz
    from backend.db import get_conn

    today = datetime.now(tz.utc).strftime("%Y-%m-%d")
    conn = get_conn()

    accounts = conn.execute("SELECT * FROM accounts").fetchall()
    if not accounts:
        return {"recorded": 0}

    existing = conn.execute(
        "SELECT account_id FROM portfolio_snapshots WHERE date = ?", (today,)
    ).fetchall()
    existing_ids = {r["account_id"] for r in existing}

    missing = [a for a in accounts if a["id"] not in existing_ids]
    if not missing:
        return {"recorded": 0, "date": today}

    all_holdings: dict[str, list[dict]] = {}
    tickers_by_market: dict[str, set[str]] = {"us_stock": set(), "a_stock": set(), "crypto": set()}
    for acct in missing:
        rows = conn.execute(
            "SELECT * FROM holdings WHERE account_id = ?", (acct["id"],)
        ).fetchall()
        holdings_list = [dict(r) for r in rows]
        all_holdings[acct["id"]] = holdings_list
        for h in holdings_list:
            market = "crypto" if h["asset_type"] == "crypto" else (
                "a_stock" if acct["platform"] == "a_stock" else "us_stock"
            )
            tickers_by_market[market].add(h["ticker"])

    live_prices = _fetch_live_prices(tickers_by_market)

    recorded = 0
    for acct in missing:
        holdings = all_holdings.get(acct["id"], [])
        total_cost = 0.0
        market_value = 0.0
        for h in holdings:
            m = 100 if h["asset_type"] == "option" else 1
            total_cost += h["avg_cost"] * h["qty"] * m
            price = live_prices.get(h["ticker"]) or h["current_price"]
            if price is not None:
                market_value += price * h["qty"] * m

        conn.execute(
            """INSERT OR REPLACE INTO portfolio_snapshots
               (date, account_id, currency, total_cost, market_value)
               VALUES (?, ?, ?, ?, ?)""",
            (today, acct["id"], acct["currency"], round(total_cost, 2), round(market_value, 2)),
        )
        recorded += 1

    conn.commit()
    return {"recorded": recorded, "date": today}


@router.get("/portfolio/snapshots")
def get_portfolio_snapshots(days: int = Query(90, description="Number of days to look back")):
    """Get historical portfolio snapshots for charting."""
    from datetime import datetime, timedelta, timezone as tz
    from backend.db import get_conn

    conn = get_conn()
    since = (datetime.now(tz.utc) - timedelta(days=days)).strftime("%Y-%m-%d")
    rows = conn.execute(
        """SELECT date, account_id, currency, total_cost, market_value
           FROM portfolio_snapshots
           WHERE date >= ?
           ORDER BY date""",
        (since,),
    ).fetchall()

    by_date: dict[str, dict] = {}
    for r in rows:
        d = r["date"]
        if d not in by_date:
            by_date[d] = {"date": d, "entries": []}
        by_date[d]["entries"].append({
            "accountId": r["account_id"],
            "currency": r["currency"],
            "totalCost": r["total_cost"],
            "marketValue": r["market_value"],
        })

    return {"snapshots": list(by_date.values())}
