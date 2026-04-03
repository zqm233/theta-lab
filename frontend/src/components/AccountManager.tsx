import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { API_BASE } from "../hooks/useApi";
import AccountDetail from "./AccountDetail";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from "recharts";

interface Account {
  id: string;
  name: string;
  platform: string;
  broker: string;
  currency: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

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

interface Trade {
  id: string;
  ticker: string;
  pnl: number;
  closedAt: string;
}

interface TradeSummary {
  totalPnl: number;
  tradeCount: number;
  wins: number;
  losses: number;
  winRate: number;
}

interface AccountForm {
  name: string;
  platform: string;
  broker: string;
  currency: string;
  notes: string;
}

const EMPTY_FORM: AccountForm = { name: "", platform: "us_stock", broker: "", currency: "USD", notes: "" };

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

const CHART_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

export default function AccountManager() {
  const { t } = useI18n();
  const [summaries, setSummaries] = useState<AccountSummary[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tradeSummary, setTradeSummary] = useState<TradeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [displayCurrency, setDisplayCurrency] = useState<"CNY" | "USD">("CNY");
  const [usdToCny, setUsdToCny] = useState(7.25);
  const [navSnapshots, setNavSnapshots] = useState<{ date: string; entries: { currency: string; marketValue: number; totalCost: number }[] }[]>([]);

  const fetchSummaries = useCallback(async () => {
    try {
      const [acctRes, tradeRes, rateRes] = await Promise.all([
        fetch(`${API_BASE}/accounts/summary`),
        fetch(`${API_BASE}/trades/history`),
        fetch(`${API_BASE}/exchange-rate`),
      ]);
      let rate = 7.25;
      if (rateRes.ok) {
        const data = await rateRes.json();
        rate = data.usdToCny;
        setUsdToCny(rate);
      }
      if (acctRes.ok) {
        const data = await acctRes.json();
        setSummaries(data.accounts);
      }
      if (tradeRes.ok) {
        const data = await tradeRes.json();
        setTrades(data.trades ?? []);
        setTradeSummary(data.summary);
      }

      fetch(`${API_BASE}/portfolio/snapshot`, { method: "POST" }).then(() =>
        fetch(`${API_BASE}/portfolio/snapshots?days=365`).then((r) => r.ok ? r.json() : null).then((data) => {
          if (data?.snapshots) setNavSnapshots(data.snapshots);
        })
      ).catch(() => {});
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSummaries(); }, [fetchSummaries]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const handlePlatformChange = (platform: string) => {
    setForm((prev) => ({
      ...prev,
      platform,
      currency: PLATFORM_CURRENCIES[platform] ?? prev.currency,
    }));
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/accounts`);
      if (!res.ok) return;
      const data = await res.json();
      const acct = (data.accounts as Account[]).find((a) => a.id === id);
      if (acct) {
        setForm({ name: acct.name, platform: acct.platform, broker: acct.broker, currency: acct.currency, notes: acct.notes });
        setEditingId(id);
        setShowForm(true);
      }
    } catch { /* silent */ }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    const url = editingId ? `${API_BASE}/accounts/${editingId}` : `${API_BASE}/accounts`;
    const method = editingId ? "PUT" : "POST";
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowForm(false);
        setEditingId(null);
        fetchSummaries();
        showToast(editingId ? "✓" : "✓");
      }
    } catch { /* silent */ }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/accounts/${id}`, { method: "DELETE" });
      if (res.ok) {
        setDeleteConfirm(null);
        fetchSummaries();
      }
    } catch { /* silent */ }
  };

  if (selectedAccountId) {
    const acct = summaries.find((s) => s.id === selectedAccountId);
    return (
      <AccountDetail
        accountId={selectedAccountId}
        accountName={acct?.name ?? ""}
        accountCurrency={acct?.currency ?? "USD"}
        accountPlatform={acct?.platform ?? "us_stock"}
        onBack={() => {
          setSelectedAccountId(null);
          fetchSummaries();
        }}
      />
    );
  }

  const formatNative = (value: number, currency: string) => {
    const prefix = currency === "CNY" ? "¥" : currency === "USDT" ? "" : "$";
    const suffix = currency === "USDT" ? " USDT" : "";
    return `${prefix}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${suffix}`;
  };

  const toDisplay = (amount: number, fromCurrency: string): number => {
    if (fromCurrency === displayCurrency) return amount;
    if (fromCurrency === "USD" && displayCurrency === "CNY") return amount * usdToCny;
    if (fromCurrency === "CNY" && displayCurrency === "USD") return amount / usdToCny;
    if (fromCurrency === "USDT" && displayCurrency === "CNY") return amount * usdToCny;
    if (fromCurrency === "USDT" && displayCurrency === "USD") return amount;
    if (fromCurrency === "HKD" && displayCurrency === "CNY") return amount * usdToCny / 7.8;
    if (fromCurrency === "HKD" && displayCurrency === "USD") return amount / 7.8;
    return amount;
  };

  const sym = displayCurrency === "CNY" ? "¥" : "$";
  const fmt = (v: number) => `${sym}${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const navHistory = useMemo(() => {
    return navSnapshots.map((s) => {
      const total = s.entries.reduce((sum: number, e: { currency: string; marketValue: number; totalCost: number }) => {
        const mv = e.marketValue || e.totalCost;
        return sum + toDisplay(mv, e.currency);
      }, 0);
      return { date: s.date, value: Math.round(total * 100) / 100 };
    });
  }, [navSnapshots, displayCurrency, usdToCny]);

  const totalCostAll = summaries.reduce((s, a) => s + toDisplay(a.totalCost, a.currency), 0);
  const totalMarketAll = summaries.reduce((s, a) => s + (a.totalMarketValue != null ? toDisplay(a.totalMarketValue, a.currency) : 0), 0);
  const totalPnlAll = summaries.reduce((s, a) => s + (a.unrealizedPnl != null ? toDisplay(a.unrealizedPnl, a.currency) : 0), 0);
  const hasAnyMarket = summaries.some((a) => a.totalMarketValue != null);
  const returnRate = hasAnyMarket && totalCostAll > 0 ? ((totalMarketAll - totalCostAll) / totalCostAll) * 100 : null;

  const cumulativePnlData = (() => {
    if (trades.length === 0) return [];
    const sorted = [...trades].sort((a, b) => a.closedAt.localeCompare(b.closedAt));
    let cum = 0;
    return sorted.map((tr) => {
      cum += tr.pnl;
      return { date: tr.closedAt.slice(0, 10), pnl: Math.round(cum * 100) / 100 };
    });
  })();

  return (
    <div className="accounts-page">
      <div className="accounts-header">
        <h2 className="chain-ticker">{t("accountsTitle")}</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div className="currency-toggle">
            <button className={`currency-toggle-btn${displayCurrency === "CNY" ? " active" : ""}`} onClick={() => setDisplayCurrency("CNY")}>¥ CNY</button>
            <button className={`currency-toggle-btn${displayCurrency === "USD" ? " active" : ""}`} onClick={() => setDisplayCurrency("USD")}>$ USD</button>
          </div>
          <button className="accounts-add-btn" onClick={openCreate}>+ {t("addAccount")}</button>
        </div>
      </div>

      {!loading && summaries.length > 0 && (
        <>
          <div className="dashboard-overview">
            <div className="dashboard-card">
              <div className="dashboard-card-label">{t("marketValue")}</div>
              <div className="dashboard-card-value">{hasAnyMarket ? fmt(totalMarketAll) : fmt(totalCostAll)}</div>
            </div>
            {hasAnyMarket && (
              <>
                <div className="dashboard-card">
                  <div className="dashboard-card-label">{t("unrealizedPnl")}</div>
                  <div className={`dashboard-card-value ${totalPnlAll >= 0 ? "pnl-up" : "pnl-down"}`}>
                    {totalPnlAll >= 0 ? "+" : ""}{fmt(totalPnlAll)}
                  </div>
                </div>
                {returnRate !== null && (
                  <div className="dashboard-card">
                    <div className="dashboard-card-label">{t("returnRate")}</div>
                    <div className={`dashboard-card-value ${returnRate >= 0 ? "pnl-up" : "pnl-down"}`}>
                      {returnRate >= 0 ? "+" : ""}{returnRate.toFixed(2)}%
                    </div>
                  </div>
                )}
              </>
            )}
            {tradeSummary && (
              <>
                <div className="dashboard-card">
                  <div className="dashboard-card-label">{t("totalPnl")} ({t("navTradeHistory")})</div>
                  <div className={`dashboard-card-value ${tradeSummary.totalPnl >= 0 ? "pnl-up" : "pnl-down"}`}>
                    {tradeSummary.totalPnl >= 0 ? "+" : ""}${tradeSummary.totalPnl.toFixed(2)}
                  </div>
                </div>
              </>
            )}
          </div>

          {(() => {
            const pieData = summaries
              .filter((a) => (a.totalMarketValue ?? a.totalCost) > 0)
              .map((a) => ({
                name: a.name,
                value: Math.round(toDisplay(a.totalMarketValue ?? a.totalCost, a.currency) * 100) / 100,
              }));
            const hasCharts = pieData.length > 0 || navHistory.length > 0 || cumulativePnlData.length > 1;
            return hasCharts ? (
              <div className="dashboard-charts-row">
                {pieData.length > 0 && (
                  <div className="dashboard-chart-card">
                    <h3 className="dashboard-section-title">{t("marketValue")}</h3>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2}>
                          {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => fmt(v)} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {navHistory.length > 0 && (
                  <div className="dashboard-chart-card">
                    <h3 className="dashboard-section-title">{t("marketValue")}</h3>
                    <ResponsiveContainer width="100%" height={160}>
                      <AreaChart data={navHistory} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                        <defs>
                          <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                        <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} width={45} />
                        <Tooltip formatter={(v: number) => fmt(v)} />
                        <Area type="monotone" dataKey="value" name={t("marketValue")} stroke="#10b981" fill="url(#navGrad)" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {cumulativePnlData.length > 1 && (
                  <div className="dashboard-chart-card">
                    <h3 className="dashboard-section-title">{t("totalPnl")} ({t("navTradeHistory")})</h3>
                    <ResponsiveContainer width="100%" height={160}>
                      <AreaChart data={cumulativePnlData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                        <defs>
                          <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-muted)" }} />
                        <YAxis tick={{ fontSize: 10, fill: "var(--text-muted)" }} width={45} />
                        <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                        <Area type="monotone" dataKey="pnl" name={t("totalPnl")} stroke="#6366f1" fill="url(#pnlGrad)" strokeWidth={2} dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            ) : null;
          })()}
        </>
      )}

      {!loading && summaries.length === 0 && (
        <div className="portfolio-empty">{t("accountsEmpty")}</div>
      )}

      {!loading && summaries.length > 0 && (
        <>
          <h3 className="dashboard-section-title">{t("accountsTitle")}</h3>
          <div className="accounts-grid">
            {summaries.map((acct) => {
              const acctRate = acct.totalMarketValue != null && acct.totalCost > 0
                ? ((acct.totalMarketValue - acct.totalCost) / acct.totalCost * 100) : null;
              return (
                <div key={acct.id} className="account-card">
                  <div className="account-card-header">
                    <div className="account-card-title">
                      <span className="account-platform-icon">{PLATFORM_ICONS[acct.platform] ?? "📁"}</span>
                      <div>
                        <div className="account-card-name">{acct.name}</div>
                        {acct.broker && <div className="account-card-broker">{acct.broker}</div>}
                      </div>
                    </div>
                    <div className="account-card-actions">
                      <button className="account-icon-btn" onClick={() => openEdit(acct.id)} title={t("editAccount")}>✏</button>
                      <button className="account-icon-btn danger" onClick={() => setDeleteConfirm(acct.id)} title={t("deleteAccount")}>✕</button>
                    </div>
                  </div>

                  <div className="account-card-stats">
                    <div className="account-stat">
                      <span className="account-stat-label">{t("marketValue")}</span>
                      <span className="account-stat-value">{acct.totalMarketValue != null ? formatNative(acct.totalMarketValue, acct.currency) : formatNative(acct.totalCost, acct.currency)}</span>
                    </div>
                    {acct.unrealizedPnl != null && (
                      <div className="account-stat">
                        <span className="account-stat-label">{t("unrealizedPnl")}</span>
                        <span className={`account-stat-value ${acct.unrealizedPnl >= 0 ? "pnl-up" : "pnl-down"}`}>
                          {acct.unrealizedPnl >= 0 ? "+" : ""}{formatNative(acct.unrealizedPnl, acct.currency)}
                        </span>
                      </div>
                    )}
                    {acctRate !== null && (
                      <div className="account-stat">
                        <span className="account-stat-label">{t("returnRate")}</span>
                        <span className={`account-stat-value ${acctRate >= 0 ? "pnl-up" : "pnl-down"}`}>
                          {acctRate >= 0 ? "+" : ""}{acctRate.toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </div>

                  <button className="account-view-btn" onClick={() => setSelectedAccountId(acct.id)}>
                    {t("viewHoldings")} →
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {showForm && (
        <div className="modal-anchor">
          <div className="modal-overlay" onClick={() => setShowForm(false)}>
            <div className="modal-dialog add-position-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{editingId ? t("editAccount") : t("addAccount")}</h3>
                <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="add-form-field">
                  <label>{t("accountName")}</label>
                  <input className="add-form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
                </div>
                <div className="add-form-field">
                  <label>{t("accountPlatform")}</label>
                  <div className="platform-selector">
                    {(["us_stock", "a_stock", "crypto", "other"] as const).map((p) => (
                      <button
                        key={p}
                        className={`platform-btn${form.platform === p ? " active" : ""}`}
                        onClick={() => handlePlatformChange(p)}
                      >
                        {PLATFORM_ICONS[p]} {t(`platform${p.charAt(0).toUpperCase() + p.slice(1).replace("_s", "S").replace("_o", "O")}` as any)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="add-form-field">
                  <label>{t("accountBroker")}</label>
                  <input className="add-form-input" value={form.broker} onChange={(e) => setForm({ ...form, broker: e.target.value })} placeholder="IBKR, Binance, OKX..." />
                </div>
                <div className="add-form-field">
                  <label>{t("accountCurrency")}</label>
                  <select className="add-form-input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                    <option value="USD">USD</option>
                    <option value="CNY">CNY (¥)</option>
                    <option value="USDT">USDT</option>
                    <option value="HKD">HKD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
                <div className="add-form-field">
                  <label>{t("notes")}</label>
                  <input className="add-form-input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
                <button className="add-form-submit" onClick={handleSubmit}>{t("save")}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-anchor">
          <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
            <div className="modal-dialog add-position-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{t("deleteAccount")}</h3>
                <button className="modal-close" onClick={() => setDeleteConfirm(null)}>✕</button>
              </div>
              <div className="modal-body">
                <p style={{ marginBottom: 16, color: "var(--text-muted)" }}>{t("deleteAccountConfirm")}</p>
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
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
