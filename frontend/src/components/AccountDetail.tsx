import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { API_BASE } from "../hooks/useApi";
import HoldingEditor, { type Holding } from "./HoldingEditor";

interface Props {
  accountId: string;
  accountName: string;
  accountCurrency: string;
  accountPlatform: string;
  onBack: () => void;
}

const ASSET_ICONS: Record<string, string> = {
  stock: "📈",
  option: "📊",
  crypto: "₿",
};

export default function AccountDetail({ accountId, accountName, accountCurrency, accountPlatform, onBack }: Props) {
  const { t } = useI18n();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEditor, setShowEditor] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchHoldings = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/holdings?account_id=${accountId}`);
      if (res.ok) {
        const data = await res.json();
        setHoldings(data.holdings);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { fetchHoldings(); }, [fetchHoldings]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/holdings/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteConfirm(null);
        fetchHoldings();
        showToast("✓");
      }
    } catch { /* silent */ }
  };

  const openAdd = () => {
    setEditingHolding(null);
    setShowEditor(true);
  };

  const openEdit = (h: Holding) => {
    setEditingHolding(h);
    setShowEditor(true);
  };

  const formatCurrency = (value: number) => {
    const prefix = accountCurrency === "CNY" ? "¥" : accountCurrency === "USDT" ? "" : "$";
    const suffix = accountCurrency === "USDT" ? " USDT" : "";
    return `${prefix}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}`;
  };

  const calcPnl = (h: Holding) => {
    if (h.currentPrice == null) return null;
    const multiplier = h.assetType === "option" ? 100 : 1;
    const direction = h.side === "short" ? -1 : 1;
    return direction * (h.currentPrice - h.avgCost) * h.qty * multiplier;
  };

  const totalCost = holdings.reduce((sum, h) => {
    const m = h.assetType === "option" ? 100 : 1;
    return sum + h.avgCost * h.qty * m;
  }, 0);

  const totalMarket = holdings.reduce((sum, h) => {
    if (h.currentPrice == null) return sum;
    const m = h.assetType === "option" ? 100 : 1;
    return sum + h.currentPrice * h.qty * m;
  }, 0);

  const totalPnl = holdings.reduce((sum, h) => {
    const pnl = calcPnl(h);
    return pnl != null ? sum + pnl : sum;
  }, 0);

  const hasAnyPrice = holdings.some((h) => h.currentPrice != null);

  return (
    <div className="accounts-page">
      <div className="accounts-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="account-icon-btn" onClick={onBack} title={t("back")}>←</button>
          <h2 className="chain-ticker">{accountName}</h2>
        </div>
        <button className="accounts-add-btn" onClick={openAdd}>+ {t("addHolding")}</button>
      </div>

      {hasAnyPrice && (
        <div className="account-detail-summary">
          <div className="account-stat">
            <span className="account-stat-label">{t("totalCost")}</span>
            <span className="account-stat-value">{formatCurrency(totalCost)}</span>
          </div>
          <div className="account-stat">
            <span className="account-stat-label">{t("marketValue")}</span>
            <span className="account-stat-value">{formatCurrency(totalMarket)}</span>
          </div>
          <div className="account-stat">
            <span className="account-stat-label">{t("unrealizedPnl")}</span>
            <span className={`account-stat-value ${totalPnl >= 0 ? "pnl-up" : "pnl-down"}`}>
              {totalPnl >= 0 ? "+" : ""}{formatCurrency(totalPnl)}
            </span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="portfolio-empty">{t("loading")}</div>
      ) : holdings.length === 0 ? (
        <div className="portfolio-empty">{t("holdingsEmpty")}</div>
      ) : (
        <div className="table-container">
          <table className="chain-table">
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>{t("assetType")}</th>
                <th style={{ textAlign: "left" }}>Ticker</th>
                <th>{t("holdingSide")}</th>
                <th>{t("holdingQty")}</th>
                <th>{t("holdingAvgCost")}</th>
                <th>{t("holdingCurrentPrice")}</th>
                <th>{t("unrealizedPnl")}</th>
                <th>{t("notes")}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => {
                const pnl = calcPnl(h);
                const label = h.assetType === "option"
                  ? `${h.ticker} ${h.optionType?.toUpperCase()} $${h.strike} ${h.expiration ?? ""}`
                  : h.ticker;
                return (
                  <tr key={h.id}>
                    <td>
                      <span className="asset-type-badge">{ASSET_ICONS[h.assetType] ?? "📄"} {t(`asset${h.assetType.charAt(0).toUpperCase() + h.assetType.slice(1)}` as any)}</span>
                    </td>
                    <td className="strike">{label}</td>
                    <td>
                      <span className={`side-tag ${h.side === "long" ? "sell" : "buy"}`}>
                        {h.side === "long" ? t("holdingLong") : t("holdingShort")}
                      </span>
                    </td>
                    <td>{h.qty}</td>
                    <td>{formatCurrency(h.avgCost)}</td>
                    <td>{h.currentPrice != null ? formatCurrency(h.currentPrice) : "—"}</td>
                    <td className={pnl != null ? (pnl >= 0 ? "pnl-up" : "pnl-down") : ""}>
                      {pnl != null ? `${pnl >= 0 ? "+" : ""}${formatCurrency(pnl)}` : "—"}
                    </td>
                    <td style={{ color: "var(--text-muted)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {h.notes || "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="account-icon-btn" onClick={() => openEdit(h)} title={t("editHolding")}>✏</button>
                        <button className="account-icon-btn danger" onClick={() => setDeleteConfirm(h.id)} title={t("deleteHolding")}>✕</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showEditor && (
        <HoldingEditor
          accountId={accountId}
          accountPlatform={accountPlatform}
          editing={editingHolding}
          onClose={() => { setShowEditor(false); setEditingHolding(null); }}
          onSaved={fetchHoldings}
        />
      )}

      {deleteConfirm && (
        <div className="modal-overlay modal-overlay--local" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-dialog add-position-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{t("deleteHolding")}</h3>
              <button className="modal-close" onClick={() => setDeleteConfirm(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: "flex", gap: 8 }}>
                <button className="add-form-submit" style={{ background: "var(--red)", flex: 1 }} onClick={() => handleDelete(deleteConfirm)}>
                  {t("confirm")}
                </button>
                <button className="add-form-submit" style={{ background: "var(--surface-hover)", flex: 1 }} onClick={() => setDeleteConfirm(null)}>
                  {t("cancel")}
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
