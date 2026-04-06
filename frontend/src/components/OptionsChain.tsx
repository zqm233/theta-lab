import { useCallback, useEffect, useRef, useState } from "react";
import type { OptionContract, OptionsChainData } from "../types/options";
import { fetchApi } from "../hooks/useApi";
import { useI18n } from "../i18n";
import { useChatBridge } from "../chatBridge";
import { usePortfolio } from "../portfolio";
import { usePrice } from "../priceProvider";
import { useSettings } from "../settings";
import { formatUsMarketTime } from "../usMarketTime";
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
  const sharedPrice = usePrice(ticker);
  const { refreshIntervalMs, jitteredInterval } = useSettings();
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
  const [chain, setChain] = useState<OptionsChainData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedExpiration, _setSelectedExpiration] = useState<string>(() => {
    try { return localStorage.getItem(`thetalab-exp-${ticker}`) || ""; } catch { return ""; }
  });
  const setSelectedExpiration = useCallback((exp: string) => {
    _setSelectedExpiration(exp);
    try { if (exp) localStorage.setItem(`thetalab-exp-${ticker}`, exp); } catch { /* noop */ }
  }, [ticker]);
  const [activeTab, setActiveTab] = useState<"puts" | "calls">("puts");
  const [selectedStrike, setSelectedStrike] = useState<number | null>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenu | null>(null);
  const [chainUpdatedAt, setChainUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [faQuota, setFaQuota] = useState<FaQuota>({ configured: false, limit: 5, used: 0, remaining: 0 });

  const refreshFaQuota = useCallback(() => {
    fetchApi<FaQuota>("/flashalpha/quota")
      .then(setFaQuota)
      .catch(() => {});
  }, []);

  useEffect(() => { refreshFaQuota(); }, [refreshFaQuota]);

  interface CacheEntry {
    chain: OptionsChainData;
    expiration: string;
    updatedAt: Date;
    tab: "puts" | "calls";
  }
  const cacheRef = useRef<Record<string, CacheEntry>>({});

  const applyData = useCallback((data: OptionsChainData, exp: string, tab?: "puts" | "calls") => {
    setChain(data);
    setSelectedExpiration(exp);
    const now = new Date();
    setChainUpdatedAt(now);
    cacheRef.current[data.ticker] = {
      chain: data,
      expiration: exp,
      updatedAt: now,
      tab: tab ?? "puts",
    };
  }, []);

  const loadChain = useCallback(async (t: string, exp?: string, silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    if (silent) setRefreshing(true);
    try {
      const path = exp
        ? `/options-chain/${t}?expiration=${exp}`
        : `/options-chain/${t}`;
      const data = await fetchApi<OptionsChainData>(path);

      if (!exp && data.daysToExpiry === 0 && data.availableExpirations.length > 1) {
        const nextExp = data.availableExpirations[1];
        const nextData = await fetchApi<OptionsChainData>(
          `/options-chain/${t}?expiration=${nextExp}`
        );
        applyData(nextData, nextData.expiration, activeTab);
      } else {
        applyData(data, exp || data.expiration, activeTab);
      }
      if (!silent) setError(null);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "Failed");
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, [applyData, activeTab]);

  useEffect(() => {
    setSelectedStrike(null);
    const cached = cacheRef.current[ticker];
    if (cached) {
      setChain(cached.chain);
      setSelectedExpiration(cached.expiration);
      setChainUpdatedAt(cached.updatedAt);
      setActiveTab(cached.tab);
      setError(null);
      const age = Date.now() - cached.updatedAt.getTime();
      if (age > refreshIntervalMs) {
        loadChain(ticker, cached.expiration, true);
      }
    } else {
      const savedExp = (() => { try { return localStorage.getItem(`thetalab-exp-${ticker}`) || ""; } catch { return ""; } })();
      if (savedExp) {
        _setSelectedExpiration(savedExp);
        loadChain(ticker, savedExp);
      } else {
        _setSelectedExpiration("");
        loadChain(ticker);
      }
    }
  }, [ticker]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedExpiration) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        loadChain(ticker, selectedExpiration, true);
        schedule();
      }, jitteredInterval());
    };
    schedule();
    return () => clearTimeout(timer);
  }, [ticker, selectedExpiration, loadChain, jitteredInterval]);

  const handleExpirationChange = (exp: string) => {
    setSelectedExpiration(exp);
    setSelectedStrike(null);
    loadChain(ticker, exp);
  };

  const handleRefresh = () => {
    if (selectedExpiration) {
      loadChain(ticker, selectedExpiration, true);
    }
  };

  const formatTime = (d: Date) =>
    `${formatUsMarketTime(d, lang)}${t("marketTimeEt")}`;

  const handleRowContextMenu = (e: React.MouseEvent, opt: OptionContract, tab: "puts" | "calls") => {
    e.preventDefault();
    setCtxMenu({
      kind: "row",
      x: e.clientX,
      y: e.clientY,
      strike: opt.strike,
      option: opt,
      tab,
    });
  };

  const handleTabContextMenu = (e: React.MouseEvent, tab: "puts" | "calls") => {
    e.preventDefault();
    setCtxMenu({ kind: "tab", x: e.clientX, y: e.clientY, tab });
  };

  const formatContractLineForChat = (o: OptionContract, side: "Put" | "Call") =>
    `${ticker} ${side} $${o.strike.toFixed(2)} | Last: $${o.lastPrice.toFixed(2)} | Bid: $${o.bid.toFixed(2)} | Ask: $${o.ask.toFixed(2)} | Vol: ${o.volume.toLocaleString()} | OI: ${o.openInterest.toLocaleString()} | IV: ${(o.impliedVolatility * 100).toFixed(1)}% | Exp: ${selectedExpiration}`;

  const handleAnalyze = () => {
    if (ctxMenu?.kind === "row") {
      setSelectedStrike(ctxMenu.strike);
      setCtxMenu(null);
    }
  };

  const openAddForm = () => {
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
  };

  const submitAddForm = () => {
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
  };

  const handleSendRowToChat = () => {
    if (!ctxMenu || ctxMenu.kind !== "row") return;
    const o = ctxMenu.option;
    const type = ctxMenu.tab === "puts" ? "Put" : "Call";
    sendToChat(formatContractLineForChat(o, type));
    setCtxMenu(null);
  };

  const handleAdvancedAnalysis = () => {
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
    setTimeout(refreshFaQuota, 8000);
  };

  const handleSendAllTabToChat = () => {
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
  };

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

  const FAKE_IV = [0.500005, 0.250007, 0.125009, 0.062509, 0.00001];
  const isReliableIV = (iv: number, strike: number) => {
    if (iv <= 0.001) return false;
    if (FAKE_IV.some((f) => Math.abs(iv - f) < 0.00001)) return false;
    if (!chain) return iv > 0 && iv < 3;
    const spot = sharedPrice?.price ?? chain.currentPrice;
    const distance = Math.abs(strike - spot) / spot;
    if (distance > 0.3 && iv > 2) return false;
    if (distance > 0.5) return false;
    return true;
  };

  const formatIV = (iv: number, strike: number) => {
    if (!isReliableIV(iv, strike)) return "N/A";
    return `${(iv * 100).toFixed(1)}%`;
  };

  const spotForMoneyness =
    sharedPrice?.price != null && Number.isFinite(sharedPrice.price) && sharedPrice.price > 0
      ? sharedPrice.price
      : chain && chain.currentPrice > 0
        ? chain.currentPrice
        : null;

  const rowMoneynessClass = (opt: OptionContract, tab: "puts" | "calls") => {
    if (spotForMoneyness == null) return opt.inTheMoney ? "itm" : "otm";
    if (tab === "calls") return spotForMoneyness > opt.strike ? "itm" : "otm";
    return opt.strike > spotForMoneyness ? "itm" : "otm";
  };

  return (
    <div className="options-chain">
      {selectedStrike !== null && (
        <SellPutPanel
          ticker={ticker}
          strike={selectedStrike}
          expiration={selectedExpiration}
          onClose={() => setSelectedStrike(null)}
        />
      )}

      <header className="chain-header">
        <div className="chain-header-left">
          <h2 className="chain-ticker">{ticker}</h2>
          {chain?.earningsWarning?.isClose && (
            <span className="earnings-badge" title={`${chain.underlying ?? ticker} ${chain.earningsWarning.date}`}>
              ⚠ {t("earningsWarning")} {chain.earningsWarning.daysUntil}{t("earningsDays")}
            </span>
          )}
        </div>
        <div className="chain-meta">
          {sharedPrice?.price != null && (
            <span className="current-price">
              ${sharedPrice.price.toFixed(2)}
              {sharedPrice.change != null && (
                <span className={`price-change ${sharedPrice.change >= 0 ? "up" : "down"}`}>
                  {" "}{sharedPrice.change >= 0 ? "+" : ""}{sharedPrice.change.toFixed(2)}%
                </span>
              )}
            </span>
          )}
          <div className="chain-refresh-bar">
            {chainUpdatedAt && (
              <span className="portfolio-updated-at">
                {t("lastUpdated")} {formatTime(chainUpdatedAt)}
              </span>
            )}
            <button
              className="portfolio-refresh-btn"
              onClick={handleRefresh}
              disabled={refreshing}
              title={t("refresh")}
            >
              {refreshing ? "⟳" : "↻"}
            </button>
          </div>
        </div>
      </header>

      {chain?.availableExpirations && (
        <div className="expiration-bar">
          <label>{t("expiration")}</label>
          <select
            value={selectedExpiration}
            onChange={(e) => handleExpirationChange(e.target.value)}
          >
            {chain.availableExpirations.map((exp) => (
              <option key={exp} value={exp}>
                {exp}
              </option>
            ))}
          </select>
          {chain.daysToExpiry !== undefined && (
            <span className="dte-badge">{chain.daysToExpiry} DTE</span>
          )}
          {chain.ivRank != null && (
            <span
              className={`iv-rank-badge has-tooltip ${
                chain.ivRank > 50 ? "iv-high" : chain.ivRank < 25 ? "iv-low" : "iv-mid"
              }`}
              data-tooltip={
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

      {loading && <div className="loading-spinner">{t("loading")}</div>}
      {error && <div className="error-banner">{error}</div>}

      {chain && !loading && (
        <>
          <div className="tab-bar">
            <button
              type="button"
              className={activeTab === "puts" ? "active" : ""}
              onClick={() => { setActiveTab("puts"); if (cacheRef.current[ticker]) cacheRef.current[ticker].tab = "puts"; }}
              onContextMenu={(e) => handleTabContextMenu(e, "puts")}
            >
              {t("tabPuts")} ({chain.puts.length})
            </button>
            <button
              type="button"
              className={activeTab === "calls" ? "active" : ""}
              onClick={() => { setActiveTab("calls"); if (cacheRef.current[ticker]) cacheRef.current[ticker].tab = "calls"; }}
              onContextMenu={(e) => handleTabContextMenu(e, "calls")}
            >
              {t("tabCalls")} ({chain.calls.length})
            </button>
          </div>

          <div className="table-container">
            <table className="chain-table">
              <thead>
                <tr>
                  <th>{t("colStrike")}</th>
                  <th>{t("colLast")}</th>
                  <th>{t("colBid")}</th>
                  <th>{t("colAsk")}</th>
                  <th>{t("colVolume")}</th>
                  <th>{t("colOI")}</th>
                  <th>{t("colIV")}</th>
                </tr>
              </thead>
              <tbody>
                {(activeTab === "puts" ? chain.puts : chain.calls).map(
                  (opt: OptionContract) => (
                    <tr
                      key={opt.contractSymbol}
                      className={[
                        rowMoneynessClass(opt, activeTab),
                        selectedStrike === opt.strike ? "selected-row" : "",
                      ].join(" ")}
                      onContextMenu={(e) => handleRowContextMenu(e, opt, activeTab)}
                    >
                      <td className="strike">{opt.strike.toFixed(2)}</td>
                      <td>{opt.lastPrice.toFixed(2)}</td>
                      <td>{opt.bid.toFixed(2)}</td>
                      <td>{opt.ask.toFixed(2)}</td>
                      <td>{opt.volume.toLocaleString()}</td>
                      <td>{opt.openInterest.toLocaleString()}</td>
                      <td>
                        {formatIV(opt.impliedVolatility, opt.strike)}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>

        </>
      )}

      {ctxMenu && (
        <div
          ref={menuRef}
          className="ctx-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
        >
          {ctxMenu.kind === "tab" ? (
            <button type="button" className="ctx-menu-item" onClick={handleSendAllTabToChat}>
              💬 {t("sendToChat")}
            </button>
          ) : (
            <>
              {ctxMenu.tab === "puts" && (
                <button type="button" className="ctx-menu-item" onClick={handleAnalyze}>
                  {t("ctxMenuAnalyzePut")} — ${ctxMenu.strike.toFixed(2)}
                </button>
              )}
              <button type="button" className="ctx-menu-item" onClick={openAddForm}>
                📥 {t("addToPortfolio")}
              </button>
              {faQuota.configured && (
                <button
                  type="button"
                  className="ctx-menu-item"
                  onClick={handleAdvancedAnalysis}
                  disabled={faQuota.remaining <= 0}
                  style={faQuota.remaining <= 0 ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                >
                  🔍 {t("ctxAdvancedAnalysis")}
                  <span style={{ fontSize: "0.75rem", opacity: 0.6, marginLeft: 6 }}>
                    {faQuota.remaining > 0
                      ? `${faQuota.remaining}/${faQuota.limit}`
                      : `${t("ctxQuotaExhausted")} · ${t("quotaResetTime")}`}
                  </span>
                </button>
              )}
              <button type="button" className="ctx-menu-item" onClick={handleSendRowToChat}>
                💬 {t("sendToChat")}
              </button>
            </>
          )}
        </div>
      )}

      {addForm && (
        <div className="modal-anchor">
          <div className="modal-overlay" onClick={() => setAddForm(null)}>
            <div className="modal-dialog add-position-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>
                  {t("addToPortfolio")} — {addForm.ticker} {addForm.type === "put" ? "Put" : "Call"} ${addForm.strike.toFixed(2)}
                </h3>
                <button className="modal-close" onClick={() => setAddForm(null)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="add-form-field">
                  <label>{t("portfolioSide")}</label>
                  <div className="add-form-sides">
                    <button
                      className={`side-toggle ${formSide === "sell" ? "active sell" : ""}`}
                      onClick={() => setFormSide("sell")}
                    >
                      {t("portfolioSell")}
                    </button>
                    <button
                      className={`side-toggle ${formSide === "buy" ? "active buy" : ""}`}
                      onClick={() => setFormSide("buy")}
                    >
                      {t("portfolioBuy")}
                    </button>
                  </div>
                </div>
                <div className="add-form-field">
                  <label>{t("portfolioQty")}</label>
                  <input
                    type="number"
                    min="1"
                    value={formQty}
                    onChange={(e) => setFormQty(e.target.value)}
                    className="add-form-input"
                    autoFocus
                  />
                </div>
                <div className="add-form-field">
                  <label>{t("portfolioEntry")}</label>
                  <div className="add-form-price-row">
                    <span className="add-form-dollar">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formEntry}
                      onChange={(e) => setFormEntry(e.target.value)}
                      className="add-form-input"
                    />
                  </div>
                </div>
                <div className="add-form-meta">
                  {t("expiration")}: {addForm.expiration}
                </div>
                <button className="add-form-submit" onClick={submitAddForm}>
                  {t("addToPortfolio")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
