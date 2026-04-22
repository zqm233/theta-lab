import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchApi } from "./api";

/**
 * 通用的 GET 请求 Hook
 * 
 * 优化的 loading 状态:
 * - 如果有缓存数据,即使在后台刷新也不会显示 loading
 * - 只在真正没有数据时才显示 loading
 */
export function useApiQuery<T>(
  key: string | string[],
  path: string,
  options?: {
    enabled?: boolean;
    refetchInterval?: number;
    staleTime?: number;
    /** 覆盖全局 retry；例如列表接口失败时不希望立刻再打一遍 */
    retry?: boolean | number;
  }
) {
  const query = useQuery<T>({
    queryKey: Array.isArray(key) ? key : [key],
    queryFn: () => fetchApi<T>(path),
    enabled: options?.enabled,
    refetchInterval: options?.refetchInterval,
    staleTime: options?.staleTime,
    ...(options?.retry !== undefined ? { retry: options.retry } : {}),
  });

  // 优化的 loading 状态:只在没有数据且正在获取时才为 true
  const isLoading = query.isLoading && !query.data;

  return {
    ...query,
    isLoading, // 覆盖原始的 isLoading
  };
}

/**
 * 通用的 POST/PUT/DELETE 请求 Hook
 */
export function useApiMutation<TData = unknown, TVariables = unknown>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: {
    onSuccess?: (data: TData) => void;
    onError?: (error: Error) => void;
    invalidateKeys?: string[][];
  }
) {
  const queryClient = useQueryClient();

  return useMutation<TData, Error, TVariables>({
    mutationFn,
    onSuccess: (data) => {
      // 自动失效相关查询,触发重新获取
      if (options?.invalidateKeys) {
        options.invalidateKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }
      options?.onSuccess?.(data);
    },
    onError: options?.onError,
  });
}
