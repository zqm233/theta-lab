"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AccountHoldingsDialog } from "@/components/AccountHoldingsDialog";
import { Plus, Edit2, Trash2, TrendingUp, Wallet, RefreshCw } from "lucide-react";
import { useI18n, type I18nKey } from "@/lib/i18n";
import { API_BASE } from "@/lib/api";
import { useApiQuery } from "@/lib/api-hooks";
import { useQueryClient } from "@tanstack/react-query";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { toCny } from "@/lib/fxToCny";

interface AccountSummary {
  id: string;
  name: string;
  platform: string;
  broker: string;
  currency: string;
  positionCount: number;
  totalCost: number;
  totalMarketValue: number | null;
  unrealizedPnl: number | null;
}

interface AccountForm {
  name: string;
  platform: string;
  broker: string;
  currency: string;
  notes: string;
}

const EMPTY_FORM: AccountForm = {
  name: "",
  platform: "us_stock",
  broker: "",
  currency: "USD",
  notes: "",
};

const PLATFORM_CURRENCIES: Record<string, string> = {
  us_stock: "USD",
  a_stock: "CNY",
  crypto: "USDT",
  other: "USD",
};

const PLATFORM_ICONS: Record<string, string> = {
  us_stock: "🇺🇸",
  a_stock: "🇨🇳",
  crypto: "₿",
  other: "📁",
};

const CHART_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"];

type PieMode = "account" | "platform";

type PieRow = {
  name: string;
  value: number;
  currencies: Record<string, number>;
};

function buildAccountPieRows(
  summaries: AccountSummary[],
  convert: (amount: number, currency: string) => number,
): PieRow[] {
  return summaries
    .filter((a) => a.totalMarketValue !== null && a.totalMarketValue > 0)
    .map((a) => {
      const cny = convert(a.totalMarketValue as number, a.currency);
      return {
        name: a.name,
        value: cny,
        currencies: { CNY: cny },
      };
    });
}

function buildPlatformPieRows(
  summaries: AccountSummary[],
  t: (key: I18nKey) => string,
  convert: (amount: number, currency: string) => number,
): PieRow[] {
  const platformTitle = (platform: string) => {
    switch (platform) {
      case "us_stock":
        return t("platformUsStock");
      case "a_stock":
        return t("platformAStock");
      case "crypto":
        return t("platformCrypto");
      default:
        return t("platformOther");
    }
  };
  const buckets: Record<string, { value: number; currencies: Record<string, number> }> = {};
  for (const a of summaries) {
    const mv = a.totalMarketValue;
    if (mv === null || mv <= 0) continue;
    const cnyMv = convert(mv, a.currency);
    const key =
      a.platform === "us_stock" || a.platform === "a_stock" || a.platform === "crypto"
        ? a.platform
        : "other";
    if (!buckets[key]) {
      buckets[key] = { value: 0, currencies: {} };
    }
    buckets[key].value += cnyMv;
    buckets[key].currencies.CNY = (buckets[key].currencies.CNY ?? 0) + cnyMv;
  }
  const order = ["crypto", "a_stock", "us_stock", "other"] as const;
  return order
    .filter((k) => buckets[k] && buckets[k].value > 0)
    .map((k) => ({
      name: platformTitle(k),
      value: buckets[k].value,
      currencies: { ...buckets[k].currencies },
    }));
}

function PieValueTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: PieRow }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-lg border border-border/60 bg-background/95 px-3 py-2 text-sm shadow-md">
      <div className="font-medium">{row.name}</div>
      {Object.entries(row.currencies).map(([ccy, amt]) => (
        <div key={ccy} className="text-muted-foreground">
          {ccy === "CNY"
            ? `¥${amt.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`
            : `${amt.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${ccy}`}
        </div>
      ))}
    </div>
  );
}

