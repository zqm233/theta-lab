import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { API_BASE } from "./hooks/useApi";

interface Settings {
  refreshInterval: number;
}

const DEFAULTS: Settings = {
  refreshInterval: 60,
};

const STORAGE_KEY = "thetalab-settings";

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function save(s: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export interface MarketStatus {
  marketState: string;
  isActive: boolean;
  reason: string | null;
}

const PAUSED_INTERVAL_MS = 24 * 60 * 60 * 1000; // effectively stopped
const MARKET_STATUS_POLL_MS = 2 * 60 * 1000; // check every 2 min

interface SettingsContextValue {
  settings: Settings;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  refreshIntervalMs: number;
  /** Returns base interval ± jitter, automatically slowed when market is closed. */
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
      const res = await fetch(`${API_BASE}/market-status`);
      if (res.ok) {
        const data: MarketStatus = await res.json();
        setMarketStatus(data);
      }
    } catch {
      /* silent — keep last known status */
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

  return (
    <SettingsContext.Provider value={{ settings, update, refreshIntervalMs, jitteredInterval, marketStatus }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
