import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { useChatBridge } from "../chatBridge";
import { API_BASE } from "../hooks/useApi";
import { useSettings } from "../settings";
import { formatUsMarketTime } from "../usMarketTime";
import type { Position } from "../portfolio";
import { usePortfolio } from "../portfolio";

interface Props {
  filterTicker?: string | null;
}

export default function Portfolio({ filterTicker }: Props) {
  const { t, lang } = useI18n();
  const { sendToChat } = useChatBridge();
  const { positions, removePosition, closePosition } = usePortfolio();
  const { jitteredInterval } = useSettings();
  const [quotes, setQuotes] = useState<Record<string, number | null>>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [closeForm, setCloseForm] = useState<{ id: string; exitPrice: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; pos: Position } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = filterTicker
    ? positions.filter((p) => p.ticker === filterTicker)
    : positions;

  const fetchQuotes = useCallback(async (posArr: Position[]) => {
    if (posArr.length === 0) return;
    setRefreshing(true);
    try {
      const payload = posArr.map((p) => ({
        id: p.id,
        ticker: p.ticker,
        expiration: p.expiration,
        strike: p.strike,
        type: p.type,
      }));
      const res = await fetch(`${API_BASE}/portfolio/quotes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setQuotes(data.quotes ?? {});
        setLastUpdated(new Date());
      }
    } catch {
      /* silent */
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchQuotes(positions);
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        fetchQuotes(positions);
        schedule();
      }, jitteredInterval());
    };
    schedule();
    return () => clearTimeout(timer);
  }, [positions, fetchQuotes, jitteredInterval]);

  const handleManualRefresh = () => {
    fetchQuotes(positions);
  };

  const formatTime = (d: Date) =>
    `${formatUsMarketTime(d, lang)}${t("marketTimeEt")}`;

  const calcPnl = (pos: Position) => {
    const cur = quotes[pos.id];
    if (cur == null) return null;
    const multiplier = pos.side === "sell" ? 1 : -1;
    return multiplier * (pos.entry - cur) * pos.qty * 100;
  };

  const handleSendToChat = (pos: Position) => {
    const side = pos.side === "sell" ? "Sell" : "Buy";
    const type = pos.type === "put" ? "Put" : "Call";
    const pnl = calcPnl(pos);
    const pnlStr = pnl != null ? ` | P&L: $${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}` : "";
    sendToChat(
      `${pos.ticker} ${side} ${type} $${pos.strike.toFixed(2)} x${pos.qty} | Entry: $${pos.entry.toFixed(2)} | Exp: ${pos.expiration}${pnlStr}`
    );
  };

  const openCloseForm = (pos: Position) => {
    const cur = quotes[pos.id];
    setCloseForm({ id: pos.id, exitPrice: cur != null ? cur.toFixed(2) : "" });
  };

  const submitClose = async () => {
    if (!closeForm) return;
    const exitPrice = parseFloat(closeForm.exitPrice);
    if (isNaN(exitPrice) || exitPrice < 0) return;
    const ok = await closePosition(closeForm.id, exitPrice);
    setCloseForm(null);
    if (ok) {
      setToast(t("tradeClosed"));
      setTimeout(() => setToast(null), 2000);
    }
  };

  const handleRowContextMenu = (e: React.MouseEvent, pos: Position) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, pos });
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

  const title = filterTicker
    ? `${t("navPortfolio")} — ${filterTicker}`
    : t("navPortfolio");

  return (
    <div className="portfolio-page">
      <div className="portfolio-header-row">
        <h2 className="chain-ticker">{title}</h2>
        <div className="portfolio-refresh-bar">
          {lastUpdated && (
            <span className="portfolio-updated-at">
              {t("lastUpdated")} {formatTime(lastUpdated)}
            </span>
          )}
          <button
            className="portfolio-refresh-btn"
            onClick={handleManualRefresh}
            disabled={refreshing}
            title={t("refresh")}
          >
            {refreshing ? "⟳" : "↻"}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="portfolio-empty">{t("portfolioEmpty")}</div>
      ) : (
        <div className="table-container">
          <table className="chain-table">
            <thead>
              <tr>
                {!filterTicker && <th style={{ textAlign: "left" }}>Ticker</th>}
                <th>{t("portfolioSide")}</th>
                <th>Type</th>
                <th>{t("colStrike")}</th>
                <th>{t("portfolioQty")}</th>
                <th>{t("portfolioEntry")}</th>
                <th>{t("portfolioCurrent")}</th>
                <th>{t("portfolioPnl")}</th>
                <th>{t("colExpiration")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((pos) => {
                const cur = quotes[pos.id];
                const pnl = calcPnl(pos);
                return (
                  <tr key={pos.id} onContextMenu={(e) => handleRowContextMenu(e, pos)}>
                    {!filterTicker && <td className="strike">{pos.ticker}</td>}
                    <td>
                      <span className={`side-tag ${pos.side}`}>
                        {pos.side === "sell" ? t("portfolioSell") : t("portfolioBuy")}
                      </span>
                    </td>
                    <td>{pos.type === "put" ? "Put" : "Call"}</td>
                    <td>${pos.strike.toFixed(2)}</td>
                    <td>{pos.qty}</td>
                    <td>${pos.entry.toFixed(2)}</td>
                    <td>{cur != null ? `$${cur.toFixed(2)}` : "—"}</td>
                    <td className={pnl != null ? (pnl >= 0 ? "pnl-up" : "pnl-down") : ""}>
                      {pnl != null
                        ? `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}`
                        : "—"}
                    </td>
                    <td>{pos.expiration}</td>
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
          <button type="button" className="ctx-menu-item" onClick={() => {
            openCloseForm(ctxMenu.pos);
            setCtxMenu(null);
          }}>
            {t("closePosition")} — ${ctxMenu.pos.strike.toFixed(2)}
          </button>
          <button type="button" className="ctx-menu-item" onClick={() => {
            handleSendToChat(ctxMenu.pos);
            setCtxMenu(null);
          }}>
            💬 {t("sendToChat")}
          </button>
          <button type="button" className="ctx-menu-item ctx-menu-danger" onClick={() => {
            removePosition(ctxMenu.pos.id);
            setCtxMenu(null);
          }}>
            {t("deletePosition")}
          </button>
        </div>
      )}

      {closeForm && (() => {
        const pos = positions.find((p) => p.id === closeForm.id);
        return pos ? (
          <div className="modal-anchor">
            <div className="modal-overlay" onClick={() => setCloseForm(null)}>
              <div className="modal-dialog add-position-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>{t("closePosition")} — {pos.ticker} {pos.type === "put" ? "Put" : "Call"} ${pos.strike.toFixed(2)}</h3>
                  <button className="modal-close" onClick={() => setCloseForm(null)}>✕</button>
                </div>
                <div className="modal-body">
                  <div className="add-form-field">
                    <label>{t("exitPrice")}</label>
                    <div className="add-form-price-row">
                      <span className="add-form-dollar">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={closeForm.exitPrice}
                        onChange={(e) => setCloseForm({ ...closeForm, exitPrice: e.target.value })}
                        className="add-form-input"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="add-form-meta">
                    {t("portfolioEntry")}: ${pos.entry.toFixed(2)} · {t("portfolioQty")}: {pos.qty} · {pos.expiration}
                  </div>
                  <button className="add-form-submit" onClick={submitClose}>
                    {t("confirmClose")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null;
      })()}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
