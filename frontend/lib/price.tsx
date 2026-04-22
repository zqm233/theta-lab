"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "./api";

export interface PriceData {
  price: number | null;
  change: number | null;
  marketState: string | null;
  loading: boolean;
}

// 使用 React Query 管理单个价格数据
function usePriceQuery(ticker: string) {
  return useQuery({
    queryKey: ["price", ticker],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/tickers/prices?tickers=${ticker}`);
      if (!res.ok) throw new Error();
      const { prices: batch } = await res.json();
      const d = batch[ticker];
      if (d && !d.error) {
        return {
          price: d.price ?? null,
          change: d.changePercent ?? null,
          marketState: d.marketState ?? null,
          loading: false,
        };
      }
      return { price: null, change: null, marketState: null, loading: false };
    },
    staleTime: 60000, // 60s - 与全局一致,避免频繁刷新
    // 移除 refetchInterval - 避免后台持续请求导致页面切换时重复请求
    retry: 1,
  });
}

export function usePrice(ticker: string): PriceData | undefined {
  const { data, isLoading } = usePriceQuery(ticker);
  
  if (isLoading && !data) {
    return { price: null, change: null, marketState: null, loading: true };
  }
  
  return data;
}

// 批量获取多个 ticker 的价格（用于 Watchlist 等组件）
export function usePrices(tickers: string[] = []): Record<string, PriceData> {
  const { data, isLoading } = useQuery({
    queryKey: ["prices", tickers.sort().join(",")],
    queryFn: async () => {
      if (tickers.length === 0) return {};
      
      const res = await fetch(`${API_BASE}/tickers/prices?tickers=${tickers.join(",")}`);
      if (!res.ok) throw new Error();
      const { prices: batch } = await res.json();
      
      const result: Record<string, PriceData> = {};
      for (const ticker of tickers) {
        const d = batch[ticker];
        if (d && !d.error) {
          result[ticker] = {
            price: d.price ?? null,
            change: d.changePercent ?? null,
            marketState: d.marketState ?? null,
            loading: false,
          };
        } else {
          result[ticker] = {
            price: null,
            change: null,
            marketState: null,
            loading: false,
          };
        }
      }
      return result;
    },
    enabled: tickers.length > 0,
    staleTime: 60000, // 60s
    // 移除 refetchInterval - 避免后台持续请求
    retry: 1,
  });
  
  if (isLoading && !data) {
    // Return empty loading state for each ticker
    const result: Record<string, PriceData> = {};
    for (const ticker of tickers) {
      result[ticker] = { price: null, change: null, marketState: null, loading: true };
    }
    return result;
  }
  
  return data ?? {};
}
