"""OKX API client.

Covers Dual Investment (DCD) product listings, funding account balance,
and DCD order queries via OKX REST API with HMAC-SHA256 signed requests.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

import requests

logger = logging.getLogger(__name__)

OKX_BASE_URL = "https://www.okx.com"

_product_cache: dict[str, Any] = {}
_pairs_cache: dict[str, Any] = {"data": None, "ts": 0.0}
_balance_cache: dict[str, Any] = {}
_CACHE_TTL = 120
_BALANCE_CACHE_TTL = 30


class OkxConfigError(Exception):
    """Raised when OKX API credentials are missing."""


def _get_credentials() -> tuple[str, str, str]:
    api_key = os.environ.get("OKX_API_KEY", "")
    api_secret = os.environ.get("OKX_API_SECRET", "")
    passphrase = os.environ.get("OKX_PASSPHRASE", "")
    if not api_key or not api_secret or not passphrase:
        raise OkxConfigError(
            "OKX_API_KEY, OKX_API_SECRET, and OKX_PASSPHRASE must be set"
        )
    return api_key, api_secret, passphrase


def _sign(timestamp: str, method: str, path: str, body: str, secret: str) -> str:
    msg = timestamp + method + path + body
    mac = hmac.new(secret.encode(), msg.encode(), hashlib.sha256)
    return base64.b64encode(mac.digest()).decode()


def _signed_get(path: str, params: dict[str, str] | None = None) -> dict:
    api_key, api_secret, passphrase = _get_credentials()
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

    query = ""
    if params:
        query = "?" + "&".join(f"{k}={v}" for k, v in params.items())
    full_path = path + query

    sig = _sign(ts, "GET", full_path, "", api_secret)

    resp = requests.get(
        f"{OKX_BASE_URL}{full_path}",
        headers={
            "OK-ACCESS-KEY": api_key,
            "OK-ACCESS-SIGN": sig,
            "OK-ACCESS-TIMESTAMP": ts,
            "OK-ACCESS-PASSPHRASE": passphrase,
            "Content-Type": "application/json",
        },
        timeout=15,
    )
    if not resp.ok:
        snippet = (resp.text or "")[:800]
        logger.error("OKX HTTP %s → %s %s", full_path, resp.status_code, snippet)
        raise Exception(f"OKX HTTP {resp.status_code} for {full_path}: {snippet}")
    result = resp.json()
    if str(result.get("code", "")) not in ("0", ""):
        logger.error("OKX API error: %s", result)
        raise Exception(
            f"OKX API error: code={result.get('code')}, msg={result.get('msg')}"
        )
    return result


def get_currency_pairs() -> list[dict[str, str]]:
    """Fetch available dual investment currency pairs."""
    cached = _pairs_cache
    if cached["data"] and time.time() - cached["ts"] < _CACHE_TTL:
        return cached["data"]

    result = _signed_get("/api/v5/finance/sfp/dcd/currency-pair")
    raw_data = result.get("data", [])
    pairs = raw_data if isinstance(raw_data, list) else raw_data.get("pairs", [])
    cached["data"] = pairs
    cached["ts"] = time.time()
    return pairs


def get_dual_investment_products(
    base_ccy: str = "BTC",
    quote_ccy: str = "USDT",
    opt_type: str = "P",
) -> list[dict[str, Any]]:
    """Fetch OKX Dual Investment product list.

    Args:
        base_ccy: Base currency (e.g. BTC, ETH).
        quote_ccy: Quote currency (e.g. USDT).
        opt_type: 'P' for put (buy low) or 'C' for call (sell high).

    Returns:
        List of products with normalized fields.
    """
    cache_key = f"okx:{base_ccy}:{quote_ccy}:{opt_type}"
    cached = _product_cache.get(cache_key)
    if cached and time.time() - cached["ts"] < _CACHE_TTL:
        return cached["data"]

    params = {
        "baseCcy": base_ccy.upper(),
        "quoteCcy": quote_ccy.upper(),
        "optType": opt_type.upper(),
    }
    result = _signed_get("/api/v5/finance/sfp/dcd/products", params)
    raw_data = result.get("data", [])
    products = raw_data.get("products", []) if isinstance(raw_data, dict) else raw_data

    direction = "buy_low" if opt_type.upper() == "P" else "sell_high"
    normalized = []
    for p in products:
        exp_ts = int(p.get("expTime", 0))
        settle_date = (
            datetime.fromtimestamp(exp_ts / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
            if exp_ts
            else ""
        )
        list_ts = int(p.get("listTime", 0))
        now_ms = int(time.time() * 1000)
        duration_days = max(round((exp_ts - now_ms) / 86_400_000), 0) if exp_ts else 0

        apr = float(p.get("annualizedYield", 0))
        abs_yield = float(p.get("absYield", 0))

        trade_end_ts = int(p.get("tradeEndTime", 0))
        can_purchase = trade_end_ts > now_ms if trade_end_ts else False

        normalized.append({
            "id": p.get("productId", ""),
            "coin": base_ccy.upper(),
            "direction": direction,
            "optionType": "PUT" if opt_type.upper() == "P" else "CALL",
            "investCoin": p.get("notionalCcy", ""),
            "exercisedCoin": base_ccy.upper() if opt_type.upper() == "P" else quote_ccy.upper(),
            "strikePrice": float(p.get("strike", 0)),
            "apr": apr,
            "aprPercent": round(apr * 100, 2),
            "absYield": abs_yield,
            "duration": duration_days,
            "settleDate": settle_date,
            "minAmount": float(p.get("minSize", 0)),
            "maxAmount": float(p.get("maxSize", 0)),
            "stepSize": float(p.get("stepSz", 0)) or float(p.get("minSize", 0)) or 0.0001,
            "canPurchase": can_purchase,
        })

    normalized.sort(key=lambda x: x["strikePrice"])
    _product_cache[cache_key] = {"data": normalized, "ts": time.time()}
    return normalized


def get_dual_investment_summary(base_ccy: str = "BTC", quote_ccy: str = "USDT") -> dict[str, Any]:
    """Fetch both buy-low and sell-high products and return a combined summary."""
    buy_low = get_dual_investment_products(base_ccy, quote_ccy, "P")
    sell_high = get_dual_investment_products(base_ccy, quote_ccy, "C")

    return {
        "coin": base_ccy.upper(),
        "exchange": "okx",
        "buyLow": buy_low,
        "sellHigh": sell_high,
        "buyLowCount": len(buy_low),
        "sellHighCount": len(sell_high),
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
    }


def get_funding_balance(ccy: str = "") -> list[dict[str, Any]]:
    """Fetch funding account balances from OKX.

    Args:
        ccy: Optional currency filter (e.g. "USDT"). Empty returns all.

    Returns:
        List of {ccy, bal, availBal, frozenBal}.
    """
    cache_key = f"balance:{ccy}"
    cached = _balance_cache.get(cache_key)
    if cached and time.time() - cached["ts"] < _BALANCE_CACHE_TTL:
        return cached["data"]

    params = {}
    if ccy:
        params["ccy"] = ccy.upper()
    result = _signed_get("/api/v5/asset/balances", params or None)
    raw = result.get("data", [])

    normalized = []
    for item in raw:
        normalized.append({
            "ccy": item.get("ccy", ""),
            "bal": float(item.get("bal", 0)),
            "availBal": float(item.get("availBal", 0)),
            "frozenBal": float(item.get("frozenBal", 0)),
        })

    _balance_cache[cache_key] = {"data": normalized, "ts": time.time()}
    return normalized


def _okx_float(value: Any) -> float:
    """Parse OKX numeric fields (often strings)."""
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def _dcd_order_rows_from_response_data(data: Any) -> list[dict[str, Any]]:
    """Normalize ``data`` from OKX ``/dcd/...`` responses to a list of order dicts."""
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict):
        inner = data.get("orders") or data.get("orderList")
        if isinstance(inner, list):
            return [x for x in inner if isinstance(x, dict)]
    return []


def _dcd_invest_amount(o: dict[str, Any]) -> float:
    """OKX uses different keys on active vs history DCD rows."""
    for key in (
        "notionalSz",
        "sz",
        "investAmt",
        "amt",
        "notional",
        "purchaseAmt",
        "accFillSz",
    ):
        if key not in o:
            continue
        raw = o.get(key)
        if raw is None or (isinstance(raw, str) and not raw.strip()):
            continue
        v = _okx_float(raw)
        if v > 0:
            return v
    return 0.0


def _dcd_invest_ccy(o: dict[str, Any]) -> str:
    for key in ("notionalCcy", "investCcy", "depositCcy", "ccy", "linkedCcy"):
        v = o.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return ""


def _pick_sz_ccy(
    o: dict[str, Any],
    sz_key: str,
    ccy_key: str | None,
    fallback_ccy: str,
) -> tuple[float, str] | None:
    raw = o.get(sz_key)
    if raw is None or (isinstance(raw, str) and not str(raw).strip()):
        return None
    v = _okx_float(raw)
    if v <= 0:
        return None
    if ccy_key:
        c = o.get(ccy_key)
        if isinstance(c, str) and c.strip():
            return v, c.strip()
    return v, fallback_ccy


def _dcd_sell_high_invest_btc(o: dict[str, Any], base: str) -> tuple[float, str]:
    """高卖：总投入 = 卖出的标的币数量（base），不要用 USDT 名义误当本金。"""
    b = base.upper()
    ns = _okx_float(o.get("notionalSz", 0))
    nc = (o.get("notionalCcy") or "").strip().upper()
    if ns > 0 and nc == b:
        return ns, b
    if ns > 0 and not nc:
        return ns, b

    for sk, ck in (("baseSz", "baseCcy"),):
        got = _pick_sz_ccy(o, sk, ck, b)
        if got:
            return got

    raw_sz = o.get("sz")
    if raw_sz is not None and str(raw_sz).strip():
        v = _okx_float(raw_sz)
        if v > 0:
            c = (o.get("ccy") or "").strip().upper()
            if not c or c == b:
                return v, b

    for k in ("frozeSz", "ordSz", "accFillSz", "investAmt", "amt", "purchaseAmt"):
        got = _pick_sz_ccy(o, k, None, b)
        if got:
            return got[0], b

    return 0.0, b


def _dcd_buy_low_invest(
    o: dict[str, Any], base: str, quote: str
) -> tuple[float, str]:
    """低买：本金多在报价币（USDT）。"""
    b, q = base.upper(), quote.upper()
    amt = _dcd_invest_amount(o)
    ccy = _dcd_invest_ccy(o)
    if amt > 0:
        return amt, (ccy or q)

    for sz_key, ccy_key, fb in (
        ("quoteSz", "quoteCcy", q),
        ("notionalSz", "notionalCcy", q),
        ("baseSz", "baseCcy", b),
    ):
        got = _pick_sz_ccy(o, sz_key, ccy_key, fb)
        if got:
            return got

    raw_sz = o.get("sz")
    if raw_sz is not None and str(raw_sz).strip():
        v = _okx_float(raw_sz)
        if v > 0:
            c = (o.get("ccy") or "").strip().upper()
            if isinstance(c, str) and c.strip():
                return v, c
            return v, q
    return 0.0, q


def _dcd_invest_amount_and_ccy(
    o: dict[str, Any],
    *,
    opt_type: str,
    coin: str,
    quote_ccy: str,
) -> tuple[float, str]:
    base = (coin or "BTC").upper()
    quote = (quote_ccy or "USDT").upper()
    if opt_type == "C":
        return _dcd_sell_high_invest_btc(o, base)
    return _dcd_buy_low_invest(o, base, quote)


def _dcd_expected_profit_and_ccy(
    o: dict[str, Any],
    *,
    opt_type: str,
    base: str,
    quote: str,
    invest_amt: float,
    invest_ccy: str,
    apr: float,
    duration_days: int,
    invest_unknown: bool,
) -> tuple[float, str]:
    """预期收益币种：高卖用 BTC（订单里给的回报）；低买多用报价币。"""
    b, q = base.upper(), quote.upper()
    if opt_type == "C":
        ay = _okx_float(o.get("absYield", 0))
        if ay > 0:
            return round(ay, 8), b
        for amt_key, ccy_key in (
            ("estimatedInterest", "interestCcy"),
            ("estInterest", "interestCcy"),
            ("preInterest", "interestCcy"),
            ("interest", "interestCcy"),
            ("settleInterest", "interestCcy"),
        ):
            raw = o.get(amt_key)
            if raw is None or (isinstance(raw, str) and not str(raw).strip()):
                continue
            p = _okx_float(raw)
            if p <= 0:
                continue
            ic = (o.get(ccy_key) or "").strip().upper()
            if not ic or ic == b:
                return round(p, 8), b
        if (
            not invest_unknown
            and invest_ccy.upper() == b
            and invest_amt > 0
            and apr > 0
            and duration_days > 0
        ):
            return round(invest_amt * apr * (duration_days / 365), 8), b
        return 0.0, b

    for key in ("estimatedInterest", "estInterest", "preInterest", "interest", "settleInterest"):
        raw = o.get(key)
        if raw is None or (isinstance(raw, str) and not str(raw).strip()):
            continue
        p = _okx_float(raw)
        if p > 0:
            ic = (o.get("interestCcy") or "").strip().upper()
            ccy_out = ic if ic else (invest_ccy or q)
            return round(p, 4), ccy_out
    if not invest_unknown and invest_amt > 0 and apr > 0 and duration_days > 0:
        ccy_out = invest_ccy or q
        return round(invest_amt * apr * (duration_days / 365), 4), ccy_out
    return 0.0, (invest_ccy or q)


def _fetch_dcd_order_history_raw(state_filter: str | None = None) -> list[dict[str, Any]]:
    """One GET to OKX DCD order-history.

    Many accounts reject ``state=filled`` (400). Omit ``state`` when ``state_filter``
    is empty/None and pass ``limit`` only — then filter rows client-side.
    """
    params: dict[str, str] = {"limit": "100"}
    if state_filter and str(state_filter).strip():
        params["state"] = str(state_filter).strip()
    result = _signed_get("/api/v5/finance/sfp/dcd/order-history", params)
    raw = result.get("data", [])
    return _dcd_order_rows_from_response_data(raw)


def _fetch_dcd_orders_live_raw() -> list[dict[str, Any]]:
    """Active DCD positions — OKX uses ``GET /finance/sfp/dcd/orders`` (not order-history)."""
    result = _signed_get("/api/v5/finance/sfp/dcd/orders", None)
    raw = result.get("data", [])
    return _dcd_order_rows_from_response_data(raw)


def _normalize_dcd_orders_payload(orders_list: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Map OKX raw order rows to app order dicts."""
    normalized = []
    for o in orders_list:
        settle_ts = int(o.get("settleTime", 0) or o.get("expTime", 0) or 0)
        settle_date = (
            datetime.fromtimestamp(settle_ts / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
            if settle_ts
            else ""
        )
        create_ts = int(o.get("cTime", 0) or 0)
        create_time = (
            datetime.fromtimestamp(create_ts / 1000, tz=timezone.utc).strftime(
                "%Y-%m-%d %H:%M"
            )
            if create_ts
            else ""
        )

        product_id = o.get("productId", "")
        parts = product_id.split("-") if product_id else []
        coin = parts[0] if parts else ""
        quote_ccy = parts[1] if len(parts) > 1 else "USDT"
        opt_type = parts[-1] if len(parts) >= 5 else ""
        direction = "buy_low" if opt_type == "P" else "sell_high"

        invest_amt, invest_ccy = _dcd_invest_amount_and_ccy(
            o, opt_type=opt_type, coin=coin, quote_ccy=quote_ccy
        )
        invest_unknown = invest_amt <= 0
        apr = _okx_float(o.get("annualizedYield", 0))

        duration_days = 0
        if settle_ts:
            if create_ts > 0:
                duration_days = max(0, round((settle_ts - create_ts) / 86_400_000))
            else:
                now_ms = int(time.time() * 1000)
                duration_days = max(0, round((settle_ts - now_ms) / 86_400_000))

        expected_profit, expected_profit_ccy = _dcd_expected_profit_and_ccy(
            o,
            opt_type=opt_type,
            base=coin,
            quote=quote_ccy,
            invest_amt=invest_amt,
            invest_ccy=invest_ccy,
            apr=apr,
            duration_days=duration_days,
            invest_unknown=invest_unknown,
        )

        actual_profit = None
        settle_amt = o.get("settleAmt")
        if settle_amt is not None and str(settle_amt).strip() != "":
            actual_profit = round(_okx_float(settle_amt) - invest_amt, 4)

        normalized.append({
            "ordId": o.get("ordId", ""),
            "productId": product_id,
            "coin": coin,
            "direction": direction,
            "strikePrice": _okx_float(o.get("strike", 0)),
            "apr": apr,
            "aprPercent": round(apr * 100, 2),
            "investAmt": invest_amt,
            "investCcy": invest_ccy,
            "investUnknown": invest_unknown,
            "state": o.get("state", ""),
            "settleDate": settle_date,
            "createTime": create_time,
            "durationDays": duration_days,
            "expectedProfit": expected_profit,
            "expectedProfitCcy": expected_profit_ccy,
            "actualProfit": actual_profit,
        })

    return normalized


def get_dcd_orders(state: str = "") -> list[dict[str, Any]]:
    """Fetch DCD orders from OKX with at most one ``state`` query param (OKX contract).

    Args:
        state: ``live`` uses ``GET /finance/sfp/dcd/orders`` (active positions). Other
            values use ``order-history`` with that single ``state`` query param.

    Returns:
        Normalized order dicts.
    """
    s = state.strip().lower()
    raw: list[dict[str, Any]]
    if s == "live":
        try:
            raw = _fetch_dcd_orders_live_raw()
        except Exception as exc:
            logger.warning("OKX dcd/orders (live) failed, fallback order-history: %s", exc)
            raw = _fetch_dcd_order_history_raw("live")
    else:
        raw = _fetch_dcd_order_history_raw(state.strip())
    return _normalize_dcd_orders_payload(raw)


_LIVE_LIKE_ORDER_STATES = frozenset(
    {"live", "pending", "processing", "init", "active", "new"}
)


def get_okx_dcd_orders_history_filled_expired() -> list[dict[str, Any]]:
    """History: settled / expired / canceled rows. OKX often returns 400 for ``state=filled``,
    so we prefer an unscoped ``order-history`` call (``limit`` only) and drop live-like rows,
    then fall back to single-state queries.
    """
    raw_orders: list[dict[str, Any]] = []

    try:
        rows = _fetch_dcd_order_history_raw(None)
        for x in rows:
            st = str(x.get("state", "") or "").strip().lower()
            if st in _LIVE_LIKE_ORDER_STATES:
                continue
            raw_orders.append(x)
    except Exception as exc:
        logger.warning("OKX DCD order-history (no state) failed: %s", exc)

    if not raw_orders:
        for st in ("expired", "settled", "canceled", "filled"):
            try:
                raw_orders.extend(_fetch_dcd_order_history_raw(st))
            except Exception as exc:
                logger.warning("OKX DCD order-history state=%s failed: %s", st, exc)

    by_ord: dict[str, dict[str, Any]] = {}
    anon_i = 0
    for o in raw_orders:
        oid = str(o.get("ordId", "") or "")
        if oid:
            by_ord[oid] = o
        else:
            by_ord[f"__anon_{anon_i}"] = o
            anon_i += 1

    merged = list(by_ord.values())
    merged.sort(key=lambda x: int(x.get("cTime", 0) or 0), reverse=True)
    return _normalize_dcd_orders_payload(merged)


def check_okx_configured() -> bool:
    """Return True if OKX API credentials are present in environment."""
    return bool(
        os.environ.get("OKX_API_KEY")
        and os.environ.get("OKX_API_SECRET")
        and os.environ.get("OKX_PASSPHRASE")
    )
