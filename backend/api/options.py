"""Options & market data endpoints — price, chain, volatility, analysis."""

from __future__ import annotations

import json
import logging
import time as _time
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Query

from backend.analysis.risk import check_earnings_risk, generate_risk_summary
from backend.analysis.strategy import analyze_sell_put, theta_decay_comparison
from backend.analysis.volatility import compute_volatility_summary, rolling_hv_series
from backend.data.market import MarketDataProvider

logger = logging.getLogger(__name__)

router = APIRouter()

_hv_cache: dict[tuple[str, str], list[float]] = {}
_market_status_cache: dict[str, Any] = {"data": None, "ts": 0.0}
_MARKET_STATUS_TTL = 120

UNDERLYING_MAP: dict[str, str] = {
    "TSLL": "TSLA",
}


def _get_provider(ticker: str) -> MarketDataProvider:
    try:
        return MarketDataProvider(ticker.upper())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


def _get_hv_series(ticker: str, provider: MarketDataProvider) -> list[float]:
    """Return cached HV series for today; compute at most once per ticker per day."""
    key = (ticker.upper(), date.today().isoformat())
    if key not in _hv_cache:
        _hv_cache.clear()
        history = provider.get_history(period="1y")
        close_prices = [d["close"] for d in history]
        _hv_cache[key] = rolling_hv_series(close_prices, window=30)
    return _hv_cache[key]


def _find_atm_options(options: list[dict], spot: float) -> list[dict]:
    if not options:
        return []
    sorted_opts = sorted(options, key=lambda o: abs(o["strike"] - spot))
    return sorted_opts[:3]


def _find_nearest_strike(options: list[dict], target: float) -> dict | None:
    if not options:
        return None
    return min(options, key=lambda o: abs(o["strike"] - target))


def _check_earnings_proximity(earnings: list[dict], threshold_days: int = 10) -> dict | None:
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

    # 清理 NaN 值，避免 JSON 序列化错误
    import math
    def clean_nan(obj):
        if isinstance(obj, dict):
            return {k: clean_nan(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [clean_nan(item) for item in obj]
        elif isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
            return None
        return obj
    
    return clean_nan(chain)


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


@router.get("/quote")
def get_quote(
    ticker: str = Query(..., description="Ticker symbol"),
    market: str = Query("us_stock", description="Market: us_stock / a_stock / crypto"),
):
    """Get current price for any market. Lightweight single-ticker lookup."""
    import ssl
    import urllib.request

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


@router.get("/exchange-rate")
def get_exchange_rate():
    """Get current USD/CNY exchange rate (cached 1h)."""
    import ssl
    import time
    import urllib.request

    cache = getattr(get_exchange_rate, "_cache", None)
    if cache and time.time() - cache["ts"] < 3600:
        return cache["data"]

    rate = 7.25
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
