import { useEffect, useState } from "react";
import type { SellPutAnalysis } from "../types/options";
import { API_BASE } from "../hooks/useApi";
import { useI18n } from "../i18n";
import { useChatBridge } from "../chatBridge";

interface Props {
  ticker: string;
  strike: number;
  expiration: string;
  onClose: () => void;
}

function SignalDot({ signal, t }: { signal: string; t: (k: string) => string }) {
  const cls =
    signal === "FAVORABLE_SELL"
      ? "dot-good"
      : signal === "UNFAVORABLE_SELL"
        ? "dot-bad"
        : "dot-neutral";
  const label =
    signal === "FAVORABLE_SELL"
      ? t("signalGood")
      : signal === "UNFAVORABLE_SELL"
        ? t("signalBad")
        : t("signalNeutral");
  return <span className={`signal-dot ${cls}`}>{label}</span>;
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

    fetch(`${API_BASE}/sell-put-analysis/${ticker}?strike=${strike}&expiration=${expiration}`, {
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
    <div className="modal-anchor">
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {t("sellPutAnalysis")} — {ticker} ${strike.toFixed(2)}
          </h3>
          <div className="modal-header-actions">
            {analysis && (
              <button className="modal-send-chat-btn" onClick={handleSendToChat} title={t("sendToChat")}>
                💬 {t("sendToChat")}
              </button>
            )}
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="modal-body">
          {loading && <div className="loading-spinner">{t("loading")}</div>}
          {error && <div className="error-banner">{error}</div>}

          {analysis && (
            <>
              <div className="sp-summary-row">
                <span className="sp-tag">${analysis.strike.toFixed(0)} P</span>
                <span className="sp-kv">
                  <span className="sp-k">{t("cushion")}</span>
                  <span className="sp-v">{analysis.safetyCushion.percent.toFixed(1)}%</span>
                </span>
                <span className="sp-divider" />
                <span className="sp-kv">
                  <span className="sp-k">{t("roic")}</span>
                  <span className="sp-v sp-v-highlight">{analysis.roic.roic.toFixed(2)}%</span>
                </span>
                <span className="sp-kv">
                  <span className="sp-k">{t("annualized")}</span>
                  <span className="sp-v">{analysis.roic.annualized.toFixed(1)}%</span>
                </span>
                <span className="sp-divider" />
                {analysis.volatility && (
                  <SignalDot signal={analysis.volatility.sellSignal} t={t} />
                )}
                {riskCount > 0 && (
                  <span className="sp-risk-badge">{riskCount} {t("risks")}</span>
                )}
              </div>

              <div className="sp-detail-grid">
                <div className="sp-detail-card">
                  <span className="sp-k">{t("premium")}</span>
                  <span className="sp-detail-val">${analysis.premium.toFixed(2)}</span>
                </div>
                <div className="sp-detail-card">
                  <span className="sp-k">{t("breakeven")}</span>
                  <span className="sp-detail-val">${analysis.breakeven.toFixed(2)}</span>
                </div>
                <div className="sp-detail-card">
                  <span className="sp-k">DTE</span>
                  <span className="sp-detail-val">{analysis.daysToExpiry}{t("days")}</span>
                </div>
                <div className="sp-detail-card">
                  <span className="sp-k">{t("maxProfit")}</span>
                  <span className="sp-detail-val green">${analysis.maxProfit.toFixed(0)}</span>
                </div>
                <div className="sp-detail-card">
                  <span className="sp-k">{t("maxLoss")}</span>
                  <span className="sp-detail-val red">${analysis.maxLoss.toFixed(0)}</span>
                </div>
                <div className="sp-detail-card">
                  <span className="sp-k">{t("cushion")}</span>
                  <span className="sp-detail-val">${analysis.safetyCushion.absolute.toFixed(2)}</span>
                </div>
              </div>

              <div className="sp-detail-section">
                <div className="sp-section-title">Greeks</div>
                <div className="sp-detail-row sp-greeks">
                  <span className="has-tooltip" data-tooltip={t("helpDelta")}>
                    Δ {analysis.greeks.delta.toFixed(3)} <i className="tip-icon">?</i>
                  </span>
                  <span className="has-tooltip" data-tooltip={t("helpGamma")}>
                    Γ {analysis.greeks.gamma.toFixed(5)} <i className="tip-icon">?</i>
                  </span>
                  <span className="has-tooltip" data-tooltip={t("helpTheta")}>
                    Θ {analysis.greeks.theta.toFixed(3)} <i className="tip-icon">?</i>
                  </span>
                  <span className="has-tooltip" data-tooltip={t("helpVega")}>
                    V {analysis.greeks.vega.toFixed(3)} <i className="tip-icon">?</i>
                  </span>
                </div>
              </div>

              {analysis.volatility && (
                <div className="sp-detail-section">
                  <div className="sp-section-title">Volatility</div>
                  <div className="sp-detail-row sp-greeks">
                    <span className="has-tooltip" data-tooltip={t("helpIV")}>
                      IV {(analysis.iv * 100).toFixed(1)}% <i className="tip-icon">?</i>
                    </span>
                    {analysis.volatility.ivRank !== null && (
                      <span className="has-tooltip" data-tooltip={t("helpIVRank")}>
                        Rank {analysis.volatility.ivRank.toFixed(1)}% <i className="tip-icon">?</i>
                      </span>
                    )}
                    {analysis.volatility.ivPercentile !== null && (
                      <span className="has-tooltip" data-tooltip={t("helpIVPctl")}>
                        Pctl {analysis.volatility.ivPercentile.toFixed(1)}% <i className="tip-icon">?</i>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {riskCount > 0 && (
                <div className="sp-detail-section sp-risks">
                  <div className="sp-section-title">{t("risks")}</div>
                  {analysis.riskAlerts.map((alert, i) => (
                    <div key={i} className="sp-risk-item">{alert}</div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}
