"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw } from "lucide-react";
import type { OptionContract } from "@/types/options";
import { useI18n } from "@/lib/i18n";
import { useChatBridge } from "@/lib/chat-bridge";
import { usePortfolio } from "@/lib/portfolio";
import { usePrice } from "@/lib/price";
import { formatUsMarketTime } from "@/lib/utils/usMarketTime";
import { useOptionsChain } from "@/lib/hooks/useOptionsChain";
import type { OptionsChainData } from "@/lib/hooks/useOptionsChain";
import { useApiQuery } from "@/lib/api-hooks";
import { useQueryClient } from "@tanstack/react-query";
import SellPutPanel from "./SellPutPanel";

interface FaQuota {
  configured: boolean;
  limit: number;
  used: number;
  remaining: number;
}

type ContextMenu =
  | {
      kind: "row";
      x: number;
      y: number;
      strike: number;
      option: OptionContract;
      tab: "puts" | "calls";
    }
  | { kind: "tab"; x: number; y: number; tab: "puts" | "calls" };

interface Props {
  ticker: string;
}

export default function OptionsChain({ ticker }: Props) {
  const { t, lang } = useI18n();
  const { sendToChat, submitToChat } = useChatBridge();
  const { addPosition } = usePortfolio();
  const queryClient = useQueryClient();
  const sharedPrice = usePrice(ticker);
  const [toast, setToast] = useState<string | null>(null);
  const [addForm, setAddForm] = useState<{
    ticker: string;
    type: "put" | "call";
    strike: number;
    expiration: string;
    defaultPrice: number;
  } | null>(null);
  const [formSide, setFormSide] = useState<"sell" | "buy">("sell");
  const [formQty, setFormQty] = useState("1");
  const [formEntry, setFormEntry] = useState("");
  const [mounted, setMounted] = useState(false);

  // 从 localStorage 恢复上次选择的到期日
  const [userSelectedExpiration, setUserSelectedExpiration] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`thetalab-exp-${ticker}`);
      if (saved) setUserSelectedExpiration(saved);
    }
  }, [ticker]);

  // 使用新的 useOptionsChain hook (统一使用 React Query)
  const {
    data: chain,
    isLoading: loading,
    error: queryError,
    refetch,
    effectiveExpiration,
    setEffectiveExpiration,
  } = useOptionsChain(ticker, userSelectedExpiration);

  const error = queryError ? (queryError instanceof Error ? queryError.message : "Failed") : null;
  const selectedExpiration = effectiveExpiration || chain?.expiration || "";

  // 保存用户选择到 localStorage
  const setSelectedExpiration = useCallback((exp: string) => {
    setUserSelectedExpiration(exp);
    setEffectiveExpiration(exp);
    if (typeof window !== "undefined" && exp) {
      localStorage.setItem(`thetalab-exp-${ticker}`, exp);
    }
  }, [ticker, setEffectiveExpiration]);

  const [activeTab, setActiveTab] = useState<"puts" | "calls">("puts");
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // React Query: FlashAlpha quota
  const { data: faQuota } = useApiQuery<FaQuota>(
    ["flashalpha-quota"],
    "/flashalpha/quota",
    {
      staleTime: 300000, // 5分钟
    }
  );
  
  const quota = faQuota ?? { configured: false, limit: 5, used: 0, remaining: 0 };

  const handleExpirationChange = (exp: string) => {
    setSelectedExpiration(exp);
    setSelectedStrike(null);
  };

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const formatTime = useCallback((d: Date) =>
    `${formatUsMarketTime(d, lang)}${t("marketTimeEt")}`,
    [lang, t]
  );

  const formatContractLineForChat = useCallback((o: OptionContract, side: "Put" | "Call") =>
    `${ticker} ${side} $${o.strike.toFixed(2)} | Last: $${o.lastPrice.toFixed(2)} | Bid: $${o.bid.toFixed(2)} | Ask: $${o.ask.toFixed(2)} | Vol: ${o.volume.toLocaleString()} | OI: ${o.openInterest.toLocaleString()} | IV: ${(o.impliedVolatility * 100).toFixed(1)}% | Exp: ${selectedExpiration}`,
    [ticker, selectedExpiration]
  );

  const handleRowContextMenu = useCallback((e: React.MouseEvent, opt: OptionContract, tab: "puts" | "calls") => {
    e.preventDefault();
    setCtxMenu({
      kind: "row",
      x: e.clientX,
      y: e.clientY,
      strike: opt.strike,
      option: opt,
      tab,
    });
  }, []);

  const handleTabContextMenu = useCallback((e: React.MouseEvent, tab: "puts" | "calls") => {
    e.preventDefault();
    setCtxMenu({ kind: "tab", x: e.clientX, y: e.clientY, tab });
  }, []);

  const handleAnalyze = useCallback(() => {
    if (ctxMenu?.kind === "row") {
      setSelectedStrike(ctxMenu.strike);
      setCtxMenu(null);
    }
  }, [ctxMenu]);

  const openAddForm = useCallback(() => {
    if (!ctxMenu || ctxMenu.kind !== "row") return;
    const o = ctxMenu.option;
    setAddForm({
      ticker,
      type: ctxMenu.tab === "puts" ? "put" : "call",
      strike: o.strike,
      expiration: selectedExpiration,
      defaultPrice: o.lastPrice,
    });
    setFormSide("sell");
    setFormQty("1");
    setFormEntry(o.lastPrice.toFixed(2));
    setCtxMenu(null);
  }, [ctxMenu, ticker, selectedExpiration]);

  const submitAddForm = useCallback(() => {
    if (!addForm) return;
    const qty = parseInt(formQty, 10);
    const entry = parseFloat(formEntry);
    if (!qty || qty <= 0 || isNaN(entry) || entry < 0) return;
    addPosition({
      ticker: addForm.ticker,
      type: addForm.type,
      side: formSide,
      strike: addForm.strike,
      qty,
      entry,
      expiration: addForm.expiration,
    });
    setAddForm(null);
    setToast(t("portfolioAddedOk"));
    setTimeout(() => setToast(null), 2000);
  }, [addForm, formQty, formEntry, formSide, addPosition, t]);

  const handleSendRowToChat = useCallback(() => {
    if (!ctxMenu || ctxMenu.kind !== "row") return;
    const o = ctxMenu.option;
    const type = ctxMenu.tab === "puts" ? "Put" : "Call";
    sendToChat(formatContractLineForChat(o, type));
    setCtxMenu(null);
  }, [ctxMenu, sendToChat, formatContractLineForChat]);

  const handleAdvancedAnalysis = useCallback(() => {
    if (!ctxMenu || ctxMenu.kind !== "row") return;
    const strike = ctxMenu.strike.toFixed(2);
    const isolationPrefix = lang === "zh"
      ? `[独立分析请求：这是一个美股期权分析任务，请忽略之前对话中关于加密货币或双币投资的上下文，专注于以下期权分析。]\n\n`
      : `[Independent analysis request: This is a US stock options analysis task. Ignore any prior crypto or DCD context and focus on the following options analysis.]\n\n`;
    const body = lang === "zh"
      ? `请使用 FlashAlpha 对 ${ticker} 进行高级期权分析：查看 GEX、DEX、关键价位和波动率。当前关注行权价 $${strike}，到期日 ${selectedExpiration}。`
      : `Use FlashAlpha to analyze ${ticker}: GEX, DEX, key levels, and volatility. Strike: $${strike}, Expiration: ${selectedExpiration}.`;
    const displayText = lang === "zh"
      ? `🔍 分析 ${ticker} $${strike} ${ctxMenu.tab === "puts" ? "Put" : "Call"} ${selectedExpiration}`
      : `🔍 Analyzing ${ticker} $${strike} ${ctxMenu.tab === "puts" ? "Put" : "Call"} ${selectedExpiration}`;
    submitToChat(isolationPrefix + body, displayText);
    setCtxMenu(null);
    // 8秒后刷新 quota 数据（等待 FlashAlpha API 调用完成）
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["flashalpha-quota"] });
    }, 8000);
  }, [ctxMenu, lang, ticker, selectedExpiration, submitToChat, queryClient]);

  const handleSendAllTabToChat = useCallback(() => {
    if (!ctxMenu || ctxMenu.kind !== "tab" || !chain) return;
    const opts = ctxMenu.tab === "puts" ? chain.puts : chain.calls;
    const side = ctxMenu.tab === "puts" ? "Put" : "Call";
    const dte = chain.daysToExpiry ?? "—";
    const header =
      lang === "zh"
        ? `${ticker} ${side === "Put" ? "看跌" : "看涨"}期权链 — 到期 ${selectedExpiration}，DTE ${dte}，共 ${opts.length} 档：\n`
        : `${ticker} ${side} chain — Exp ${selectedExpiration}, DTE ${dte}, ${opts.length} strikes:\n`;
    const body = opts.map((o) => formatContractLineForChat(o, side)).join("\n");
    sendToChat(header + body);
    setCtxMenu(null);
  }, [ctxMenu, chain, lang, ticker, selectedExpiration, formatContractLineForChat, sendToChat]);

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

  // Rule: rerender-derived-state - Memoize constant arrays
  const FAKE_IV = useMemo(() => [0.500005, 0.250007, 0.125009, 0.062509, 0.00001], []);
  
  const isReliableIV = useCallback((iv: number, strike: number) => {
    if (iv <= 0.001) return false;
    if (FAKE_IV.some((f) => Math.abs(iv - f) < 0.00001)) return false;
    if (!chain) return iv > 0 && iv < 3;
    const spot = sharedPrice?.price ?? chain.currentPrice;
    const distance = Math.abs(strike - spot) / spot;
    if (distance > 0.3 && iv > 2) return false;
    if (distance > 0.5) return false;
    return true;
  }, [FAKE_IV, chain, sharedPrice?.price]);

  const formatIV = useCallback((iv: number, strike: number) => {
    if (!isReliableIV(iv, strike)) return "N/A";
    return `${(iv * 100).toFixed(1)}%`;
  }, [isReliableIV]);

  // Rule: rerender-derived-state - Compute derived state with useMemo
  const spotForMoneyness = useMemo(() =>
    sharedPrice?.price != null && Number.isFinite(sharedPrice.price) && sharedPrice.price > 0
      ? sharedPrice.price
      : chain && chain.currentPrice > 0
        ? chain.currentPrice
        : null,
    [sharedPrice?.price, chain]
  );

  const rowMoneynessClass = useCallback((opt: OptionContract, tab: "puts" | "calls") => {
    if (spotForMoneyness == null) return opt.inTheMoney ? "itm" : "otm";
    if (tab === "calls") return spotForMoneyness > opt.strike ? "itm" : "otm";
    return opt.strike > spotForMoneyness ? "itm" : "otm";
  }, [spotForMoneyness]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <AnimatePresence>
        {selectedStrike !== null && (
          <SellPutPanel
            ticker={ticker}
            strike={selectedStrike}
            expiration={selectedExpiration}
            onClose={() => setSelectedStrike(null)}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50 bg-card/20 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">{ticker}</h2>
          {chain?.earningsWarning?.isClose && (
            <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded-full text-xs font-medium" title={`${chain.underlying ?? ticker} ${chain.earningsWarning.date}`}>
              ⚠ {t("earningsWarning")} {chain.earningsWarning.daysUntil}{t("earningsDays")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {sharedPrice?.price != null && (
            <div className="text-right">
              <div className="text-lg font-semibold">
                ${sharedPrice.price.toFixed(2)}
                {sharedPrice.change != null && (
                  <span className={`ml-2 text-sm ${sharedPrice.change >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {sharedPrice.change >= 0 ? "+" : ""}{sharedPrice.change.toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.1, rotate: 180 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleRefresh}
              disabled={loading}
              className="p-2 hover:bg-accent/50 rounded-lg transition-colors disabled:opacity-50"
              title={t("refresh")}
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </motion.button>
          </div>
        </div>
      </div>

      {/* Expiration Bar */}
      {chain?.availableExpirations && (
        <div className="flex items-center gap-4 p-4 border-b border-border/50 bg-card/10">
          <label className="text-sm font-medium">{t("expiration")}</label>
          <select
            value={selectedExpiration}
            onChange={(e) => handleExpirationChange(e.target.value)}
            className="px-3 py-1.5 bg-background/50 border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {chain.availableExpirations
              .filter((exp) => {
                const expDate = new Date(exp + "T16:00:00-05:00");
                return expDate >= new Date();
              })
              .map((exp) => (
                <option key={exp} value={exp}>
                  {exp}
                </option>
              ))}
          </select>
          {chain.daysToExpiry !== undefined && (
            <span className="px-2 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium">
              {chain.daysToExpiry} DTE
            </span>
          )}
          {chain.ivRank != null && (
            <span
              className={`px-2 py-1 rounded-full text-xs font-medium cursor-help ${
                chain.ivRank > 50 ? "bg-green-500/20 text-green-400" : chain.ivRank < 25 ? "bg-red-500/20 text-red-400" : "bg-gray-500/20 text-gray-400"
              }`}
              title={
                chain.ivRank > 50
                  ? t("helpIVDotGreen")
                  : chain.ivRank < 25
                  ? t("helpIVDotRed")
                  : t("helpIVDotWhite")
              }
            >
              {chain.ivRank > 50 ? "🟢" : chain.ivRank < 25 ? "🔴" : "⚪"}
              {" "}IV Rank {chain.ivRank.toFixed(1)}%
            </span>
          )}
        </div>
      )}

      {/* Loading / Error */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">{t("loading")}</div>
        </div>
      )}
      {error && (
        <div className="m-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
          {error}
        </div>
      )}

      {/* Tabs and Table */}
      {chain && !loading && (
        <>
          <div className="flex border-b border-border/50">
            {["puts", "calls"].map((tab) => (
              <motion.button
                key={tab}
                onClick={() => {
                  setActiveTab(tab as "puts" | "calls");
                }}
                onContextMenu={(e) => handleTabContextMenu(e, tab as "puts" | "calls")}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-all ${
                  activeTab === tab
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {t(tab === "puts" ? "tabPuts" : "tabCalls")} ({tab === "puts" ? chain.puts.length : chain.calls.length})
              </motion.button>
            ))}
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-card/95 backdrop-blur-sm border-b border-border/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("colStrike")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("colLast")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("colBid")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("colAsk")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("colVolume")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("colOI")}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{t("colIV")}</th>
                </tr>
              </thead>
              <tbody>
                {(activeTab === "puts" ? chain.puts : chain.calls).map((opt: OptionContract) => {
                  const isITM = rowMoneynessClass(opt, activeTab) === "itm";
                  const isSelected = selectedStrike === opt.strike;
                  return (
                    <motion.tr
                      key={opt.contractSymbol}
                      className={`
                        border-b border-border/30 cursor-pointer transition-colors
                        ${isITM ? "bg-primary/5" : ""}
                        ${isSelected ? "bg-primary/20" : "hover:bg-accent/30"}
                      `}
                      onContextMenu={(e) => handleRowContextMenu(e, opt, activeTab)}
                      whileHover={{ x: 4 }}
                    >
                      <td className="px-4 py-3 font-mono font-semibold text-sm">{opt.strike.toFixed(2)}</td>
                      <td className="px-4 py-3 text-sm">{opt.lastPrice != null ? opt.lastPrice.toFixed(2) : "—"}</td>
                      <td className="px-4 py-3 text-sm">{opt.bid != null ? opt.bid.toFixed(2) : "—"}</td>
                      <td className="px-4 py-3 text-sm">{opt.ask != null ? opt.ask.toFixed(2) : "—"}</td>
                      <td className="px-4 py-3 text-sm">{opt.volume?.toLocaleString() ?? "—"}</td>
                      <td className="px-4 py-3 text-sm">{opt.openInterest?.toLocaleString() ?? "—"}</td>
                      <td className="px-4 py-3 text-sm">{formatIV(opt.impliedVolatility, opt.strike)}</td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
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
            {ctxMenu.kind === "tab" ? (
              <button
                className="w-full px-4 py-2 text-sm text-left hover:bg-accent/50 transition-colors"
                onClick={handleSendAllTabToChat}
              >
                💬 {t("sendToChat")}
              </button>
            ) : (
              <>
                {ctxMenu.tab === "puts" && (
                  <button
                    className="w-full px-4 py-2 text-sm text-left hover:bg-accent/50 transition-colors"
                    onClick={handleAnalyze}
                  >
                    {t("ctxMenuAnalyzePut")} — ${ctxMenu.strike.toFixed(2)}
                  </button>
                )}
                <button
                  className="w-full px-4 py-2 text-sm text-left hover:bg-accent/50 transition-colors"
                  onClick={openAddForm}
                >
                  📥 {t("addToPortfolio")}
                </button>
                {quota.configured && (
                  <button
                    className="w-full px-4 py-2 text-sm text-left hover:bg-accent/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    onClick={handleAdvancedAnalysis}
                    disabled={quota.remaining <= 0}
                  >
                    🔍 {t("ctxAdvancedAnalysis")}
                    <span className="ml-2 text-xs opacity-60">
                      {quota.remaining > 0
                        ? `${quota.remaining}/${quota.limit}`
                        : `${t("ctxQuotaExhausted")} · ${t("quotaResetTime")}`}
                    </span>
                  </button>
                )}
                <button
                  className="w-full px-4 py-2 text-sm text-left hover:bg-accent/50 transition-colors"
                  onClick={handleSendRowToChat}
                >
                  💬 {t("sendToChat")}
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Position Modal */}
      <AnimatePresence>
        {addForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setAddForm(null)}
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
                    {t("addToPortfolio")} — {addForm.ticker} {addForm.type === "put" ? "Put" : "Call"} ${addForm.strike.toFixed(2)}
                  </h3>
                  <button
                    className="p-1.5 hover:bg-accent/50 rounded-lg transition-colors"
                    onClick={() => setAddForm(null)}
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">{t("portfolioSide")}</label>
                    <div className="flex gap-2">
                      <button
                        className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                          formSide === "sell" ? "bg-red-500/20 text-red-400 border-2 border-red-500/50" : "bg-accent/50 hover:bg-accent"
                        }`}
                        onClick={() => setFormSide("sell")}
                      >
                        {t("portfolioSell")}
                      </button>
                      <button
                        className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                          formSide === "buy" ? "bg-green-500/20 text-green-400 border-2 border-green-500/50" : "bg-accent/50 hover:bg-accent"
                        }`}
                        onClick={() => setFormSide("buy")}
                      >
                        {t("portfolioBuy")}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">{t("portfolioQty")}</label>
                    <input
                      type="number"
                      min="1"
                      value={formQty}
                      onChange={(e) => setFormQty(e.target.value)}
                      className="w-full px-4 py-2 bg-background/50 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">{t("portfolioEntry")}</label>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formEntry}
                        onChange={(e) => setFormEntry(e.target.value)}
                        className="flex-1 px-4 py-2 bg-background/50 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    {t("expiration")}: {addForm.expiration}
                  </div>

                  <button
                    className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
                    onClick={submitAddForm}
                  >
                    {t("addToPortfolio")}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
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
