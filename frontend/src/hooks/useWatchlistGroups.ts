import { useCallback, useState } from "react";
import type { StockSummary } from "../types";

export interface WatchlistGroup {
  id: string;
  name: string;
  stocks: StockSummary[];
}

const STORAGE_KEY = "stock-terminal-watchlist-groups";

function readGroups(): WatchlistGroup[] {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as WatchlistGroup[]) : [];
  } catch {
    return [];
  }
}

function persist(groups: WatchlistGroup[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

export function useWatchlistGroups() {
  const [groups, setGroups] = useState<WatchlistGroup[]>(readGroups);

  const addGroup = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setGroups((current) => {
      const next = [...current, { id, name: trimmed, stocks: [] }];
      persist(next);
      return next;
    });
    return id;
  }, []);

  const renameGroup = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setGroups((current) => {
      const next = current.map((group) =>
        group.id === id ? { ...group, name: trimmed } : group,
      );
      persist(next);
      return next;
    });
  }, []);

  const deleteGroup = useCallback((id: string) => {
    setGroups((current) => {
      const next = current.filter((group) => group.id !== id);
      persist(next);
      return next;
    });
  }, []);

  const removeStock = useCallback((groupId: string, symbol: string) => {
    setGroups((current) => {
      const next = current.map((group) =>
        group.id === groupId
          ? {
              ...group,
              stocks: group.stocks.filter((stock) => stock.symbol !== symbol),
            }
          : group,
      );
      persist(next);
      return next;
    });
  }, []);

  const setStockGroups = useCallback(
    (stock: StockSummary, selectedGroupIds: string[]) => {
      const selected = new Set(selectedGroupIds);
      setGroups((current) => {
        const next = current.map((group) => {
          const withoutStock = group.stocks.filter(
            (item) => item.symbol !== stock.symbol,
          );
          return selected.has(group.id)
            ? { ...group, stocks: [...withoutStock, stock] }
            : { ...group, stocks: withoutStock };
        });
        persist(next);
        return next;
      });
    },
    [],
  );

  return {
    groups,
    addGroup,
    renameGroup,
    deleteGroup,
    removeStock,
    setStockGroups,
  };
}
