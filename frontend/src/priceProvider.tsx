import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { API_BASE } from "./hooks/useApi";
import { useSettings } from "./settings";

export interface PriceData {
  price: number | null;
  change: number | null;
  marketState: string | null;
  loading: boolean;
}

interface PriceContextValue {
  prices: Record<string, PriceData>;
  subscribe: (ticker: string) => void;
  unsubscribe: (ticker: string) => void;
}

const PriceContext = createContext<PriceContextValue | null>(null);

export function PriceProvider({ children }: { children: ReactNode }) {
  const { jitteredInterval } = useSettings();
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const subscribersRef = useRef<Map<string, number>>(new Map());

  const fetchBatch = useCallback(async (tickers: string[]) => {
    if (tickers.length === 0) return;
    setPrices((prev) => {
      const next = { ...prev };
      for (const t of tickers) next[t] = { ...next[t], loading: true };
      return next;
    });
    try {
      const res = await fetch(`${API_BASE}/prices?tickers=${tickers.join(",")}`);
      if (!res.ok) throw new Error();
      const { prices: batch } = await res.json();
      setPrices((prev) => {
        const next = { ...prev };
        for (const t of tickers) {
          const d = batch[t];
          if (d && !d.error) {
            next[t] = {
              price: d.price ?? null,
              change: d.changePercent ?? null,
              marketState: d.marketState ?? null,
              loading: false,
            };
          } else {
            next[t] = { price: null, change: null, marketState: null, loading: false };
          }
        }
        return next;
      });
    } catch {
      setPrices((prev) => {
        const next = { ...prev };
        for (const t of tickers)
          next[t] = { price: null, change: null, marketState: null, loading: false };
        return next;
      });
    }
  }, []);

  const refreshAll = useCallback(() => {
    const tickers = Array.from(subscribersRef.current.keys());
    fetchBatch(tickers);
  }, [fetchBatch]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        refreshAll();
        schedule();
      }, jitteredInterval());
    };
    schedule();
    return () => clearTimeout(timer);
  }, [refreshAll, jitteredInterval]);

  const subscribe = useCallback(
    (ticker: string) => {
      const subs = subscribersRef.current;
      const count = subs.get(ticker) ?? 0;
      subs.set(ticker, count + 1);
      if (count === 0) fetchBatch([ticker]);
    },
    [fetchBatch],
  );

  const unsubscribe = useCallback((ticker: string) => {
    const subs = subscribersRef.current;
    const count = subs.get(ticker) ?? 0;
    if (count <= 1) {
      subs.delete(ticker);
    } else {
      subs.set(ticker, count - 1);
    }
  }, []);

  return (
    <PriceContext.Provider value={{ prices, subscribe, unsubscribe }}>
      {children}
    </PriceContext.Provider>
  );
}

export function usePrice(ticker: string): PriceData | undefined {
  const ctx = useContext(PriceContext);
  if (!ctx) throw new Error("usePrice must be used within PriceProvider");
  const { prices, subscribe, unsubscribe } = ctx;

  useEffect(() => {
    subscribe(ticker);
    return () => unsubscribe(ticker);
  }, [ticker, subscribe, unsubscribe]);

  return prices[ticker];
}

export function usePrices(): Record<string, PriceData> {
  const ctx = useContext(PriceContext);
  if (!ctx) throw new Error("usePrices must be used within PriceProvider");
  return ctx.prices;
}

export function usePriceSubscribe(): (ticker: string) => void {
  const ctx = useContext(PriceContext);
  if (!ctx) throw new Error("usePriceSubscribe must be used within PriceProvider");
  return ctx.subscribe;
}
