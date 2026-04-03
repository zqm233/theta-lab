"""Sell Put strategy analysis module.

Provides safety cushion calculation, annualized ROIC,
and theta decay comparison across different expiration dates.
"""

from __future__ import annotations

from .greeks import bs_put_price, greeks


def safety_cushion(spot_price: float, strike_price: float) -> dict[str, float]:
    """How far the underlying must drop to reach the strike.

    Returns absolute and percentage cushion.
    """
    if spot_price <= 0:
        return {"absolute": 0.0, "percent": 0.0}
    cushion_abs = round(spot_price - strike_price, 4)
    cushion_pct = round(cushion_abs / spot_price * 100, 2)
    return {"absolute": cushion_abs, "percent": cushion_pct}


def sell_put_roic(
    strike_price: float,
    premium: float,
    days_to_expiry: int,
) -> dict[str, float]:
    """Return on Invested Capital for a cash-secured put.

    ROIC = premium / (strike * 100) as percentage.
    Annualized = ROIC * (365 / DTE).
    """
    if strike_price <= 0 or days_to_expiry <= 0:
        return {"roic": 0.0, "annualized": 0.0}
    capital = strike_price * 100
    raw_return = premium * 100
    roic = round(raw_return / capital * 100, 4)
    annualized = round(roic * 365 / days_to_expiry, 4)
    return {"roic": roic, "annualized": annualized}


def theta_decay_comparison(
    spot: float,
    strike: float,
    iv: float,
    dte_list: list[int],
    risk_free_rate: float = 0.02,
) -> list[dict]:
    """Compare theta decay across multiple expiration windows.

    Helps find the "sweet spot" for selling puts (typically 30-45 DTE).
    """
    results = []
    for dte in dte_list:
        t = max(dte, 1) / 365.0
        price = bs_put_price(spot, strike, t, risk_free_rate, iv)
        g = greeks(spot, strike, t, risk_free_rate, iv, option_type="put")
        roic = sell_put_roic(strike, price, dte)
        results.append({
            "dte": dte,
            "putPrice": round(price, 4),
            "theta": g["theta"],
            "delta": g["delta"],
            "dailyDecayRate": round(abs(g["theta"] / price) * 100, 2) if price > 0.01 else 0,
            "roic": roic["roic"],
            "annualizedROIC": roic["annualized"],
        })
    return results


def analyze_sell_put(
    spot_price: float,
    strike_price: float,
    premium: float,
    days_to_expiry: int,
    iv: float,
    risk_free_rate: float = 0.02,
) -> dict:
    """Comprehensive Sell Put analysis combining all metrics."""
    cushion = safety_cushion(spot_price, strike_price)
    roic = sell_put_roic(strike_price, premium, days_to_expiry)
    t = max(days_to_expiry, 1) / 365.0
    g = greeks(spot_price, strike_price, t, risk_free_rate, iv, option_type="put")

    breakeven = strike_price - premium

    return {
        "spot": spot_price,
        "strike": strike_price,
        "premium": premium,
        "daysToExpiry": days_to_expiry,
        "iv": iv,
        "breakeven": round(breakeven, 4),
        "safetyCushion": cushion,
        "roic": roic,
        "greeks": g,
        "maxProfit": round(premium * 100, 2),
        "maxLoss": round((breakeven) * 100, 2),
    }
