"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { API_BASE } from "@/lib/api";

export interface HistoryFilters {
  ticker: string | null;
  period: "all" | "7d" | "30d" | "90d" | "1y";
}

interface Trade {
  ticker: string;
  pnl: number;
}

interface Props {
  filters: HistoryFilters;
  onChange: (f: HistoryFilters) => void;
}

export default function TradeHistoryFilter({ filters, onChange }: Props) {
  const { t } = useI18n();
  const [trades, setTrades] = useState<Trade[]>([]);

  const fetchTickers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/trades`);
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
    <div className="flex h-full flex-col bg-card/30 backdrop-blur-xl border-r border-border/50">
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <h2 className="text-sm font-medium text-foreground/80">{t("navTradeHistory")}</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <motion.div
          className={`
            p-3 border-b border-border/30 cursor-pointer transition-colors
            ${filters.ticker === null ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-accent/30"}
          `}
          onClick={() => onChange({ ...filters, ticker: null })}
          whileHover={{ x: 4 }}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">{t("portfolioAll")}</span>
            <span className="text-xs px-2 py-0.5 bg-primary/20 text-primary rounded-full">
              {trades.length}
            </span>
          </div>
        </motion.div>

        {tickerSummaries.map(({ ticker, count, pnl }) => (
          <motion.div
            key={ticker}
            className={`
              p-3 border-b border-border/30 cursor-pointer transition-colors
              ${filters.ticker === ticker ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-accent/30"}
            `}
            onClick={() => onChange({ ...filters, ticker })}
            whileHover={{ x: 4 }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold">{ticker}</span>
              <span className="text-xs px-2 py-0.5 bg-accent/50 rounded-full">
                {count}
              </span>
            </div>
            <div className={`text-xs font-medium ${pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
              {pnl >= 0 ? "+" : ""}${pnl.toFixed(0)}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
