"""LangChain tools that wrap the existing market data and analysis modules.

These tools let the LLM agent autonomously fetch live data and run
Sell Put analysis during a conversation.
"""

from __future__ import annotations

import json
from math import erf, log, sqrt

from langchain.tools import tool

from backend.analysis.risk import check_earnings_risk, generate_risk_summary
from backend.analysis.strategy import analyze_sell_put
from backend.analysis.volatility import compute_volatility_summary
from backend.data.market import MarketDataProvider


@tool
def get_stock_price(ticker: str) -> str:
    """Get the current stock price for TSLA or TSLL.

    Args:
        ticker: Stock ticker symbol, must be TSLA or TSLL.
    """
    try:
        provider = MarketDataProvider(ticker.upper())
        info = provider.get_current_price()
        return json.dumps(info, ensure_ascii=False)
    except ValueError as e:
        return str(e)


@tool
def get_options_chain(ticker: str, expiration: str | None = None) -> str:
    """Fetch options chain (puts and calls) for TSLA or TSLL.

    Returns strike prices, bid/ask, IV, volume, open interest.

    Args:
        ticker: Stock ticker symbol, must be TSLA or TSLL.
        expiration: Optional expiration date in YYYY-MM-DD format.
                    If omitted, uses the nearest expiration.
    """
    try:
        provider = MarketDataProvider(ticker.upper())
        chain = provider.get_options_chain(expiration)
        if "error" in chain:
            return json.dumps(chain, ensure_ascii=False)

        summary = {
            "ticker": chain["ticker"],
            "expiration": chain["expiration"],
            "daysToExpiry": chain["daysToExpiry"],
            "currentPrice": chain["currentPrice"],
            "availableExpirations": chain["availableExpirations"][:5],
            "putsCount": len(chain["puts"]),
            "callsCount": len(chain["calls"]),
            "puts_otm": [
                {k: p[k] for k in ("strike", "bid", "ask", "lastPrice", "impliedVolatility", "volume", "openInterest")}
                for p in chain["puts"]
                if not p["inTheMoney"]
            ][:10],
        }
        return json.dumps(summary, ensure_ascii=False)
    except ValueError as e:
        return str(e)


@tool
def sell_put_analysis(ticker: str, strike: float, expiration: str | None = None) -> str:
    """Run a comprehensive Sell Put analysis for a specific strike.

    Returns safety cushion, ROIC, Greeks, volatility metrics, and risk alerts.

    Args:
        ticker: Stock ticker symbol, must be TSLA or TSLL.
        strike: The strike price of the put to sell.
        expiration: Optional expiration date in YYYY-MM-DD format.
    """
    try:
        provider = MarketDataProvider(ticker.upper())
        chain = provider.get_options_chain(expiration)
        if "error" in chain:
            return json.dumps(chain, ensure_ascii=False)

        puts = chain.get("puts", [])
        target = next((p for p in puts if abs(p["strike"] - strike) < 0.01), None)
        if not target:
            available = [p["strike"] for p in puts]
            return f"Strike {strike} not found. Available: {available[:10]}"

        premium = target["bid"] if target["bid"] > 0 else target["lastPrice"]
        iv = target["impliedVolatility"]
        dte = chain["daysToExpiry"]
        spot = chain["currentPrice"]

        analysis = analyze_sell_put(spot, strike, premium, dte, iv)

        earnings = provider.get_earnings_dates()
        earnings_risk = check_earnings_risk(earnings, chain["expiration"])

        history = provider.get_history(period="1y")
        close_prices = [d["close"] for d in history]
        iv_history = [p["impliedVolatility"] for p in puts if p["impliedVolatility"] > 0]
        vol_summary = compute_volatility_summary(close_prices, iv, iv_history)

        risk_alerts = generate_risk_summary(
            vol_summary.get("ivRank"),
            vol_summary.get("ivPercentile"),
            earnings_risk,
            analysis["safetyCushion"]["percent"],
        )

        result = {
            **analysis,
            "ticker": ticker.upper(),
            "expiration": chain["expiration"],
            "volatility": vol_summary,
            "riskAlerts": risk_alerts,
        }
        return json.dumps(result, ensure_ascii=False)
    except ValueError as e:
        return str(e)


