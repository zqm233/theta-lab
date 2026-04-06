"""Crypto endpoints — Dual Investment products, OKX balance & DCD orders."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)

router = APIRouter()


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
