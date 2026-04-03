"""Market data ingestion layer.

Uses direct Yahoo Finance API for options (fresher data) and
yfinance for stock prices, history, and earnings.
"""

from __future__ import annotations

import calendar
import logging
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

import time as _time

import numpy as np
import requests
import yfinance as yf

logger = logging.getLogger(__name__)

US_EASTERN = ZoneInfo("America/New_York")

_yahoo_session: requests.Session | None = None
_yahoo_crumb: str | None = None
_crumb_fetched_at: float = 0
_CRUMB_TTL = 300  # reuse crumb for 5 minutes


def calendar_days_to_expiration_us_eastern(expiration_yyyy_mm_dd: str) -> int:
    """Calendar DTE for US-listed options: expiration date minus *today* in US/Eastern."""
    exp_day = datetime.strptime(expiration_yyyy_mm_dd, "%Y-%m-%d").date()
    today_us = datetime.now(US_EASTERN).date()
    return max((exp_day - today_us).days, 0)


def _get_yahoo_session() -> tuple[requests.Session, str] | None:
    """Return a requests session with a valid Yahoo crumb, or None on failure."""
    global _yahoo_session, _yahoo_crumb, _crumb_fetched_at

    if (
        _yahoo_session
        and _yahoo_crumb
        and (_time.monotonic() - _crumb_fetched_at) < _CRUMB_TTL
    ):
        return _yahoo_session, _yahoo_crumb

    try:
        session = requests.Session()
        session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0"
            ),
        })
        try:
            session.get("https://fc.yahoo.com/v1/test", timeout=5)
        except requests.RequestException:
            pass

        crumb_resp = session.get(
            "https://query2.finance.yahoo.com/v1/test/getcrumb", timeout=5
        )
        if crumb_resp.status_code == 429:
            if _yahoo_session and _yahoo_crumb:
                _crumb_fetched_at = _time.monotonic()
                return _yahoo_session, _yahoo_crumb
            logger.debug("Yahoo crumb rate-limited, no cached crumb available")
            return None

        if crumb_resp.status_code != 200:
            logger.debug("Yahoo crumb request returned %s", crumb_resp.status_code)
            return None

        _yahoo_session = session
        _yahoo_crumb = crumb_resp.text
        _crumb_fetched_at = _time.monotonic()
        return session, _yahoo_crumb
    except Exception:
        logger.debug("Failed to obtain Yahoo session/crumb")
        return None


def _invalidate_crumb() -> None:
    global _yahoo_session, _yahoo_crumb, _crumb_fetched_at
    _yahoo_session = None
    _yahoo_crumb = None
    _crumb_fetched_at = 0


