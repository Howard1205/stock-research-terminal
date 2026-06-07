import { memo } from "react";
import type {
  FinancialMode,
  FinancialPerformance as FinancialData,
  FinancialPeriod,
} from "../types";
import { usePersistentToggle } from "../hooks/usePersistentToggle";
import { CollapseButton } from "./CollapseButton";
import { HighlightedText } from "./HighlightedText";

interface FinancialPerformanceProps {
  data: FinancialData | null;
  loading: boolean;
  error: string | null;
  mode: FinancialMode;
  onModeChange: (mode: FinancialMode) => void;
}

type MetricKey = keyof FinancialPeriod;
type MetricKind = "amount" | "percent" | "eps";

const rows: Array<{ label: string; key: MetricKey; kind: MetricKind }> = [
  { label: "营业收入", key: "revenue", kind: "amount" },
  { label: "营收同比增长", key: "revenue_yoy", kind: "percent" },
  { label: "归母净利润", key: "parent_net_profit", kind: "amount" },
  {
    label: "归母净利润同比增长",
    key: "parent_net_profit_yoy",
    kind: "percent",
  },
  { label: "扣非净利润", key: "deducted_net_profit", kind: "amount" },
  { label: "经营现金流", key: "operating_cash_flow", kind: "amount" },
  {
    label: "经营现金流同比增长",
    key: "operating_cash_flow_yoy",
    kind: "percent",
  },
  { label: "毛利率", key: "gross_margin", kind: "percent" },
  { label: "净利率", key: "net_margin", kind: "percent" },
  { label: "每股收益 EPS", key: "eps", kind: "eps" },
  { label: "资产负债率", key: "debt_ratio", kind: "percent" },
];

const highlightedMetrics = new Set<MetricKey>([
  "revenue",
  "parent_net_profit",
  "operating_cash_flow",
  "gross_margin",
  "net_margin",
]);

const trends: Array<{
  label: string;
  key: MetricKey;
  kind: MetricKind;
  color: string;
}> = [
  { label: "营业收入", key: "revenue", kind: "amount", color: "#38bdf8" },
  {
    label: "归母净利润",
    key: "parent_net_profit",
    kind: "amount",
    color: "#f43f5e",
  },
  {
    label: "经营现金流",
    key: "operating_cash_flow",
    kind: "amount",
    color: "#5eead4",
  },
  { label: "毛利率", key: "gross_margin", kind: "percent", color: "#c084fc" },
];

