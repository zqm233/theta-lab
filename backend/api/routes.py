"""FastAPI routes for the ThetaLab system.

Provides endpoints for options chain, volatility analysis,
sell put strategy analysis, risk assessment, and agent chat.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time as _time
import uuid
from datetime import date, datetime
from typing import Any, AsyncGenerator
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from backend.analysis.risk import check_earnings_risk, generate_risk_summary
from backend.analysis.strategy import analyze_sell_put, theta_decay_comparison
from backend.analysis.volatility import compute_volatility_summary, rolling_hv_series
from backend.data.market import MarketDataProvider

logger = logging.getLogger(__name__)

_hv_cache: dict[tuple[str, str], list[float]] = {}


def _persist_env(env_path, kv: dict[str, str]) -> None:
    """Upsert key=value pairs into a .env file."""
    from pathlib import Path

    path = Path(env_path)
    lines: list[str] = []
    if path.exists():
        lines = path.read_text().splitlines()

    updated_keys: set[str] = set()
    new_lines: list[str] = []
    for line in lines:
        key = line.split("=", 1)[0].strip() if "=" in line else ""
        if key in kv:
            new_lines.append(f'{key}="{kv[key]}"')
            updated_keys.add(key)
        else:
            new_lines.append(line)

    for k, v in kv.items():
        if k not in updated_keys:
            new_lines.append(f'{k}="{v}"')

    path.write_text("\n".join(new_lines) + "\n")

_market_status_cache: dict[str, Any] = {"data": None, "ts": 0.0}
_MARKET_STATUS_TTL = 120  # seconds


def _get_hv_series(ticker: str, provider: MarketDataProvider) -> list[float]:
    """Return cached HV series for today; compute at most once per ticker per day."""
    key = (ticker.upper(), date.today().isoformat())
    if key not in _hv_cache:
        _hv_cache.clear()
        history = provider.get_history(period="1y")
        close_prices = [d["close"] for d in history]
        _hv_cache[key] = rolling_hv_series(close_prices, window=30)
    return _hv_cache[key]

router = APIRouter(prefix="/api")


def _get_provider(ticker: str) -> MarketDataProvider:
    try:
        return MarketDataProvider(ticker.upper())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/price/{ticker}")
def get_price(ticker: str):
    provider = _get_provider(ticker)
    return provider.get_current_price()


@router.get("/prices")
def get_prices_batch(tickers: str = Query(..., description="Comma-separated tickers")):
    """Batch price fetch — single request for multiple tickers."""
    symbols = [s.strip().upper() for s in tickers.split(",") if s.strip()]
    if not symbols:
        return {"prices": {}}
    results: dict[str, dict] = {}
    for sym in symbols:
        try:
            provider = _get_provider(sym)
            results[sym] = provider.get_current_price()
        except Exception:
            results[sym] = {"ticker": sym, "price": None, "error": True}
    return {"prices": results}


@router.get("/market-status")
def get_market_status():
    """US equity market status with 2-minute cache."""
    now = _time.time()
    cached = _market_status_cache
    if cached["data"] and now - cached["ts"] < _MARKET_STATUS_TTL:
        return cached["data"]

    now_et = datetime.now(ZoneInfo("America/New_York"))
    if now_et.weekday() >= 5:
        result = {
            "marketState": "CLOSED",
            "isActive": False,
            "reason": "weekend",
        }
        cached["data"] = result
        cached["ts"] = now
        return result

    try:
        provider = MarketDataProvider("SPY")
        info = provider.get_current_price()
        state = info.get("marketState", "CLOSED")
    except Exception:
        state = "CLOSED"

    is_active = state in ("REGULAR", "PRE", "POST")
    result = {
        "marketState": state,
        "isActive": is_active,
        "reason": "holiday" if not is_active and now_et.weekday() < 5 else None,
    }
    cached["data"] = result
    cached["ts"] = now
    return result


UNDERLYING_MAP: dict[str, str] = {
    "TSLL": "TSLA",
}


@router.get("/options-chain/{ticker}")
def get_options_chain(
    ticker: str,
    expiration: str | None = Query(None, description="Expiration date YYYY-MM-DD"),
):
    """Fetch the full options chain for a ticker and expiration."""
    provider = _get_provider(ticker)
    chain = provider.get_options_chain(expiration)
    if "error" in chain:
        raise HTTPException(status_code=404, detail=chain["error"])

    try:
        puts = chain.get("puts", [])
        atm_puts = _find_atm_options(puts, chain["currentPrice"])
        current_iv = atm_puts[0]["impliedVolatility"] if atm_puts else None
        if current_iv:
            from backend.analysis.volatility import iv_rank as calc_iv_rank
            hv_series = _get_hv_series(ticker, provider)
            chain["ivRank"] = calc_iv_rank(current_iv, hv_series)
        else:
            chain["ivRank"] = None
    except Exception:
        chain["ivRank"] = None

    underlying = UNDERLYING_MAP.get(ticker.upper())
    if underlying:
        try:
            ul_provider = _get_provider(underlying)
            earnings = ul_provider.get_earnings_dates(limit=4)
            chain["earningsWarning"] = _check_earnings_proximity(earnings)
            chain["underlying"] = underlying
        except Exception:
            chain["earningsWarning"] = None
            chain["underlying"] = underlying
    else:
        try:
            earnings = provider.get_earnings_dates(limit=4)
            chain["earningsWarning"] = _check_earnings_proximity(earnings)
        except Exception:
            chain["earningsWarning"] = None

    return chain


def _check_earnings_proximity(earnings: list[dict], threshold_days: int = 10) -> dict | None:
    """Check if next earnings date is within threshold_days."""
    from datetime import datetime
    now = datetime.now()
    for e in earnings:
        try:
            dt = datetime.strptime(e["date"], "%Y-%m-%d %H:%M")
            days_until = (dt - now).days
            if days_until >= 0:
                return {
                    "date": e["date"],
                    "daysUntil": days_until,
                    "isClose": days_until <= threshold_days,
                }
        except Exception:
            continue
    return None


class PositionQuoteRequest(BaseModel):
    ticker: str
    expiration: str
    strike: float
    type: str  # "put" or "call"
    id: str


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

class CloseTradeRequest(BaseModel):
    id: str
    ticker: str
    type: str
    side: str
    strike: float
    qty: int
    entry_price: float
    exit_price: float
    expiration: str
    opened_at: str


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

class CreateAccountRequest(BaseModel):
    name: str
    platform: str
    broker: str = ""
    currency: str = "USD"
    notes: str = ""


class UpdateAccountRequest(BaseModel):
    name: str | None = None
    platform: str | None = None
    broker: str | None = None
    currency: str | None = None
    notes: str | None = None


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

class CreateHoldingRequest(BaseModel):
    account_id: str
    asset_type: str
    ticker: str
    side: str = "long"
    qty: float
    avg_cost: float = 0
    current_price: float | None = None
    notes: str = ""
    option_type: str | None = None
    strike: float | None = None
    expiration: str | None = None


class UpdateHoldingRequest(BaseModel):
    qty: float | None = None
    avg_cost: float | None = None
    current_price: float | None = None
    side: str | None = None
    notes: str | None = None
    ticker: str | None = None


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


def _fetch_live_prices(tickers_by_market: dict[str, set[str]]) -> dict[str, float]:
    """Batch-fetch live prices across markets. Returns {ticker: price}."""
    import urllib.request
    import ssl
    from concurrent.futures import ThreadPoolExecutor

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


@router.get("/exchange-rate")
def get_exchange_rate():
    """Get current USD/CNY exchange rate (cached 1h)."""
    import time
    import urllib.request
    import ssl

    cache = getattr(get_exchange_rate, "_cache", None)
    if cache and time.time() - cache["ts"] < 3600:
        return cache["data"]

    rate = 7.25  # fallback
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        url = "https://open.er-api.com/v6/latest/USD"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=5, context=ctx) as resp:
            data = json.loads(resp.read().decode())
            if data.get("result") == "success":
                rate = data["rates"].get("CNY", rate)
    except Exception:
        pass

    result = {"usdToCny": round(rate, 4), "cnyToUsd": round(1 / rate, 6)}
    get_exchange_rate._cache = {"ts": time.time(), "data": result}
    return result


@router.get("/quote")
def get_quote(
    ticker: str = Query(..., description="Ticker symbol"),
    market: str = Query("us_stock", description="Market: us_stock / a_stock / crypto"),
):
    """Get current price for any market. Lightweight single-ticker lookup."""
    import urllib.request
    import ssl

    ticker = ticker.strip()
    if not ticker:
        raise HTTPException(status_code=400, detail="ticker required")

    if market == "a_stock":
        code = ticker.split(".")[0]
        exchange = ticker.split(".")[-1].lower() if "." in ticker else ""
        prefix = "sh" if exchange == "sh" or code.startswith(("6", "5", "9")) else "sz"
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            url = f"https://qt.gtimg.cn/q={prefix}{code}"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=5, context=ctx) as resp:
                text = resp.read().decode("gbk")
            parts = text.split("~")
            if len(parts) > 3:
                price = float(parts[3])
                name = parts[1]
                return {"ticker": ticker, "name": name, "price": price}
        except Exception:
            pass
        return {"ticker": ticker, "price": None}

    elif market == "crypto":
        symbol = ticker.split(".")[0].upper()
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            url = f"https://api.binance.com/api/v3/ticker/price?symbol={symbol}USDT"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=5, context=ctx) as resp:
                data = json.loads(resp.read().decode())
            return {"ticker": symbol, "price": float(data["price"])}
        except Exception:
            pass
        return {"ticker": symbol, "price": None}

    else:
        try:
            provider = _get_provider(ticker)
            info = provider.get_current_price()
            return {"ticker": ticker.upper(), "price": info.get("price"), "name": info.get("name", "")}
        except Exception:
            return {"ticker": ticker.upper(), "price": None}


@router.get("/securities/search")
def search_securities(
    q: str = Query(..., description="Search query"),
    market: str = Query("us_stock", description="Market: us_stock / a_stock / crypto"),
):
    """Search for securities by code, name, or abbreviation."""
    from backend.data.securities import search_securities as do_search

    if len(q.strip()) < 1:
        return {"results": []}
    results = do_search(q, market, limit=10)
    return {"results": results}


@router.get("/expirations/{ticker}")
def get_expirations(ticker: str):
    provider = _get_provider(ticker)
    dates = provider.get_expiration_dates()
    return {"ticker": ticker.upper(), "expirations": dates}


@router.get("/volatility/{ticker}")
def get_volatility(ticker: str):
    """Full volatility analysis: IV Rank, IV Percentile, HV, IV-HV Spread."""
    provider = _get_provider(ticker)

    hv_series = _get_hv_series(ticker, provider)
    history = provider.get_history(period="1y")
    if not history:
        raise HTTPException(status_code=404, detail="No historical data available")

    close_prices = [d["close"] for d in history]

    chain = provider.get_options_chain()
    if "error" in chain:
        raise HTTPException(status_code=404, detail="No options data for volatility analysis")

    puts = chain.get("puts", [])
    atm_puts = _find_atm_options(puts, chain["currentPrice"])
    if not atm_puts:
        raise HTTPException(status_code=404, detail="Cannot determine ATM IV")

    current_iv = atm_puts[0]["impliedVolatility"]

    summary = compute_volatility_summary(close_prices, current_iv, cached_hv_series=hv_series)
    summary["ticker"] = ticker.upper()
    summary["currentPrice"] = chain["currentPrice"]
    return summary


@router.get("/sell-put-analysis/{ticker}")
def get_sell_put_analysis(
    ticker: str,
    strike: float = Query(..., description="Strike price"),
    expiration: str | None = Query(None, description="Expiration date YYYY-MM-DD"),
):
    """Comprehensive Sell Put analysis for a specific strike."""
    provider = _get_provider(ticker)
    chain = provider.get_options_chain(expiration)
    if "error" in chain:
        raise HTTPException(status_code=404, detail=chain["error"])

    puts = chain.get("puts", [])
    target_put = next((p for p in puts if abs(p["strike"] - strike) < 0.01), None)
    if not target_put:
        available = [p["strike"] for p in puts]
        raise HTTPException(
            status_code=404,
            detail=f"Strike {strike} not found. Available: {available[:10]}...",
        )

    premium = target_put["bid"] if target_put["bid"] > 0 else target_put["lastPrice"]
    iv = target_put["impliedVolatility"]
    dte = chain["daysToExpiry"]
    spot = chain["currentPrice"]

    analysis = analyze_sell_put(spot, strike, premium, dte, iv)

    earnings = provider.get_earnings_dates()
    earnings_risk = check_earnings_risk(earnings, chain["expiration"])

    hv_series = _get_hv_series(ticker, provider)
    history = provider.get_history(period="1y")
    close_prices = [d["close"] for d in history]
    vol_summary = compute_volatility_summary(close_prices, iv, cached_hv_series=hv_series)

    risk_alerts = generate_risk_summary(
        vol_summary.get("ivRank"),
        vol_summary.get("ivPercentile"),
        earnings_risk,
        analysis["safetyCushion"]["percent"],
    )

    return {
        **analysis,
        "ticker": ticker.upper(),
        "expiration": chain["expiration"],
        "volatility": vol_summary,
        "earningsRisk": earnings_risk,
        "riskAlerts": risk_alerts,
    }


@router.get("/theta-comparison/{ticker}")
def get_theta_comparison(
    ticker: str,
    strike: float = Query(..., description="Strike price"),
):
    """Compare theta decay across multiple expiration windows."""
    provider = _get_provider(ticker)
    price_info = provider.get_current_price()
    spot = price_info["price"]

    expirations = provider.get_expiration_dates()
    if not expirations:
        raise HTTPException(status_code=404, detail="No options expirations available")

    first_chain = provider.get_options_chain(expirations[0])
    if "error" in first_chain:
        raise HTTPException(status_code=404, detail="No options data")
    puts = first_chain.get("puts", [])
    nearest = _find_nearest_strike(puts, strike)
    iv = nearest["impliedVolatility"] if nearest else 0.5

    dte_list = [7, 14, 21, 30, 45, 60]
    comparison = theta_decay_comparison(spot, strike, iv, dte_list)

    return {
        "ticker": ticker.upper(),
        "spot": spot,
        "strike": strike,
        "iv": round(iv, 4),
        "comparison": comparison,
    }


@router.get("/earnings/{ticker}")
def get_earnings(ticker: str):
    provider = _get_provider(ticker)
    dates = provider.get_earnings_dates()
    return {"ticker": ticker.upper(), "earnings": dates}


def _find_atm_options(options: list[dict], spot: float) -> list[dict]:
    if not options:
        return []
    sorted_opts = sorted(options, key=lambda o: abs(o["strike"] - spot))
    return sorted_opts[:3]


def _find_nearest_strike(options: list[dict], target: float) -> dict | None:
    if not options:
        return None
    return min(options, key=lambda o: abs(o["strike"] - target))


# ---------------------------------------------------------------------------
# Agent Chat endpoints
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    message: str
    thread_id: str | None = None
    user_id: str = "default"


def _get_agent():
    from backend.app import get_agent
    try:
        return get_agent()
    except ValueError as e:
        raise HTTPException(
            503,
            f"LLM not configured. Please go to Settings to configure your LLM provider, model, and API key.",
        ) from e


@router.post("/chat")
async def chat(request: ChatRequest):
    """SSE streaming chat with the ThetaLab agent."""
    agent = _get_agent()
    thread_id = request.thread_id or str(uuid.uuid4())

    async def event_stream() -> AsyncGenerator[dict, None]:
        yield {"event": "thread_id", "data": json.dumps({"thread_id": thread_id})}
        try:
            async for item in agent.astream(
                request.message,
                thread_id=thread_id,
                user_id=request.user_id,
            ):
                if item["type"] == "token":
                    yield {"event": "token", "data": json.dumps({"content": item["content"]})}
                elif item["type"] == "confirm":
                    yield {
                        "event": "confirm",
                        "data": json.dumps({
                            "thread_id": thread_id,
                            "tool_calls": item["tool_calls"],
                        }),
                    }
            yield {"event": "done", "data": json.dumps({"status": "ok"})}
        except Exception as exc:
            logger.exception("Chat stream error")
            yield {
                "event": "error",
                "data": json.dumps({"error": str(exc)}),
            }

    return EventSourceResponse(event_stream())


class ConfirmRequest(BaseModel):
    thread_id: str
    approved: bool
    user_id: str = "default"


@router.post("/chat/confirm")
async def chat_confirm(request: ConfirmRequest):
    """Resume agent execution after human-in-the-loop confirmation."""
    agent = _get_agent()

    async def event_stream() -> AsyncGenerator[dict, None]:
        try:
            async for item in agent.astream_resume(
                thread_id=request.thread_id,
                user_id=request.user_id,
                approved=request.approved,
            ):
                if item["type"] == "token":
                    yield {"event": "token", "data": json.dumps({"content": item["content"]})}
                elif item["type"] == "confirm":
                    yield {
                        "event": "confirm",
                        "data": json.dumps({
                            "thread_id": request.thread_id,
                            "tool_calls": item["tool_calls"],
                        }),
                    }
            yield {"event": "done", "data": json.dumps({"status": "ok"})}
        except Exception as exc:
            logger.exception("Chat confirm stream error")
            yield {
                "event": "error",
                "data": json.dumps({"error": str(exc)}),
            }

    return EventSourceResponse(event_stream())


@router.get("/chat/history/{thread_id}")
async def get_chat_history(thread_id: str):
    agent = _get_agent()
    history = await agent.get_history(thread_id)
    return {"thread_id": thread_id, "messages": history}


@router.get("/profile")
def get_profile(user_id: str = "default"):
    agent = _get_agent()
    profile = agent.get_profile(user_id)
    return {"user_id": user_id, "profile": profile}


@router.post("/profile/reset")
def reset_profile(user_id: str = "default"):
    agent = _get_agent()
    from backend.agent.memory import DEFAULT_PROFILE, PROFILE_KEY, PROFILE_NAMESPACE
    ns = (*PROFILE_NAMESPACE, user_id)
    agent.store.put(ns, PROFILE_KEY, {**DEFAULT_PROFILE})
    return {"user_id": user_id, "profile": DEFAULT_PROFILE}


# ── Dual Investment (Binance + OKX) ──────────────────────────────────


@router.get("/dual-invest/status")
def dual_invest_status():
    """Check which exchange APIs are configured."""
    from backend.data.binance import check_binance_configured
    from backend.data.okx import check_okx_configured
    return {
        "binance": check_binance_configured(),
        "okx": check_okx_configured(),
        "configured": check_binance_configured() or check_okx_configured(),
    }


@router.get("/dual-invest/products")
def dual_invest_products(
    coin: str = Query("BTC", description="Crypto asset, e.g. BTC, ETH"),
    direction: str = Query("buy_low", description="buy_low or sell_high"),
    exchange: str = Query("binance", description="binance or okx"),
):
    """Fetch Dual Investment products from Binance or OKX."""
    if direction not in ("buy_low", "sell_high"):
        raise HTTPException(400, "direction must be buy_low or sell_high")

    if exchange == "okx":
        from backend.data.okx import OkxConfigError, get_dual_investment_products as okx_products
        opt_type = "P" if direction == "buy_low" else "C"
        try:
            products = okx_products(coin.upper(), "USDT", opt_type)
            return {"coin": coin.upper(), "direction": direction, "exchange": "okx", "products": products}
        except OkxConfigError as e:
            raise HTTPException(400, str(e))
        except Exception as e:
            logger.exception("OKX dual invest error")
            raise HTTPException(502, f"OKX API error: {e}")
    else:
        from backend.data.binance import BinanceConfigError, get_dual_investment_products as bn_products
        try:
            products = bn_products(coin.upper(), direction)
            return {"coin": coin.upper(), "direction": direction, "exchange": "binance", "products": products}
        except BinanceConfigError as e:
            raise HTTPException(400, str(e))
        except Exception as e:
            logger.exception("Binance dual invest error")
            raise HTTPException(502, f"Binance API error: {e}")


@router.post("/dual-invest/configure")
def dual_invest_configure(body: dict):
    """Save exchange API credentials to .env and environment."""
    from pathlib import Path

    exchange = body.get("exchange", "binance")
    env_path = Path(__file__).resolve().parent.parent.parent / ".env"

    if exchange == "okx":
        api_key = body.get("apiKey", "").strip()
        api_secret = body.get("apiSecret", "").strip()
        passphrase = body.get("passphrase", "").strip()
        if not api_key or not api_secret or not passphrase:
            raise HTTPException(400, "apiKey, apiSecret, and passphrase are required for OKX")
        os.environ["OKX_API_KEY"] = api_key
        os.environ["OKX_API_SECRET"] = api_secret
        os.environ["OKX_PASSPHRASE"] = passphrase
        _persist_env(env_path, {
            "OKX_API_KEY": api_key,
            "OKX_API_SECRET": api_secret,
            "OKX_PASSPHRASE": passphrase,
        })
        from backend.data.okx import check_okx_configured
        return {"exchange": "okx", "configured": check_okx_configured()}
    else:
        api_key = body.get("apiKey", "").strip()
        api_secret = body.get("apiSecret", "").strip()
        if not api_key or not api_secret:
            raise HTTPException(400, "apiKey and apiSecret are required")
        os.environ["BINANCE_API_KEY"] = api_key
        os.environ["BINANCE_API_SECRET"] = api_secret
        _persist_env(env_path, {
            "BINANCE_API_KEY": api_key,
            "BINANCE_API_SECRET": api_secret,
        })
        from backend.data.binance import check_binance_configured
        return {"exchange": "binance", "configured": check_binance_configured()}


# ── OKX Account & DCD Orders ─────────────────────────────────────────


@router.get("/okx/balance")
def okx_balance(ccy: str = Query("", description="Currency filter, e.g. USDT")):
    """Return OKX funding account balance."""
    from backend.data.okx import OkxConfigError, get_funding_balance

    try:
        balances = get_funding_balance(ccy)
        return {"balances": balances}
    except OkxConfigError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("OKX balance error")
        raise HTTPException(502, f"OKX API error: {e}")


@router.get("/okx/dcd/orders")
def okx_dcd_orders(state: str = Query("", description="live, filled, expired, canceled")):
    """Return OKX DCD orders."""
    from backend.data.okx import OkxConfigError, get_dcd_orders

    try:
        orders = get_dcd_orders(state)
        return {"orders": orders}
    except OkxConfigError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("OKX DCD orders error")
        raise HTTPException(502, f"OKX API error: {e}")


# ── LLM Configuration ──────────────────────────────────────────────

_SUPPORTED_PROVIDERS = ["google", "openai", "anthropic"]
_PROVIDER_API_KEY_ENV = {
    "google": "GOOGLE_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
}


@router.get("/llm/config")
def get_llm_config():
    """Return current LLM configuration (API key is masked)."""
    provider = os.getenv("LLM_PROVIDER", "").lower()
    model = os.getenv("LLM_MODEL", "")
    base_url = os.getenv("LLM_BASE_URL", "")
    api_key_env = _PROVIDER_API_KEY_ENV.get(provider, "")
    has_key = bool(os.getenv(api_key_env, ""))
    configured = bool(provider and model and has_key)
    return {
        "provider": provider,
        "model": model,
        "baseUrl": base_url,
        "configured": configured,
        "supportedProviders": _SUPPORTED_PROVIDERS,
    }


class LLMConfigRequest(BaseModel):
    provider: str
    model: str = ""
    apiKey: str = ""
    baseUrl: str = ""


@router.post("/llm/config")
def set_llm_config(body: LLMConfigRequest):
    """Update LLM provider, model, API key, and optional base URL."""
    from pathlib import Path

    provider = body.provider.lower().strip()
    if provider not in _SUPPORTED_PROVIDERS:
        raise HTTPException(
            400,
            f"Unsupported provider: '{provider}'. Supported: {', '.join(_SUPPORTED_PROVIDERS)}",
        )

    env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    env_updates: dict[str, str] = {
        "LLM_PROVIDER": provider,
    }

    if body.model.strip():
        env_updates["LLM_MODEL"] = body.model.strip()
        os.environ["LLM_MODEL"] = body.model.strip()

    if body.baseUrl.strip():
        env_updates["LLM_BASE_URL"] = body.baseUrl.strip()
        os.environ["LLM_BASE_URL"] = body.baseUrl.strip()
    else:
        os.environ.pop("LLM_BASE_URL", None)

    if body.apiKey.strip():
        key_env = _PROVIDER_API_KEY_ENV[provider]
        env_updates[key_env] = body.apiKey.strip()
        os.environ[key_env] = body.apiKey.strip()

    os.environ["LLM_PROVIDER"] = provider
    _persist_env(env_path, env_updates)

    from backend.app import reset_agent
    reset_agent()

    has_key = bool(os.getenv(_PROVIDER_API_KEY_ENV[provider], ""))
    return {
        "provider": provider,
        "model": body.model.strip(),
        "baseUrl": body.baseUrl.strip(),
        "configured": has_key,
    }


@router.post("/llm/test")
async def test_llm_connection():
    """Send a minimal prompt to verify LLM connectivity and return latency."""
    import time
    from backend.agent.agent import _create_llm

    try:
        llm = _create_llm()
    except ValueError as e:
        raise HTTPException(400, str(e))

    start = time.monotonic()
    try:
        resp = await llm.ainvoke("Say OK")
        latency_ms = int((time.monotonic() - start) * 1000)
        content = resp.content if hasattr(resp, "content") else str(resp)
        return {"ok": True, "latency_ms": latency_ms, "reply": content[:100]}
    except Exception as e:
        latency_ms = int((time.monotonic() - start) * 1000)
        msg = str(e)
        if len(msg) > 300:
            msg = msg[:300] + "..."
        return {"ok": False, "latency_ms": latency_ms, "error": msg}


# ── OKX MCP Configuration ────────────────────────────────────────

@router.get("/okx-mcp/config")
def get_okx_mcp_config():
    """Return current OKX MCP access level."""
    from backend.agent.mcp_tools import DEFAULT_ACCESS
    access = os.environ.get("OKX_MCP_ACCESS", DEFAULT_ACCESS)
    return {"access": access}


class OkxMcpConfigRequest(BaseModel):
    access: str = "readonly"


@router.post("/okx-mcp/config")
async def set_okx_mcp_config(body: OkxMcpConfigRequest):
    """Update OKX MCP access level, then reload tools."""
    from pathlib import Path
    from backend.agent.mcp_tools import reinit_mcp_tools
    from backend.app import reset_agent

    if body.access not in ("readonly", "full"):
        raise HTTPException(400, "access must be 'readonly' or 'full'")

    os.environ["OKX_MCP_ACCESS"] = body.access

    env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    _persist_env(env_path, {"OKX_MCP_ACCESS": body.access})

    tools = await reinit_mcp_tools()
    reset_agent()

    return {
        "access": body.access,
        "toolCount": len(tools),
        "tools": [t.name for t in tools],
    }
