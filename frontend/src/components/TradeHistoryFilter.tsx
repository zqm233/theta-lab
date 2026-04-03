import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { API_BASE } from "../hooks/useApi";

export interface HistoryFilters {
  ticker: string | null;
  period: string;
}

interface Trade {
  ticker: string;
  pnl: number;
}

interface Props {
  filters: HistoryFilters;
  onChange: (f: HistoryFilters) => void;
}

const PERIODS = ["all", "7d", "30d", "90d", "1y"] as const;

export default function TradeHistoryFilter({ filters, onChange }: Props) {
  const { t } = useI18n();
  const [trades, setTrades] = useState<Trade[]>([]);

  const fetchTickers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/trades/history`);
      if (!res.ok) return;
      const data = await res.json();
      setTrades(data.trades ?? []);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchTickers();
  }, [fetchTickers]);

  const tickerSummaries = useMemo(() => {
    const map = new Map<string, { count: number; pnl: number }>();
    for (const tr of trades) {
      const existing = map.get(tr.ticker);
      if (existing) {
        existing.count += 1;
        existing.pnl += tr.pnl;
      } else {
        map.set(tr.ticker, { count: 1, pnl: tr.pnl });
      }
    }
    return Array.from(map.entries()).map(([ticker, info]) => ({
      ticker,
      count: info.count,
      pnl: info.pnl,
    }));
  }, [trades]);

  return (
    <div className="watchlist">
      <div className="watchlist-header">
        <span className="watchlist-title">{t("navTradeHistory")}</span>
      </div>

      {/* Ticker filter */}
      <div className="watchlist-items">
        <button
          className={`watchlist-item${filters.ticker === null ? " active" : ""}`}
          onClick={() => onChange({ ...filters, ticker: null })}
        >
          <div className="watchlist-item-left">
            <span className="watchlist-ticker">{t("portfolioAll")}</span>
          </div>
          <span className="portfolio-ticker-count">{trades.length}</span>
        </button>

        {tickerSummaries.map(({ ticker, count, pnl }) => (
          <button
            key={ticker}
            className={`watchlist-item${filters.ticker === ticker ? " active" : ""}`}
            onClick={() => onChange({ ...filters, ticker })}
          >
            <div className="watchlist-item-left">
              <span className="watchlist-ticker">{ticker}</span>
              <span className={`trade-filter-pnl ${pnl >= 0 ? "pnl-up" : "pnl-down"}`}>
                {pnl >= 0 ? "+" : ""}${pnl.toFixed(0)}
              </span>
            </div>
            <span className="portfolio-ticker-count">{count}</span>
          </button>
        ))}
      </div>

      {/* Time period filter */}
      <div className="trade-filter-section">
        <div className="trade-filter-label">{t("filterPeriod")}</div>
        <div className="trade-filter-periods">
          {PERIODS.map((p) => (
            <button
              key={p}
              className={`trade-filter-period${filters.period === p ? " active" : ""}`}
              onClick={() => onChange({ ...filters, period: p })}
            >
              {t(`period_${p}` as any)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
