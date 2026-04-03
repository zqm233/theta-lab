"""Securities search across markets: A-shares, US stocks, crypto.

A-shares: fetched from East Money public API, cached in memory.
US stocks: yfinance Search API.
Crypto: static top-200 list.
"""

from __future__ import annotations

import logging
import re
import time
from typing import TypedDict

logger = logging.getLogger(__name__)


class SearchResult(TypedDict):
    ticker: str
    name: str
    exchange: str


# ---------------------------------------------------------------------------
# A-Share stock list (cached from East Money API)
# ---------------------------------------------------------------------------

_TYPE_LABELS: dict[str, str] = {
    "GP-A": "A股",
    "ETF": "ETF",
    "LOF": "LOF",
    "ZS": "指数",
    "KCB": "科创板",
    "CYB": "创业板",
    "GP-B": "B股",
}


def search_a_shares(query: str, limit: int = 10) -> list[SearchResult]:
    """Search A-share stocks/ETFs via Tencent SmartBox API.

    Supports code, Chinese name, and pinyin abbreviation.
    """
    import urllib.request
    import ssl

    q = query.strip()
    if not q:
        return []

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    url = f"https://smartbox.gtimg.cn/s3/?v=2&q={urllib.request.quote(q)}&t=all"
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://stockapp.finance.qq.com/",
        })
        with urllib.request.urlopen(req, timeout=8, context=ctx) as resp:
            text = resp.read().decode("utf-8")
        # API returns literal \uXXXX escapes; decode them to real characters
        text = text.encode("utf-8").decode("unicode_escape")
    except Exception as exc:
        logger.warning("Tencent SmartBox search failed: %s", exc)
        return []

    match = re.search(r'v_hint="(.+)"', text)
    if not match:
        return []

    raw = match.group(1)
    results: list[SearchResult] = []
    for entry in raw.split("^"):
        parts = entry.split("~")
        if len(parts) < 5:
            continue
        market, code, name, _pinyin, sec_type = parts[:5]

        # Only include A-share markets (sh/sz) and relevant types
        if market not in ("sh", "sz"):
            continue
        if sec_type in ("ZS",):  # skip pure indices
            continue

        exchange = "SH" if market == "sh" else "SZ"
        type_label = _TYPE_LABELS.get(sec_type, sec_type)
        results.append({
            "ticker": f"{code}.{exchange}",
            "name": name,
            "exchange": f"{'上交所' if exchange == 'SH' else '深交所'} {type_label}",
        })
        if len(results) >= limit:
            break

    return results


# ---------------------------------------------------------------------------
# US Stock search (via yfinance)
# ---------------------------------------------------------------------------

