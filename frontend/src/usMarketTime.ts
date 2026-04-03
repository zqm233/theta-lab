import type { Lang } from "./i18n";

/** US Eastern — reference for listed equity / options. */
export const US_MARKET_TIMEZONE = "America/New_York";

/** Format a wall-clock time in US Eastern (not the user's local zone). */
export function formatUsMarketTime(d: Date, lang: Lang): string {
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  return d.toLocaleTimeString(locale, {
    timeZone: US_MARKET_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}
