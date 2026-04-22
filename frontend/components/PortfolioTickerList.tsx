"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { usePortfolio } from "@/lib/portfolio";

interface Props {
  selected: string | null;
  onSelect: (ticker: string | null) => void;
}

export default function PortfolioTickerList({ selected, onSelect }: Props) {
  const { t } = useI18n();
  const { positions } = usePortfolio();

  const tickerSummaries = useMemo(() => {
    const map = new Map<string, { count: number }>();
    for (const pos of positions) {
      const existing = map.get(pos.ticker);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(pos.ticker, { count: 1 });
      }
    }
    return Array.from(map.entries()).map(([ticker, info]) => ({
      ticker,
      positionCount: info.count,
    }));
  }, [positions]);

  return (
    <div className="flex h-full flex-col bg-card/30 backdrop-blur-xl border-r border-border/50">
      <div className="flex items-center justify-between p-4 border-b border-border/50">
        <h2 className="text-sm font-medium text-foreground/80">{t("navPortfolio")}</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <motion.div
          className={`
            p-3 border-b border-border/30 cursor-pointer transition-colors
            ${selected === null ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-accent/30"}
          `}
          onClick={() => onSelect(null)}
          whileHover={{ x: 4 }}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">{t("portfolioAll")}</span>
            <span className="text-xs px-2 py-0.5 bg-primary/20 text-primary rounded-full">
              {positions.length}
            </span>
          </div>
        </motion.div>

        {tickerSummaries.map(({ ticker, positionCount }) => (
          <motion.div
            key={ticker}
            className={`
              p-3 border-b border-border/30 cursor-pointer transition-colors
              ${selected === ticker ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-accent/30"}
            `}
            onClick={() => onSelect(ticker)}
            whileHover={{ x: 4 }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{ticker}</span>
              <span className="text-xs px-2 py-0.5 bg-accent/50 rounded-full">
                {positionCount}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
