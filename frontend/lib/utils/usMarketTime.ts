import type { Lang } from "../i18n";

/**
 * Format date in US Eastern Time
 * Used for displaying market hours and timestamps
 */
export function formatUsMarketTime(date: Date, lang: Lang): string {
  const formatter = new Intl.DateTimeFormat(
    lang === "zh" ? "zh-CN" : "en-US",
    {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }
  );
  return formatter.format(date);
}
