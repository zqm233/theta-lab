import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_BASE } from "../hooks/useApi";
import { useChatBridge } from "../chatBridge";
import { useI18n } from "../i18n";

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
  canPurchase: boolean;
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
  const [exchangeStatus, setExchangeStatus] = useState<Record<Exchange, boolean>>({
    binance: false,
    okx: false,
  });
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [exchange, setExchange] = useState<Exchange>("binance");
  const [coin, setCoin] = useState("BTC");
  const [direction, setDirection] = useState<"buy_low" | "sell_high">("buy_low");
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSettle, setSelectedSettle] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spotPrice, setSpotPrice] = useState<number | null>(null);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_BASE}/dual-invest/status`)
      .then((r) => (r.ok ? r.json() : { binance: false, okx: false }))
      .then((d) => {
        setExchangeStatus({ binance: !!d.binance, okx: !!d.okx });
        if (!d.binance && d.okx) setExchange("okx");
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
    let cancelled = false;
    const fetchSpot = () => {
      fetch(`${API_BASE}/quote?ticker=${coin}&market=crypto`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!cancelled && d?.price) setSpotPrice(d.price);
        })
        .catch(() => {});
    };
    fetchSpot();
    const timer = setInterval(fetchSpot, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [coin]);

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

  const activeDuration = filteredProducts.length > 0 ? filteredProducts[0].duration : null;

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
    const dir = p.direction === "buy_low" ? "Buy Low" : "Sell High";
    const spot = spotPrice ? `$${spotPrice.toLocaleString()}` : "unknown";
    const prompt =
      lang === "zh"
        ? `分析这个 ${p.coin} ${dir === "Buy Low" ? "低买" : "高卖"} 双币投资产品：行权价 $${p.strikePrice.toLocaleString()}，APR ${p.aprPercent.toFixed(2)}%，期限 ${p.duration} 天，交割日 ${p.settleDate}，当前现货价 ${spot}。值得买吗？风险如何？`
        : `Analyze this ${p.coin} ${dir} dual investment: strike $${p.strikePrice.toLocaleString()}, APR ${p.aprPercent.toFixed(2)}%, ${p.duration} days, settle ${p.settleDate}, current spot ${spot}. Is it worth it? What are the risks?`;
    submitToChat(prompt);
    setCtxMenu(null);
  };

  const handleSendToChat = () => {
    if (!ctxMenu) return;
    sendToChat(formatProductLine(ctxMenu.product));
    setCtxMenu(null);
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
          {spotPrice != null && (
            <span className="chain-spot-price">
              {coin}{" "}
              <span style={{ fontWeight: 700 }}>
                ${spotPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </span>
          )}
        </div>
      </header>

      <div className="expiration-bar">
        <label>{t("dualExchange")}</label>
        <div className="tab-bar" style={{ marginBottom: 0 }}>
          {(["binance", "okx"] as Exchange[]).map((ex) => (
            <button
              key={ex}
              className={exchange === ex ? "active" : ""}
              onClick={() => setExchange(ex)}
              disabled={!exchangeStatus[ex]}
              title={exchangeStatus[ex] ? "" : t("dualExchangeNotConfigured")}
            >
              {ex === "binance" ? "Binance" : "OKX"}
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

      {ctxMenu && (
        <div
          ref={menuRef}
          className="ctx-menu"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
        >
          <button type="button" className="ctx-menu-item" onClick={handleAnalyze}>
            {t("ctxMenuAnalyzePut")} — ${ctxMenu.product.strikePrice.toLocaleString()}
          </button>
          <button type="button" className="ctx-menu-item" onClick={handleSendToChat}>
            {t("sendToChat")}
          </button>
        </div>
      )}
    </div>
  );
}
