"use client";

/**
 * Client-side store for last-known per-holding quotes (memory + localStorage).
 * Account-level totals on the main 账户页 still come from GET /accounts?view=summary
 * (server computes from live fetch); this map feeds the holdings dialog display and
 * fallback when a request returns without a price.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/** localStorage key — survives reload & browser restart until cleared. */
const LS_KEY = "thetalab-holding-quotes-v1";

export type HoldingQuoteMap = Record<string, number>;

function loadFromStorage(): HoldingQuoteMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const j = JSON.parse(raw) as unknown;
    return typeof j === "object" && j !== null && !Array.isArray(j) ? (j as HoldingQuoteMap) : {};
  } catch {
    return {};
  }
}

function saveToStorage(m: HoldingQuoteMap) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(m));
  } catch {
    /* quota / private mode */
  }
}

interface HoldingQuotesContextValue {
  /** Merge API prices into in-memory + localStorage (skips nulls to keep last known). */
  mergeFromHoldings: (rows: { id: string; currentPrice: number | null }[]) => void;
  /**
   * Display price: prefer fresh API value when present; otherwise last known from cache
   * (e.g. quote failed this request but we still have localStorage from earlier).
   */
  get: (holdingId: string, apiFallback: number | null) => number | null;
}

const HoldingQuotesContext = createContext<HoldingQuotesContextValue | null>(null);

const fallbackQuotes: HoldingQuotesContextValue = {
  mergeFromHoldings: () => {},
  get: (_holdingId, apiFallback) =>
    apiFallback !== null && apiFallback !== undefined && !Number.isNaN(Number(apiFallback))
      ? Number(apiFallback)
      : null,
};

export function HoldingQuotesProvider({ children }: { children: ReactNode }) {
  const [byId, setById] = useState<HoldingQuoteMap>({});

  useEffect(() => {
    setById(loadFromStorage());
  }, []);

  const mergeFromHoldings = useCallback((rows: { id: string; currentPrice: number | null }[]) => {
    setById((prev) => {
      const next = { ...prev };
      for (const r of rows) {
        const v = r.currentPrice;
        if (v !== null && v !== undefined && !Number.isNaN(Number(v))) {
          next[r.id] = Number(v);
        }
      }
      saveToStorage(next);
      return next;
    });
  }, []);

  const get = useCallback((holdingId: string, apiFallback: number | null) => {
    if (apiFallback !== null && apiFallback !== undefined && !Number.isNaN(Number(apiFallback))) {
      return Number(apiFallback);
    }
    const cached = byId[holdingId];
    return cached !== undefined ? cached : null;
  }, [byId]);

  const value = useMemo(
    () => ({ mergeFromHoldings, get }),
    [mergeFromHoldings, get],
  );

  return (
    <HoldingQuotesContext.Provider value={value}>
      {children}
    </HoldingQuotesContext.Provider>
  );
}

/**
 * Returns quote helpers; if used outside `HoldingQuotesProvider`, behaves as API-only
 * (no local cache) so the UI does not crash.
 */
export function useHoldingQuotes(): HoldingQuotesContextValue {
  const ctx = useContext(HoldingQuotesContext);
  return ctx ?? fallbackQuotes;
}
