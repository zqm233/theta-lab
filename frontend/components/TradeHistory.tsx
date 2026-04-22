"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApiQuery } from "@/lib/api-hooks";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";
import type { HistoryFilters } from "./TradeHistoryFilter";
import TradeHistoryFilter from "./TradeHistoryFilter";

interface Trade {
  id: string;
  ticker: string;
  type: string;
  side: string;
  strike: number;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  expiration: string;
  openedAt: string;
  closedAt: string;
  pnl: number;
  exitType?: string;
  notes?: string;
}

interface Props {
  filters: HistoryFilters;
  onFiltersChange: (f: HistoryFilters) => void;
}

export default function TradeHistory({ filters, onFiltersChange }: Props) {
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();

  // React Query: 交易历史 (不自动刷新,只手动刷新)
  const { data, isLoading } = useApiQuery<{ trades: Trade[] }>(
    ["trade-history"],
    "/trades/history",
    {
      staleTime: 300000, // 5分钟缓存
    }
  );

  const trades = data?.trades ?? [];
  const loading = isLoading;

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ["trade-history"] });
  };

  const filtered = useMemo(() => {
    let result = trades;
    if (filters.ticker) {
      result = result.filter((tr) => tr.ticker === filters.ticker);
    }
    if (filters.period !== "all") {
      const now = Date.now();
      const ms: Record<string, number> = {
        "7d": 7 * 86400000,
        "30d": 30 * 86400000,
        "90d": 90 * 86400000,
        "1y": 365 * 86400000,
      };
      const cutoff = now - (ms[filters.period] ?? 0);
      result = result.filter((tr) => new Date(tr.closedAt).getTime() >= cutoff);
    }
    return result;
  }, [trades, filters]);

  const summary = useMemo(() => {
    if (filtered.length === 0) return null;
    const totalPnl = filtered.reduce((s, tr) => s + tr.pnl, 0);
    const wins = filtered.filter((tr) => tr.pnl >= 0).length;
    const losses = filtered.length - wins;
    return {
      totalPnl,
      tradeCount: filtered.length,
      wins,
      losses,
      winRate: Math.round((wins / filtered.length) * 100),
    };
  }, [filtered]);

  const handleDelete = async (id: string) => {
    try {
      await fetch(`${API_BASE}/trades/${id}`, { method: "DELETE" });
      refetch(); // 刷新缓存
    } catch {
      /* silent */
    }
  };

  const formatExitType = (exitType?: string) => {
    if (!exitType || exitType === "manual") return t("exitManual");
    if (exitType === "exercised") return t("exitExercised");
    if (exitType === "expired_worthless") return t("exitExpiredWorthless");
    return exitType;
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Period Filter Bar */}
      <TradeHistoryFilter filters={filters} onChange={onFiltersChange} />

      {/* Summary */}
      {summary && (
        <div className="flex items-center gap-6 p-4 border-b border-border/50 bg-card/10">
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">{t("totalPnl")}</span>
            <span className={`text-lg font-bold ${summary.totalPnl >= 0 ? "text-green-400" : "text-red-400"}`}>
              {summary.totalPnl >= 0 ? "+" : ""}${summary.totalPnl.toFixed(2)}
            </span>
          </div>
          <div className="w-px h-10 bg-border/50" />
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">{t("tradeCount")}</span>
            <span className="text-lg font-bold">{summary.tradeCount}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">{t("winRate")}</span>
            <span className="text-lg font-bold">{summary.winRate}%</span>
          </div>
          <div className="flex-1" />
          <div className="text-xs text-muted-foreground">
            {summary.wins}W / {summary.losses}L
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-muted-foreground">{t("loading")}</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <div className="text-4xl mb-4">📜</div>
            <p>{t("noTradeHistory")}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Ticker</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("portfolioSide")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("colStrike")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("portfolioQty")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("portfolioEntry")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("exitPrice")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("portfolioPnl")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("closeMethod")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("closedAt")}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((trade) => (
                  <motion.tr
                    key={trade.id}
                    className="border-b border-border/30 hover:bg-accent/30 transition-colors"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    whileHover={{ x: 4 }}
                  >
                    <td className="px-4 py-3 font-semibold text-sm">{trade.ticker}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        trade.side === "sell" ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"
                      }`}>
                        {trade.side === "sell" ? t("portfolioSell") : t("portfolioBuy")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{trade.type === "put" ? "Put" : "Call"}</td>
                    <td className="px-4 py-3 font-mono text-sm">${trade.strike.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm">{trade.qty}</td>
                    <td className="px-4 py-3 text-sm">${trade.entryPrice.toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm">${trade.exitPrice.toFixed(2)}</td>
                    <td className={`px-4 py-3 font-semibold text-sm ${
                      trade.pnl >= 0 ? "text-green-400" : "text-red-400"
                    }`}>
                      {trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-xs">{formatExitType(trade.exitType)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(trade.closedAt)}</td>
                  <td className="px-4 py-3">
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleDelete(trade.id)}
                      className="p-1.5 hover:bg-destructive/20 hover:text-destructive rounded-lg transition-colors"
                      title={t("deletePosition")}
                    >
                      <Trash2 size={14} />
                    </motion.button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
