import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { API_BASE } from "./hooks/useApi";

export interface Position {
  id: string;
  ticker: string;
  type: "put" | "call";
  side: "buy" | "sell";
  strike: number;
  qty: number;
  entry: number;
  expiration: string;
  addedAt: string;
}

interface PortfolioContextValue {
  positions: Position[];
  addPosition: (pos: Omit<Position, "id" | "addedAt">) => void;
  removePosition: (id: string) => void;
  closePosition: (id: string, exitPrice: number) => Promise<boolean>;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

function loadPositions(): Position[] {
  try {
    const saved = localStorage.getItem("portfolio");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function savePositions(positions: Position[]) {
  localStorage.setItem("portfolio", JSON.stringify(positions));
}

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [positions, setPositions] = useState<Position[]>(loadPositions);

  const addPosition = useCallback((pos: Omit<Position, "id" | "addedAt">) => {
    setPositions((prev) => {
      const newPos: Position = {
        ...pos,
        id: crypto.randomUUID(),
        addedAt: new Date().toISOString(),
      };
      const updated = [...prev, newPos];
      savePositions(updated);
      return updated;
    });
  }, []);

  const removePosition = useCallback((id: string) => {
    setPositions((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      savePositions(updated);
      return updated;
    });
  }, []);

  const closePosition = useCallback(async (id: string, exitPrice: number): Promise<boolean> => {
    const pos = positions.find((p) => p.id === id);
    if (!pos) return false;
    try {
      const res = await fetch(`${API_BASE}/trades/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: pos.id,
          ticker: pos.ticker,
          type: pos.type,
          side: pos.side,
          strike: pos.strike,
          qty: pos.qty,
          entry_price: pos.entry,
          exit_price: exitPrice,
          expiration: pos.expiration,
          opened_at: pos.addedAt,
        }),
      });
      if (!res.ok) return false;
      removePosition(id);
      return true;
    } catch {
      return false;
    }
  }, [positions, removePosition]);

  return (
    <PortfolioContext.Provider value={{ positions, addPosition, removePosition, closePosition }}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used within PortfolioProvider");
  return ctx;
}
