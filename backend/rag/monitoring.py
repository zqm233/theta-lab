"""RAG system monitoring and health tracking.

Tracks RAG failures and provides degradation alerts.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from datetime import datetime

logger = logging.getLogger(__name__)

# Global health tracker (thread-safe)
_health_tracker: RagHealthTracker | None = None
_health_tracker_lock = threading.Lock()


@dataclass
class RagHealthTracker:
    """Tracks RAG system health and failure patterns."""
    
    total_attempts: int = 0
    rag_successes: int = 0
    fallback_successes: int = 0
    total_failures: int = 0
    
    consecutive_failures: int = 0
    last_failure_time: datetime | None = None
    last_success_time: datetime | None = None
    
    failure_threshold: int = 5
    is_degraded: bool = False
    
    failure_reasons: list[str] = field(default_factory=list)
    
    def record_rag_success(self):
        """Record successful RAG retrieval."""
        self.total_attempts += 1
        self.rag_successes += 1
        self.consecutive_failures = 0
        self.last_success_time = datetime.now()
        self.is_degraded = False
        
        logger.debug("RAG success recorded. Total: %d/%d", self.rag_successes, self.total_attempts)
    
    def record_fallback_success(self):
        """Record successful fallback retrieval."""
        self.total_attempts += 1
        self.fallback_successes += 1
        self.consecutive_failures = 0
        self.last_success_time = datetime.now()
        
        logger.warning("RAG failed but fallback succeeded. Fallback count: %d", self.fallback_successes)
    
    def record_failure(self, reason: str = "unknown"):
        """Record complete failure (RAG + fallback)."""
        self.total_attempts += 1
        self.total_failures += 1
        self.consecutive_failures += 1
        self.last_failure_time = datetime.now()
        
        # 保留最近 10 个失败原因
        self.failure_reasons.append(reason)
        if len(self.failure_reasons) > 10:
            self.failure_reasons.pop(0)
        
        if self.consecutive_failures >= self.failure_threshold:
            if not self.is_degraded:
                self.is_degraded = True
                logger.error(
                    "RAG SYSTEM DEGRADED: %d consecutive failures. Reasons: %s",
                    self.consecutive_failures,
                    self.failure_reasons[-3:]
                )
                # TODO: 发送告警（邮件、Slack 等）
                self._alert_ops_team()
        else:
            logger.error("RAG failure #%d: %s", self.consecutive_failures, reason)
    
    def _alert_ops_team(self):
        """Send alert to operations team (placeholder)."""
        # TODO: 实现告警逻辑
        # - 发送邮件
        # - Slack webhook
        # - PagerDuty
        # - 监控系统 API
        logger.critical("ALERT: RAG system requires attention. Degraded mode active.")
    
    def get_health_status(self) -> dict:
        """Get current health status."""
        return {
            "is_healthy": not self.is_degraded,
            "total_attempts": self.total_attempts,
            "rag_success_rate": self.rag_successes / max(self.total_attempts, 1),
            "fallback_rate": self.fallback_successes / max(self.total_attempts, 1),
            "failure_rate": self.total_failures / max(self.total_attempts, 1),
            "consecutive_failures": self.consecutive_failures,
            "last_failure_time": self.last_failure_time.isoformat() if self.last_failure_time else None,
            "last_success_time": self.last_success_time.isoformat() if self.last_success_time else None,
            "recent_failures": self.failure_reasons[-5:],
        }


def get_health_tracker() -> RagHealthTracker:
    """Get or create global health tracker (thread-safe)."""
    global _health_tracker
    
    if _health_tracker is None:
        with _health_tracker_lock:
            if _health_tracker is None:
                _health_tracker = RagHealthTracker()
    
    return _health_tracker


def record_rag_success():
    """Record successful RAG retrieval."""
    get_health_tracker().record_rag_success()


def record_fallback_success():
    """Record successful fallback retrieval."""
    get_health_tracker().record_fallback_success()


def record_failure(reason: str = "unknown"):
    """Record complete failure."""
    get_health_tracker().record_failure(reason)


def get_health_status() -> dict:
    """Get current RAG system health status."""
    return get_health_tracker().get_health_status()
