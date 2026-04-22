"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ReactNode, useState } from "react";

export function ReactQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 激进的缓存策略,优先使用缓存
            staleTime: 60000, // 数据保持新鲜 60 秒
            gcTime: 600000, // 缓存保留 10 分钟
            refetchOnWindowFocus: false, // 窗口聚焦时不自动刷新
            refetchOnMount: "always" as const, // 只在数据过期时重新获取（支持浏览器前进/后退）
            refetchOnReconnect: false, // 重连时不刷新
            retry: 1, // 失败重试 1 次
            // 关键:即使数据标记为 stale,也优先从缓存返回
            networkMode: "offlineFirst", // 优先使用缓存
          },
          mutations: {
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} position="bottom" />
    </QueryClientProvider>
  );
}
