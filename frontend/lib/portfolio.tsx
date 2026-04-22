"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { API_BASE } from "./api";
import { getLocalStorage, setLocalStorage } from "./utils/localStorage";

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
  closePosition(id: string, exitPrice: number, exitType?: string): Promise<boolean>;
}

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

// Type guard for Position validation
function isPositionArray(data: unknown): data is Position[] {
  if (!Array.isArray(data)) return false;
  return data.every((item) =>
    typeof item === "object" &&
    item !== null &&
    typeof item.id === "string" &&
    typeof item.ticker === "string" &&
    (item.type === "put" || item.type === "call") &&
    (item.side === "buy" || item.side === "sell") &&
    typeof item.strike === "number" &&
    typeof item.qty === "number" &&
    typeof item.entry === "number" &&
    typeof item.expiration === "string" &&
    typeof item.addedAt === "string"
  );
}

function loadPositions(): Position[] {
  return getLocalStorage<Position[]>("portfolio", [], isPositionArray);
}

function savePositions(positions: Position[]) {
  setLocalStorage("portfolio", positions);
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

  const closePosition = useCallback(async (id: string, exitPrice: number, exitType: string = "manual"): Promise<boolean> => {
    // Rule: rerender-defer-reads - Access latest state via functional update
    return new Promise((resolve) => {
      setPositions((prevPositions) => {
        const pos = prevPositions.find((p) => p.id === id);
        if (!pos) {
          resolve(false);
          return prevPositions;
        }
        
        // Rule: async-defer-await - Start fetch in background
        // v1 API: PUT /holdings/:id/close
        fetch(`${API_BASE}/holdings/${id}/close`, {
          method: "PUT",
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
            exit_type: exitType,
          }),
        }).then((res) => {
          if (res.ok) {
            setPositions((prev) => {
              const updated = prev.filter((p) => p.id !== id);
              savePositions(updated);
              return updated;
            });
            resolve(true);
          } else {
            resolve(false);
          }
        }).catch(() => {
          resolve(false);
        });
        
        return prevPositions;
      });
    });
  }, []);

  // Rule: rerender-dependencies - Memoize context value
  const value = useMemo(() => ({
    positions,
    addPosition,
    removePosition,
    closePosition,
  }), [positions, addPosition, removePosition, closePosition]);

  return (
    <PortfolioContext.Provider value={value}>
      {children}
    </PortfolioContext.Provider>
  );
}

export function usePortfolio() {
  const ctx = useContext(PortfolioContext);
  if (!ctx) throw new Error("usePortfolio must be used within PortfolioProvider");
  return ctx;
}
