/**
 * Approximate conversion to CNY for portfolio aggregation (top cards + pie).
 * Rates from NEXT_PUBLIC_* (baked at build); defaults are indicative only.
 */

const DEFAULT_USD_CNY = 7.2;
const DEFAULT_HKD_CNY = 0.92;

function readFloatEnv(name: string, fallback: number): number {
  if (typeof process === "undefined" || !process.env) return fallback;
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getUsdCnyRate(): number {
  return readFloatEnv("NEXT_PUBLIC_USD_CNY", DEFAULT_USD_CNY);
}

export function getUsdtCnyRate(): number {
  return readFloatEnv("NEXT_PUBLIC_USDT_CNY", getUsdCnyRate());
}

function getHkdCnyRate(): number {
  return readFloatEnv("NEXT_PUBLIC_HKD_CNY", DEFAULT_HKD_CNY);
}

/** Convert a balance in `currency` (account holding currency) to CNY. */
export function toCny(amount: number, currency: string | null | undefined): number {
  const c = (currency ?? "").trim().toUpperCase();
  if (c === "CNY" || c === "RMB" || c === "CNH") return amount;
  if (c === "USD") return amount * getUsdCnyRate();
  if (c === "USDT") return amount * getUsdtCnyRate();
  if (c === "HKD") return amount * getHkdCnyRate();
  if (c === "") return amount * getUsdCnyRate();
  return amount;
}