@tool
def get_volatility_summary(ticker: str) -> str:
    """Get volatility analysis: IV Rank, IV Percentile, HV, sell signal.

    Useful for determining if now is a good time to sell options.

    Args:
        ticker: Stock ticker symbol, must be TSLA or TSLL.
    """
    try:
        provider = MarketDataProvider(ticker.upper())
        history = provider.get_history(period="1y")
        if not history:
            return "No historical data available"

        close_prices = [d["close"] for d in history]
        chain = provider.get_options_chain()
        if "error" in chain:
            return "No options data for volatility analysis"

        puts = chain.get("puts", [])
        if not puts:
            return "No put options available"

        sorted_puts = sorted(puts, key=lambda o: abs(o["strike"] - chain["currentPrice"]))
        current_iv = sorted_puts[0]["impliedVolatility"] if sorted_puts else 0
        iv_history = [p["impliedVolatility"] for p in puts if p["impliedVolatility"] > 0]

        summary = compute_volatility_summary(close_prices, current_iv, iv_history)
        summary["ticker"] = ticker.upper()
        summary["currentPrice"] = chain["currentPrice"]
        return json.dumps(summary, ensure_ascii=False)
    except ValueError as e:
        return str(e)


@tool
def get_earnings_dates(ticker: str) -> str:
    """Get upcoming earnings announcement dates for the underlying stock (TSLA).

    Important for IV Crush risk assessment.

    Args:
        ticker: Stock ticker symbol, must be TSLA or TSLL.
    """
    try:
        provider = MarketDataProvider(ticker.upper())
        dates = provider.get_earnings_dates()
        return json.dumps({"ticker": ticker.upper(), "earnings": dates}, ensure_ascii=False)
    except ValueError as e:
        return str(e)


def _normal_cdf(x: float) -> float:
    return 0.5 * (1.0 + erf(x / sqrt(2.0)))


@tool
def analyze_single_leg_option(
    strategy: str,
    spot_price: float,
    strike_price: float,
    premium: float,
    days_to_expiry: int,
    implied_volatility: float,
    risk_free_rate: float = 0.02,
) -> str:
    """Analyze a single-leg options strategy (long/short call/put).

    Args:
        strategy: One of long_call, long_put, short_call, short_put.
        spot_price: Underlying current price.
        strike_price: Option strike.
        premium: Premium per share/contract unit.
        days_to_expiry: Days left to expiration.
        implied_volatility: Annualized IV, decimal form (e.g. 0.25).
        risk_free_rate: Annualized risk-free rate, decimal form.
    """
    s = strategy.strip().lower()
    if s not in {"long_call", "long_put", "short_call", "short_put"}:
        return "strategy must be: long_call / long_put / short_call / short_put"
    if spot_price <= 0 or strike_price <= 0:
        return "Prices must be > 0."
    if premium < 0:
        return "Premium cannot be negative."
    if days_to_expiry <= 0:
        return "days_to_expiry must be > 0."
    if implied_volatility <= 0:
        return "implied_volatility must be > 0."

    t_years = max(days_to_expiry, 1) / 365.0
    sigma = max(implied_volatility, 1e-6)
    d2 = (log(spot_price / strike_price) + (risk_free_rate - 0.5 * sigma ** 2) * t_years) / (
        sigma * sqrt(t_years)
    )
    call_itm_prob = _normal_cdf(d2)
    put_itm_prob = 1.0 - call_itm_prob

    def payoff(expiry_spot: float) -> float:
        if s == "long_call":
            return max(expiry_spot - strike_price, 0.0) - premium
        if s == "long_put":
            return max(strike_price - expiry_spot, 0.0) - premium
        if s == "short_call":
            return premium - max(expiry_spot - strike_price, 0.0)
        return premium - max(strike_price - expiry_spot, 0.0)

    scenarios = [round(spot_price * m, 2) for m in (0.8, 0.9, 1.0, 1.1, 1.2)]

    if s == "long_call":
        be = strike_price + premium
        mp, ml = "unlimited", f"{premium:.2f}"
        pop = call_itm_prob
    elif s == "long_put":
        be = strike_price - premium
        mp, ml = f"{max(strike_price - premium, 0):.2f}", f"{premium:.2f}"
        pop = put_itm_prob
    elif s == "short_call":
        be = strike_price + premium
        mp, ml = f"{premium:.2f}", "unlimited"
        pop = 1.0 - call_itm_prob
    else:
        be = strike_price - premium
        mp, ml = f"{premium:.2f}", f"{max(strike_price - premium, 0):.2f}"
        pop = 1.0 - put_itm_prob

    rows = [f"S_T={p:.2f} PnL={payoff(p):.2f}" for p in scenarios]
    return (
        f"strategy={s}; breakeven={be:.2f}; max_profit={mp}; max_loss={ml}; "
        f"approx_pop={min(max(pop, 0), 1):.2%}; scenarios=[{'; '.join(rows)}]"
    )


