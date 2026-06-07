import { useEffect, useState } from "react";
import { searchStocks } from "../api";
import type { StockSummary } from "../types";

interface SearchPanelProps {
  onSelect: (stock: StockSummary) => void;
}

export function SearchPanel({ onSelect }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        setResults(await searchStocks(normalized, controller.signal));
      } catch (requestError) {
        if (
          requestError instanceof DOMException &&
          requestError.name === "AbortError"
        ) {
          return;
        }
        setError(
          requestError instanceof Error ? requestError.message : "搜索失败",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="relative">
      <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
        全市场 A 股搜索
      </label>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="输入股票代码或公司名称"
        className="w-full rounded-xl border border-line bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-teal-400"
      />

      {query.trim() && (
        <div className="absolute z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-line bg-panel shadow-2xl">
          {loading && <Message>正在查询完整 A 股股票池...</Message>}
          {error && <Message tone="error">{error}</Message>}
          {!loading && !error && results.length === 0 && (
            <Message>没有找到匹配股票</Message>
          )}
          {!loading &&
            results.map((stock) => (
              <button
                key={stock.symbol}
                type="button"
                onClick={() => {
                  onSelect(stock);
                  setQuery("");
                  setResults([]);
                }}
                className="flex w-full items-center justify-between border-b border-line/70 px-4 py-3 text-left transition last:border-0 hover:bg-slate-800"
              >
                <span className="font-medium text-slate-100">{stock.name}</span>
                <span className="font-mono text-sm text-slate-400">
                  {stock.symbol}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

function Message({
  children,
  tone = "normal",
}: {
  children: React.ReactNode;
  tone?: "normal" | "error";
}) {
  return (
    <div
      className={`px-4 py-4 text-sm ${
        tone === "error" ? "text-rose-400" : "text-slate-400"
      }`}
    >
      {children}
    </div>
  );
}
