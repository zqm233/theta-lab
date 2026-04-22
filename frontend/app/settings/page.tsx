"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Save, Settings as SettingsIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useSettings, type MarketStatus } from "@/lib/settings";

export default function SettingsPage() {
  const { t } = useI18n();
  const { settings, update, refreshIntervalMs, marketStatus } = useSettings();
  const [localRefresh, setLocalRefresh] = useState(
    settings?.refreshInterval?.toString() || "30"
  );
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  };

  useEffect(() => {
    if (settings?.refreshInterval) {
      setLocalRefresh(settings.refreshInterval.toString());
    }
  }, [settings]);

  const handleSave = () => {
    setSaving(true);
    const newInterval = parseInt(localRefresh, 10);
    if (!isNaN(newInterval) && newInterval >= 5) {
      update("refreshInterval", newInterval);
      showToast("设置已保存 / Settings saved");
    }
    setSaving(false);
  };

  const getMarketStatusColor = (status: MarketStatus) => {
    const state = status.marketState;
    if (state === "OPEN" || state === "open") return "text-green-400";
    if (state === "PRE" || state === "pre") return "text-blue-400";
    if (state === "POST" || state === "post") return "text-orange-400";
    return "text-gray-400";
  };

  const getMarketStatusLabel = (status: MarketStatus) => {
    const state = status.marketState;
    if (state === "OPEN" || state === "open") return t("marketOpen");
    if (state === "PRE" || state === "pre") return t("marketPre");
    if (state === "POST" || state === "post") return t("marketPost");
    return t("marketClosed");
  };

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-[1600px] mx-auto p-8 space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-8"
        >
          <div className="flex items-center gap-4 mb-2">
            <SettingsIcon size={32} className="text-primary" />
            <h1 className="text-3xl font-bold">{t("navSettings")}</h1>
          </div>
          <p className="text-muted-foreground">
            {t("settingsProductScope")}
          </p>
        </motion.div>

        {/* Market Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-2xl p-6"
        >
          <h2 className="text-xl font-semibold mb-4">{t("settingsMarketStatus")}</h2>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">US Market:</span>
            <span className={`text-lg font-semibold ${getMarketStatusColor(marketStatus)}`}>
              {getMarketStatusLabel(marketStatus)}
            </span>
            {!marketStatus.isActive && (
              <span className="text-xs text-muted-foreground ml-auto">
                {t("marketClosedSlowRefresh")}
              </span>
            )}
          </div>
        </motion.div>

        {/* Refresh Interval */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-2xl p-6"
        >
          <h2 className="text-xl font-semibold mb-2">{t("settingsRefreshInterval")}</h2>
          <p className="text-sm text-muted-foreground mb-4">{t("settingsRefreshDesc")}</p>
          
          <div className="flex items-center gap-4">
            <input
              type="number"
              min="5"
              step="5"
              value={localRefresh}
              onChange={(e) => setLocalRefresh(e.target.value)}
              className="flex-1 px-4 py-2 bg-background/50 border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <span className="text-muted-foreground">seconds</span>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? t("saving") : t("save")}
            </motion.button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Current: {settings?.refreshInterval || 30}s ({refreshIntervalMs / 1000}s = {refreshIntervalMs}ms)
          </p>
        </motion.div>

        {/* LLM Config */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass rounded-2xl p-6"
        >
          <h2 className="text-xl font-semibold mb-2">{t("llmConfig")}</h2>
          <p className="text-sm text-muted-foreground mb-4">{t("llmConfigDesc")}</p>
          
          <div className="space-y-4">
            <div className="p-4 bg-accent/30 border border-border/50 rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Google Gemini</div>
                  <div className="text-sm text-muted-foreground">gemini-2.5-flash</div>
                </div>
                <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-medium">
                  {t("llmConfigured")}
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              LLM configuration is managed in the backend. Check backend/api/settings.py for details.
            </p>
          </div>
        </motion.div>

        {/* Exchange APIs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass rounded-2xl p-6"
        >
          <h2 className="text-xl font-semibold mb-4">Exchange API Configuration</h2>
          
          <div className="space-y-4">
            {/* Binance */}
            <div className="p-4 bg-accent/30 border border-border/50 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">Binance</div>
                <span className="px-3 py-1 bg-gray-500/20 text-gray-400 rounded-full text-xs font-medium">
                  {t("binanceNotConfigured")}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{t("binanceApiConfigDesc")}</p>
            </div>

            {/* OKX */}
            <div className="p-4 bg-accent/30 border border-border/50 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">OKX</div>
                <span className="px-3 py-1 bg-gray-500/20 text-gray-400 rounded-full text-xs font-medium">
                  {t("okxNotConfigured")}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{t("okxApiConfigDesc")}</p>
            </div>

            <p className="text-xs text-muted-foreground">
              Exchange API keys are configured via environment variables on the backend.
            </p>
          </div>
        </motion.div>

        {/* MCP Integrations */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass rounded-2xl p-6"
        >
          <h2 className="text-xl font-semibold mb-4">MCP Integrations</h2>
          
          <div className="space-y-4">
            {/* FlashAlpha */}
            <div className="p-4 bg-accent/30 border border-border/50 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">FlashAlpha</div>
                <span className="px-3 py-1 bg-gray-500/20 text-gray-400 rounded-full text-xs font-medium">
                  {t("faMcpNotConfigured")}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{t("faMcpConfigDesc")}</p>
            </div>

            {/* CoinMarketCap */}
            <div className="p-4 bg-accent/30 border border-border/50 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">CoinMarketCap</div>
                <span className="px-3 py-1 bg-gray-500/20 text-gray-400 rounded-full text-xs font-medium">
                  {t("cmcMcpNotConfigured")}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{t("cmcMcpConfigDesc")}</p>
            </div>

            <p className="text-xs text-muted-foreground">
              MCP tool configurations are managed on the backend. Configure API keys via environment variables.
            </p>
          </div>
        </motion.div>

        {/* LangSmith */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="glass rounded-2xl p-6"
        >
          <h2 className="text-xl font-semibold mb-2">{t("langsmithConfig")}</h2>
          <p className="text-sm text-muted-foreground mb-4">{t("langsmithConfigDesc")}</p>
          
          <div className="p-4 bg-accent/30 border border-border/50 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="font-medium">LangSmith Tracing</div>
              <span className="px-3 py-1 bg-gray-500/20 text-gray-400 rounded-full text-xs font-medium">
                {t("langsmithNotConfigured")}
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Configure LANGCHAIN_API_KEY in backend environment to enable observability.
          </p>
        </motion.div>
      </div>

      {/* Toast */}
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
    </div>
  );
}
