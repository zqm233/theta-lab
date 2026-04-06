import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "../hooks/useApi";
import { useChatBridge } from "../chatBridge";
import { useI18n } from "../i18n";
import { useSettings } from "../settings";
import { formatUsMarketTime } from "../usMarketTime";

interface Product {
  id: string;
  coin: string;
  direction: string;
  optionType: string;
  investCoin: string;
  exercisedCoin: string;
  strikePrice: number;
  apr: number;
  aprPercent: number;
  duration: number;
  settleDate: string;
  minAmount: number;
  maxAmount: number;
  stepSize: number;
  canPurchase: boolean;
}

interface DcdOrder {
  ordId: string;
  productId: string;
  coin: string;
  direction: string;
  strikePrice: number;
  apr: number;
  aprPercent: number;
  investAmt: number;
  investCcy: string;
  state: string;
  settleDate: string;
  createTime: string;
}

interface CtxMenu {
  x: number;
  y: number;
  product: Product;
}

type Exchange = "binance" | "okx";

const COINS = ["BTC", "ETH", "SOL", "BNB"];

export default function DualInvestment() {
  const { t, lang } = useI18n();
  const { sendToChat, submitToChat } = useChatBridge();
  const { jitteredInterval } = useSettings();
  const [exchangeStatus, setExchangeStatus] = useState<Record<Exchange, boolean>>({
    binance: false,
    okx: false,
  });
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [exchange, setExchange] = useState<Exchange>("okx");
  const [coin, setCoin] = useState("BTC");
  const [direction, setDirection] = useState<"buy_low" | "sell_high">("buy_low");
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSettle, setSelectedSettle] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spotPrice, setSpotPrice] = useState<number | null>(null);
  const [spotUpdatedAt, setSpotUpdatedAt] = useState<Date | null>(null);
  const [quoteRefreshing, setQuoteRefreshing] = useState(false);
  const [availBal, setAvailBal] = useState<number | null>(null);
  const [balCcy, setBalCcy] = useState("");
  const [dcdOrders, setDcdOrders] = useState<DcdOrder[]>([]);
  const [ordersExpanded, setOrdersExpanded] = useState(true);
  const [subModal, setSubModal] = useState<Product | null>(null);
  const [subPct, setSubPct] = useState(50);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const coinMountRef = useRef(false);



  useEffect(() => {
    fetch(`${API_BASE}/dual-invest/status`)
      .then((r) => (r.ok ? r.json() : { binance: false, okx: false }))
      .then((d) => {
        setExchangeStatus({ binance: !!d.binance, okx: !!d.okx });
        if (!d.okx && d.binance) setExchange("binance");
        setStatusLoaded(true);
      })
      .catch(() => setStatusLoaded(true));
  }, []);

  const isConfigured = exchangeStatus[exchange];

  const fetchProducts = useCallback(
    async (c: string, dir: string, ex: Exchange) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${API_BASE}/dual-invest/products?coin=${c}&direction=${dir}&exchange=${ex}`
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `HTTP ${res.status}`);
        }
        const data = await res.json();
        const prods: Product[] = data.products ?? [];
        setProducts(prods);
        setSelectedSettle("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed");
        setProducts([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!statusLoaded || !isConfigured) return;
    fetchProducts(coin, direction, exchange);
  }, [statusLoaded, isConfigured, coin, direction, exchange, fetchProducts]);

  useEffect(() => {
    if (coinMountRef.current) {
      setSpotPrice(null);
      setSpotUpdatedAt(null);
    }
    coinMountRef.current = true;
  }, [coin]);

  const fetchSpot = useCallback(
    async (silent = false) => {
      if (silent) setQuoteRefreshing(true);
      try {
        const r = await fetch(`${API_BASE}/quote?ticker=${coin}&market=crypto`);
        const d = r.ok ? await r.json() : null;
        if (d?.price != null && Number.isFinite(d.price)) {
          setSpotPrice(d.price);
          setSpotUpdatedAt(new Date());
        }
      } catch {
        /* silent for rate limits */
      } finally {
        setQuoteRefreshing(false);
      }
    },
    [coin]
  );

  useEffect(() => {
    fetchSpot(false);
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        fetchSpot(true);
        schedule();
      }, jitteredInterval());
    };
    schedule();
    return () => clearTimeout(timer);
  }, [coin, fetchSpot, jitteredInterval]);

  const formatSpotTime = (d: Date) =>
    `${formatUsMarketTime(d, lang)}${t("marketTimeEt")}`;

  const investCoin = direction === "buy_low" ? "USDT" : coin;

  const refreshBalance = useCallback(() => {
    if (exchange !== "okx" || !isConfigured) return;
    fetch(`${API_BASE}/okx/balance?ccy=${investCoin}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.balances) return;
        const entry = d.balances.find((b: { ccy: string }) => b.ccy === investCoin);
        setAvailBal(entry ? entry.availBal : 0);
        setBalCcy(entry ? entry.ccy : investCoin);
      })
      .catch(() => {});
  }, [exchange, isConfigured, investCoin]);

  useEffect(() => {
    if (exchange !== "okx" || !isConfigured) {
      setAvailBal(null);
      setBalCcy("");
      return;
    }
    let cancelled = false;
    const load = () => {
      fetch(`${API_BASE}/okx/balance?ccy=${investCoin}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (cancelled || !d?.balances) return;
          const entry = d.balances.find(
            (b: { ccy: string }) => b.ccy === investCoin
          );
          if (entry) {
            setAvailBal(entry.availBal);
            setBalCcy(entry.ccy);
          } else {
            setAvailBal(0);
            setBalCcy(investCoin);
          }
        })
        .catch(() => {});
    };
    load();
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => { load(); schedule(); }, jitteredInterval());
    };
    schedule();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [exchange, isConfigured, investCoin, jitteredInterval]);

  const fetchOrders = useCallback(() => {
    if (exchange !== "okx" || !isConfigured) return;
    fetch(`${API_BASE}/okx/dcd/orders?state=live`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.orders) setDcdOrders(d.orders);
      })
      .catch(() => {});
  }, [exchange, isConfigured]);

  useEffect(() => {
    if (exchange !== "okx" || !isConfigured) {
      setDcdOrders([]);
      return;
    }
    fetchOrders();
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => { fetchOrders(); schedule(); }, jitteredInterval());
    };
    schedule();
    return () => clearTimeout(timer);
  }, [exchange, isConfigured, fetchOrders, jitteredInterval]);

  const settleDates = useMemo(() => {
    const dates = [...new Set(products.map((p) => p.settleDate))];
    dates.sort();
    return dates;
  }, [products]);

  const activSettle = selectedSettle || (settleDates.length > 0 ? settleDates[0] : "");

  const filteredProducts = useMemo(() => {
    if (!activSettle) return products;
    return products.filter((p) => p.settleDate === activSettle);
  }, [products, activSettle]);

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

  const handleRowContextMenu = (e: React.MouseEvent, product: Product) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, product });
  };

  const formatProductLine = (p: Product) => {
    const dir = p.direction === "buy_low" ? "Buy Low" : "Sell High";
    return `${p.coin} ${dir} | Strike $${p.strikePrice.toLocaleString()} | APR ${p.aprPercent.toFixed(2)}% | ${p.duration}d | Settle ${p.settleDate} | ${p.investCoin}`;
  };

  const handleAnalyze = () => {
    if (!ctxMenu) return;
    const p = ctxMenu.product;
    const dir = p.direction === "buy_low" ? "低买" : "高卖";
    const dirEn = p.direction === "buy_low" ? "Buy Low" : "Sell High";
    const spot = spotPrice ? `$${spotPrice.toLocaleString()}` : "unknown";
    const strikeStr = `$${p.strikePrice.toLocaleString()}`;
    const prompt = lang === "zh"
      ? `分析这个 ${p.coin} ${dir}双币投资产品：行权价 ${strikeStr}，APR ${p.aprPercent.toFixed(2)}%，期限 ${p.duration} 天，交割日 ${p.settleDate}，当前现货价 ${spot}。请查看市场情绪、技术面和最新新闻，帮我判断这个价位是否安全，值得申购吗？`
      : `Analyze this ${p.coin} ${dirEn} DCD: strike ${strikeStr}, APR ${p.aprPercent.toFixed(2)}%, ${p.duration} days, settle ${p.settleDate}, spot ${spot}. Check market sentiment, technicals, and news. Is this strike safe? Worth subscribing?`;
    const displayText = lang === "zh"
      ? `分析 ${p.coin} ${dir} ${strikeStr}`
      : `Analyze ${p.coin} ${dirEn} ${strikeStr}`;
    submitToChat(prompt, displayText);
    setCtxMenu(null);
  };

  const handleSendToChat = () => {
    if (!ctxMenu) return;
    sendToChat(formatProductLine(ctxMenu.product));
    setCtxMenu(null);
  };

  const handleSubscribe = () => {
    if (!ctxMenu) return;
    setSubModal(ctxMenu.product);
    setSubPct(50);
    setCtxMenu(null);
  };

  const subBal = availBal ?? 0;
  const subRawAmt = subModal ? subBal * (subPct / 100) : 0;
  const subStep = subModal?.stepSize || 0.0001;
  const subAmount = subModal
    ? Math.min(Math.max(Math.floor(subRawAmt / subStep) * subStep, subModal.minAmount), subModal.maxAmount)
    : 0;
  const subYield = subModal
    ? subAmount * (subModal.aprPercent / 100) * (subModal.duration / 365)
    : 0;

  const confirmSubscribe = () => {
    if (!subModal) return;
    const p = subModal;
    const dir = p.direction === "buy_low" ? "低买" : "高卖";
    const amt = subAmount.toLocaleString(undefined, { maximumFractionDigits: 8 });
    const prompt =
      lang === "zh"
        ? `帮我申购双币赢：${p.id}，投入 ${amt} ${p.investCoin}，${p.coin} ${dir}，行权价 $${p.strikePrice.toLocaleString()}，APR ${p.aprPercent.toFixed(2)}%，期限 ${p.duration} 天。`
        : `Subscribe to DCD: ${p.id}, invest ${amt} ${p.investCoin}, ${p.coin} ${p.direction === "buy_low" ? "Buy Low" : "Sell High"}, strike $${p.strikePrice.toLocaleString()}, APR ${p.aprPercent.toFixed(2)}%, ${p.duration} days.`;
    submitToChat(prompt);
    setSubModal(null);
    setTimeout(refreshBalance, 5000);
  };

  const handleRedeem = (order: DcdOrder) => {
    const prompt =
      lang === "zh"
        ? `帮我提前赎回这个双币赢订单：订单号 ${order.ordId}，产品 ${order.productId}，投入 ${order.investAmt} ${order.investCcy}。`
        : `Redeem this DCD order early: order ID ${order.ordId}, product ${order.productId}, invested ${order.investAmt} ${order.investCcy}.`;
    submitToChat(prompt);
  };

  const cushion = (strike: number) => {
    if (!spotPrice || spotPrice <= 0) return null;
    if (direction === "buy_low") {
      return ((spotPrice - strike) / spotPrice) * 100;
    }
    return ((strike - spotPrice) / spotPrice) * 100;
  };

  if (!statusLoaded) {
    return <div className="loading-spinner">{t("loading")}</div>;
  }

  const noExchange = !exchangeStatus.binance && !exchangeStatus.okx;
  if (noExchange) {
    return (
      <div className="portfolio-empty">
        <p>{t("dualInvestNotConfigured")}</p>
        <p style={{ fontSize: "0.8rem", marginTop: 8, color: "var(--text-muted)" }}>
          {t("dualInvestConfigHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="options-chain">
      <header className="chain-header">
        <div className="chain-header-left">
          <h2 className="chain-ticker">{t("navDualInvest")}</h2>
        </div>
        <div className="chain-meta">
          {spotPrice != null && (
            <span style={{ fontSize: "0.9rem" }}>
              {coin}{" "}
              <span style={{ fontWeight: 700 }}>
                ${spotPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </span>
          )}
          {exchange === "okx" && availBal != null && (
            <span style={{ fontSize: "0.82rem", opacity: 0.6, borderLeft: "1px solid var(--border)", paddingLeft: 12 }}>
              {t("dualBalance")}: {availBal.toLocaleString(undefined, { maximumFractionDigits: 4 })} {balCcy}
            </span>
          )}
          <div className="chain-refresh-bar">
            {spotUpdatedAt && (
              <span className="portfolio-updated-at">
                {t("lastUpdated")} {formatSpotTime(spotUpdatedAt)}
              </span>
            )}
            <button
              type="button"
              className="portfolio-refresh-btn"
              onClick={() => fetchSpot(true)}
              disabled={quoteRefreshing}
              title={t("refresh")}
            >
              {quoteRefreshing ? "⟳" : "↻"}
            </button>
          </div>
        </div>
      </header>

      <div className="expiration-bar">
        <label>{t("dualExchange")}</label>
        <div className="tab-bar" style={{ marginBottom: 0 }}>
          {(["okx", "binance"] as Exchange[]).map((ex) => (
            <button
              key={ex}
              className={exchange === ex ? "active" : ""}
              onClick={() => setExchange(ex)}
              disabled={!exchangeStatus[ex]}
              title={exchangeStatus[ex] ? "" : t("dualExchangeNotConfigured")}
            >
              {ex === "okx" ? (lang === "zh" ? "欧易" : "OKX") : (lang === "zh" ? "币安" : "Binance")}
            </button>
          ))}
        </div>

        <span style={{ width: 1, height: 20, background: "var(--border)", margin: "0 8px" }} />

        <label>{t("dualInvestCoin")}</label>
        <div style={{ display: "flex", gap: 4 }}>
          {COINS.map((c) => (
            <button
              key={c}
              className={`settings-option${coin === c ? " active" : ""}`}
              style={{ padding: "4px 12px", fontSize: "0.8rem" }}
              onClick={() => setCoin(c)}
            >
              {c}
            </button>
          ))}
        </div>

        <span style={{ width: 1, height: 20, background: "var(--border)", margin: "0 8px" }} />

        <div className="tab-bar" style={{ marginBottom: 0 }}>
          <button
            className={direction === "buy_low" ? "active" : ""}
            onClick={() => setDirection("buy_low")}
          >
            {t("dualBuyLow")}
          </button>
          <button
            className={direction === "sell_high" ? "active" : ""}
            onClick={() => setDirection("sell_high")}
          >
            {t("dualSellHigh")}
          </button>
        </div>
      </div>

      {/* Settle date selector */}
      {!loading && settleDates.length > 0 && (
        <div className="expiration-bar">
          <label>{t("dualSettleDate")}</label>
          <select
            value={activSettle}
            onChange={(e) => setSelectedSettle(e.target.value)}
          >
            {settleDates.map((d) => {
              const dur = products.find((p) => p.settleDate === d)?.duration ?? 0;
              return (
                <option key={d} value={d}>
                  {d} ({dur}{t("days")})
                </option>
              );
            })}
          </select>
        </div>
      )}

      {!isConfigured && (
        <div className="portfolio-empty">
          <p>{t("dualExchangeNotConfigured")}</p>
        </div>
      )}

      {isConfigured && loading && (
        <div className="loading-spinner">{t("loading")}</div>
      )}
      {error && <div className="error-banner">{error}</div>}

      {isConfigured && !loading && filteredProducts.length === 0 && !error && (
        <div className="portfolio-empty">{t("dualInvestEmpty")}</div>
      )}

      {isConfigured && !loading && filteredProducts.length > 0 && (
        <div className="table-container">
          <table className="chain-table align-left">
            <thead>
              <tr>
                <th>{t("colStrike")}</th>
                <th>APR</th>
                <th>{t("cushion")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p) => {
                const c = cushion(p.strikePrice);
                return (
                  <tr
                    key={p.id}
                    onContextMenu={(e) => handleRowContextMenu(e, p)}
                  >
                    <td>
                      {p.strikePrice.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td style={{ color: "var(--green)", fontWeight: 600 }}>
                      {p.aprPercent.toFixed(2)}%
                    </td>
                    <td>
                      {c != null ? (
                        <span className={c >= 0 ? "pnl-up" : "pnl-down"}>
                          {c >= 0 ? "+" : ""}
                          {c.toFixed(1)}%
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {exchange === "okx" && isConfigured && (
        <div className="settings-section" style={{ marginTop: 16 }}>
          <div
            style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
            onClick={() => setOrdersExpanded((v) => !v)}
          >
            <span style={{ fontSize: "0.7rem", opacity: 0.5 }}>{ordersExpanded ? "▼" : "▶"}</span>
            <label className="settings-label" style={{ margin: 0, cursor: "pointer" }}>
              {t("dualMyOrders")} ({dcdOrders.length})
            </label>
          </div>
          {ordersExpanded && (
            dcdOrders.length === 0 ? (
              <div className="portfolio-empty" style={{ padding: "12px 0" }}>
                {t("dualNoOrders")}
              </div>
            ) : (
              <div className="table-container" style={{ marginTop: 8 }}>
                <table className="chain-table align-left">
                  <thead>
                    <tr>
                      <th>{t("dualInvestCoin")}</th>
                      <th>{t("dualOrderType")}</th>
                      <th>{t("colStrike")}</th>
                      <th>APR</th>
                      <th>{t("dualOrderAmt")}</th>
                      <th>{t("dualSettleDate")}</th>
                      <th>{t("dualOrderState")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dcdOrders.map((o) => (
                      <tr key={o.ordId}>
                        <td>{o.coin}</td>
                        <td>
                          <span style={{
                            fontSize: "0.78rem",
                            padding: "1px 6px",
                            borderRadius: 4,
                            background: o.direction === "buy_low" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                            color: o.direction === "buy_low" ? "var(--green)" : "var(--red, #ef4444)",
                          }}>
                            {o.direction === "buy_low" ? t("dualBuyLow") : t("dualSellHigh")}
                          </span>
                        </td>
                        <td>{o.strikePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td style={{ color: "var(--green)", fontWeight: 600 }}>
                          {o.aprPercent.toFixed(2)}%
                        </td>
                        <td>{o.investAmt.toLocaleString(undefined, { maximumFractionDigits: 4 })} {o.investCcy}</td>
                        <td>{o.settleDate}</td>
                        <td>{o.state}</td>
                        <td>
                          <button
                            type="button"
                            className="settings-option"
                            style={{ padding: "2px 8px", fontSize: "0.75rem" }}
                            onClick={() => handleRedeem(o)}
                          >
                            {t("dualRedeem")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}

      {ctxMenu && (
        <div
          ref={menuRef}
          className="ctx-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
        >
          <button type="button" className="ctx-menu-item" onClick={handleAnalyze}>
            {t("ctxMenuAnalyzePut")} — ${ctxMenu.product.strikePrice.toLocaleString()}
          </button>
          {exchange === "okx" && ctxMenu.product.canPurchase && (
            <button type="button" className="ctx-menu-item" onClick={handleSubscribe}>
              {t("dualSubscribe")} — ${ctxMenu.product.strikePrice.toLocaleString()}
            </button>
          )}
          <button type="button" className="ctx-menu-item" onClick={handleSendToChat}>
            {t("sendToChat")}
          </button>
        </div>
      )}

      {subModal && (
        <div className="modal-overlay" onClick={() => setSubModal(null)}>
          <div className="modal-dialog" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                {t("dualSubscribeTitle")}: {subModal.coin}{" "}
                {subModal.direction === "buy_low" ? t("dualBuyLow") : t("dualSellHigh")}
              </h3>
              <button type="button" className="modal-close" onClick={() => setSubModal(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: "flex", gap: 24, fontSize: "0.85rem" }}>
                <div>
                  <span style={{ opacity: 0.6 }}>{t("colStrike")}:</span>{" "}
                  <strong>${subModal.strikePrice.toLocaleString()}</strong>
                </div>
                <div>
                  <span style={{ opacity: 0.6 }}>APR:</span>{" "}
                  <strong style={{ color: "var(--green)" }}>{subModal.aprPercent.toFixed(2)}%</strong>
                </div>
                <div>
                  <span style={{ opacity: 0.6 }}>{t("dualDuration")}:</span>{" "}
                  <strong>{subModal.duration}{t("days")}</strong>
                </div>
              </div>

              <div>
                <label style={{ fontSize: "0.82rem", opacity: 0.6, display: "block", marginBottom: 6 }}>
                  {t("dualInvestAmount")}
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={subPct}
                  onChange={(e) => setSubPct(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--accent)" }}
                />
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  {[25, 50, 75, 100].map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`settings-option${subPct === p ? " active" : ""}`}
                      style={{ padding: "2px 10px", fontSize: "0.75rem", flex: 1 }}
                      onClick={() => setSubPct(p)}
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                <div>
                  <span style={{ opacity: 0.6 }}>{t("dualInvestAmount")}:</span>{" "}
                  <strong>{subAmount.toLocaleString(undefined, { maximumFractionDigits: 8 })} {subModal.investCoin}</strong>
                </div>
                <div>
                  <span style={{ opacity: 0.6 }}>{t("dualAvailBalance")}:</span>{" "}
                  {subBal.toLocaleString(undefined, { maximumFractionDigits: 8 })} {subModal.investCoin}
                </div>
              </div>

              <div style={{ background: "var(--surface-hover)", borderRadius: 8, padding: "10px 14px", fontSize: "0.85rem" }}>
                <span style={{ opacity: 0.6 }}>{t("dualExpectedYield")}:</span>{" "}
                <strong style={{ color: "var(--green)" }}>
                  +{subYield.toLocaleString(undefined, { maximumFractionDigits: 8 })} {subModal.investCoin}
                </strong>
                <span style={{ opacity: 0.5, marginLeft: 8 }}>
                  ({subModal.aprPercent.toFixed(2)}% APR / {subModal.duration}{t("days")})
                </span>
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
                <button
                  type="button"
                  className="settings-option"
                  style={{ padding: "6px 20px" }}
                  onClick={() => setSubModal(null)}
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  className="add-form-submit"
                  style={{ padding: "6px 20px" }}
                  disabled={subAmount <= 0 || subBal <= 0}
                  onClick={confirmSubscribe}
                >
                  {t("confirm")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
