import { useMemo } from "react";
import { useI18n } from "../i18n";
import { usePortfolio } from "../portfolio";

interface Props {
  selected: string | null;
  onSelect: (ticker: string | null) => void;
}

export default function PortfolioTickerList({ selected, onSelect }: Props) {
  const { t } = useI18n();
  const { positions } = usePortfolio();

  const tickerSummaries = useMemo(() => {
    const map = new Map<string, { count: number; tickers: Set<string> }>();
    for (const pos of positions) {
      const existing = map.get(pos.ticker);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(pos.ticker, { count: 1, tickers: new Set() });
      }
    }
    return Array.from(map.entries()).map(([ticker, info]) => ({
      ticker,
      positionCount: info.count,
    }));
  }, [positions]);

  return (
    <div className="watchlist">
      <div className="watchlist-header">
        <span className="watchlist-title">{t("navPortfolio")}</span>
      </div>

      <div className="watchlist-items">
        <button
          className={`watchlist-item${selected === null ? " active" : ""}`}
          onClick={() => onSelect(null)}
        >
          <div className="watchlist-item-left">
            <span className="watchlist-ticker">{t("portfolioAll")}</span>
          </div>
          <span className="portfolio-ticker-count">{positions.length}</span>
        </button>

        {tickerSummaries.map(({ ticker, positionCount }) => (
          <button
            key={ticker}
            className={`watchlist-item${selected === ticker ? " active" : ""}`}
            onClick={() => onSelect(ticker)}
          >
            <div className="watchlist-item-left">
              <span className="watchlist-ticker">{ticker}</span>
            </div>
            <span className="portfolio-ticker-count">{positionCount}</span>
          </button>
        ))}
      </div>

      {positions.length === 0 && (
        <div className="portfolio-ticker-empty">{t("portfolioEmpty")}</div>
      )}
    </div>
  );
}
