import { useCallback, useState } from "react";
import type { StockSummary } from "../types";

const STORAGE_KEY = "stock-terminal-recent";
const MAX_RECENT = 8;

function readRecent(): StockSummary[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as StockSummary[]) : [];
  } catch {
    return [];
  }
}

export function useRecentStocks() {
  const [recentStocks, setRecentStocks] = useState<StockSummary[]>(readRecent);

  const addRecent = useCallback((stock: StockSummary) => {
    setRecentStocks((current) => {
      const next = [
        stock,
        ...current.filter((item) => item.symbol !== stock.symbol),
      ].slice(0, MAX_RECENT);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearRecent = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setRecentStocks([]);
  }, []);

  return { recentStocks, addRecent, clearRecent };
}
