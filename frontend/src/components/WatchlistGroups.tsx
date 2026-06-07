import { memo, useState } from "react";
import type { StockSummary } from "../types";
import type { WatchlistGroup } from "../hooks/useWatchlistGroups";

export const WatchlistGroups = memo(function WatchlistGroups({
  groups,
  activeSymbol,
  activeChangePercent,
  onSelect,
  onAddGroup,
  onRenameGroup,
  onDeleteGroup,
  onRemoveStock,
}: {
  groups: WatchlistGroup[];
  activeSymbol?: string;
  activeChangePercent: number | null;
  onSelect: (stock: StockSummary) => void;
  onAddGroup: (name: string) => string | null;
  onRenameGroup: (id: string, name: string) => void;
  onDeleteGroup: (id: string) => void;
  onRemoveStock: (groupId: string, symbol: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const createGroup = () => {
    if (onAddGroup(newName)) setNewName("");
  };

  return (
    <section className="mt-8 border-t border-line pt-6">
      <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
        自选股分组
      </h2>
      <div className="mt-3 flex gap-2">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") createGroup();
          }}
          placeholder="新建分组"
          className="min-w-0 flex-1 rounded-lg border border-line bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-teal-400"
        />
        <button
          type="button"
          onClick={createGroup}
          disabled={!newName.trim()}
          className="rounded-lg border border-teal-400/30 px-2.5 text-xs text-teal-300 disabled:opacity-40"
        >
          新建
        </button>
      </div>
      {groups.length === 0 && (
        <p className="mt-3 text-xs leading-5 text-slate-600">
          新建分组后，可从顶部行情卡将股票加入一个或多个分组。
        </p>
      )}
      <div className="mt-3 space-y-2">
        {groups.map((group) => {
          const open = openGroups[group.id] ?? true;
          return (
            <div key={group.id} className="rounded-lg border border-line/70">
              <div className="flex items-center gap-1 px-2 py-2">
                <button
                  type="button"
                  onClick={() =>
                    setOpenGroups((current) => ({
                      ...current,
                      [group.id]: !open,
                    }))
                  }
                  className="min-w-0 flex-1 truncate text-left text-xs font-medium text-slate-300"
                >
                  {open ? "▾" : "▸"} {group.name}{" "}
                  <span className="text-slate-600">({group.stocks.length})</span>
                </button>
                <button
                  type="button"
                  title="重命名分组"
                  onClick={() => {
                    setRenamingId(group.id);
                    setRenameValue(group.name);
                  }}
                  className="px-1 text-xs text-slate-600 hover:text-slate-300"
                >
                  改
                </button>
                <button
                  type="button"
                  title="删除分组"
                  onClick={() => onDeleteGroup(group.id)}
                  className="px-1 text-xs text-slate-600 hover:text-rose-400"
                >
                  删
                </button>
              </div>
              {renamingId === group.id && (
                <div className="flex gap-1 border-t border-line/70 p-2">
                  <input
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    className="min-w-0 flex-1 rounded border border-line bg-slate-950 px-2 py-1 text-xs text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      onRenameGroup(group.id, renameValue);
                      setRenamingId(null);
                    }}
                    className="text-xs text-teal-300"
                  >
                    保存
                  </button>
                </div>
              )}
              {open && (
                <div className="border-t border-line/70 p-1">
                  {group.stocks.length === 0 && (
                    <div className="px-2 py-2 text-xs text-slate-600">暂无股票</div>
                  )}
                  {group.stocks.map((stock) => (
                    <div
                      key={stock.symbol}
                      className={`flex items-center rounded-md ${
                        activeSymbol === stock.symbol
                          ? "bg-teal-400/10"
                          : "hover:bg-slate-800"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(stock)}
                        className="min-w-0 flex-1 px-2 py-2 text-left"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-slate-300">
                            {stock.name}
                          </span>
                          {activeSymbol === stock.symbol &&
                            activeChangePercent !== null && (
                              <span
                                className={`font-mono text-[10px] ${
                                  activeChangePercent >= 0
                                    ? "text-rose-400"
                                    : "text-emerald-400"
                                }`}
                              >
                                {activeChangePercent >= 0 ? "+" : ""}
                                {activeChangePercent.toFixed(2)}%
                              </span>
                            )}
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] text-slate-600">
                          {stock.symbol}
                        </div>
                      </button>
                      <button
                        type="button"
                        title="从分组移除"
                        onClick={() => onRemoveStock(group.id, stock.symbol)}
                        className="px-2 text-xs text-slate-600 hover:text-rose-400"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
});
