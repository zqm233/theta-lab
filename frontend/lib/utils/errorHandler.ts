/**
 * 统一的 API 错误处理工具
 * 
 * 用于前端组件中的 API 调用错误处理，提供用户友好的错误消息
 */

export interface ApiError {
  message: string;
  status?: number;
  detail?: string;
}

/**
 * 从 Response 对象中提取错误消息
 */
export async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body.detail) return body.detail;
    if (body.error) return typeof body.error === 'string' ? body.error : body.error.message || 'Unknown error';
    if (body.message) return body.message;
  } catch {
    // JSON 解析失败，使用 HTTP 状态码
  }
  
  // 根据状态码返回友好消息
  switch (response.status) {
    case 400:
      return '请求参数错误';
    case 401:
      return '未授权，请检查 API 配置';
    case 403:
      return '无权限访问';
    case 404:
      return '请求的资源不存在';
    case 429:
      return 'API 请求过于频繁，请稍后再试';
    case 500:
      return '服务器内部错误';
    case 502:
      return '网关错误，后端服务不可用';
    case 503:
      return '服务暂时不可用';
    default:
      return `HTTP ${response.status} 错误`;
  }
}

/**
 * 从 Error 对象中提取用户友好的错误消息
 */
export function extractErrorFromException(error: unknown): string {
  if (error instanceof Error) {
    // 网络错误
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      return '网络连接失败，请检查网络';
    }
    // 超时错误
    if (error.message.includes('timeout') || error.message.includes('Timeout')) {
      return '请求超时，请稍后重试';
    }
    return error.message;
  }
  return '未知错误';
}

/**
 * 日志记录（开发环境输出，生产环境静默）
 */
export function logError(context: string, error: unknown) {
  if (process.env.NODE_ENV === 'development') {
    console.error(`[${context}]`, error);
  }
}

/**
 * 统一的 fetch 错误处理包装器
 * 
 * @example
 * const data = await handleFetch(
 *   () => fetch('/api/data'),
 *   (msg) => setError(msg)
 * );
 */
export async function handleFetch<T>(
  fetchFn: () => Promise<Response>,
  onError?: (message: string) => void,
  context?: string
): Promise<T | null> {
  try {
    const response = await fetchFn();
    
    if (!response.ok) {
      const errorMsg = await extractErrorMessage(response);
      if (context) logError(context, `HTTP ${response.status}: ${errorMsg}`);
      if (onError) onError(errorMsg);
      return null;
    }
    
    return await response.json();
  } catch (error) {
    const errorMsg = extractErrorFromException(error);
    if (context) logError(context, error);
    if (onError) onError(errorMsg);
    return null;
  }
}

/**
 * Toast 提示的错误处理（用于非关键错误，静默失败但记录日志）
 */
export function handleSilentError(context: string, error: unknown) {
  logError(context, error);
  // 静默失败，不打断用户操作
}
