"""Binance Dual Investment API client.

Fetches product listings (Buy Low / Sell High) from Binance's
/sapi/v1/dci/product/list endpoint using HMAC-SHA256 signed requests.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

import requests

logger = logging.getLogger(__name__)

BINANCE_BASE_URL = "https://api.binance.com"

_product_cache: dict[str, Any] = {}
_CACHE_TTL = 120  # seconds


class BinanceConfigError(Exception):
    """Raised when Binance API credentials are missing."""


def _get_credentials() -> tuple[str, str]:
    api_key = os.environ.get("BINANCE_API_KEY", "")
    api_secret = os.environ.get("BINANCE_API_SECRET", "")
    if not api_key or not api_secret:
        raise BinanceConfigError(
            "BINANCE_API_KEY and BINANCE_API_SECRET must be set in environment"
        )
    return api_key, api_secret


def _signed_get(path: str, params: dict[str, str]) -> dict:
    api_key, api_secret = _get_credentials()
    params["recvWindow"] = "10000"
    params["timestamp"] = str(int(time.time() * 1000))

    query = "&".join(f"{k}={v}" for k, v in params.items())
    sig = hmac.new(
        api_secret.encode(), query.encode(), hashlib.sha256
    ).hexdigest()

    url = f"{BINANCE_BASE_URL}{path}?{query}&signature={sig}"
    resp = requests.get(
        url,
        headers={"X-MBX-APIKEY": api_key},
        timeout=15,
    )
    if not resp.ok:
        try:
            err = resp.json()
        except Exception:
            err = {"raw": resp.text[:500]}
        logger.error("Binance API %s → %s %s", path, resp.status_code, err)
        raise Exception(
            f"Binance {resp.status_code}: code={err.get('code')}, msg={err.get('msg', err)}"
        )
    return resp.json()


def get_dual_investment_products(
    coin: str = "BTC",
    direction: str = "buy_low",
) -> list[dict[str, Any]]:
    """Fetch Dual Investment product list from Binance.

    Args:
        coin: The crypto asset (e.g. BTC, ETH, BNB).
        direction: 'buy_low' (PUT) or 'sell_high' (CALL).

    Returns:
        List of products with normalized fields.
    """
    cache_key = f"{coin}:{direction}"
    cached = _product_cache.get(cache_key)
    if cached and time.time() - cached["ts"] < _CACHE_TTL:
        return cached["data"]

    coin = coin.upper()
    if direction == "buy_low":
        params = {
            "optionType": "PUT",
            "exercisedCoin": coin,
            "investCoin": "USDT",
            "pageSize": "100",
        }
    else:
        params = {
            "optionType": "CALL",
            "exercisedCoin": "USDT",
            "investCoin": coin,
            "pageSize": "100",
        }

    raw = _signed_get("/sapi/v1/dci/product/list", params)
    products = raw.get("list", [])

    normalized = []
    for p in products:
        settle_ts = int(p.get("settleDate", 0))
        settle_date = (
            datetime.fromtimestamp(settle_ts / 1000, tz=timezone.utc)
            .strftime("%Y-%m-%d")
            if settle_ts
            else ""
        )
        duration = int(p.get("duration", 0))
        apr = float(p.get("apr", 0))

        normalized.append({
            "id": p.get("id", ""),
            "orderId": p.get("orderId"),
            "coin": coin,
            "direction": direction,
            "optionType": p.get("optionType", ""),
            "investCoin": p.get("investCoin", ""),
            "exercisedCoin": p.get("exercisedCoin", ""),
            "strikePrice": float(p.get("strikePrice", 0)),
            "apr": apr,
            "aprPercent": round(apr * 100, 2),
            "duration": duration,
            "settleDate": settle_date,
            "minAmount": float(p.get("minAmount", 0)),
            "maxAmount": float(p.get("maxAmount", 0)),
            "canPurchase": p.get("canPurchase", False),
        })

    normalized.sort(key=lambda x: x["strikePrice"])
    _product_cache[cache_key] = {"data": normalized, "ts": time.time()}
    return normalized


def get_dual_investment_summary(coin: str = "BTC") -> dict[str, Any]:
    """Fetch both buy-low and sell-high products and return a combined summary."""
    buy_low = get_dual_investment_products(coin, "buy_low")
    sell_high = get_dual_investment_products(coin, "sell_high")

    return {
        "coin": coin.upper(),
        "buyLow": buy_low,
        "sellHigh": sell_high,
        "buyLowCount": len(buy_low),
        "sellHighCount": len(sell_high),
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
    }


def check_binance_configured() -> bool:
    """Return True if Binance API credentials are present in environment."""
    return bool(
        os.environ.get("BINANCE_API_KEY") and os.environ.get("BINANCE_API_SECRET")
    )
