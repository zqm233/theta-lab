"""Volatility analysis engine.

Calculates IV Rank, IV Percentile, Historical Volatility,
and IV-HV Spread to identify overpriced options for Sell Put.
"""

from __future__ import annotations

import numpy as np


def historical_volatility(close_prices: list[float], window: int = 20) -> float | None:
    """Annualized historical volatility based on log returns."""
    if len(close_prices) < window + 1:
        return None
    prices = np.array(close_prices[-(window + 1):])
    log_returns = np.log(prices[1:] / prices[:-1])
    return float(np.std(log_returns, ddof=1) * np.sqrt(252))


def rolling_hv_series(close_prices: list[float], window: int = 30) -> list[float]:
    """Compute a rolling annualized HV series over the full price history.

    Returns one HV value per day (starting from day `window`).
    """
    if len(close_prices) < window + 1:
        return []
    prices = np.array(close_prices, dtype=float)
    log_returns = np.log(prices[1:] / prices[:-1])
    series = []
    for i in range(window - 1, len(log_returns)):
        chunk = log_returns[i - window + 1 : i + 1]
        hv = float(np.std(chunk, ddof=1) * np.sqrt(252))
        series.append(hv)
    return series


def iv_rank(current_iv: float, hv_series: list[float]) -> float | None:
    """IV Rank: where current ATM IV sits relative to the 1-year HV range.

    Uses the rolling HV series as a proxy for historical IV range.
    Formula: (current_iv - min_hv) / (max_hv - min_hv) * 100
    """
    if not hv_series or len(hv_series) < 10:
        return None
    hv_min = min(hv_series)
    hv_max = max(hv_series)
    if hv_max == hv_min:
        return 50.0
    rank = (current_iv - hv_min) / (hv_max - hv_min) * 100
    return round(max(0, min(100, rank)), 2)


def iv_percentile(current_iv: float, hv_series: list[float]) -> float | None:
    """IV Percentile: % of days in the HV series where HV was below current IV."""
    if not hv_series or len(hv_series) < 10:
        return None
    below = sum(1 for hv in hv_series if hv < current_iv)
    return round(below / len(hv_series) * 100, 2)


def iv_hv_spread(current_iv: float, hv: float) -> float:
    """IV minus HV. Positive value = options are relatively expensive."""
    return round(current_iv - hv, 4)


def compute_volatility_summary(
    close_prices: list[float],
    current_iv: float,
    cached_hv_series: list[float] | None = None,
) -> dict:
    """Full volatility analysis combining all metrics."""
    hv_20 = historical_volatility(close_prices, window=20)
    hv_60 = historical_volatility(close_prices, window=60)

    hv_series = cached_hv_series if cached_hv_series is not None else rolling_hv_series(close_prices, window=30)
    rank = iv_rank(current_iv, hv_series)
    percentile = iv_percentile(current_iv, hv_series)
    spread = iv_hv_spread(current_iv, hv_20) if hv_20 is not None else None

    signal = "NEUTRAL"
    if rank is not None and percentile is not None:
        if rank > 50 and percentile > 50 and spread is not None and spread > 0:
            signal = "FAVORABLE_SELL"
        elif rank < 30 and percentile < 30:
            signal = "UNFAVORABLE_SELL"

    return {
        "currentIV": round(current_iv, 4),
        "hv20": round(hv_20, 4) if hv_20 else None,
        "hv60": round(hv_60, 4) if hv_60 else None,
        "ivRank": rank,
        "ivPercentile": percentile,
        "ivHvSpread": spread,
        "sellSignal": signal,
    }
