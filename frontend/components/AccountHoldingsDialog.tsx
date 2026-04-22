"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Edit2, Trash2, X } from "lucide-react";
import { useI18n, type I18nKey } from "@/lib/i18n";
import { API_BASE } from "@/lib/api";
import { useApiQuery } from "@/lib/api-hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useHoldingQuotes } from "@/lib/holdingQuotes";

export interface AccountSummaryLite {
  id: string;
  name: string;
  broker: string;
  currency: string;
}

interface Holding {
  id: string;
  accountId: string;
  assetType: string;
  ticker: string;
  side: string;
  qty: number;
  avgCost: number;
  currentPrice: number | null;
  notes: string;
  optionType: string | null;
  strike: number | null;
  expiration: string | null;
}

type AssetKind = "stock" | "etf" | "crypto" | "option";

/** DB `asset_type` -> UI label (never show raw English in table). */
function assetTypeLabel(raw: string, t: (key: I18nKey) => string): string {
  switch (raw) {
    case "stock":
      return t("assetStock");
    case "etf":
      return t("assetEtf");
    case "crypto":
      return t("assetCrypto");
    case "option":
      return t("assetOption");
    default:
      return raw;
  }
}

interface HoldingFormState {
  assetKind: AssetKind;
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

const emptyForm = (): HoldingFormState => ({
  assetKind: "stock",
  ticker: "",
  side: "long",
  qty: "",
  avgCost: "",
  currentPrice: "",
  notes: "",
  optionType: "put",
  strike: "",
  expiration: "",
});

function holdingToForm(h: Holding): HoldingFormState {
  let kind: AssetKind = "stock";
  if (h.assetType === "crypto") kind = "crypto";
  else if (h.assetType === "option") kind = "option";
  else if (h.assetType === "etf") kind = "etf";

  return {
    assetKind: kind,
    ticker: h.ticker,
    side: h.side,
    qty: String(h.qty),
    avgCost: String(h.avgCost),
    currentPrice: h.currentPrice !== null ? String(h.currentPrice) : "",
    notes: h.notes ?? "",
    optionType: h.optionType ?? "put",
    strike: h.strike !== null ? String(h.strike) : "",
    expiration: h.expiration ?? "",
  };
}

function formToAssetType(kind: AssetKind): string {
  if (kind === "crypto") return "crypto";
  if (kind === "option") return "option";
  if (kind === "etf") return "etf";
  return "stock";
}

interface AccountHoldingsDialogProps {
  account: AccountSummaryLite | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onToast: (msg: string) => void;
}

export function AccountHoldingsDialog({
  account,
  open,
  onClose,
  onSaved,
  onToast,
}: AccountHoldingsDialogProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { mergeFromHoldings, get: getQuote } = useHoldingQuotes();
  const accountId = account?.id ?? "";

  const [showForm, setShowForm] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [form, setForm] = useState<HoldingFormState>(emptyForm);

  const {
    data: holdingsData,
    isLoading: holdingsLoading,
    refetch: refetchHoldings,
  } = useApiQuery<{ holdings: Holding[] }>(
    ["account-holdings", accountId],
    `/accounts/${accountId}/holdings`,
    { enabled: open && Boolean(accountId), staleTime: 5000 },
  );

  const holdings = holdingsData?.holdings ?? [];

  useEffect(() => {
    if (holdings.length === 0) return;
    mergeFromHoldings(
      holdings.map((h) => ({ id: h.id, currentPrice: h.currentPrice })),
    );
  }, [holdings, mergeFromHoldings]);

  const invalidateSummaries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["accounts-summary"] });
  }, [queryClient]);

  const handleCloseAll = () => {
    setShowForm(false);
    setEditingHolding(null);
    setForm(emptyForm());
    onClose();
  };

  const openAdd = () => {
    setEditingHolding(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (h: Holding) => {
    setEditingHolding(h);
    setForm(holdingToForm(h));
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingHolding(null);
    setForm(emptyForm());
  };

  const submitHolding = async () => {
    if (!accountId) return;
    const qty = Number(form.qty);
    const avgCost = Number(form.avgCost);
    if (!form.ticker.trim() || Number.isNaN(qty) || Number.isNaN(avgCost)) {
      onToast(t("holdingFormInvalid"));
      return;
    }

    const assetType = formToAssetType(form.assetKind);
    const currentPriceRaw = form.currentPrice.trim();
    const current_price = currentPriceRaw === "" ? null : Number(currentPriceRaw);
    if (currentPriceRaw !== "" && Number.isNaN(current_price)) {
      onToast(t("holdingFormInvalid"));
      return;
    }

    const body: Record<string, unknown> = {
      account_id: accountId,
      asset_type: assetType,
      ticker: form.ticker.trim().toUpperCase(),
      side: form.side,
      qty,
      avg_cost: avgCost,
      current_price,
      notes: form.notes,
      option_type: form.assetKind === "option" ? form.optionType : null,
      strike: form.assetKind === "option" ? Number(form.strike) : null,
      expiration: form.assetKind === "option" && form.expiration.trim() ? form.expiration.trim() : null,
    };

    if (form.assetKind === "option") {
      if (Number.isNaN(body.strike as number) || !form.expiration.trim()) {
        onToast(t("holdingFormInvalid"));
        return;
      }
    }

    try {
      if (editingHolding) {
        const res = await fetch(`${API_BASE}/holdings/${editingHolding.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            qty,
            avg_cost: avgCost,
            current_price,
            side: form.side,
            notes: form.notes,
            ticker: form.ticker.trim().toUpperCase(),
          }),
        });
        if (!res.ok) throw new Error("put failed");
      } else {
        const res = await fetch(`${API_BASE}/accounts/${accountId}/holdings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error("post failed");
      }
      closeForm();
      await refetchHoldings();
      invalidateSummaries();
      onSaved();
      onToast(t("holdingSaved"));
    } catch (e) {
      console.error(e);
      onToast(t("loadFailed"));
    }
  };

  const deleteHolding = async (h: Holding) => {
    if (typeof window !== "undefined" && !window.confirm(t("deleteHoldingConfirm"))) {
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/holdings/${h.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      await refetchHoldings();
      invalidateSummaries();
      onSaved();
      onToast(t("holdingSaved"));
    } catch (e) {
      console.error(e);
      onToast(t("loadFailed"));
    }
  };

  if (!account) return null;

  return (
    <>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[50] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={handleCloseAll}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 12 }}
              className="relative glass border border-border/50 rounded-2xl w-full max-w-3xl max-h-[88vh] shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 p-5 border-b border-border/40 shrink-0">
                <div>
                  <h2 className="text-xl font-semibold">{t("accountHoldingsTitle")}</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {account.name} · {account.broker} · {account.currency}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openAdd}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
                  >
                    <Plus size={16} />
                    {t("addHolding")}
                  </button>
                  <button
                    type="button"
                    onClick={handleCloseAll}
                    className="p-2 rounded-lg hover:bg-accent/50 text-muted-foreground"
                    aria-label={t("cancel")}
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-auto p-5">
                {!accountId || holdingsLoading ? (
                  <div className="text-muted-foreground py-12 text-center">{t("loading")}</div>
                ) : holdings.length === 0 ? (
                  <div className="rounded-xl border border-border/30 p-10 text-center text-muted-foreground">
                    {t("holdingsEmpty")}
                  </div>
                ) : (
                  <div className="rounded-xl border border-border/30 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-accent/30 border-b border-border/40">
                        <tr>
                          <th className="text-left p-3 font-medium">{t("holdingTicker")}</th>
                          <th className="text-left p-3 font-medium">{t("assetType")}</th>
                          <th className="text-right p-3 font-medium">{t("holdingQty")}</th>
                          <th className="text-right p-3 font-medium">{t("holdingAvgCost")}</th>
                          <th className="text-right p-3 font-medium">{t("holdingCurrentPrice")}</th>
                          <th className="text-right p-3 w-24" />
                        </tr>
                      </thead>
                      <tbody>
                        {holdings.map((h) => (
                          <tr key={h.id} className="border-b border-border/20 hover:bg-accent/10">
                            <td className="p-3 font-mono font-medium">{h.ticker}</td>
                            <td className="p-3">{assetTypeLabel(h.assetType, t)}</td>
                            <td className="p-3 text-right">{h.qty}</td>
                            <td className="p-3 text-right">{h.avgCost}</td>
                            <td className="p-3 text-right">
                              {(() => {
                                const px = getQuote(h.id, h.currentPrice);
                                return px !== null
                                  ? px.toLocaleString(undefined, { maximumFractionDigits: 6 })
                                  : "—";
                              })()}
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEdit(h)}
                                  className="p-2 rounded-lg hover:bg-accent/50"
                                  aria-label={t("editHolding")}
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteHolding(h)}
                                  className="p-2 rounded-lg hover:bg-destructive/20 text-destructive"
                                  aria-label={t("deleteHolding")}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && showForm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={closeForm}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="relative glass border border-border/50 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 space-y-4">
                <h3 className="text-lg font-semibold">
                  {editingHolding ? t("editHolding") : t("addHolding")}
                </h3>

                {!editingHolding && (
                  <div>
                    <label className="block text-sm font-medium mb-2">{t("assetType")}</label>
                    <select
                      value={form.assetKind}
                      onChange={(e) =>
                        setForm({ ...form, assetKind: e.target.value as AssetKind })
                      }
                      className="w-full px-4 py-2 bg-background/50 border border-border/50 rounded-lg"
                    >
                      <option value="stock">{t("assetStock")}</option>
                      <option value="etf">{t("assetEtf")}</option>
                      <option value="crypto">{t("assetCrypto")}</option>
                      <option value="option">{t("assetOption")}</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-2">{t("holdingTicker")}</label>
                  <input
                    type="text"
                    value={form.ticker}
                    onChange={(e) => setForm({ ...form, ticker: e.target.value })}
                    disabled={Boolean(editingHolding)}
                    className="w-full px-4 py-2 bg-background/50 border border-border/50 rounded-lg disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">{t("holdingSide")}</label>
                  <select
                    value={form.side}
                    onChange={(e) => setForm({ ...form, side: e.target.value })}
                    className="w-full px-4 py-2 bg-background/50 border border-border/50 rounded-lg"
                  >
                    <option value="long">{t("holdingLong")}</option>
                    <option value="short">{t("holdingShort")}</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-2">{t("holdingQty")}</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={form.qty}
                      onChange={(e) => setForm({ ...form, qty: e.target.value })}
                      className="w-full px-4 py-2 bg-background/50 border border-border/50 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">{t("holdingAvgCost")}</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={form.avgCost}
                      onChange={(e) => setForm({ ...form, avgCost: e.target.value })}
                      className="w-full px-4 py-2 bg-background/50 border border-border/50 rounded-lg"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">{t("holdingCurrentPrice")}</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.currentPrice}
                    onChange={(e) => setForm({ ...form, currentPrice: e.target.value })}
                    placeholder="—"
                    className="w-full px-4 py-2 bg-background/50 border border-border/50 rounded-lg"
                  />
                </div>

                {form.assetKind === "option" && !editingHolding && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-2">{t("optionType")}</label>
                      <select
                        value={form.optionType}
                        onChange={(e) => setForm({ ...form, optionType: e.target.value })}
                        className="w-full px-4 py-2 bg-background/50 border border-border/50 rounded-lg"
                      >
                        <option value="put">{t("optionPut")}</option>
                        <option value="call">{t("optionCall")}</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium mb-2">{t("strikePrice")}</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={form.strike}
                          onChange={(e) => setForm({ ...form, strike: e.target.value })}
                          className="w-full px-4 py-2 bg-background/50 border border-border/50 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">{t("expiration")}</label>
                        <input
                          type="text"
                          value={form.expiration}
                          onChange={(e) => setForm({ ...form, expiration: e.target.value })}
                          placeholder="YYYY-MM-DD"
                          className="w-full px-4 py-2 bg-background/50 border border-border/50 rounded-lg"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium mb-2">{t("notes")}</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full px-4 py-2 bg-background/50 border border-border/50 rounded-lg"
                  />
                </div>

                {editingHolding && (
                  <p className="text-xs text-muted-foreground">
                    {t("assetType")}: {assetTypeLabel(editingHolding.assetType, t)}
                    {editingHolding.assetType === "option"
                      ? ` · ${editingHolding.optionType} ${editingHolding.strike} ${editingHolding.expiration}`
                      : ""}
                  </p>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeForm}
                    className="flex-1 px-4 py-2 bg-accent hover:bg-accent/80 rounded-lg"
                  >
                    {t("cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={submitHolding}
                    className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg"
                  >
                    {t("save")}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