class MarketDataProvider:
    """Wraps yfinance + direct Yahoo API for stock and options data."""

    def __init__(self, ticker: str) -> None:
        ticker = ticker.upper()
        if not ticker.isalpha() or len(ticker) > 5:
            raise ValueError(f"Invalid ticker: {ticker}")
        self._ticker = ticker
        self._yf = yf.Ticker(ticker)

    @property
    def ticker(self) -> str:
        return self._ticker

    def get_current_price(self) -> dict[str, Any]:
        regular_price = 0.0
        prev_close = 0.0
        try:
            fast = self._yf.fast_info
            regular_price = float(fast.get("lastPrice", 0) or fast.get("last_price", 0))
            prev_close = float(fast.get("previousClose", 0) or fast.get("previous_close", 0))
        except Exception:
            pass

        price = regular_price
        market_state = "CLOSED"
        extended_price = None

        try:
            info = self._yf.info
            market_state = info.get("marketState", "CLOSED")

            pre_price = _safe_float(info.get("preMarketPrice"))
            post_price = _safe_float(info.get("postMarketPrice"))

            if market_state == "PRE" and pre_price:
                price = pre_price
                extended_price = pre_price
            elif market_state in ("POST", "POSTPOST", "CLOSED") and post_price:
                price = post_price
                extended_price = post_price
            elif market_state == "REGULAR":
                price = float(info.get("regularMarketPrice", 0) or regular_price)

            if not regular_price and price:
                regular_price = price
            if not prev_close:
                prev_close = _safe_float(info.get("previousClose")) or 0.0
        except Exception:
            pass

        change_percent = ((price - prev_close) / prev_close * 100) if prev_close else None

        return {
            "ticker": self._ticker,
            "price": round(price, 4),
            "regularPrice": round(regular_price, 4),
            "extendedPrice": round(extended_price, 4) if extended_price else None,
            "marketState": market_state,
            "changePercent": round(change_percent, 2) if change_percent is not None else None,
            "previousClose": round(prev_close, 4),
            "currency": "USD",
            "data_source": "yfinance (delayed)",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }

    def get_history(self, period: str = "1y", interval: str = "1d") -> list[dict[str, Any]]:
        df = self._yf.history(period=period, interval=interval)
        if df.empty:
            return []
        records = []
        for date, row in df.iterrows():
            records.append({
                "date": date.strftime("%Y-%m-%d"),
                "open": round(float(row["Open"]), 4),
                "high": round(float(row["High"]), 4),
                "low": round(float(row["Low"]), 4),
                "close": round(float(row["Close"]), 4),
                "volume": int(row["Volume"]),
            })
        return records

    def get_expiration_dates(self) -> list[str]:
        return list(self._yf.options)

    def get_options_chain(self, expiration: str | None = None) -> dict[str, Any]:
        """Fetch options chain for a given expiration date.

        Uses the direct Yahoo Finance API for fresher data, with
        yfinance as a fallback.
        """
        expirations = self.get_expiration_dates()
        if not expirations:
            return {"error": "No options data available", "ticker": self._ticker}

        if expiration is None:
            expiration = expirations[0]
        elif expiration not in expirations:
            return {
                "error": f"Invalid expiration: {expiration}",
                "available": expirations,
            }

        current = self.get_current_price()
        days_to_expiry = calendar_days_to_expiration_us_eastern(expiration)

        result = self._fetch_chain_direct(expiration)
        if result:
            result["currentPrice"] = current["price"]
            result["availableExpirations"] = expirations
            result["daysToExpiry"] = days_to_expiry
            return result

        return self._fetch_chain_yfinance(expiration, expirations, current, days_to_expiry)

    def _fetch_chain_direct(self, expiration: str) -> dict[str, Any] | None:
        """Fetch options via direct Yahoo Finance v7 API (fresher data).

        Returns None silently on any failure; caller falls back to yfinance.
        """
        pair = _get_yahoo_session()
        if pair is None:
            return None

        try:
            session, crumb = pair
            exp_dt = datetime.strptime(expiration, "%Y-%m-%d")
            exp_ts = int(calendar.timegm(exp_dt.timetuple()))

            base_url = (
                f"https://query2.finance.yahoo.com/v7/finance/options/"
                f"{self._ticker}?date={exp_ts}&crumb="
            )
            resp = session.get(base_url + crumb, timeout=10)

            if resp.status_code == 401:
                _invalidate_crumb()
                pair2 = _get_yahoo_session()
                if pair2 is None:
                    return None
                _, crumb2 = pair2
                resp = session.get(base_url + crumb2, timeout=10)

            if resp.status_code != 200:
                return None

            data = resp.json()
            chain_result = data.get("optionChain", {}).get("result", [{}])[0]
            options = chain_result.get("options", [{}])
            if not options:
                return None

            opt = options[0]
            actual_exp = opt.get("expirationDate", 0)
            exp_str = (
                datetime.utcfromtimestamp(actual_exp).strftime("%Y-%m-%d")
                if actual_exp
                else expiration
            )

            def _process(contracts: list[dict]) -> list[dict[str, Any]]:
                rows = []
                for c in contracts:
                    iv = c.get("impliedVolatility", 0) or 0
                    vol = c.get("volume", 0) or 0
                    oi = c.get("openInterest", 0) or 0
                    rows.append({
                        "contractSymbol": c.get("contractSymbol", ""),
                        "strike": round(float(c.get("strike", 0)), 2),
                        "lastPrice": round(float(c.get("lastPrice", 0)), 4),
                        "bid": round(float(c.get("bid", 0)), 4),
                        "ask": round(float(c.get("ask", 0)), 4),
                        "volume": int(vol),
                        "openInterest": int(oi),
                        "impliedVolatility": round(float(iv), 4),
                        "inTheMoney": bool(c.get("inTheMoney", False)),
                    })
                return rows

            return {
                "ticker": self._ticker,
                "expiration": exp_str,
                "calls": _process(opt.get("calls", [])),
                "puts": _process(opt.get("puts", [])),
                "dataSource": "Yahoo Finance (direct)",
                "fetchedAt": datetime.now(timezone.utc).isoformat(),
            }

        except Exception:
            logger.debug("Direct Yahoo API unavailable for %s, using fallback", self._ticker)
            return None

    def _fetch_chain_yfinance(
        self,
        expiration: str,
        expirations: list[str],
        current: dict[str, Any],
        days_to_expiry: int,
    ) -> dict[str, Any]:
        """Fallback: fetch options chain via yfinance."""
        chain = self._yf.option_chain(expiration)

        def _process_df(df) -> list[dict[str, Any]]:
            rows = []
            for _, row in df.iterrows():
                iv = float(row.get("impliedVolatility", 0))
                vol = row.get("volume", 0)
                oi = row.get("openInterest", 0)
                rows.append({
                    "contractSymbol": str(row.get("contractSymbol", "")),
                    "strike": round(float(row.get("strike", 0)), 2),
                    "lastPrice": round(float(row.get("lastPrice", 0)), 4),
                    "bid": round(float(row.get("bid", 0)), 4),
                    "ask": round(float(row.get("ask", 0)), 4),
                    "volume": int(vol) if not np.isnan(vol) else 0,
                    "openInterest": int(oi) if not np.isnan(oi) else 0,
                    "impliedVolatility": round(iv, 4),
                    "inTheMoney": bool(row.get("inTheMoney", False)),
                })
            return rows

        return {
            "ticker": self._ticker,
            "expiration": expiration,
            "daysToExpiry": days_to_expiry,
            "currentPrice": current["price"],
            "calls": _process_df(chain.calls),
            "puts": _process_df(chain.puts),
            "availableExpirations": expirations,
            "dataSource": "yfinance (delayed)",
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
        }

    def get_earnings_dates(self, limit: int = 8) -> list[dict[str, Any]]:
        """Fetch upcoming and recent earnings dates."""
        try:
            df = self._yf.get_earnings_dates(limit=limit)
            if df is None or df.empty:
                return []
            results = []
            for date, row in df.iterrows():
                results.append({
                    "date": date.strftime("%Y-%m-%d %H:%M"),
                    "epsEstimate": _safe_float(row.get("EPS Estimate")),
                    "reportedEPS": _safe_float(row.get("Reported EPS")),
                    "surprisePercent": _safe_float(row.get("Surprise(%)")),
                })
            return results
        except Exception:
            return []


def _safe_float(val: Any) -> float | None:
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    try:
        return round(float(val), 4)
    except (ValueError, TypeError):
        return None
