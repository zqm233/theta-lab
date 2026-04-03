"""Risk management and earnings event detection.

Monitors TSLA earnings dates and generates IV Crush warnings
when options are being sold near earnings announcements.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any


def check_earnings_risk(
    earnings_dates: list[dict[str, Any]],
    option_expiration: str,
    warning_days: int = 7,
) -> dict[str, Any]:
    """Check if an option expiration date falls near an earnings announcement.

    Args:
        earnings_dates: List of earnings date dicts from MarketDataProvider.
        option_expiration: The option expiration date string (YYYY-MM-DD).
        warning_days: How many days before/after earnings to flag risk.
    """
    if not earnings_dates:
        return {"hasEarningsRisk": False, "message": "No earnings data available"}

    try:
        exp_date = datetime.strptime(option_expiration, "%Y-%m-%d")
    except ValueError:
        return {"hasEarningsRisk": False, "message": "Invalid expiration date format"}

    now = datetime.now()
    upcoming = []

    for entry in earnings_dates:
        try:
            ed = datetime.strptime(entry["date"], "%Y-%m-%d %H:%M")
        except (ValueError, KeyError):
            continue

        if ed >= now - timedelta(days=1):
            upcoming.append(ed)

    warnings = []
    for ed in upcoming:
        delta = abs((ed - exp_date).days)
        if delta <= warning_days:
            warnings.append({
                "earningsDate": ed.strftime("%Y-%m-%d"),
                "daysFromExpiry": delta,
                "risk": "HIGH" if delta <= 3 else "MODERATE",
            })

        if exp_date >= ed >= now:
            warnings.append({
                "earningsDate": ed.strftime("%Y-%m-%d"),
                "type": "EARNINGS_BEFORE_EXPIRY",
                "message": "Earnings announcement falls BEFORE option expiry — expect IV Crush post-earnings",
                "risk": "HIGH",
            })

    # Deduplicate by earnings date
    seen = set()
    unique_warnings = []
    for w in warnings:
        key = w["earningsDate"]
        if key not in seen:
            seen.add(key)
            unique_warnings.append(w)

    has_risk = len(unique_warnings) > 0
    return {
        "hasEarningsRisk": has_risk,
        "warnings": unique_warnings,
        "message": (
            "⚠️ IV Crush 风险：期权到期日临近财报发布，卖出期权需警惕财报后 IV 骤降导致的价格波动"
            if has_risk
            else "未检测到近期财报风险"
        ),
    }


def generate_risk_summary(
    iv_rank: float | None,
    iv_percentile: float | None,
    earnings_risk: dict[str, Any],
    safety_cushion_pct: float,
) -> list[str]:
    """Generate a list of risk warnings for display."""
    alerts = []

    if earnings_risk.get("hasEarningsRisk"):
        alerts.append(earnings_risk["message"])

    if iv_rank is not None and iv_rank < 20:
        alerts.append(
            f"IV Rank 偏低 ({iv_rank:.1f}%)，当前期权费可能不够丰厚，卖出性价比较低"
        )

    if iv_percentile is not None and iv_percentile < 20:
        alerts.append(
            f"IV Percentile 偏低 ({iv_percentile:.1f}%)，历史上仅 {iv_percentile:.0f}% 的时间 IV 低于当前水平"
        )

    if safety_cushion_pct < 5:
        alerts.append(
            f"安全垫不足 ({safety_cushion_pct:.1f}%)，标的小幅下跌即可触碰行权价"
        )

    if not alerts:
        alerts.append("当前风险指标正常，未发现明显预警信号")

    return alerts