export const FinancialPerformance = memo(function FinancialPerformance({
  data,
  loading,
  error,
  mode,
  onModeChange,
}: FinancialPerformanceProps) {
  const [open, toggle] = usePersistentToggle("module:financials", true);
  return (
    <section className="mt-5 rounded-2xl border border-line bg-panel p-5 shadow-xl shadow-black/10">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <h2 className="font-semibold text-white">利润表与财务表现</h2>
          <p className="mt-1 text-xs text-slate-500">
            人民币口径 · 金额默认亿元，小额自动显示万元
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {open && (
            <>
              <ModeButton
                active={mode === "annual"}
                onClick={() => onModeChange("annual")}
              >
                年报
              </ModeButton>
              <ModeButton
                active={mode === "quarterly"}
                onClick={() => onModeChange("quarterly")}
              >
                季报
              </ModeButton>
            </>
          )}
          <CollapseButton open={open} onClick={toggle} />
        </div>
      </div>

      {!open && data && (
        <p className="mt-4 text-sm text-slate-500">
          {data.summaries.slice(0, 2).join(" · ")}
        </p>
      )}
      {open && (
        <>
          {loading && <ModuleMessage>正在读取真实财务报告...</ModuleMessage>}
          {error && <ModuleMessage error>{error}</ModuleMessage>}
          {!loading && !error && !data && (
            <ModuleMessage>选择股票后显示利润表与财务趋势</ModuleMessage>
          )}
          {!loading && !error && data && (
            <>
          <div className="mt-5 rounded-xl border border-teal-400/20 bg-teal-400/[0.04] p-4">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-teal-300">
              财务变化摘要
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {data.summaries.map((summary) => (
                <div
                  key={summary}
                  className="flex gap-2 text-sm leading-6 text-slate-300"
                >
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-300" />
                  <span><HighlightedText text={summary} financial /></span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-xl border border-line">
            <table className="min-w-[920px] w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-950/70">
                  <th className="sticky left-0 z-10 min-w-44 border-b border-r border-line bg-slate-950 px-4 py-3 text-left font-medium text-slate-400">
                    财务指标
                  </th>
                  {data.periods.map((period) => (
                    <th
                      key={period.period}
                      className="min-w-36 border-b border-line px-4 py-3 text-right font-medium text-slate-300"
                    >
                      <div>{period.label}</div>
                      <div className="mt-1 text-[11px] font-normal text-slate-600">
                        {period.report_date}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.key}
                    className={`border-b border-line/70 last:border-0 ${
                      highlightedMetrics.has(row.key) ? "bg-slate-800/20" : ""
                    }`}
                  >
                    <td
                      className={`sticky left-0 z-10 min-w-56 border-r border-line px-4 py-3 ${
                        highlightedMetrics.has(row.key)
                          ? "financial-metric-label"
                          : "bg-panel text-slate-400"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span>{row.label}</span>
                        <RowSparkline
                          values={data.periods.map(
                            (period) => period[row.key] as number | null,
                          )}
                          positive={
                            ((data.periods[data.periods.length - 1]?.[
                              row.key
                            ] as number | null) ?? 0) >=
                            ((data.periods[0]?.[row.key] as number | null) ?? 0)
                          }
                        />
                      </div>
                    </td>
                    {data.periods.map((period) => {
                      const value = period[row.key];
                      return (
                        <td
                          key={period.period}
                          className={`px-4 py-3 text-right font-mono tabular-nums ${valueColor(
                            value,
                            row.key,
                          )}`}
                        >
                          {formatValue(value, row.kind)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {trends.map((trend) => (
              <TrendCard
                key={trend.key}
                label={trend.label}
                values={data.periods
                  .filter(
                    (period) =>
                      data.mode !== "annual" || period.label.endsWith("年报"),
                  )
                  .map((period) => ({
                    label: period.label,
                    value: period[trend.key] as number | null,
                  }))}
                kind={trend.kind}
                color={trend.color}
              />
            ))}
          </div>

          <p className="mt-4 text-xs leading-5 text-slate-600">
            来源：{data.source.name}（{data.source.dataset}） · 更新时间：
            {new Date(data.updated_at).toLocaleString("zh-CN")}。季报模式中的收入、
            利润、现金流与 EPS 按累计值差额拆分为单季度。
          </p>
            </>
          )}
        </>
      )}
    </section>
  );
});

function RowSparkline({
  values,
  positive,
}: {
  values: Array<number | null>;
  positive: boolean;
}) {
  const available = values.filter((value): value is number => value !== null);
  if (available.length < 2) return <span className="text-[10px] text-slate-700">--</span>;
  const width = 54;
  const height = 20;
  const min = Math.min(...available);
  const max = Math.max(...available);
  const span = max - min || 1;
  const points = available
    .map(
      (value, index) =>
        `${(index / (available.length - 1)) * width},${
          height - 2 - ((value - min) / span) * (height - 4)
        }`,
    )
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-5 w-14 shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={positive ? "#fb7185" : "#34d399"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrendCard({
  label,
  values,
  kind,
  color,
}: {
  label: string;
  values: Array<{ label: string; value: number | null }>;
  kind: MetricKind;
  color: string;
}) {
  const available = values.filter(
    (item): item is { label: string; value: number } => item.value !== null,
  );
  const first = available[0]?.value;
  const last = available[available.length - 1]?.value;
  const improving = first !== undefined && last !== undefined && last >= first;

  return (
    <div className="rounded-xl border border-line bg-slate-950/50 p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-slate-500">{label}</div>
          <div className="mt-1 font-mono text-sm text-slate-200">
            {formatValue(last ?? null, kind)}
          </div>
        </div>
        {first !== undefined && last !== undefined && (
          <span
            className={`text-xs font-medium ${
              improving ? "text-rose-400" : "text-emerald-400"
            }`}
          >
            {improving ? "↗ 上升" : "↘ 下降"}
          </span>
        )}
      </div>
      <Sparkline values={available.map((item) => item.value)} color={color} />
      <div className="mt-1 flex justify-between text-[10px] text-slate-600">
        <span>{available[0]?.label ?? "暂无"}</span>
        <span>{available[available.length - 1]?.label ?? "暂无"}</span>
      </div>
    </div>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) {
    return <div className="mt-4 h-16 text-xs text-slate-600">暂无趋势数据</div>;
  }
  const width = 240;
  const height = 64;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - 6 - ((value - min) / span) * (height - 12);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-3 h-16 w-full overflow-visible"
      role="img"
      aria-label="财务趋势图"
    >
      <line x1="0" y1={height - 2} x2={width} y2={height - 2} stroke="#243047" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-4 py-2 text-xs transition ${
        active
          ? "border-teal-400/60 bg-teal-400/10 text-teal-300"
          : "border-line text-slate-500"
      }`}
    >
      {children}
    </button>
  );
}

function ModuleMessage({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`mt-5 flex min-h-48 items-center justify-center rounded-xl bg-slate-950/40 text-sm ${
        error ? "text-rose-400" : "text-slate-500"
      }`}
    >
      {children}
    </div>
  );
}

function formatValue(value: unknown, kind: MetricKind): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "暂无数据";
  if (kind === "percent") return `${value.toFixed(2)}%`;
  if (kind === "eps") return `${value.toFixed(2)} 元`;
  if (Math.abs(value) < 10_000_000) return `${(value / 10_000).toFixed(2)} 万元`;
  return `${(value / 100_000_000).toFixed(2)} 亿元`;
}

function valueColor(
  value: unknown,
  key: MetricKey,
): string {
  if (typeof value !== "number") return "text-slate-600";
  const isGrowthMetric = [
    "revenue_yoy",
    "parent_net_profit_yoy",
    "operating_cash_flow_yoy",
  ].includes(String(key));
  if (isGrowthMetric && value !== 0) {
    return value > 0 ? "text-rose-400" : "text-emerald-400";
  }
  return value < 0 ? "text-emerald-400" : "text-slate-200";
}
