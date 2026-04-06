import { useCallback, useEffect, useRef, useState } from "react";
import OptionsChain from "./components/OptionsChain";
import ChatPanel from "./components/ChatPanel";
import Sidebar from "./components/Sidebar";
import Watchlist from "./components/Watchlist";
import Portfolio from "./components/Portfolio";
import PortfolioTickerList from "./components/PortfolioTickerList";
import Settings from "./components/Settings";
import TradeHistory from "./components/TradeHistory";
import TradeHistoryFilter from "./components/TradeHistoryFilter";
import type { HistoryFilters } from "./components/TradeHistoryFilter";
import AccountManager from "./components/AccountManager";
import DualInvestment from "./components/DualInvestment";
import { useI18n } from "./i18n";
import "./App.css";

type OptionsSubTab = "chain" | "portfolio" | "history";

function App() {
  const { t } = useI18n();
  const [activePage, setActivePage] = useState("options");
  const [optionsTab, setOptionsTab] = useState<OptionsSubTab>("chain");
  const [selectedTicker, setSelectedTicker] = useState("TSLL");
  const [portfolioTicker, setPortfolioTicker] = useState<string | null>(null);
  const [historyFilters, setHistoryFilters] = useState<HistoryFilters>({ ticker: null, period: "all" });

  const handleTickerSelect = useCallback((ticker: string) => {
    setSelectedTicker(ticker);
    setActivePage("options");
    setOptionsTab("chain");
  }, []);

  const CHAT_MIN = 300;
  const CHAT_MAX = 700;
  const CHAT_DEFAULT = 400;
  const [chatWidth, setChatWidth] = useState(
    () => Number(localStorage.getItem("chatWidth")) || CHAT_DEFAULT
  );
  const dragging = useRef(false);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const startX = e.clientX;
    const startW = chatWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      const next = Math.min(CHAT_MAX, Math.max(CHAT_MIN, startW + delta));
      setChatWidth(next);
    };

    const onUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [chatWidth]);

  useEffect(() => {
    localStorage.setItem("chatWidth", String(chatWidth));
  }, [chatWidth]);

  const isOptions = activePage === "options";

  return (
    <div className="app">
      <Sidebar active={activePage} onNavigate={setActivePage} />
      {isOptions && optionsTab === "chain" && (
        <div className="panel-watchlist">
          <Watchlist selected={selectedTicker} onSelect={handleTickerSelect} />
        </div>
      )}
      {isOptions && optionsTab === "portfolio" && (
        <div className="panel-watchlist">
          <PortfolioTickerList
            selected={portfolioTicker}
            onSelect={setPortfolioTicker}
          />
        </div>
      )}
      {isOptions && optionsTab === "history" && (
        <div className="panel-watchlist">
          <TradeHistoryFilter filters={historyFilters} onChange={setHistoryFilters} />
        </div>
      )}
      <main className="app-main">
        <div className="panel-center">
          <div style={{ display: isOptions ? "block" : "none" }}>
            <div className="options-sub-tabs">
              {([
                { id: "chain" as const, label: t("navOptionsChain") },
                { id: "portfolio" as const, label: t("navPortfolio") },
                { id: "history" as const, label: t("navTradeHistory") },
              ]).map((tab) => (
                <button
                  key={tab.id}
                  className={`options-sub-tab${optionsTab === tab.id ? " active" : ""}`}
                  onClick={() => setOptionsTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div style={{ display: optionsTab === "chain" ? "block" : "none" }}>
              <OptionsChain ticker={selectedTicker} />
            </div>
            <div style={{ display: optionsTab === "portfolio" ? "block" : "none" }}>
              <Portfolio filterTicker={portfolioTicker} />
            </div>
            <div style={{ display: optionsTab === "history" ? "block" : "none" }}>
              <TradeHistory filters={historyFilters} />
            </div>
          </div>
          <div style={{ display: activePage === "dual" ? "block" : "none" }}>
            <DualInvestment />
          </div>
          {activePage === "accounts" && <AccountManager />}
          {activePage === "workbench" && (
            <div className="placeholder-page">Workbench (Coming Soon)</div>
          )}
          {activePage === "settings" && <Settings />}
        </div>
        <div className="panel-resize-handle" onMouseDown={onResizeStart} />
        <div className="panel-right" style={{ width: chatWidth }}>
          <ChatPanel />
        </div>
      </main>
    </div>
  );
}

export default App;
