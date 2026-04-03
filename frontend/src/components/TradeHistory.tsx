import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { API_BASE } from "../hooks/useApi";
import type { HistoryFilters } from "./TradeHistoryFilter";

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
}

interface Props {
  filters: HistoryFilters;
}

export default function TradeHistory({ filters }: Props) {
  const { t, lang } = useI18n();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/trades/history`);
      if (!res.ok) return;
      const data = await res.json();
      setTrades(data.trades ?? []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

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
      fetchHistory();
    } catch {
      /* silent */
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="portfolio-page">
      <h2 className="chain-ticker">{t("navTradeHistory")}</h2>

      {summary && summary.tradeCount > 0 && (
        <div className="trade-summary">
          <div className={`trade-summary-item ${summary.totalPnl >= 0 ? "pnl-up" : "pnl-down"}`}>
            <span className="trade-summary-label">{t("totalPnl")}</span>
            <span className="trade-summary-value">
              {summary.totalPnl >= 0 ? "+" : ""}${summary.totalPnl.toFixed(2)}
            </span>
          </div>
          <div className="trade-summary-item">
            <span className="trade-summary-label">{t("tradeCount")}</span>
            <span className="trade-summary-value">{summary.tradeCount}</span>
          </div>
          <div className="trade-summary-item">
            <span className="trade-summary-label">{t("winRate")}</span>
            <span className="trade-summary-value">{summary.winRate}%</span>
          </div>
          <div className="trade-summary-item">
            <span className="trade-summary-label">W/L</span>
            <span className="trade-summary-value">{summary.wins}/{summary.losses}</span>
          </div>
        </div>
      )}

      {loading && <div className="loading-spinner">{t("loading")}</div>}

      {!loading && filtered.length === 0 && (
        <div className="portfolio-empty">{t("noTradeHistory")}</div>
      )}

      {filtered.length > 0 && (
        <div className="table-container">
          <table className="chain-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Ticker</th>
                <th>{t("portfolioSide")}</th>
                <th>Type</th>
                <th>{t("colStrike")}</th>
                <th>{t("portfolioQty")}</th>
                <th>{t("portfolioEntry")}</th>
                <th>{t("exitPrice")}</th>
                <th>{t("portfolioPnl")}</th>
                <th>{t("expiration")}</th>
                <th>{t("closedAt")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tr) => (
                <tr key={tr.id}>
                  <td className="strike">{tr.ticker}</td>
                  <td>
                    <span className={`side-tag ${tr.side}`}>
                      {tr.side === "sell" ? t("portfolioSell") : t("portfolioBuy")}
                    </span>
                  </td>
                  <td>{tr.type === "put" ? "Put" : "Call"}</td>
                  <td>${tr.strike.toFixed(2)}</td>
                  <td>{tr.qty}</td>
                  <td>${tr.entryPrice.toFixed(2)}</td>
                  <td>${tr.exitPrice.toFixed(2)}</td>
                  <td className={tr.pnl >= 0 ? "pnl-up" : "pnl-down"}>
                    {tr.pnl >= 0 ? "+" : ""}${tr.pnl.toFixed(2)}
                  </td>
                  <td>{tr.expiration}</td>
                  <td>{formatDate(tr.closedAt)}</td>
                  <td>
                    <button
                      className="portfolio-remove-btn"
                      onClick={() => handleDelete(tr.id)}
                      title={t("deletePosition")}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