@tool
def get_dual_investment_products(coin: str, direction: str = "buy_low") -> str:
    """Get Binance Dual Investment products (crypto structured options).

    Buy Low = selling puts (deposit USDT, buy crypto if price drops).
    Sell High = selling calls (deposit crypto, sell if price rises).

    Args:
        coin: Crypto asset, e.g. BTC, ETH, SOL, BNB.
        direction: 'buy_low' (put) or 'sell_high' (call).
    """
    from backend.data.binance import (
        BinanceConfigError,
        check_binance_configured,
        get_dual_investment_products as fetch_products,
    )
    if not check_binance_configured():
        return "Binance API not configured. User needs to set BINANCE_API_KEY and BINANCE_API_SECRET."

    if direction not in ("buy_low", "sell_high"):
        return "direction must be buy_low or sell_high"

    try:
        products = fetch_products(coin.upper(), direction)
        if not products:
            return f"No {direction} products available for {coin.upper()}"

        top = products[:10]
        summary = {
            "coin": coin.upper(),
            "direction": direction,
            "totalProducts": len(products),
            "products": [
                {
                    "strikePrice": p["strikePrice"],
                    "aprPercent": p["aprPercent"],
                    "duration": p["duration"],
                    "settleDate": p["settleDate"],
                    "canPurchase": p["canPurchase"],
                }
                for p in top
            ],
        }
        return json.dumps(summary, ensure_ascii=False)
    except BinanceConfigError as e:
        return str(e)
    except Exception as e:
        return f"Error fetching Dual Investment products: {e}"


@tool
def get_okx_dual_investment_products(coin: str, direction: str = "buy_low") -> str:
    """Get OKX Dual Investment products (crypto structured options).

    Buy Low = selling puts (deposit USDT, buy crypto if price drops).
    Sell High = selling calls (deposit crypto, sell if price rises).

    Args:
        coin: Crypto asset, e.g. BTC, ETH, SOL, BNB.
        direction: 'buy_low' (put) or 'sell_high' (call).
    """
    from backend.data.okx import (
        OkxConfigError,
        check_okx_configured,
        get_dual_investment_products as fetch_products,
    )
    if not check_okx_configured():
        return "OKX API not configured. User needs to set OKX_API_KEY, OKX_API_SECRET, and OKX_PASSPHRASE."

    if direction not in ("buy_low", "sell_high"):
        return "direction must be buy_low or sell_high"

    opt_type = "P" if direction == "buy_low" else "C"
    try:
        products = fetch_products(coin.upper(), "USDT", opt_type)
        if not products:
            return f"No {direction} products available for {coin.upper()} on OKX"

        top = products[:10]
        summary = {
            "exchange": "okx",
            "coin": coin.upper(),
            "direction": direction,
            "totalProducts": len(products),
            "products": [
                {
                    "strikePrice": p["strikePrice"],
                    "aprPercent": p["aprPercent"],
                    "duration": p["duration"],
                    "settleDate": p["settleDate"],
                    "canPurchase": p["canPurchase"],
                }
                for p in top
            ],
        }
        return json.dumps(summary, ensure_ascii=False)
    except OkxConfigError as e:
        return str(e)
    except Exception as e:
        return f"Error fetching OKX Dual Investment products: {e}"


OPTIONS_TOOLS = [
    get_stock_price,
    get_options_chain,
    sell_put_analysis,
    get_volatility_summary,
    get_earnings_dates,
    analyze_single_leg_option,
]

CRYPTO_TOOLS = [
    get_dual_investment_products,
    get_okx_dual_investment_products,
]

ALL_TOOLS = OPTIONS_TOOLS + CRYPTO_TOOLS
