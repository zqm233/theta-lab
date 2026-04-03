"""OKX Dual Investment API client.

Fetches product listings from OKX's /api/v5/finance/sfp/dcd/* endpoints
using HMAC-SHA256 signed requests.
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
_CACHE_TTL = 120


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
        logger.error("OKX HTTP %s → %s %s", full_path, resp.status_code, resp.text[:500])
        resp.raise_for_status()
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


def check_okx_configured() -> bool:
    """Return True if OKX API credentials are present in environment."""
    return bool(
        os.environ.get("OKX_API_KEY")
        and os.environ.get("OKX_API_SECRET")
        and os.environ.get("OKX_PASSPHRASE")
    )
