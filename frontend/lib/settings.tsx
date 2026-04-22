"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { API_BASE } from "./api";
import { getLocalStorage, setLocalStorage } from "./utils/localStorage";

interface Settings {
  refreshInterval: number;
}

const DEFAULTS: Settings = {
  refreshInterval: 60,
};

const STORAGE_KEY = "thetalab-settings";

// Type guard for Settings validation
function isSettings(data: unknown): data is Settings {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  return typeof obj.refreshInterval === "number" && obj.refreshInterval > 0;
}

function load(): Settings {
  return getLocalStorage<Settings>(STORAGE_KEY, DEFAULTS, isSettings);
}

function save(s: Settings) {
  setLocalStorage(STORAGE_KEY, s);
}

export interface MarketStatus {
  marketState: string;
  isActive: boolean;
  reason: string | null;
}

const PAUSED_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MARKET_STATUS_POLL_MS = 2 * 60 * 1000;

interface SettingsContextValue {
  settings: Settings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  refreshIntervalMs: number;
  jitteredInterval: (factor?: number) => number;
  marketStatus: MarketStatus;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

const DEFAULT_MARKET_STATUS: MarketStatus = {
  marketState: "UNKNOWN",
  isActive: true,
  reason: null,
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);
  const [marketStatus, setMarketStatus] = useState<MarketStatus>(DEFAULT_MARKET_STATUS);

  const marketActive = marketStatus.isActive;

  const fetchMarketStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/market/status`);
      if (res.ok) {
        const data: MarketStatus = await res.json();
        setMarketStatus(data);
      }
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    fetchMarketStatus();
    const id = setInterval(fetchMarketStatus, MARKET_STATUS_POLL_MS);
    return () => clearInterval(id);
  }, [fetchMarketStatus]);

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      save(next);
      return next;
    });
  }, []);

  const refreshIntervalMs = settings.refreshInterval * 1000;

  const jitteredInterval = useCallback(
    (factor = 0.2) => {
      if (!marketActive) return PAUSED_INTERVAL_MS;
      const base = refreshIntervalMs;
      const offset = base * factor * (Math.random() * 2 - 1);
      return Math.round(base + offset);
    },
    [refreshIntervalMs, marketActive],
  );

  // Rule: rerender-dependencies - Memoize context value
  const value = useMemo(() => ({
    settings,
    update,
    refreshIntervalMs,
    jitteredInterval,
    marketStatus,
  }), [settings, update, refreshIntervalMs, jitteredInterval, marketStatus]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
