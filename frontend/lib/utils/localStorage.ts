/**
 * Rule: client-localstorage-schema
 * 
 * Version and minimize localStorage data. Add schema versioning to enable
 * safe migrations when the data structure changes.
 */

const STORAGE_VERSION = 1;

interface StorageWrapper<T> {
  version: number;
  data: T;
  timestamp: number;
}

/**
 * Safely read from localStorage with version checking and error handling
 */
export function getLocalStorage<T>(
  key: string,
  defaultValue: T,
  validator?: (data: unknown) => data is T
): T {
  // Rule: js-cache-storage - Cache localStorage reads
  if (typeof window === "undefined") return defaultValue;

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;

    let parsedValue: unknown;
    
    // Try to parse as JSON
    try {
      parsedValue = JSON.parse(raw);
    } catch (jsonError) {
      // If JSON parse fails, treat as raw string value
      // This handles old format like: localStorage.setItem("lang", "zh")
      parsedValue = raw;
    }

    // Check if it's a versioned wrapper
    if (typeof parsedValue === 'object' && parsedValue !== null && 'version' in parsedValue && 'data' in parsedValue) {
      const wrapper = parsedValue as StorageWrapper<unknown>;
      
      // Version check
      if (wrapper.version !== STORAGE_VERSION) {
        console.warn(`[Storage] Version mismatch for ${key}: expected ${STORAGE_VERSION}, got ${wrapper.version}`);
        return defaultValue;
      }

      // Optional validation
      if (validator && !validator(wrapper.data)) {
        console.warn(`[Storage] Validation failed for ${key}`);
        return defaultValue;
      }

      return wrapper.data as T;
    }

    // Direct value (old format compatibility)
    if (validator && !validator(parsedValue)) {
      console.warn(`[Storage] Old format validation failed for ${key}`);
      return defaultValue;
    }
    
    return parsedValue as T;
  } catch (err) {
    console.error(`[Storage] Failed to read ${key}:`, err);
    return defaultValue;
  }
}

/**
 * Safely write to localStorage with version tagging
 */
export function setLocalStorage<T>(key: string, data: T): boolean {
  if (typeof window === "undefined") return false;

  try {
    const wrapper: StorageWrapper<T> = {
      version: STORAGE_VERSION,
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(wrapper));
    return true;
  } catch (err) {
    console.error(`[Storage] Failed to write ${key}:`, err);
    return false;
  }
}

/**
 * Remove an item from localStorage
 */
export function removeLocalStorage(key: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    localStorage.removeItem(key);
    return true;
  } catch (err) {
    console.error(`[Storage] Failed to remove ${key}:`, err);
    return false;
  }
}

/**
 * Check if localStorage is available
 */
export function isLocalStorageAvailable(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const test = "__storage_test__";
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get storage size estimate (in bytes)
 */
export function getStorageSize(): number {
  if (typeof window === "undefined") return 0;

  let total = 0;
  try {
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        const value = localStorage.getItem(key) || "";
        total += key.length + value.length;
      }
    }
  } catch {
    // Ignore errors
  }
  return total;
}

/**
 * Clear old entries based on timestamp (older than maxAge in ms)
 */
export function clearOldEntries(maxAge: number): number {
  if (typeof window === "undefined") return 0;

  const now = Date.now();
  let cleared = 0;

  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;

        const wrapper: StorageWrapper<unknown> = JSON.parse(raw);
        if (wrapper.timestamp && now - wrapper.timestamp > maxAge) {
          localStorage.removeItem(key);
          cleared++;
        }
      } catch {
        // Skip malformed entries
      }
    }
  } catch (err) {
    console.error("[Storage] Failed to clear old entries:", err);
  }

  return cleared;
}
