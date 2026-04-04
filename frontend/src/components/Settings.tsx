import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { useSettings } from "../settings";
import { API_BASE } from "../hooks/useApi";

const INTERVAL_OPTIONS = [15, 30, 60, 120, 300];
const LLM_PROVIDERS = ["google", "openai", "anthropic", "custom"];
const LLM_PROVIDER_LABELS: Record<string, string> = {
  google: "Google Gemini",
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

  const handleProviderChange = useCallback((p: string) => {
    setLlmProvider(p);
    if (p !== llmSaved.provider) {
      setLlmModel("");
      setLlmBaseUrl("");
      setLlmApiKey("");
    }
  }, [llmSaved.provider]);

  const handleLlmCancel = useCallback(() => {
    setLlmEditing(false);
    setLlmProvider(llmSaved.provider);
    setLlmModel(llmSaved.model);
    setLlmBaseUrl(llmSaved.baseUrl);
    setLlmApiKey("");
  }, [llmSaved]);

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
        setLlmToast(t("llmConfigSaved"));
        setTimeout(() => setLlmToast(null), 3000);
      }
    } catch {
      /* silent */
    } finally {
      setLlmSaving(false);
    }
  }, [llmProvider, isCustom, llmModel, llmApiKey, llmBaseUrl, t]);

  const llmLocked = !!llmConfigured && !llmEditing;
  const llmDirty = llmEditing && (llmProvider !== llmSaved.provider || llmModel !== llmSaved.model);

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

  const binanceLocked = !!binanceConfigured && !binanceEditing;
  const okxLocked = !!okxConfigured && !okxEditing;

  return (
    <div className="settings-page">
      <h2>{t("navSettings")}</h2>

      {/* LLM Configuration */}
      <div className="settings-section">
        <label className="settings-label">{t("llmConfig")}</label>
        <p className="settings-desc">{t("llmConfigDesc")}</p>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <span className={`market-status-dot ${llmConfigured && !llmDirty ? "active" : "closed"}`} />
          <span style={{ fontSize: "0.85rem" }}>
            {llmConfigured && !llmDirty
              ? `${llmSaved.provider === "custom" ? (llmSaved.baseUrl || "Custom") : (LLM_PROVIDER_LABELS[llmSaved.provider] || llmSaved.provider)} — ${llmSaved.model}`
              : t("llmNotConfigured")}
          </span>
          {llmLocked && isCustom && llmBaseUrl && (
            <span style={{ fontSize: "0.75rem", opacity: 0.6 }}>({llmBaseUrl})</span>
          )}
          {llmLocked && (
            <button
              className="settings-option"
              style={{ marginLeft: 8, padding: "2px 10px", fontSize: "0.75rem" }}
              onClick={() => setLlmEditing(true)}
            >
              {t("reconfigure")}
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8 }}>
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
          </div>
          <input
            className="add-form-input"
            placeholder={t("llmModelPlaceholder")}
            value={llmModel}
            onChange={(e) => setLlmModel(e.target.value)}
            disabled={llmLocked}
            autoComplete="off"
          />
          <input
            className="add-form-input"
            type="password"
            placeholder={t("llmApiKey")}
            value={llmLocked ? MASKED : llmApiKey}
            onChange={(e) => setLlmApiKey(e.target.value)}
            disabled={llmLocked}
            autoComplete="off"
          />
          {isCustom && (
            <input
              className="add-form-input"
              placeholder={t("llmBaseUrlRequired")}
              value={llmBaseUrl}
              onChange={(e) => setLlmBaseUrl(e.target.value)}
              disabled={llmLocked}
              autoComplete="off"
            />
          )}
          {!llmLocked && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="add-form-submit"
                onClick={saveLlmConfig}
                disabled={llmSaving || !llmModel.trim() || !llmApiKey.trim() || (isCustom && !llmBaseUrl.trim())}
                style={{ maxWidth: 200 }}
              >
                {t("save")}
              </button>
              {llmEditing && (
                <button
                  className="settings-option"
                  onClick={handleLlmCancel}
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

      {llmToast && <div className="toast">{llmToast}</div>}
      {binanceToast && <div className="toast">{binanceToast}</div>}
      {okxToast && <div className="toast">{okxToast}</div>}
    </div>
  );
}
