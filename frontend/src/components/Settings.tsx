import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { useSettings } from "../settings";
import { API_BASE } from "../hooks/useApi";

const INTERVAL_OPTIONS = [15, 30, 60, 120, 300];
const LLM_PROVIDERS = ["google", "openai", "anthropic", "custom"];
const LLM_PROVIDER_LABELS: Record<string, string> = {
  google: "Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic",
  custom: "Custom",
};

const MASKED = "••••••";

export default function Settings() {
  const { t } = useI18n();
  const { settings, update } = useSettings();

  // LLM
  const [llmProvider, setLlmProvider] = useState("google");
  const [llmModel, setLlmModel] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmBaseUrl, setLlmBaseUrl] = useState("");
  const [llmConfigured, setLlmConfigured] = useState<boolean | null>(null);
  const [llmEditing, setLlmEditing] = useState(false);
  const [llmSaving, setLlmSaving] = useState(false);
  const [llmToast, setLlmToast] = useState<string | null>(null);
  const [llmSaved, setLlmSaved] = useState({ provider: "", model: "", baseUrl: "" });
  const [llmTesting, setLlmTesting] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [llmVerified, _setLlmVerified] = useState(() => localStorage.getItem("llmVerified") === "1");
  const setLlmVerified = useCallback((v: boolean) => {
    _setLlmVerified(v);
    v ? localStorage.setItem("llmVerified", "1") : localStorage.removeItem("llmVerified");
  }, []);
  const [llmKeyFocused, setLlmKeyFocused] = useState(false);
  const providerDrafts = useRef<Record<string, { model: string; baseUrl: string; apiKey: string }>>({}); 

  useEffect(() => {
    fetch(`${API_BASE}/llm/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          const p = d.provider || "";
          const displayProvider = p === "openai" && d.baseUrl ? "custom" : p;
          setLlmProvider(displayProvider);
          setLlmModel(d.model || "");
          setLlmBaseUrl(d.baseUrl || "");
          setLlmConfigured(!!d.configured);
          setLlmSaved({ provider: displayProvider, model: d.model || "", baseUrl: d.baseUrl || "" });
        }
      })
      .catch(() => setLlmConfigured(false));
  }, []);

  const isCustom = llmProvider === "custom";
  const llmLocked = !!llmConfigured && !llmEditing;

  const handleLlmEdit = useCallback(() => {
    setLlmEditing(true);
    setLlmVerified(false);
  }, []);

  const handleProviderChange = useCallback((p: string) => {
    providerDrafts.current[llmProvider] = { model: llmModel, baseUrl: llmBaseUrl, apiKey: llmApiKey };
    setLlmProvider(p);
    const draft = providerDrafts.current[p];
    if (draft) {
      setLlmModel(draft.model);
      setLlmBaseUrl(draft.baseUrl);
      setLlmApiKey(draft.apiKey);
    } else if (p === llmSaved.provider) {
      setLlmModel(llmSaved.model);
      setLlmBaseUrl(llmSaved.baseUrl);
      setLlmApiKey("");
    } else {
      setLlmModel("");
      setLlmBaseUrl("");
      setLlmApiKey("");
    }
  }, [llmProvider, llmModel, llmBaseUrl, llmApiKey, llmSaved]);

  const testLlmConnection = useCallback(async () => {
    setLlmTesting(true);
    setLlmTestResult(null);
    try {
      const res = await fetch(`${API_BASE}/llm/test`, { method: "POST" });
      const d = await res.json();
      if (d.ok) {
        setLlmVerified(true);
        setLlmTestResult({ ok: true, msg: `${t("llmTestOk")} (${d.latency_ms}ms)` });
      } else {
        setLlmVerified(false);
        setLlmTestResult({ ok: false, msg: d.error || t("llmTestFail") });
      }
    } catch {
      setLlmVerified(false);
      setLlmTestResult({ ok: false, msg: t("llmTestFail") });
    } finally {
      setLlmTesting(false);
      setTimeout(() => setLlmTestResult(null), 6000);
    }
  }, [t]);

  const saveLlmConfig = useCallback(async () => {
    setLlmSaving(true);
    try {
      const res = await fetch(`${API_BASE}/llm/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: isCustom ? "openai" : llmProvider,
          model: llmModel.trim(),
          apiKey: llmApiKey.trim(),
          baseUrl: llmBaseUrl.trim(),
        }),
      });
      if (res.ok) {
        setLlmConfigured(true);
        setLlmEditing(false);
        setLlmApiKey("");
        setLlmSaved({ provider: llmProvider, model: llmModel.trim(), baseUrl: llmBaseUrl.trim() });
        providerDrafts.current = {};
        setLlmToast(t("llmConfigSaved"));
        setTimeout(() => setLlmToast(null), 3000);
        testLlmConnection();
      }
    } catch {
      /* silent */
    } finally {
      setLlmSaving(false);
    }
  }, [llmProvider, isCustom, llmModel, llmApiKey, llmBaseUrl, t, testLlmConnection]);

  // Binance
  const [binanceKey, setBinanceKey] = useState("");
  const [binanceSecret, setBinanceSecret] = useState("");
  const [binanceConfigured, setBinanceConfigured] = useState<boolean | null>(null);
  const [binanceEditing, setBinanceEditing] = useState(false);
  const [binanceSaving, setBinanceSaving] = useState(false);
  const [binanceToast, setBinanceToast] = useState<string | null>(null);

  // OKX
  const [okxKey, setOkxKey] = useState("");
  const [okxSecret, setOkxSecret] = useState("");
  const [okxPassphrase, setOkxPassphrase] = useState("");
  const [okxConfigured, setOkxConfigured] = useState<boolean | null>(null);
  const [okxEditing, setOkxEditing] = useState(false);
  const [okxSaving, setOkxSaving] = useState(false);
  const [okxToast, setOkxToast] = useState<string | null>(null);

  // OKX MCP
  const [mcpAccess, setMcpAccess] = useState<"readonly" | "full">("readonly");
  const [mcpToolCount, setMcpToolCount] = useState<number | null>(null);
  const [mcpSaving, setMcpSaving] = useState(false);
  const [mcpToast, setMcpToast] = useState<string | null>(null);

  // FlashAlpha MCP
  const [faKey, setFaKey] = useState("");
  const [faConfigured, setFaConfigured] = useState<boolean | null>(null);
  const [faEditing, setFaEditing] = useState(false);
  const [faSaving, setFaSaving] = useState(false);
  const [faToast, setFaToast] = useState<string | null>(null);
  const [faToolCount, setFaToolCount] = useState<number | null>(null);

  // CMC MCP
  const [cmcKey, setCmcKey] = useState("");
  const [cmcConfigured, setCmcConfigured] = useState<boolean | null>(null);
  const [cmcEditing, setCmcEditing] = useState(false);
  const [cmcSaving, setCmcSaving] = useState(false);
  const [cmcToast, setCmcToast] = useState<string | null>(null);
  const [cmcToolCount, setCmcToolCount] = useState<number | null>(null);

  // LangSmith
  const [lsKey, setLsKey] = useState("");
  const [lsConfigured, setLsConfigured] = useState<boolean | null>(null);
  const [lsEditing, setLsEditing] = useState(false);
  const [lsSaving, setLsSaving] = useState(false);
  const [lsToast, setLsToast] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/dual-invest/status`)
      .then((r) => (r.ok ? r.json() : { binance: false, okx: false }))
      .then((d) => {
        setBinanceConfigured(!!d.binance);
        setOkxConfigured(!!d.okx);
      })
      .catch(() => {
        setBinanceConfigured(false);
        setOkxConfigured(false);
      });

    fetch(`${API_BASE}/okx-mcp/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setMcpAccess(d.access === "full" ? "full" : "readonly");
        }
      })
      .catch(() => {});

    fetch(`${API_BASE}/cmc-mcp/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setCmcConfigured(!!d.configured);
      })
      .catch(() => setCmcConfigured(false));

    fetch(`${API_BASE}/flashalpha/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setFaConfigured(!!d.configured);
          if (d.toolCount) setFaToolCount(d.toolCount);
        }
      })
      .catch(() => setFaConfigured(false));

    fetch(`${API_BASE}/langsmith/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setLsConfigured(!!d.configured);
      })
      .catch(() => setLsConfigured(false));
  }, []);

  const saveBinanceKeys = useCallback(async () => {
    if (!binanceKey.trim() || !binanceSecret.trim()) return;
    setBinanceSaving(true);
    try {
      const res = await fetch(`${API_BASE}/dual-invest/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange: "binance",
          apiKey: binanceKey.trim(),
          apiSecret: binanceSecret.trim(),
        }),
      });
      if (res.ok) {
        setBinanceConfigured(true);
        setBinanceEditing(false);
        setBinanceKey("");
        setBinanceSecret("");
        setBinanceToast(t("binanceConfigSaved"));
        setTimeout(() => setBinanceToast(null), 2000);
      }
    } catch {
      /* silent */
    } finally {
      setBinanceSaving(false);
    }
  }, [binanceKey, binanceSecret, t]);

  const saveOkxKeys = useCallback(async () => {
    if (!okxKey.trim() || !okxSecret.trim() || !okxPassphrase.trim()) return;
    setOkxSaving(true);
    try {
      const res = await fetch(`${API_BASE}/dual-invest/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange: "okx",
          apiKey: okxKey.trim(),
          apiSecret: okxSecret.trim(),
          passphrase: okxPassphrase.trim(),
        }),
      });
      if (res.ok) {
        setOkxConfigured(true);
        setOkxEditing(false);
        setOkxKey("");
        setOkxSecret("");
        setOkxPassphrase("");
        setOkxToast(t("okxConfigSaved"));
        setTimeout(() => setOkxToast(null), 2000);
      }
    } catch {
      /* silent */
    } finally {
      setOkxSaving(false);
    }
  }, [okxKey, okxSecret, okxPassphrase, t]);

  const saveMcpConfig = useCallback(async (access: "readonly" | "full") => {
    setMcpAccess(access);
    setMcpSaving(true);
    try {
      const res = await fetch(`${API_BASE}/okx-mcp/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access }),
      });
      if (res.ok) {
        const d = await res.json();
        setMcpToolCount(d.toolCount ?? null);
        setMcpToast(t("okxMcpSaved"));
        setTimeout(() => setMcpToast(null), 3000);
      }
    } catch {
      /* silent */
    } finally {
      setMcpSaving(false);
    }
  }, [t]);

  const saveCmcKey = useCallback(async () => {
    if (!cmcKey.trim()) return;
    setCmcSaving(true);
    try {
      const res = await fetch(`${API_BASE}/cmc-mcp/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: cmcKey.trim() }),
      });
      if (res.ok) {
        const d = await res.json();
        setCmcConfigured(true);
        setCmcEditing(false);
        setCmcKey("");
        setCmcToolCount(d.cmcToolCount ?? null);
        setCmcToast(t("cmcMcpSaved"));
        setTimeout(() => setCmcToast(null), 3000);
      }
    } catch {
      /* silent */
    } finally {
      setCmcSaving(false);
    }
  }, [cmcKey, t]);

  const saveFaKey = useCallback(async () => {
    if (!faKey.trim()) return;
    setFaSaving(true);
    try {
      const res = await fetch(`${API_BASE}/flashalpha/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: faKey.trim() }),
      });
      if (res.ok) {
        const d = await res.json();
        setFaConfigured(true);
        setFaEditing(false);
        setFaKey("");
        setFaToolCount(d.toolCount ?? null);
        setFaToast(t("faMcpSaved"));
        setTimeout(() => setFaToast(null), 3000);
      }
    } catch {
      /* silent */
    } finally {
      setFaSaving(false);
    }
  }, [faKey, t]);

  const saveLsKey = useCallback(async () => {
    if (!lsKey.trim()) return;
    setLsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/langsmith/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: lsKey.trim() }),
      });
      if (res.ok) {
        setLsConfigured(true);
        setLsEditing(false);
        setLsKey("");
        setLsToast(t("langsmithSaved"));
        setTimeout(() => setLsToast(null), 3000);
      }
    } catch {
      /* silent */
    } finally {
      setLsSaving(false);
    }
  }, [lsKey, t]);

  const lsLocked = !!lsConfigured && !lsEditing;
  const faLocked = !!faConfigured && !faEditing;
  const cmcLocked = !!cmcConfigured && !cmcEditing;
  const binanceLocked = !!binanceConfigured && !binanceEditing;
  const okxLocked = !!okxConfigured && !okxEditing;

  return (
    <div className="settings-page">
      <h2>{t("navSettings")}</h2>

      {/* LLM Configuration */}
      <div className="settings-section">
        <label className="settings-label">
          {t("llmConfig")}
          {llmVerified && (
            <span style={{ marginLeft: 8, fontSize: "0.78rem", color: "#22c55e", fontWeight: 400 }}>
              ● {t("llmAvailable")}
            </span>
          )}
        </label>
        <p className="settings-desc">{t("llmConfigDesc")}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: "0.78rem", opacity: 0.5, display: "block", marginBottom: 4 }}>{t("llmProvider")}</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {LLM_PROVIDERS.map((p) => (
                <button
                  key={p}
                  className={`settings-option${llmProvider === p ? " active" : ""}`}
                  onClick={() => !llmLocked && handleProviderChange(p)}
                  disabled={llmLocked}
                >
                  {LLM_PROVIDER_LABELS[p] || p}
                </button>
              ))}
              {llmLocked && (
                <button
                  className="settings-option"
                  style={{ marginLeft: 8, padding: "2px 10px", fontSize: "0.75rem" }}
                  onClick={handleLlmEdit}
                >
                  {t("reconfigure")}
                </button>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "0.78rem", opacity: 0.5, display: "block", marginBottom: 4 }}>{t("llmModel")}</label>
              <input
                className="add-form-input"
                placeholder={t("llmModelPlaceholder")}
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                disabled={llmLocked}
                autoComplete="off"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "0.78rem", opacity: 0.5, display: "block", marginBottom: 4 }}>{t("llmApiKey")}</label>
              <input
                className="add-form-input"
                type={llmLocked || (!llmKeyFocused && llmConfigured && !llmApiKey) ? "text" : "password"}
                placeholder={t("llmApiKey")}
                value={llmLocked ? "••••••••" : (!llmKeyFocused && llmConfigured && !llmApiKey ? "••••••••" : llmApiKey)}
                onFocus={() => setLlmKeyFocused(true)}
                onBlur={() => setLlmKeyFocused(false)}
                onChange={(e) => setLlmApiKey(e.target.value)}
                disabled={llmLocked}
                autoComplete="off"
              />
            </div>
          </div>
          {isCustom && (
            <div>
              <label style={{ fontSize: "0.78rem", opacity: 0.5, display: "block", marginBottom: 4 }}>{t("llmBaseUrl")}</label>
              <input
                className="add-form-input"
                placeholder={t("llmBaseUrlRequired")}
                value={llmBaseUrl}
                onChange={(e) => setLlmBaseUrl(e.target.value)}
                disabled={llmLocked}
                autoComplete="off"
              />
            </div>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {!llmLocked && (
              <button
                className="settings-option"
                onClick={saveLlmConfig}
                disabled={llmSaving || !llmModel.trim() || (!llmConfigured && !llmApiKey.trim()) || (isCustom && !llmBaseUrl.trim())}
                style={{ padding: "6px 16px" }}
              >
                {t("save")}
              </button>
            )}
            {!llmLocked && llmEditing && (
              <button
                className="settings-option"
                onClick={() => {
                  setLlmEditing(false);
                  setLlmApiKey("");
                  setLlmProvider(llmSaved.provider);
                  setLlmModel(llmSaved.model);
                  setLlmBaseUrl(llmSaved.baseUrl);
                }}
                style={{ padding: "6px 16px" }}
              >
                {t("cancel")}
              </button>
            )}
            {llmConfigured && (
              <button
                className="settings-option"
                onClick={testLlmConnection}
                disabled={llmTesting}
                style={{ padding: "6px 16px" }}
              >
                {llmTesting ? t("llmTesting") : t("llmTestBtn")}
              </button>
            )}
          </div>
          {llmTestResult && (
            <div style={{
              fontSize: "0.82rem",
              color: llmTestResult.ok ? "#22c55e" : "#ef4444",
              padding: "8px 12px",
              borderRadius: 6,
              background: llmTestResult.ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
              wordBreak: "break-word",
            }}>
              {llmTestResult.msg}
            </div>
          )}
        </div>
      </div>

      {/* LangSmith Observability */}
      <div className="settings-section">
        <label className="settings-label">{t("langsmithConfig")}</label>
        <p className="settings-desc">{t("langsmithConfigDesc")}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span className={`market-status-dot ${lsConfigured ? "active" : "closed"}`} />
          <span style={{ fontSize: "0.85rem" }}>
            {lsConfigured ? t("langsmithConfigured") : t("langsmithNotConfigured")}
          </span>
          {lsLocked && (
            <button
              className="settings-option"
              style={{ marginLeft: 8, padding: "2px 10px", fontSize: "0.75rem" }}
              onClick={() => setLsEditing(true)}
            >
              {t("reconfigure")}
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            className="add-form-input"
            type="password"
            placeholder="LangSmith API Key (lsv2_pt_...)"
            value={lsLocked ? MASKED : lsKey}
            onChange={(e) => setLsKey(e.target.value)}
            disabled={lsLocked}
            autoComplete="off"
          />
          {!lsLocked && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="add-form-submit"
                onClick={saveLsKey}
                disabled={lsSaving || !lsKey.trim()}
                style={{ maxWidth: 200, padding: "6px 24px" }}
              >
                {t("save")}
              </button>
              {lsEditing && (
                <button
                  className="settings-option"
                  onClick={() => { setLsEditing(false); setLsKey(""); }}
                  style={{ padding: "6px 16px" }}
                >
                  {t("cancel")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="settings-section">
        <label className="settings-label">{t("settingsRefreshInterval")}</label>
        <p className="settings-desc">{t("settingsRefreshDesc")}</p>
        <div className="settings-options">
          {INTERVAL_OPTIONS.map((sec) => (
            <button
              key={sec}
              className={`settings-option${settings.refreshInterval === sec ? " active" : ""}`}
              onClick={() => update("refreshInterval", sec)}
            >
              {sec < 60 ? `${sec}s` : `${sec / 60}min`}
            </button>
          ))}
        </div>
      </div>

      {/* Binance API */}
      <div className="settings-section">
        <label className="settings-label">{t("binanceApiConfig")}</label>
        <p className="settings-desc">{t("binanceApiConfigDesc")}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span className={`market-status-dot ${binanceConfigured ? "active" : "closed"}`} />
          <span style={{ fontSize: "0.85rem" }}>
            {binanceConfigured ? t("binanceConfigured") : t("binanceNotConfigured")}
          </span>
          {binanceLocked && (
            <button
              className="settings-option"
              style={{ marginLeft: 8, padding: "2px 10px", fontSize: "0.75rem" }}
              onClick={() => setBinanceEditing(true)}
            >
              {t("reconfigure")}
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            className="add-form-input"
            placeholder="API Key"
            value={binanceLocked ? MASKED : binanceKey}
            onChange={(e) => setBinanceKey(e.target.value)}
            disabled={binanceLocked}
            autoComplete="off"
          />
          <input
            className="add-form-input"
            type="password"
            placeholder="API Secret"
            value={binanceLocked ? MASKED : binanceSecret}
            onChange={(e) => setBinanceSecret(e.target.value)}
            disabled={binanceLocked}
            autoComplete="off"
          />
          {!binanceLocked && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="add-form-submit"
                onClick={saveBinanceKeys}
                disabled={binanceSaving || !binanceKey.trim() || !binanceSecret.trim()}
                style={{ maxWidth: 200 }}
              >
                {t("save")}
              </button>
              {binanceEditing && (
                <button
                  className="settings-option"
                  onClick={() => {
                    setBinanceEditing(false);
                    setBinanceKey("");
                    setBinanceSecret("");
                  }}
                  style={{ padding: "6px 16px" }}
                >
                  {t("cancel")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* OKX API */}
      <div className="settings-section">
        <label className="settings-label">{t("okxApiConfig")}</label>
        <p className="settings-desc">{t("okxApiConfigDesc")}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span className={`market-status-dot ${okxConfigured ? "active" : "closed"}`} />
          <span style={{ fontSize: "0.85rem" }}>
            {okxConfigured ? t("okxConfigured") : t("okxNotConfigured")}
          </span>
          {okxLocked && (
            <button
              className="settings-option"
              style={{ marginLeft: 8, padding: "2px 10px", fontSize: "0.75rem" }}
              onClick={() => setOkxEditing(true)}
            >
              {t("reconfigure")}
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            className="add-form-input"
            placeholder="API Key"
            value={okxLocked ? MASKED : okxKey}
            onChange={(e) => setOkxKey(e.target.value)}
            disabled={okxLocked}
            autoComplete="off"
          />
          <input
            className="add-form-input"
            type="password"
            placeholder="Secret Key"
            value={okxLocked ? MASKED : okxSecret}
            onChange={(e) => setOkxSecret(e.target.value)}
            disabled={okxLocked}
            autoComplete="off"
          />
          <input
            className="add-form-input"
            type="password"
            placeholder="Passphrase"
            value={okxLocked ? MASKED : okxPassphrase}
            onChange={(e) => setOkxPassphrase(e.target.value)}
            disabled={okxLocked}
            autoComplete="off"
          />
          {!okxLocked && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="add-form-submit"
                onClick={saveOkxKeys}
                disabled={okxSaving || !okxKey.trim() || !okxSecret.trim() || !okxPassphrase.trim()}
                style={{ maxWidth: 200 }}
              >
                {t("save")}
              </button>
              {okxEditing && (
                <button
                  className="settings-option"
                  onClick={() => {
                    setOkxEditing(false);
                    setOkxKey("");
                    setOkxSecret("");
                    setOkxPassphrase("");
                  }}
                  style={{ padding: "6px 16px" }}
                >
                  {t("cancel")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* OKX MCP Access */}
      <div className="settings-section">
        <label className="settings-label">{t("okxMcpConfig")}</label>
        <p className="settings-desc">{t("okxMcpConfigDesc")}</p>

        {mcpToolCount !== null && (
          <div style={{ fontSize: "0.85rem", marginBottom: 10, opacity: 0.7 }}>
            {t("okxMcpToolCount")}: {mcpToolCount}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button
            className={`settings-option${mcpAccess === "readonly" ? " active" : ""}`}
            onClick={() => saveMcpConfig("readonly")}
            disabled={mcpSaving}
          >
            {t("okxMcpAccessReadonly")}
          </button>
          <button
            className={`settings-option${mcpAccess === "full" ? " active" : ""}`}
            onClick={() => saveMcpConfig("full")}
            disabled={mcpSaving}
          >
            {t("okxMcpAccessFull")}
          </button>
        </div>

        {mcpAccess === "full" && (
          <p style={{ fontSize: "0.82rem", color: "var(--color-danger, #e74c3c)", margin: "0 0 8px" }}>
            {t("okxMcpFullWarning")}
          </p>
        )}
      </div>

      {/* FlashAlpha MCP */}
      <div className="settings-section">
        <label className="settings-label">{t("faMcpConfig")}</label>
        <p className="settings-desc">{t("faMcpConfigDesc")}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span className={`market-status-dot ${faConfigured ? "active" : "closed"}`} />
          <span style={{ fontSize: "0.85rem" }}>
            {faConfigured ? t("faMcpConfigured") : t("faMcpNotConfigured")}
          </span>
          {faToolCount != null && (
            <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>
              ({t("faMcpToolCount")}: {faToolCount})
            </span>
          )}
          {faLocked && (
            <button
              className="settings-option"
              style={{ marginLeft: 8, padding: "2px 10px", fontSize: "0.75rem" }}
              onClick={() => setFaEditing(true)}
            >
              {t("reconfigure")}
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            className="add-form-input"
            type="password"
            placeholder="FlashAlpha API Key"
            value={faLocked ? MASKED : faKey}
            onChange={(e) => setFaKey(e.target.value)}
            disabled={faLocked}
            autoComplete="off"
          />
          {!faLocked && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="add-form-submit"
                onClick={saveFaKey}
                disabled={faSaving || !faKey.trim()}
                style={{ maxWidth: 200, padding: "6px 24px" }}
              >
                {faSaving ? t("mcpConnecting") : t("save")}
              </button>
              {faEditing && (
                <button
                  className="settings-option"
                  onClick={() => { setFaEditing(false); setFaKey(""); }}
                  style={{ padding: "6px 16px" }}
                >
                  {t("cancel")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CoinMarketCap MCP */}
      <div className="settings-section">
        <label className="settings-label">{t("cmcMcpConfig")}</label>
        <p className="settings-desc">{t("cmcMcpConfigDesc")}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span className={`market-status-dot ${cmcConfigured ? "active" : "closed"}`} />
          <span style={{ fontSize: "0.85rem" }}>
            {cmcConfigured ? t("cmcMcpConfigured") : t("cmcMcpNotConfigured")}
          </span>
          {cmcToolCount != null && (
            <span style={{ fontSize: "0.8rem", opacity: 0.6 }}>
              ({t("cmcMcpToolCount")}: {cmcToolCount})
            </span>
          )}
          {cmcLocked && (
            <button
              className="settings-option"
              style={{ marginLeft: 8, padding: "2px 10px", fontSize: "0.75rem" }}
              onClick={() => setCmcEditing(true)}
            >
              {t("reconfigure")}
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            className="add-form-input"
            type="password"
            placeholder="CoinMarketCap API Key"
            value={cmcLocked ? MASKED : cmcKey}
            onChange={(e) => setCmcKey(e.target.value)}
            disabled={cmcLocked}
            autoComplete="off"
          />
          {!cmcLocked && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="add-form-submit"
                onClick={saveCmcKey}
                disabled={cmcSaving || !cmcKey.trim()}
                style={{ maxWidth: 200, padding: "6px 24px" }}
              >
                {cmcSaving ? t("mcpConnecting") : t("save")}
              </button>
              {cmcEditing && (
                <button
                  className="settings-option"
                  onClick={() => { setCmcEditing(false); setCmcKey(""); }}
                  style={{ padding: "6px 16px" }}
                >
                  {t("cancel")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {llmToast && <div className="toast">{llmToast}</div>}
      {lsToast && <div className="toast">{lsToast}</div>}
      {binanceToast && <div className="toast">{binanceToast}</div>}
      {okxToast && <div className="toast">{okxToast}</div>}
      {mcpToast && <div className="toast">{mcpToast}</div>}
      {faToast && <div className="toast">{faToast}</div>}
      {cmcToast && <div className="toast">{cmcToast}</div>}
    </div>
  );
}
