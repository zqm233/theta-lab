import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { useChatBridge } from "../chatBridge";
import { usePrices, usePriceSubscribe } from "../priceProvider";

const DEFAULT_TICKERS = ["TSLL", "TSLA"];

const MARKET_STATE_LABELS: Record<string, { zh: string; en: string }> = {
  PRE: { zh: "盘前", en: "Pre" },
  REGULAR: { zh: "交易中", en: "Open" },
  POST: { zh: "盘后", en: "After" },
  POSTPOST: { zh: "盘后", en: "After" },
  CLOSED: { zh: "已收盘", en: "Closed" },
};

interface Props {
  selected: string;
  onSelect: (ticker: string) => void;
}

interface WatchlistCtxMenu {
  x: number;
  y: number;
  ticker: string;
}

export default function Watchlist({ selected, onSelect }: Props) {
  const { t, lang } = useI18n();
  const { sendToChat } = useChatBridge();
  const prices = usePrices();
  const subscribe = usePriceSubscribe();
  const wlMenuRef = useRef<HTMLDivElement>(null);
  const [wlCtxMenu, setWlCtxMenu] = useState<WatchlistCtxMenu | null>(null);
  const [tickers, setTickers] = useState<string[]>(() => {
    const saved = localStorage.getItem("watchlist");
    return saved ? JSON.parse(saved) : DEFAULT_TICKERS;
  });
  const [adding, setAdding] = useState(false);
  const [inputVal, setInputVal] = useState("");

  useEffect(() => {
    tickers.forEach(subscribe);
  }, [tickers, subscribe]);

  const saveTickers = (list: string[]) => {
    setTickers(list);
    localStorage.setItem("watchlist", JSON.stringify(list));
  };

  const addTicker = () => {
    const val = inputVal.trim().toUpperCase();
    if (val && !tickers.includes(val)) {
      saveTickers([...tickers, val]);
      subscribe(val);
    }
    setInputVal("");
    setAdding(false);
  };

  const removeTicker = (ticker: string) => {
    saveTickers(tickers.filter((t) => t !== ticker));
  };

  const handleWlContextMenu = (e: React.MouseEvent, tk: string) => {
    e.preventDefault();
    e.stopPropagation();
    setWlCtxMenu({ x: e.clientX, y: e.clientY, ticker: tk });
  };

  const handleWlSendToChat = () => {
    if (!wlCtxMenu) return;
    const tk = wlCtxMenu.ticker;
    const p = prices[tk];
    const state = p?.marketState ? MARKET_STATE_LABELS[p.marketState]?.[lang] ?? p.marketState : "";
    const price = p?.price != null ? `$${p.price.toFixed(2)}` : "";
    const change = p?.change != null ? `${p.change >= 0 ? "+" : ""}${p.change.toFixed(2)}%` : "";
    sendToChat([tk, price, change, state].filter(Boolean).join(" "));
    setWlCtxMenu(null);
  };

  useEffect(() => {
    if (!wlCtxMenu) return;
    const dismiss = (e: MouseEvent) => {
      if (wlMenuRef.current && !wlMenuRef.current.contains(e.target as Node)) {
        setWlCtxMenu(null);
      }
    };
    document.addEventListener("mousedown", dismiss);
    return () => document.removeEventListener("mousedown", dismiss);
  }, [wlCtxMenu]);

  return (
    <div className="watchlist">
      <div className="watchlist-header">
        <span className="watchlist-title">{t("watchlist")}</span>
        <button
          className="watchlist-add-btn"
          onClick={() => setAdding(!adding)}
        >
          {adding ? "✕" : "+"}
        </button>
      </div>

      {adding && (
        <div className="watchlist-input-row">
          <input
            className="watchlist-input"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTicker()}
            placeholder={t("watchlistPlaceholder")}
            autoFocus
          />
        </div>
      )}

      <div className="watchlist-items">
        {tickers.map((ticker) => {
          const p = prices[ticker];
          const isSelected = selected === ticker;
          return (
            <div
              key={ticker}
              role="button"
              tabIndex={0}
              className={`watchlist-item${isSelected ? " active" : ""}`}
              onClick={() => onSelect(ticker)}
              onKeyDown={(e) => e.key === "Enter" && onSelect(ticker)}
              onContextMenu={(e) => handleWlContextMenu(e, ticker)}
            >
              <div className="watchlist-item-left">
                <div className="watchlist-ticker-row">
                  <span className="watchlist-ticker">{ticker}</span>
                  {p?.marketState && (
                    <span className={`watchlist-market-state ${p.marketState === "REGULAR" ? "open" : ""}`}>
                      {MARKET_STATE_LABELS[p.marketState]?.[lang] ?? p.marketState}
                    </span>
                  )}
                </div>
                {p?.price != null && (
                  <span className="watchlist-price">
                    ${p.price.toFixed(2)}
                  </span>
                )}
              </div>
              {p?.change != null && (
                <span
                  className={`watchlist-change ${p.change >= 0 ? "up" : "down"}`}
                >
                  {p.change >= 0 ? "+" : ""}
                  {p.change.toFixed(2)}%
                </span>
              )}
              {p?.loading && <span className="watchlist-loading" />}
              <button
                className="watchlist-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTicker(ticker);
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      {wlCtxMenu && (
        <div
          ref={wlMenuRef}
          className="ctx-menu"
          style={{ top: wlCtxMenu.y, left: wlCtxMenu.x }}
        >
          <button className="ctx-menu-item" onClick={handleWlSendToChat}>
            💬 {t("sendToChat")}
          </button>
        </div>
      )}
    </div>
  );
}
