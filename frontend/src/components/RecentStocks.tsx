import type { StockSummary } from "../types";

interface RecentStocksProps {
  stocks: StockSummary[];
  activeSymbol?: string;
  onSelect: (stock: StockSummary) => void;
  onClear: () => void;
}

export function RecentStocks({
  stocks,
  activeSymbol,
  onSelect,
  onClear,
}: RecentStocksProps) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
          最近查看
        </h2>
        {stocks.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            清空
          </button>
        )}
      </div>
      {stocks.length === 0 ? (
        <p className="text-sm leading-6 text-slate-600">
          查看过的股票会保存在这里，不会混入全市场搜索数据库。
        </p>
      ) : (
        <div className="space-y-1">
          {stocks.map((stock) => (
            <button
              key={stock.symbol}
              type="button"
              onClick={() => onSelect(stock)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                activeSymbol === stock.symbol
                  ? "bg-teal-400/10 text-teal-300"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <span className="truncate">{stock.name}</span>
              <span className="ml-3 font-mono text-xs text-slate-500">
                {stock.symbol}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