def search_us_stocks(query: str, limit: int = 10) -> list[SearchResult]:
    q = query.strip()
    if not q:
        return []

    try:
        import yfinance as yf
        search = yf.Search(q, max_results=limit)
        results: list[SearchResult] = []
        for quote in search.quotes:
            symbol = quote.get("symbol", "")
            name = quote.get("shortname") or quote.get("longname") or ""
            exchange = quote.get("exchange", "")
            if symbol:
                results.append({"ticker": symbol, "name": name, "exchange": exchange})
        return results
    except Exception as exc:
        logger.warning("yfinance search failed: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Crypto search (static list of major coins)
# ---------------------------------------------------------------------------

_CRYPTO_LIST: list[dict] = [
    {"ticker": "BTC", "name": "Bitcoin"},
    {"ticker": "ETH", "name": "Ethereum"},
    {"ticker": "BNB", "name": "BNB"},
    {"ticker": "SOL", "name": "Solana"},
    {"ticker": "XRP", "name": "Ripple"},
    {"ticker": "DOGE", "name": "Dogecoin"},
    {"ticker": "ADA", "name": "Cardano"},
    {"ticker": "AVAX", "name": "Avalanche"},
    {"ticker": "DOT", "name": "Polkadot"},
    {"ticker": "LINK", "name": "Chainlink"},
    {"ticker": "MATIC", "name": "Polygon"},
    {"ticker": "UNI", "name": "Uniswap"},
    {"ticker": "SHIB", "name": "Shiba Inu"},
    {"ticker": "LTC", "name": "Litecoin"},
    {"ticker": "ATOM", "name": "Cosmos"},
    {"ticker": "FIL", "name": "Filecoin"},
    {"ticker": "APT", "name": "Aptos"},
    {"ticker": "ARB", "name": "Arbitrum"},
    {"ticker": "OP", "name": "Optimism"},
    {"ticker": "SUI", "name": "Sui"},
    {"ticker": "NEAR", "name": "NEAR Protocol"},
    {"ticker": "PEPE", "name": "Pepe"},
    {"ticker": "INJ", "name": "Injective"},
    {"ticker": "TIA", "name": "Celestia"},
    {"ticker": "SEI", "name": "Sei"},
    {"ticker": "AAVE", "name": "Aave"},
    {"ticker": "MKR", "name": "Maker"},
    {"ticker": "CRV", "name": "Curve DAO"},
    {"ticker": "RENDER", "name": "Render"},
    {"ticker": "FET", "name": "Fetch.ai"},
    {"ticker": "GRT", "name": "The Graph"},
    {"ticker": "IMX", "name": "Immutable X"},
    {"ticker": "STX", "name": "Stacks"},
    {"ticker": "ALGO", "name": "Algorand"},
    {"ticker": "SAND", "name": "The Sandbox"},
    {"ticker": "MANA", "name": "Decentraland"},
    {"ticker": "AXS", "name": "Axie Infinity"},
    {"ticker": "ENS", "name": "Ethereum Name Service"},
    {"ticker": "COMP", "name": "Compound"},
    {"ticker": "SNX", "name": "Synthetix"},
    {"ticker": "1INCH", "name": "1inch"},
    {"ticker": "ETC", "name": "Ethereum Classic"},
    {"ticker": "BCH", "name": "Bitcoin Cash"},
    {"ticker": "XLM", "name": "Stellar"},
    {"ticker": "EOS", "name": "EOS"},
    {"ticker": "TRX", "name": "TRON"},
    {"ticker": "HBAR", "name": "Hedera"},
    {"ticker": "VET", "name": "VeChain"},
    {"ticker": "XMR", "name": "Monero"},
    {"ticker": "TON", "name": "Toncoin"},
    {"ticker": "WLD", "name": "Worldcoin"},
    {"ticker": "JUP", "name": "Jupiter"},
    {"ticker": "WIF", "name": "dogwifhat"},
    {"ticker": "BONK", "name": "Bonk"},
    {"ticker": "PENDLE", "name": "Pendle"},
    {"ticker": "PYTH", "name": "Pyth Network"},
    {"ticker": "JTO", "name": "Jito"},
    {"ticker": "TRB", "name": "Tellor"},
    {"ticker": "ORDI", "name": "ORDI"},
    {"ticker": "SATS", "name": "SATS (Ordinals)"},
]


def search_crypto(query: str, limit: int = 10) -> list[SearchResult]:
    q = query.strip().upper()
    if not q:
        return []

    results: list[SearchResult] = []
    for coin in _CRYPTO_LIST:
        ticker: str = coin["ticker"]
        name: str = coin["name"]
        if q in ticker or q in name.upper():
            results.append({"ticker": ticker, "name": name, "exchange": "Crypto"})
            if len(results) >= limit:
                break
    return results


# ---------------------------------------------------------------------------
# Unified search entry point
# ---------------------------------------------------------------------------

def search_securities(query: str, market: str, limit: int = 10) -> list[SearchResult]:
    if market == "a_stock":
        return search_a_shares(query, limit)
    elif market == "crypto":
        return search_crypto(query, limit)
    else:
        return search_us_stocks(query, limit)
