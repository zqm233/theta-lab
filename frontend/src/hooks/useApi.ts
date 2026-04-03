import { useCallback, useState } from "react";

/** Dev: use Vite proxy (`vite.config.ts`) so requests stay same-origin. Override with VITE_API_BASE if needed. */
export const API_BASE = import.meta.env.VITE_API_BASE ?? "/api";

interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  fetch: () => void;
}

export function useApi<T>(path: string): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doFetch = useCallback(() => {
    setLoading(true);
    setError(null);
    window
      .fetch(`${API_BASE}${path}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((json) => setData(json as T))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [path]);

  return { data, loading, error, fetch: doFetch };
}

export async function fetchApi<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await window.fetch(`${API_BASE}${path}`);
  } catch {
    throw new Error(
      "Cannot reach API. Start the backend (port 8000) and use `npm run dev` so /api is proxied.",
    );
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json();
}
