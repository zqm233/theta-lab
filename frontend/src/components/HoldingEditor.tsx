import { useState } from "react";
import { useI18n } from "../i18n";
import { API_BASE } from "../hooks/useApi";
import TickerSearch from "./TickerSearch";

export interface Holding {
  id: string;
  accountId: string;
  assetType: string;
  ticker: string;
  side: string;
  qty: number;
  avgCost: number;
  currentPrice: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  optionType: string | null;
  strike: number | null;
  expiration: string | null;
}

interface HoldingForm {
  assetType: string;
  ticker: string;
  side: string;
  qty: string;
  avgCost: string;
  currentPrice: string;
  notes: string;
  optionType: string;
  strike: string;
  expiration: string;
}

const EMPTY_FORM: HoldingForm = {
  assetType: "stock",
  ticker: "",
  side: "long",
  qty: "",
  avgCost: "",
  currentPrice: "",
  notes: "",
  optionType: "put",
  strike: "",
  expiration: "",
};

function holdingToForm(h: Holding): HoldingForm {
  return {
    assetType: h.assetType,
    ticker: h.ticker,
    side: h.side,
    qty: String(h.qty),
    avgCost: String(h.avgCost),
    currentPrice: h.currentPrice != null ? String(h.currentPrice) : "",
    notes: h.notes,
    optionType: h.optionType ?? "put",
    strike: h.strike != null ? String(h.strike) : "",
    expiration: h.expiration ?? "",
  };
}

interface Props {
  accountId: string;
  accountPlatform?: string;
  editing?: Holding | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function HoldingEditor({ accountId, accountPlatform, editing, onClose, onSaved }: Props) {
  const { t } = useI18n();
  const [form, setForm] = useState<HoldingForm>(editing ? holdingToForm(editing) : EMPTY_FORM);
  const [tickerName, setTickerName] = useState("");

  const handleSubmit = async () => {
    if (!form.ticker.trim() || !form.qty) return;
    const payload: Record<string, unknown> = {
      account_id: accountId,
      asset_type: form.assetType,
      ticker: form.ticker.trim(),
      side: form.side,
      qty: parseFloat(form.qty),
      avg_cost: parseFloat(form.avgCost) || 0,
      current_price: form.currentPrice ? parseFloat(form.currentPrice) : null,
      notes: form.notes,
    };
    if (form.assetType === "option") {
      payload.option_type = form.optionType;
      payload.strike = parseFloat(form.strike) || null;
      payload.expiration = form.expiration || null;
    }

    const url = editing ? `${API_BASE}/holdings/${editing.id}` : `${API_BASE}/holdings`;
    const method = editing ? "PUT" : "POST";
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? {
          ticker: payload.ticker,
          side: payload.side,
          qty: payload.qty,
          avg_cost: payload.avg_cost,
          current_price: payload.current_price,
          notes: payload.notes,
        } : payload),
      });
      if (res.ok) {
        onSaved();
        onClose();
      }
    } catch { /* silent */ }
  };

  return (
    <div className="modal-overlay modal-overlay--local" onClick={onClose}>
      <div className="modal-dialog add-position-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{editing ? t("editHolding") : t("addHolding")}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
            {!editing && (
              <div className="add-form-field">
                <label>{t("assetType")}</label>
                <div className="platform-selector">
                  {(["stock", "option", "crypto"] as const).map((at) => (
                    <button
                      key={at}
                      className={`platform-btn${form.assetType === at ? " active" : ""}`}
                      onClick={() => setForm({ ...form, assetType: at })}
                    >
                      {t(`asset${at.charAt(0).toUpperCase() + at.slice(1)}` as any)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="add-form-field">
              <label>Ticker</label>
              <TickerSearch
                market={form.assetType === "crypto" ? "crypto" : (accountPlatform ?? "us_stock")}
                value={form.ticker}
                selectedName={tickerName}
                onChange={(ticker, name) => { setForm({ ...form, ticker }); setTickerName(name); }}
                onPriceFetched={(price) => setForm((prev) => ({ ...prev, currentPrice: String(price) }))}
                placeholder={
                  accountPlatform === "a_stock" ? "代码或名称，如 600519 / 茅台..."
                  : form.assetType === "crypto" ? "BTC, ETH..."
                  : "TSLA, AAPL..."
                }
                autoFocus
              />
            </div>

            <div className="add-form-field">
              <label>{t("holdingSide")}</label>
              <div className="platform-selector">
                <button className={`platform-btn${form.side === "long" ? " active" : ""}`} onClick={() => setForm({ ...form, side: "long" })}>
                  {t("holdingLong")}
                </button>
                <button className={`platform-btn${form.side === "short" ? " active" : ""}`} onClick={() => setForm({ ...form, side: "short" })}>
                  {t("holdingShort")}
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <div className="add-form-field" style={{ flex: 1 }}>
                <label>{t("holdingQty")}</label>
                <input className="add-form-input" type="number" step="any" min="0" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
              </div>
              <div className="add-form-field" style={{ flex: 1 }}>
                <label>{t("holdingAvgCost")}</label>
                <input className="add-form-input" type="number" step="any" min="0" value={form.avgCost} onChange={(e) => setForm({ ...form, avgCost: e.target.value })} />
              </div>
            </div>

            <div className="add-form-field">
              <label>{t("holdingCurrentPrice")}</label>
              <input className="add-form-input" type="number" step="any" min="0" value={form.currentPrice} onChange={(e) => setForm({ ...form, currentPrice: e.target.value })} placeholder="—" />
            </div>

            {form.assetType === "option" && !editing && (
              <>
                <div className="add-form-field">
                  <label>{t("optionType")}</label>
                  <div className="platform-selector">
                    <button className={`platform-btn${form.optionType === "put" ? " active" : ""}`} onClick={() => setForm({ ...form, optionType: "put" })}>Put</button>
                    <button className={`platform-btn${form.optionType === "call" ? " active" : ""}`} onClick={() => setForm({ ...form, optionType: "call" })}>Call</button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <div className="add-form-field" style={{ flex: 1 }}>
                    <label>{t("colStrike")}</label>
                    <input className="add-form-input" type="number" step="0.01" value={form.strike} onChange={(e) => setForm({ ...form, strike: e.target.value })} />
                  </div>
                  <div className="add-form-field" style={{ flex: 1 }}>
                    <label>{t("expiration")}</label>
                    <input className="add-form-input" type="date" value={form.expiration} onChange={(e) => setForm({ ...form, expiration: e.target.value })} />
                  </div>
                </div>
              </>
            )}

            <div className="add-form-field">
              <label>{t("notes")}</label>
              <input className="add-form-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            <button className="add-form-submit" onClick={handleSubmit}>{t("save")}</button>
          </div>
        </div>
      </div>
  );
}