export default function AccountsPage() {
  const { t, lang } = useI18n();
  const numLocale = lang === "zh" ? "zh-CN" : "en-US";
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [toast, setToast] = useState<string | null>(null);
  const [pieMode, setPieMode] = useState<PieMode>("account");
  const [manageHoldingsAccount, setManageHoldingsAccount] = useState<AccountSummary | null>(null);

  const { data, isLoading: loading, refetch, isFetching } = useApiQuery<{ accounts: AccountSummary[] }>(
    ["accounts-summary"],
    "/accounts?view=summary",
    {
      staleTime: 5000,
    },
  );

  const summaries = data?.accounts ?? [];

  const refetchSummary = () => {
    queryClient.invalidateQueries({ queryKey: ["accounts-summary"] });
    queryClient.invalidateQueries({ queryKey: ["account-holdings"] });
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const handleSubmit = async () => {
    const url = editingId ? `${API_BASE}/accounts/${editingId}` : `${API_BASE}/accounts`;
    const writeMethod = editingId ? "PUT" : "POST";
    const wasEdit = Boolean(editingId);

    try {
      const res = await fetch(url, {
        method: writeMethod,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed");

      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      refetchSummary();
      showToast(wasEdit ? "账户已更新" : "账户已创建");
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`${API_BASE}/accounts/${id}`, { method: "DELETE" });
      refetchSummary();
      showToast("账户已删除");
    } catch (err) {
      console.error(err);
    }
  };

  const handleEdit = (summary: AccountSummary) => {
    setEditingId(summary.id);
    setForm({
      name: summary.name,
      platform: summary.platform,
      broker: summary.broker,
      currency: summary.currency,
      notes: "",
    });
    setShowForm(true);
  };

  const totalCostCny = useMemo(
    () => summaries.reduce((s, a) => s + toCny(a.totalCost, a.currency), 0),
    [summaries],
  );
  const totalMarketValueCny = useMemo(
    () => summaries.reduce((s, a) => s + toCny(a.totalMarketValue ?? 0, a.currency), 0),
    [summaries],
  );
  const totalPnlCny = totalMarketValueCny - totalCostCny;
  const totalReturn = totalCostCny > 0 ? (totalPnlCny / totalCostCny) * 100 : 0;

  const fmtCnyInt = (n: number) =>
    `¥${n.toLocaleString(numLocale, { maximumFractionDigits: 0 })}`;
  const fmtCnyPnl = (n: number) =>
    `${n >= 0 ? "+" : "-"}¥${Math.abs(n).toLocaleString(numLocale, { maximumFractionDigits: 0 })}`;

  const pieRows = useMemo(() => {
    if (pieMode === "account") {
      return buildAccountPieRows(summaries, toCny);
    }
    return buildPlatformPieRows(summaries, t, toCny);
  }, [pieMode, summaries, t]);

  const pieTotal = useMemo(() => pieRows.reduce((s, r) => s + r.value, 0), [pieRows]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground">{t("loading")}</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-[1920px] mx-auto p-8 space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{t("accountsTitle")}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t("accountsSubtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => refetch()}
              disabled={isFetching}
              title={t("refreshAccountsTooltip")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border/60 bg-background/50 hover:bg-accent/40 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={18} className={isFetching ? "animate-spin" : ""} />
              {t("refreshAccounts")}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY_FORM);
                setShowForm(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus size={20} />
              {t("addAccount")}
            </motion.button>
          </div>
        </div>

        {summaries.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <Wallet size={20} className="text-primary" />
                <span className="text-sm text-muted-foreground">{t("totalCost")}</span>
              </div>
              <div className="text-2xl font-bold">{fmtCnyInt(totalCostCny)}</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass rounded-2xl p-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp size={20} className="text-primary" />
                <span className="text-sm text-muted-foreground">{t("marketValue")}</span>
              </div>
              <div className="text-2xl font-bold">{fmtCnyInt(totalMarketValueCny)}</div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="glass rounded-2xl p-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm text-muted-foreground">{t("unrealizedPnl")}</span>
              </div>
              <div className={`text-2xl font-bold ${totalPnlCny >= 0 ? "text-green-400" : "text-red-400"}`}>
                {fmtCnyPnl(totalPnlCny)}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="glass rounded-2xl p-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm text-muted-foreground">{t("returnRate")}</span>
              </div>
              <div className={`text-2xl font-bold ${totalReturn >= 0 ? "text-green-400" : "text-red-400"}`}>
                {totalReturn >= 0 ? "+" : ""}
                {totalReturn.toFixed(2)}%
              </div>
            </motion.div>
          </div>
        )}

        {pieRows.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="glass rounded-2xl p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <h2 className="text-xl font-semibold">
                {pieMode === "account" ? t("accountAllocationTitle") : t("assetClassAllocationTitle")}
              </h2>
              <div className="flex rounded-lg border border-border/50 p-0.5 bg-background/40">
                <button
                  type="button"
                  onClick={() => setPieMode("account")}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    pieMode === "account" ? "bg-primary text-primary-foreground" : "hover:bg-accent/50"
                  }`}
                >
                  {t("pieByAccount")}
                </button>
                <button
                  type="button"
                  onClick={() => setPieMode("platform")}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                    pieMode === "platform" ? "bg-primary text-primary-foreground" : "hover:bg-accent/50"
                  }`}
                >
                  {t("pieByAssetClass")}
                </button>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieRows}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(props: { name?: string; value?: number; percent?: number }) => {
                    const pct =
                      typeof props.percent === "number"
                        ? props.percent * 100
                        : pieTotal > 0 && props.value !== undefined
                          ? (props.value / pieTotal) * 100
                          : 0;
                    return `${props.name ?? ""}: ${pct.toFixed(1)}%`;
                  }}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieRows.map((entry, index) => (
                    <Cell key={`cell-${entry.name}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<PieValueTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground mt-2">{t("chartCnyAggregatedNote")}</p>
          </motion.div>
        )}

        {summaries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="text-6xl mb-4">📊</div>
            <p>{t("accountsEmpty")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {summaries.map((summary, idx) => (
              <motion.div
                key={summary.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + idx * 0.05 }}
                className="glass rounded-2xl p-6 border border-border/30 hover:border-primary/50 transition-all flex flex-col"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{PLATFORM_ICONS[summary.platform] || "📁"}</span>
                    <div>
                      <h3 className="font-semibold">{summary.name}</h3>
                      <p className="text-xs text-muted-foreground">{summary.broker}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleEdit(summary)}
                      className="p-2 hover:bg-accent/50 rounded-lg transition-colors"
                    >
                      <Edit2 size={16} />
                    </motion.button>
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => {
                        if (typeof window !== "undefined" && !window.confirm(t("deleteAccountConfirm"))) {
                          return;
                        }
                        handleDelete(summary.id);
                      }}
                      className="p-2 hover:bg-destructive/20 text-destructive rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </motion.button>
                  </div>
                </div>

                <div className="space-y-3 flex-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("positionCount")}</span>
                    <span className="font-medium">{summary.positionCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("totalCost")}</span>
                    <span className="font-medium">
                      {summary.totalCost.toLocaleString()} {summary.currency}
                    </span>
                  </div>
                  {summary.totalMarketValue !== null && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t("marketValue")}</span>
                        <span className="font-medium">
                          {summary.totalMarketValue.toLocaleString()} {summary.currency}
                        </span>
                      </div>
                      {summary.unrealizedPnl !== null && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{t("unrealizedPnl")}</span>
                          <span
                            className={`font-semibold ${
                              summary.unrealizedPnl >= 0 ? "text-green-400" : "text-red-400"
                            }`}
                          >
                            {summary.unrealizedPnl >= 0 ? "+" : ""}
                            {summary.unrealizedPnl.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setManageHoldingsAccount(summary)}
                  className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
                >
                  {t("manageHoldings")}
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <AccountHoldingsDialog
        account={
          manageHoldingsAccount
            ? {
                id: manageHoldingsAccount.id,
                name: manageHoldingsAccount.name,
                broker: manageHoldingsAccount.broker,
                currency: manageHoldingsAccount.currency,
              }
            : null
        }
        open={manageHoldingsAccount !== null}
        onClose={() => setManageHoldingsAccount(null)}
        onSaved={() => refetchSummary()}
        onToast={showToast}
      />

      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowForm(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative glass border border-border/50 rounded-2xl w-full max-w-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <h3 className="text-lg font-semibold mb-6">
                  {editingId ? t("editAccount") : t("addAccount")}
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">{t("accountName")}</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-4 py-2 bg-background/50 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="e.g., IBKR Main"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">{t("accountPlatform")}</label>
                    <select
                      value={form.platform}
                      onChange={(e) => {
                        const platform = e.target.value;
                        setForm({
                          ...form,
                          platform,
                          currency: PLATFORM_CURRENCIES[platform] || "USD",
                        });
                      }}
                      className="w-full px-4 py-2 bg-background/50 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="us_stock">{t("platformUsStock")}</option>
                      <option value="a_stock">{t("platformAStock")}</option>
                      <option value="crypto">{t("platformCrypto")}</option>
                      <option value="other">{t("platformOther")}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">{t("accountBroker")}</label>
                    <input
                      type="text"
                      value={form.broker}
                      onChange={(e) => setForm({ ...form, broker: e.target.value })}
                      className="w-full px-4 py-2 bg-background/50 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                      placeholder="e.g., Interactive Brokers"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">{t("accountCurrency")}</label>
                    <input
                      type="text"
                      value={form.currency}
                      onChange={(e) => setForm({ ...form, currency: e.target.value })}
                      className="w-full px-4 py-2 bg-background/50 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => setShowForm(false)}
                      className="flex-1 px-4 py-2 bg-accent hover:bg-accent/80 rounded-lg transition-colors"
                    >
                      {t("cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                    >
                      {t("save")}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 right-8 px-6 py-3 bg-green-500/20 border border-green-500/50 text-green-400 rounded-xl shadow-lg"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
