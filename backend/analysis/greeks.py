"""Black-Scholes-Merton model and Greeks calculations.

Provides option pricing and sensitivity metrics (Delta, Gamma, Theta, Vega)
using scipy for the normal distribution.
"""

from __future__ import annotations

import math

from scipy.stats import norm


def _d1(s: float, k: float, t: float, r: float, sigma: float) -> float:
    return (math.log(s / k) + (r + 0.5 * sigma ** 2) * t) / (sigma * math.sqrt(t))


def _d2(s: float, k: float, t: float, r: float, sigma: float) -> float:
    return _d1(s, k, t, r, sigma) - sigma * math.sqrt(t)


def bs_call_price(s: float, k: float, t: float, r: float, sigma: float) -> float:
    if t <= 0:
        return max(s - k, 0.0)
    d1 = _d1(s, k, t, r, sigma)
    d2 = _d2(s, k, t, r, sigma)
    return s * norm.cdf(d1) - k * math.exp(-r * t) * norm.cdf(d2)


def bs_put_price(s: float, k: float, t: float, r: float, sigma: float) -> float:
    if t <= 0:
        return max(k - s, 0.0)
    d1 = _d1(s, k, t, r, sigma)
    d2 = _d2(s, k, t, r, sigma)
    return k * math.exp(-r * t) * norm.cdf(-d2) - s * norm.cdf(-d1)


def greeks(
    s: float, k: float, t: float, r: float, sigma: float, option_type: str = "put"
) -> dict[str, float]:
    """Calculate option Greeks.

    Args:
        s: Spot price
        k: Strike price
        t: Time to expiry in years
        r: Risk-free rate (annualized)
        sigma: Implied volatility (annualized)
        option_type: 'call' or 'put'
    """
    if t <= 0 or sigma <= 0:
        return {"delta": 0, "gamma": 0, "theta": 0, "vega": 0}

    d1 = _d1(s, k, t, r, sigma)
    d2 = _d2(s, k, t, r, sigma)
    sqrt_t = math.sqrt(t)

    gamma = norm.pdf(d1) / (s * sigma * sqrt_t)
    vega = s * norm.pdf(d1) * sqrt_t / 100  # per 1% IV change

    if option_type == "call":
        delta = norm.cdf(d1)
        theta = (
            -s * norm.pdf(d1) * sigma / (2 * sqrt_t)
            - r * k * math.exp(-r * t) * norm.cdf(d2)
        ) / 365
    else:
        delta = norm.cdf(d1) - 1
        theta = (
            -s * norm.pdf(d1) * sigma / (2 * sqrt_t)
            + r * k * math.exp(-r * t) * norm.cdf(-d2)
        ) / 365

    return {
        "delta": round(delta, 4),
        "gamma": round(gamma, 6),
        "theta": round(theta, 4),
        "vega": round(vega, 4),
    }
