"use client";

import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { TrendingUp, Wallet, History } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import Watchlist from "@/components/layout/Watchlist";
import PortfolioTickerList from "@/components/PortfolioTickerList";
import TradeHistoryFilter, { type HistoryFilters } from "@/components/TradeHistoryFilter";

// Rule: bundle-dynamic-imports - Use next/dynamic for heavy components
// These components use framer-motion and are large, so load them dynamically
const OptionsChain = dynamic(() => import("@/components/OptionsChain"), {
  loading: () => <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading...</div>,
  ssr: false,
});

const Portfolio = dynamic(() => import("@/components/Portfolio"), {
  loading: () => <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading...</div>,
  ssr: false,
});

const TradeHistory = dynamic(() => import("@/components/TradeHistory"), {
  loading: () => <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading...</div>,
  ssr: false,
});

// Rule: bundle-dynamic-imports - Import motion components only when needed
const motion = typeof window !== "undefined" 
  ? require("framer-motion").motion 
  : { button: "button" as any, div: "div" as any };

type Tab = "chain" | "portfolio" | "history";

export default function HomePage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>("chain");
  const [selectedTicker, setSelectedTicker] = useState("TSLL");
  const [portfolioTicker, setPortfolioTicker] = useState<string | null>(null);
  const [historyFilters, setHistoryFilters] = useState<HistoryFilters>({
    ticker: null,
    period: "all",
  });
  const [mounted, setMounted] = useState(false);

  // Rule: rendering-hydration-no-flicker - Wait for client mount before animations
  useEffect(() => {
    setMounted(true);
  }, []);

  // Rule: rerender-hoist-jsx - Extract static tab definitions
  const tabs = useMemo<Array<{ id: Tab; label: string; icon: React.ReactNode }>>(
    () => [
      { id: "chain", label: t("navOptionsChain"), icon: <TrendingUp size={16} /> },
      { id: "portfolio", label: t("navPortfolio"), icon: <Wallet size={16} /> },
      { id: "history", label: t("navTradeHistory"), icon: <History size={16} /> },
    ],
    [t]
  );

  return (
    <div className="flex h-full">
      <div className="w-80 h-full">
        {activeTab === "chain" && (
          <Watchlist selected={selectedTicker} onSelect={setSelectedTicker} />
        )}
        {activeTab === "portfolio" && (
          <PortfolioTickerList selected={portfolioTicker} onSelect={setPortfolioTicker} />
        )}
        {activeTab === "history" && (
          <TradeHistoryFilter filters={historyFilters} onChange={setHistoryFilters} />
        )}
      </div>

      <div className="flex-1 flex flex-col h-full">
        <div className="flex items-center gap-1 p-4 border-b border-border/50 bg-card/20 backdrop-blur-sm">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all
                ${activeTab === tab.id
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                }
              `}
            >
              {tab.icon}
              {tab.label}
              {mounted && activeTab === tab.id && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-primary/10 rounded-xl border border-primary/30"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          {activeTab === "chain" && <OptionsChain ticker={selectedTicker} />}
          {activeTab === "portfolio" && <Portfolio filterTicker={portfolioTicker} />}
          {activeTab === "history" && <TradeHistory filters={historyFilters} onFiltersChange={setHistoryFilters} />}
        </div>
      </div>
    </div>
  );
}



