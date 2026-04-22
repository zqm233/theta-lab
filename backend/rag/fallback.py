"""Fallback search strategies for RAG system degradation.

Provides keyword-based document retrieval when vector search is unavailable.
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def keyword_match_search(query: str, domain: str, max_length: int = 2000) -> str | None:
    """Fallback search using keyword matching on Markdown files.
    
    Args:
        query: User query string.
        domain: Knowledge domain ("options", "crypto", "general").
        max_length: Maximum characters to return from matched document.
        
    Returns:
        Content from matched document, or None if no match.
    """
    knowledge_dir = Path(__file__).parent.parent.parent / "data" / "rag" / "knowledge" / domain
    
    if not knowledge_dir.exists():
        logger.warning("Knowledge directory not found: %s", knowledge_dir)
        return None
    
    query_lower = query.lower()
    
    # 定义关键词到文档的映射
    keyword_map = _get_keyword_map(domain)
    
    # 尝试匹配文件
    for keywords, filename in keyword_map.items():
        if any(kw in query_lower for kw in keywords):
            filepath = knowledge_dir / filename
            if filepath.exists():
                try:
                    content = filepath.read_text(encoding="utf-8")
                    # 限制长度，避免 context 过长
                    if len(content) > max_length:
                        content = content[:max_length] + "\n\n...(truncated)"
                    
                    logger.info("Fallback matched: %s for query: %s", filename, query[:50])
                    return f"[Fallback: {filename}]\n\n{content}"
                except Exception as e:
                    logger.error("Error reading %s: %s", filepath, e)
                    continue
    
    logger.info("No keyword match found for query: %s", query[:50])
    return None


def _get_keyword_map(domain: str) -> dict[tuple[str, ...], str]:
    """Get keyword-to-file mapping for a domain.
    
    Args:
        domain: Knowledge domain.
        
    Returns:
        Dictionary mapping keyword tuples to filenames.
    """
    if domain == "options":
        return {
            ("sell put", "卖出看跌", "卖出 put", "short put"): "sell_put_strategy.md",
            ("iv", "implied volatility", "隐含波动率", "波动率", "volatility", "iv rank", "iv percentile"): "volatility_analysis.md",
            ("greeks", "delta", "theta", "gamma", "vega", "rho", "希腊字母"): "greeks_guide.md",
            ("iv crush", "财报", "earnings", "波动率崩塌"): "iv_crush_guide.md",
            ("gex", "dex", "vex", "flashalpha", "gamma exposure"): "flashalpha_guide.md",
            ("spread", "straddle", "strangle", "iron condor", "butterfly", "策略", "组合"): "options_strategies.md",
        }
    elif domain == "crypto":
        return {
            ("dcd", "双币", "dual", "dual investment", "双币赢", "高卖", "低买"): "dcd_complete_guide.md",
            ("market", "analysis", "分析", "技术面", "情绪", "链上", "fear", "greed"): "market_analysis_framework.md",
        }
    elif domain == "general":
        return {
            # 预留给 general 知识
        }
    
    return {}


def get_static_fallback_message(domain: str) -> str:
    """Get static fallback message when all search methods fail.
    
    Args:
        domain: Knowledge domain.
        
    Returns:
        Static fallback message.
    """
    messages = {
        "options": """知识库暂时不可用。请参考以下核心要点：

**Sell Put 基础**：
- 收益：权利金（Premium）
- 风险：(行权价 - 权利金) × 100
- 关键指标：安全垫、ROIC、Delta

**波动率**：
- IV Rank > 50%：适合卖出
- IV-HV Spread 大：期权相对贵

**希腊字母**：
- Delta：方向性，Sell Put 持仓为正
- Theta：时间衰减，对卖方有利
- Vega：波动率敏感度

请使用实时数据工具进行具体分析。""",
        
        "crypto": """知识库暂时不可用。请参考以下核心要点：

**双币赢（DCD）**：
- 高卖：存币，价格涨到目标价则被卖出
- 低买：存 USDT，价格跌到目标价则被买入
- 无论结果如何，利息都会获得

**风险分析方向**：
- 高卖风险：价格上涨突破目标价
- 低买风险：价格下跌跌破目标价

**市场分析**：
- 情绪面：Fear & Greed Index
- 技术面：MA、RSI、MACD
- 链上数据：地址分布、交易所流入流出

请使用实时数据工具进行具体分析。""",
        
        "general": """知识库暂时不可用。请使用系统内置的分析工具进行实时查询。"""
    }
    
    return messages.get(domain, "Knowledge base temporarily unavailable.")
