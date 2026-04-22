"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MessageCircle } from "lucide-react";
import type { SellPutAnalysis } from "@/types/options";
import { API_BASE } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useChatBridge } from "@/lib/chat-bridge";

interface Props {
  ticker: string;
  strike: number;
  expiration: string;
  onClose: () => void;
}

function SignalDot({ signal, t }: { signal: string; t: (k: any) => string }) {
  const isGood = signal === "FAVORABLE_SELL";
  const isBad = signal === "UNFAVORABLE_SELL";
  const label = isGood ? t("signalGood") : isBad ? t("signalBad") : t("signalNeutral");
  
  return (
    <span className={`
      inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium
      ${isGood ? "bg-green-500/20 text-green-400" : isBad ? "bg-red-500/20 text-red-400" : "bg-gray-500/20 text-gray-400"}
    `}>
      {label}
    </span>
  );
}

export default function SellPutPanel({ ticker, strike, expiration, onClose }: Props) {
  const { t } = useI18n();
  const { sendToChat } = useChatBridge();
  const [analysis, setAnalysis] = useState<SellPutAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setAnalysis(null);

    fetch(`${API_BASE}/tickers/${ticker}/sell-put-analysis?strike=${strike}&expiration=${expiration}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => setAnalysis(data as SellPutAnalysis))
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Failed");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [ticker, strike, expiration]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const riskCount = analysis?.riskAlerts.length ?? 0;

  const handleSendToChat = () => {
    if (!analysis) return;
    const lines = [
      `${ticker} Sell Put $${analysis.strike.toFixed(2)} | Exp: ${expiration}`,
      `Cushion: ${analysis.safetyCushion.percent.toFixed(1)}% ($${analysis.safetyCushion.absolute.toFixed(2)}) | ROIC: ${analysis.roic.roic.toFixed(2)}% | Ann: ${analysis.roic.annualized.toFixed(1)}%`,
      `Premium: $${analysis.premium.toFixed(2)} | Breakeven: $${analysis.breakeven.toFixed(2)} | DTE: ${analysis.daysToExpiry}`,
      `Greeks: Δ${analysis.greeks.delta.toFixed(3)} Γ${analysis.greeks.gamma.toFixed(5)} Θ${analysis.greeks.theta.toFixed(3)} V${analysis.greeks.vega.toFixed(3)}`,
      `IV: ${(analysis.iv * 100).toFixed(1)}%${analysis.volatility ? ` | Rank: ${analysis.volatility.ivRank?.toFixed(1)}% | Signal: ${analysis.volatility.sellSignal}` : ""}`,
    ];
    if (riskCount > 0) {
      lines.push(`Risks: ${analysis.riskAlerts.join("; ")}`);
    }
    sendToChat(lines.join("\n"));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative glass border border-border/50 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50">
          <h3 className="text-lg font-semibold">
            {t("sellPutAnalysis")} — {ticker} ${strike.toFixed(2)}
          </h3>
          <div className="flex items-center gap-2">
            {analysis && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg transition-colors"
                onClick={handleSendToChat}
                title={t("sendToChat")}
              >
                <MessageCircle size={16} />
                {t("sendToChat")}
              </motion.button>
            )}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              className="p-1.5 hover:bg-accent/50 rounded-lg transition-colors"
              onClick={onClose}
            >
              <X size={20} />
            </motion.button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-muted-foreground">{t("loading")}</div>
            </div>
          )}
          
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400">
              {error}
            </div>
          )}

          <AnimatePresence>
            {analysis && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                {/* Summary Row */}
                <div className="flex flex-wrap items-center gap-3 p-4 glass rounded-xl border border-border/30">
                  <span className="px-3 py-1 bg-primary/20 text-primary rounded-lg font-mono font-semibold">
                    ${analysis.strike.toFixed(0)} P
                  </span>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">{t("cushion")}</span>
                    <span className="font-semibold">{analysis.safetyCushion.percent.toFixed(1)}%</span>
                  </div>
                  <div className="w-px h-8 bg-border/50" />
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">{t("roic")}</span>
                    <span className="font-semibold text-primary">{analysis.roic.roic.toFixed(2)}%</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">{t("annualized")}</span>
                    <span className="font-semibold">{analysis.roic.annualized.toFixed(1)}%</span>
                  </div>
                  <div className="w-px h-8 bg-border/50" />
                  {analysis.volatility && <SignalDot signal={analysis.volatility.sellSignal} t={t} />}
                  {riskCount > 0 && (
                    <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded-full text-xs font-medium">
                      {riskCount} {t("risks")}
                    </span>
                  )}
                </div>

                {/* Detail Grid */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: t("premium"), value: `$${analysis.premium.toFixed(2)}` },
                    { label: t("breakeven"), value: `$${analysis.breakeven.toFixed(2)}` },
                    { label: "DTE", value: `${analysis.daysToExpiry}${t("days")}` },
                    { label: t("maxProfit"), value: `$${analysis.maxProfit.toFixed(0)}`, color: "text-green-400" },
                    { label: t("maxLoss"), value: `$${analysis.maxLoss.toFixed(0)}`, color: "text-red-400" },
                    { label: t("cushion"), value: `$${analysis.safetyCushion.absolute.toFixed(2)}` },
                  ].map((item, i) => (
                    <div key={i} className="p-4 glass rounded-xl border border-border/30">
                      <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
                      <div className={`font-semibold ${item.color || ""}`}>{item.value}</div>
                    </div>
                  ))}
                </div>

                {/* Greeks */}
                <div className="p-4 glass rounded-xl border border-border/30">
                  <div className="text-sm font-medium mb-3">Greeks</div>
                  <div className="flex flex-wrap gap-4">
                    {[
                      { label: "Δ", value: analysis.greeks.delta.toFixed(3), tooltip: t("helpDelta") },
                      { label: "Γ", value: analysis.greeks.gamma.toFixed(5), tooltip: t("helpGamma") },
                      { label: "Θ", value: analysis.greeks.theta.toFixed(3), tooltip: t("helpTheta") },
                      { label: "V", value: analysis.greeks.vega.toFixed(3), tooltip: t("helpVega") },
                    ].map((greek, i) => (
                      <span key={i} className="group relative font-mono text-sm" title={greek.tooltip}>
                        {greek.label} {greek.value}
                        <span className="ml-1 text-xs text-muted-foreground cursor-help">?</span>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Volatility */}
                {analysis.volatility && (
                  <div className="p-4 glass rounded-xl border border-border/30">
                    <div className="text-sm font-medium mb-3">Volatility</div>
                    <div className="flex flex-wrap gap-4">
                      <span className="font-mono text-sm" title={t("helpIV")}>
                        IV {(analysis.iv * 100).toFixed(1)}%
                        <span className="ml-1 text-xs text-muted-foreground cursor-help">?</span>
                      </span>
                      {analysis.volatility.ivRank !== null && (
                        <span className="font-mono text-sm" title={t("helpIVRank")}>
                          Rank {analysis.volatility.ivRank.toFixed(1)}%
                          <span className="ml-1 text-xs text-muted-foreground cursor-help">?</span>
                        </span>
                      )}
                      {analysis.volatility.ivPercentile !== null && (
                        <span className="font-mono text-sm" title={t("helpIVPctl")}>
                          Pctl {analysis.volatility.ivPercentile.toFixed(1)}%
                          <span className="ml-1 text-xs text-muted-foreground cursor-help">?</span>
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Risks */}
                {riskCount > 0 && (
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                    <div className="text-sm font-medium mb-2 text-red-400">{t("risks")}</div>
                    <div className="space-y-2">
                      {analysis.riskAlerts.map((alert, i) => (
                        <div key={i} className="text-sm text-red-300">• {alert}</div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
