"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, MessageCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useChatBridge } from "@/lib/chat-bridge";
import { API_BASE } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { formatUsMarketTime } from "@/lib/utils/usMarketTime";
import type { Position } from "@/lib/portfolio";
import { usePortfolio } from "@/lib/portfolio";
import { handleSilentError, extractErrorMessage } from "@/lib/utils/errorHandler";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface Props {
  filterTicker?: string | null;
}

export default function Portfolio({ filterTicker }: Props) {
  const { t, lang } = useI18n();
  const { sendToChat } = useChatBridge();
  const { positions, removePosition, closePosition } = usePortfolio();
  const queryClient = useQueryClient();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [closeForm, setCloseForm] = useState<{ id: string; exitPrice: string; exitType: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; pos: Position } | null>(null);
  const [selectedExpiration, setSelectedExpiration] = useState<string>("all");
  const menuRef = useRef<HTMLDivElement>(null);

  // Rule: rerender-hoist-jsx - Extract helper functions outside or use useMemo for stability
  const isExpired = useCallback((expiration: string) => {
    const exp = new Date(expiration + "T16:00:00-05:00");
    return exp < new Date();
  }, []);

  // Rule: rerender-derived-state - Extract unique expirations for dropdown
  // 只显示未到期的日期
  const expirations = useMemo(() => {
    const basePositions = filterTicker
      ? positions.filter((p) => p.ticker === filterTicker)
      : positions;
    // 过滤掉已到期的持仓
    const activeOnly = basePositions.filter((p) => !isExpired(p.expiration));
    const unique = Array.from(new Set(activeOnly.map((p) => p.expiration))).sort();
    return unique;
  }, [filterTicker, positions, isExpired]);

  // Rule: rerender-derived-state - Derive state during render with useMemo
  // 只显示未到期的持仓
  const filtered = useMemo(() => {
    let result = filterTicker
      ? positions.filter((p) => p.ticker === filterTicker)
      : positions;
    
    // 过滤掉已到期的持仓
    result = result.filter((p) => !isExpired(p.expiration));
    
    if (selectedExpiration !== "all") {
      result = result.filter((p) => p.expiration === selectedExpiration);
    }
    
    return result;
  }, [filterTicker, positions, selectedExpiration, isExpired]);

  // Rule: async-cheap-condition-before-await - Filter active positions before fetch
  const activePositions = useMemo(() => 
    positions.filter(p => !isExpired(p.expiration)),
    [positions, isExpired]
  );

  // positionIds for queryKey dependency
  const positionIds = useMemo(() => 
    activePositions.map(p => p.id).sort().join(','),
    [activePositions]
  );

  // React Query: Portfolio quotes (调用第三方API计算P&L,但需要实时性)
  const { data: quotesData, isLoading: refreshing } = useQuery({
    queryKey: ["portfolio-quotes", positionIds],
    queryFn: async () => {
      if (activePositions.length === 0) {
        return { quotes: {} };
      }

      const payload = activePositions.map((p) => ({
        id: p.id,
        ticker: p.ticker,
        expiration: p.expiration,
        strike: p.strike,
        type: p.type,
      }));
      
      const res = await fetch(`${API_BASE}/options/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (!res.ok) {
        const errMsg = await extractErrorMessage(res);
        handleSilentError('Portfolio.quotes', `Failed to fetch quotes: ${errMsg}`);
        throw new Error(errMsg);
      }
      
      const data = await res.json();
      return { quotes: data.quotes ?? {} };
    },
    enabled: positions.length > 0,
    staleTime: 30000, // 30s - 持仓盈亏需要一定实时性
    // 移除 refetchInterval - 避免后台持续请求
    retry: 1,
  });

  const quotes = quotesData?.quotes ?? {};

  // 更新时间戳
  useEffect(() => {
    if (quotesData) {
      setLastUpdated(new Date());
    }
  }, [quotesData]);

  const handleManualRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["portfolio-quotes"] });
  };

  const isITM = useCallback((pos: Position) => {
    const cur = quotes[pos.id];
    if (cur == null) return false;
    if (pos.type === "put") {
      return pos.strike > cur;
    } else {
      return pos.strike < cur;
    }
  }, [quotes]);

  const formatTime = useCallback((d: Date) =>
    `${formatUsMarketTime(d, lang)}${t("marketTimeEt")}`,
    [lang, t]
  );

  // Rule: rerender-derived-state - Compute in render with useCallback for stability
  const calcPnl = useCallback((pos: Position) => {
    const cur = quotes[pos.id];
    if (cur == null) return null;
    const multiplier = pos.side === "sell" ? 1 : -1;
    return multiplier * (pos.entry - cur) * pos.qty * 100;
  }, [quotes]);

  const handleSendToChat = useCallback((pos: Position) => {
    const side = pos.side === "sell" ? "Sell" : "Buy";
    const type = pos.type === "put" ? "Put" : "Call";
    const pnl = calcPnl(pos);
    const pnlStr = pnl != null ? ` | P&L: $${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}` : "";
    sendToChat(
      `${pos.ticker} ${side} ${type} $${pos.strike.toFixed(2)} x${pos.qty} | Entry: $${pos.entry.toFixed(2)} | Exp: ${pos.expiration}${pnlStr}`
    );
  }, [calcPnl, sendToChat]);

  const openCloseForm = useCallback((pos: Position, exitType: string = "manual") => {
    const cur = quotes[pos.id];
    let exitPrice = cur != null ? cur.toFixed(2) : "";
    if (exitType === "expired_worthless") {
      exitPrice = "0.00";
    } else if (exitType === "exercised") {
      exitPrice = pos.strike.toFixed(2);
    }
    setCloseForm({ id: pos.id, exitPrice, exitType });
  }, [quotes]);

  const submitClose = useCallback(async () => {
    if (!closeForm) return;
    const exitPrice = parseFloat(closeForm.exitPrice);
    if (isNaN(exitPrice) || exitPrice < 0) return;
    const ok = await closePosition(closeForm.id, exitPrice, closeForm.exitType);
    setCloseForm(null);
    if (ok) {
      setToast(t("tradeClosed"));
      setTimeout(() => setToast(null), 2000);
    }
  }, [closeForm, closePosition, t]);

  const handleRowContextMenu = useCallback((e: React.MouseEvent, pos: Position) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, pos });
  }, []);

  useEffect(() => {
    if (!ctxMenu) return;
    const dismiss = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [ctxMenu]);

  // Rule: rerender-derived-state-no-effect - Derive during render, not in effect
  const title = useMemo(() => 
    filterTicker
      ? `${t("navPortfolio")} — ${filterTicker}`
      : t("navPortfolio"),
    [filterTicker, t]
  );

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50 bg-card/20 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold">{title}</h2>
          
          {/* Expiration Filter */}
          {expirations.length > 0 && (
            <select
              value={selectedExpiration}
              onChange={(e) => setSelectedExpiration(e.target.value)}
              className="px-3 py-1.5 text-sm bg-background/50 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 hover:bg-accent/20 transition-colors cursor-pointer"
            >
              <option value="all">
                {t("allExpirations") || "All Expirations"} ({positions.length})
              </option>
              {expirations.map((exp) => {
                const count = positions.filter((p) => 
                  p.expiration === exp && 
                  (filterTicker ? p.ticker === filterTicker : true)
                ).length;
                return (
                  <option key={exp} value={exp}>
                    {exp} ({count})
                  </option>
                );
              })}
            </select>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              {t("lastUpdated")} {formatTime(lastUpdated)}
            </span>
          )}
          <motion.button
            whileHover={{ scale: 1.1, rotate: 180 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="p-2 hover:bg-accent/50 rounded-lg transition-colors disabled:opacity-50"
            title={t("refresh")}
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </motion.button>
        </div>
      </div>

      {/* Note */}
      <div className="px-4 py-2 text-xs text-muted-foreground bg-accent/10 border-b border-border/30">
        {t("portfolioPaperNote")}
      </div>

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <div className="text-4xl mb-4">📊</div>
            <p>{t("portfolioEmpty")}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border/50">
              <tr>
                {!filterTicker && <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Ticker</th>}
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("portfolioSide")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("colStrike")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("portfolioQty")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("portfolioEntry")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("portfolioCurrent")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("portfolioPnl")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("colExpiration")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((pos) => {
                const cur = quotes[pos.id];
                const pnl = calcPnl(pos);
                const expired = isExpired(pos.expiration);
                const itm = isITM(pos);
                return (
                  <motion.tr
                    key={pos.id}
                    onContextMenu={(e) => handleRowContextMenu(e, pos)}
                    className={`
                      border-b border-border/30 cursor-pointer transition-colors hover:bg-accent/30
                      ${expired ? "opacity-50" : ""}
                      ${itm ? "bg-primary/5" : ""}
                    `}
                    whileHover={{ x: 4 }}
                  >
                    {!filterTicker && <td className="px-4 py-3 font-semibold text-sm">{pos.ticker}</td>}
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        pos.side === "sell" ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"
                      }`}>
                        {pos.side === "sell" ? t("portfolioSell") : t("portfolioBuy")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{pos.type === "put" ? "Put" : "Call"}</td>
                    <td className="px-4 py-3 font-mono text-sm">${pos.strike.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm">{pos.qty}</td>
                    <td className="px-4 py-3 text-sm">${pos.entry.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm">{cur != null ? `$${cur.toFixed(2)}` : "—"}</td>
                    <td className={`px-4 py-3 font-semibold text-sm ${
                      pnl != null ? (pnl >= 0 ? "text-green-400" : "text-red-400") : ""
                    }`}>
                      {pnl != null
                        ? `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {pos.expiration}
                      {expired && <span className="ml-2 text-xs text-yellow-400">⚠️ {t("expired")}</span>}
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Context Menu */}
      <AnimatePresence>
        {ctxMenu && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed z-50 glass rounded-xl shadow-2xl overflow-hidden border border-border/50 py-1"
            style={{ top: ctxMenu.y, left: ctxMenu.x }}
          >
            {isExpired(ctxMenu.pos.expiration) ? (
              <>
                <button
                  className="w-full px-4 py-2 text-sm text-left hover:bg-accent/50 transition-colors"
                  onClick={() => {
                    openCloseForm(ctxMenu.pos, "expired_worthless");
                    setCtxMenu(null);
                  }}
                >
                  {t("closeExpiredWorthless")}
                </button>
                <button
                  className="w-full px-4 py-2 text-sm text-left hover:bg-accent/50 transition-colors"
                  onClick={async () => {
                    const pos = ctxMenu.pos;
                    setCtxMenu(null);
                    let spotPrice = pos.strike;
                    try {
                      const res = await fetch(`${API_BASE}/tickers/${pos.ticker}/price`);
                      if (res.ok) {
                        const data = await res.json();
                        spotPrice = data.price ?? pos.strike;
                      }
                    } catch {
                      // 获取失败，使用行权价
                    }
                    const ok = await closePosition(pos.id, spotPrice, "exercised");
                    if (ok) {
                      setToast(t("tradeClosed"));
                      setTimeout(() => setToast(null), 2000);
                    }
                  }}
                >
                  {t("closeExercised")}
                </button>
              </>
            ) : (
              <button
                className="w-full px-4 py-2 text-sm text-left hover:bg-accent/50 transition-colors"
                onClick={() => {
                  openCloseForm(ctxMenu.pos);
                  setCtxMenu(null);
                }}
              >
                {t("closePosition")} — ${ctxMenu.pos.strike.toFixed(2)}
              </button>
            )}
            <button
              className="w-full px-4 py-2 text-sm text-left hover:bg-accent/50 transition-colors"
              onClick={() => {
                handleSendToChat(ctxMenu.pos);
                setCtxMenu(null);
              }}
            >
              💬 {t("sendToChat")}
            </button>
            <button
              className="w-full px-4 py-2 text-sm text-left hover:bg-destructive/50 text-destructive transition-colors"
              onClick={() => {
                removePosition(ctxMenu.pos.id);
                setCtxMenu(null);
              }}
            >
              {t("deletePosition")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Close Position Modal */}
      <AnimatePresence>
        {closeForm && (() => {
          const pos = positions.find((p) => p.id === closeForm.id);
          const titleSuffix = closeForm.exitType === "expired_worthless" 
            ? ` — ${t("expiredWorthless")}`
            : closeForm.exitType === "exercised"
            ? ` — ${t("exercised")}`
            : "";
          return pos ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setCloseForm(null)}
              />
              
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative glass border border-border/50 rounded-2xl w-full max-w-md shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold">
                      {t("closePosition")} — {pos.ticker} {pos.type === "put" ? "Put" : "Call"} ${pos.strike.toFixed(2)}{titleSuffix}
                    </h3>
                    <button
                      className="p-1.5 hover:bg-accent/50 rounded-lg transition-colors"
                      onClick={() => setCloseForm(null)}
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">{t("exitPrice")}</label>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={closeForm.exitPrice}
                          onChange={(e) => setCloseForm({ ...closeForm, exitPrice: e.target.value })}
                          className="flex-1 px-4 py-2 bg-background/50 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                          autoFocus
                        />
                      </div>
                    </div>

                    <div className="text-sm text-muted-foreground space-y-1">
                      <div>{t("portfolioEntry")}: ${pos.entry.toFixed(2)}</div>
                      <div>{t("portfolioQty")}: {pos.qty}</div>
                      <div>{pos.expiration}</div>
                    </div>

                    <button
                      className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
                      onClick={submitClose}
                    >
                      {t("confirmClose")}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          ) : null;
        })()}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 right-8 px-6 py-3 bg-green-500/20 border border-green-500/50 text-green-400 rounded-xl shadow-lg"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
