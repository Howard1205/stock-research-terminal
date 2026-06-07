import { useState } from "react";
import type { StockSummary } from "../types";
import type { WatchlistGroup } from "../hooks/useWatchlistGroups";

export function WatchlistModal({
  stock,
  groups,
  onAddGroup,
  onSave,
  onClose,
}: {
  stock: StockSummary;
  groups: WatchlistGroup[];
  onAddGroup: (name: string) => string | null;
  onSave: (groupIds: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(
    () =>
      new Set(
        groups
          .filter((group) =>
            group.stocks.some((item) => item.symbol === stock.symbol),
          )
          .map((group) => group.id),
      ),
  );
  const [newName, setNewName] = useState("");

  const createGroup = () => {
    const id = onAddGroup(newName);
    if (!id) return;
    setSelected((current) => new Set([...current, id]));
    setNewName("");
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-white">加入自选分组</h2>
            <p className="mt-1 text-sm text-slate-500">
              {stock.name} {stock.symbol}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500">
            关闭
          </button>
        </div>
        <div className="mt-5 max-h-64 space-y-2 overflow-y-auto">
          {groups.map((group) => (
            <label
              key={group.id}
              className="flex cursor-pointer items-center justify-between rounded-lg border border-line/70 px-3 py-2.5 text-sm text-slate-300"
            >
              <span>{group.name}</span>
              <input
                type="checkbox"
                checked={selected.has(group.id)}
                onChange={() =>
                  setSelected((current) => {
                    const next = new Set(current);
                    if (next.has(group.id)) next.delete(group.id);
                    else next.add(group.id);
                    return next;
                  })
                }
              />
            </label>
          ))}
          {groups.length === 0 && (
            <p className="py-3 text-center text-sm text-slate-500">
              暂无分组，请在下方新建。
            </p>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") createGroup();
            }}
            placeholder="新建分组名称"
            className="min-w-0 flex-1 rounded-lg border border-line bg-slate-950 px-3 py-2 text-sm text-slate-100"
          />
          <button
            type="button"
            onClick={createGroup}
            disabled={!newName.trim()}
            className="rounded-lg border border-line px-3 text-sm text-teal-300 disabled:opacity-40"
          >
            新建并勾选
          </button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm text-slate-400"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onSave([...selected])}
            className="rounded-lg border border-teal-400/30 bg-teal-400/10 px-4 py-2 text-sm text-teal-300"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
