"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useChatBridge } from "@/lib/chat-bridge";
import { usePrices } from "@/lib/price";

const DEFAULT_TICKERS = ["TSLL", "TSLA"];

const MARKET_STATE_LABELS: Record<string, { zh: string; en: string }> = {
  PREPRE: { zh: "盘前", en: "Pre" },
  PRE: { zh: "盘前", en: "Pre" },
  REGULAR: { zh: "交易中", en: "Open" },
  POST: { zh: "盘后", en: "After" },
  POSTPOST: { zh: "盘后", en: "After" },
  CLOSED: { zh: "已收盘", en: "Closed" },
};

interface Props {
  selected: string;
  onSelect: (ticker: string) => void;
}

interface WatchlistCtxMenu {
  x: number;
  y: number;
  ticker: string;
}

export default function Watchlist({ selected, onSelect }: Props) {
  const { t, lang } = useI18n();
  const { sendToChat } = useChatBridge();
  const wlMenuRef = useRef<HTMLDivElement>(null);
  const [wlCtxMenu, setWlCtxMenu] = useState<WatchlistCtxMenu | null>(null);
  
  // 直接从 localStorage 初始化,避免先用默认值再更新导致的重复请求
  const [tickers, setTickers] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("watchlist");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          return DEFAULT_TICKERS;
        }
      }
    }
    return DEFAULT_TICKERS;
  });
  
  const [adding, setAdding] = useState(false);
  const [inputVal, setInputVal] = useState("");
  
  // 使用 usePrices 批量获取所有 ticker 的价格
  const prices = usePrices(tickers);

  const saveTickers = (list: string[]) => {
    setTickers(list);
    if (typeof window !== "undefined") {
      localStorage.setItem("watchlist", JSON.stringify(list));
    }
  };

  const addTicker = () => {
    const val = inputVal.trim().toUpperCase();
    if (val && !tickers.includes(val)) {
      saveTickers([...tickers, val]);
    }
    setInputVal("");
    setAdding(false);
  };

  const removeTicker = (ticker: string) => {
    saveTickers(tickers.filter((t) => t !== ticker));
  };

  const handleWlContextMenu = (e: React.MouseEvent, tk: string) => {
    e.preventDefault();
    e.stopPropagation();
    setWlCtxMenu({ x: e.clientX, y: e.clientY, ticker: tk });
  };

  const handleWlSendToChat = () => {
    if (!wlCtxMenu) return;
    const tk = wlCtxMenu.ticker;
    const p = prices[tk];
    const state = p?.marketState ? MARKET_STATE_LABELS[p.marketState]?.[lang] ?? p.marketState : "";
    const price = p?.price != null ? `$${p.price.toFixed(2)}` : "";
    const change = p?.change != null ? `${p.change >= 0 ? "+" : ""}${p.change.toFixed(2)}%` : "";
    sendToChat([tk, price, change, state].filter(Boolean).join(" "));
    setWlCtxMenu(null);
  };

  useEffect(() => {
    if (!wlCtxMenu) return;
    const dismiss = (e: MouseEvent) => {
      if (wlMenuRef.current && !wlMenuRef.current.contains(e.target as Node)) {
        setWlCtxMenu(null);
      }
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [wlCtxMenu]);

  return (
    <div className="h-full flex flex-col border-r border-border/50 bg-card/10 p-4">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="glass rounded-2xl border border-primary/20 flex-1 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50 flex-shrink-0">
          <h2 className="text-sm font-medium text-foreground/80">{t("watchlist")}</h2>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setAdding(!adding)}
            className="p-1.5 rounded-lg hover:bg-accent/50 transition-colors"
          >
            {adding ? <X size={16} /> : <Plus size={16} />}
          </motion.button>
        </div>

        {/* Add Input */}
        <AnimatePresence>
          {adding && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-b border-border/50 overflow-hidden flex-shrink-0"
            >
              <div className="p-3">
                <input
                  className="w-full px-3 py-2 bg-background/50 border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTicker()}
                  placeholder={t("watchlistPlaceholder")}
                  autoFocus
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Ticker List */}
        <div className="flex-1 overflow-y-auto">
        {tickers.map((ticker) => {
          const p = prices[ticker];
          const isSelected = selected === ticker;
          return (
            <motion.div
              key={ticker}
              whileHover={{ x: 4 }}
              className={`
                group relative p-3 border-b border-border/30 cursor-pointer transition-all
                ${isSelected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-accent/30"}
              `}
              onClick={() => onSelect(ticker)}
              onContextMenu={(e) => handleWlContextMenu(e, ticker)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold">{ticker}</span>
                    {p?.marketState && (
                      <span className={`
                        text-[10px] px-1.5 py-0.5 rounded-full
                        ${p.marketState === "REGULAR" ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}
                      `}>
                        {MARKET_STATE_LABELS[p.marketState]?.[lang] ?? p.marketState}
                      </span>
                    )}
                  </div>
                  {p?.price != null && (
                    <span className="text-xs text-muted-foreground">
                      ${p.price.toFixed(2)}
                    </span>
                  )}
                </div>
                {p?.change != null && (
                  <span className={`text-xs font-medium ${p.change >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {p.change >= 0 ? "+" : ""}
                    {p.change.toFixed(2)}%
                  </span>
                )}
                <motion.button
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                  className="ml-2 p-1 rounded hover:bg-destructive/20 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTicker(ticker);
                  }}
                >
                  <X size={12} />
                </motion.button>
              </div>
            </motion.div>
          );
        })}
      </div>
      </motion.div>

      {/* Context Menu */}
      <AnimatePresence>
        {wlCtxMenu && (
          <motion.div
            ref={wlMenuRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed z-50 glass rounded-xl shadow-2xl overflow-hidden border border-border/50"
            style={{ top: wlCtxMenu.y, left: wlCtxMenu.x }}
          >
            <button
              className="w-full px-4 py-2 text-sm text-left hover:bg-accent/50 transition-colors"
              onClick={handleWlSendToChat}
            >
              💬 {t("sendToChat")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
