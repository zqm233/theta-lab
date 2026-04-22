/**
 * Custom hook for OptionsChain data fetching with React Query
 * 
 * Handles:
 * - Automatic expiration date selection
 * - "Today expired" special logic (auto-switch to next date)
 * - Unified caching and refresh strategy
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export interface OptionsChainData {
  ticker: string;
  expiration: string;
  daysToExpiry: number;
  currentPrice: number;
  calls: any[];
  puts: any[];
  availableExpirations: string[];
  dataSource: string;
  fetchedAt: string;
  ivRank: number | null;
  earningsWarning: any | null;
  underlying?: string;
}

async function fetchOptionsChainApi(ticker: string, expiration?: string): Promise<OptionsChainData> {
  // v1 API: GET /tickers/:ticker/options-chains
  const path = expiration
    ? `${API_BASE}/tickers/${ticker}/options-chains?expiration=${expiration}`
    : `${API_BASE}/tickers/${ticker}/options-chains`;
  
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to fetch options chain: ${res.statusText}`);
  }
  
  return await res.json();
}

export function useOptionsChain(ticker: string, initialExpiration: string | null) {
  // effectiveExpiration: 真正用于查询的到期日
  // ❌ 不要用 useEffect 同步 initialExpiration,会导致重复请求
  const [effectiveExpiration, setEffectiveExpiration] = useState<string | null>(initialExpiration);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["options-chain", ticker, effectiveExpiration || "auto"],
    queryFn: async () => {
      const chainData = await fetchOptionsChainApi(ticker, effectiveExpiration || undefined);
      
      // 特殊逻辑: 如果今天到期 (daysToExpiry === 0),自动切换到下一个到期日
      if (!effectiveExpiration && chainData.daysToExpiry === 0 && chainData.availableExpirations.length > 1) {
        const nextExp = chainData.availableExpirations[1];
        
        // 延迟切换,避免在 queryFn 中直接 setState
        setTimeout(() => {
          setEffectiveExpiration(nextExp);
        }, 0);
        
        // 返回当前数据,下次查询会使用新的到期日
        return chainData;
      }
      
      return chainData;
    },
    enabled: !!ticker,
    staleTime: 60000, // 60s
    // 移除 refetchInterval - 避免后台持续请求导致页面切换时重复请求
    retry: 1,
  });

  return {
    data,
    isLoading,
    error,
    refetch,
    effectiveExpiration,
    setEffectiveExpiration,
  };
}
