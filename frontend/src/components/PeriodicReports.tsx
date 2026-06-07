import { memo, useState } from "react";
import { requestReportSummary } from "../api";
import { usePersistentToggle } from "../hooks/usePersistentToggle";
import type { CompanyReport, CompanyReports, ReportSummary } from "../types";
import { CollapseButton } from "./CollapseButton";
import { HighlightedText } from "./HighlightedText";

export const PeriodicReports = memo(function PeriodicReports({
  symbol,
  reports,
  loading,
  error,
}: {
  symbol: string | null;
  reports: CompanyReports | null;
  loading: boolean;
  error: string | null;
}) {
  const [open, toggle] = usePersistentToggle("module:reports", false);
  const [summaries, setSummaries] = useState<Record<string, ReportSummary>>({});
  const [summaryErrors, setSummaryErrors] = useState<Record<string, string>>({});
  const [summaryLoading, setSummaryLoading] = useState<string | null>(null);

  const generateSummary = async (report: CompanyReport) => {
    if (!symbol) return;
    setSummaryLoading(report.id);
    setSummaryErrors((current) => ({ ...current, [report.id]: "" }));
    try {
      const result = await requestReportSummary(symbol, report);
      setSummaries((current) => ({ ...current, [report.id]: result }));
    } catch (requestError) {
      setSummaryErrors((current) => ({
        ...current,
        [report.id]:
          requestError instanceof Error ? requestError.message : "摘要生成失败",
      }));
    } finally {
      setSummaryLoading(null);
    }
  };

  return (
    <section
      id="periodic-reports-section"
      className="mt-5 scroll-mt-4 rounded-2xl border border-line bg-panel p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-white">定期报告与摘要</h2>
          <p className="mt-1 text-xs text-slate-500">
            巨潮定期报告 PDF、原文页码与结构化证据
          </p>
        </div>
        <CollapseButton open={open} onClick={toggle} />
      </div>
      {!open && (
        <p className="mt-4 text-sm text-slate-500">
          {reports?.reports.slice(0, 3).map((item) => item.title).join(" · ") ||
            "展开后查看最近定期报告"}
        </p>
      )}
      {open && (
        <>
          {loading && <ModuleMessage>正在读取巨潮定期报告...</ModuleMessage>}
          {error && <ModuleMessage error>{error}</ModuleMessage>}
          {!loading && !error && reports?.reports.length === 0 && (
            <ModuleMessage>暂无可靠公开数据</ModuleMessage>
          )}
          <div className="mt-4 space-y-3">
            {reports?.reports.slice(0, 12).map((report) => (
              <article
                key={report.id}
                className="rounded-xl border border-line/70 bg-slate-950/35 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-slate-100">
                      <HighlightedText text={report.title} />
                    </h3>
                    <div className="mt-1 text-xs text-slate-600">
                      发布日期：{report.published_at}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={report.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-line px-2.5 py-1.5 text-xs text-slate-400"
                    >
                      查看原文
                    </a>
                    <button
                      type="button"
                      onClick={() => generateSummary(report)}
                      disabled={summaryLoading === report.id || !report.pdf_url}
                      className="rounded-md border border-teal-400/20 bg-teal-400/[0.05] px-2.5 py-1.5 text-xs text-teal-300 disabled:opacity-50"
                    >
                      {summaryLoading === report.id
                        ? "下载解析中..."
                        : report.pdf_url
                          ? "生成摘要"
                          : "无PDF"}
                    </button>
                  </div>
                </div>
                {summaryErrors[report.id] && (
                  <div className="mt-3 rounded-lg bg-rose-400/[0.06] p-3 text-xs text-rose-300">
                    {summaryErrors[report.id]}
                  </div>
                )}
                {summaries[report.id]?.message && (
                  <div className="mt-3 text-xs text-amber-300">
                    {summaries[report.id].message}
                  </div>
                )}
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {summaries[report.id]?.items.map((item, index) => (
                    <div
                      key={`${item.category}-${item.page}-${index}`}
                      className="rounded-lg border border-line/60 bg-slate-900/50 p-3"
                    >
                      <div className="text-xs font-medium text-teal-200">
                        <HighlightedText text={item.category} />
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        <HighlightedText text={item.content} />
                      </p>
                      <div className="mt-2 text-[11px] text-slate-600">
                        {item.source.title} · {item.source.published_at} · 第
                        {item.page}页{item.section ? ` · ${item.section}` : ""}
                      </div>
                      <a
                        href={item.source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-xs text-teal-300"
                      >
                        查看证据
                      </a>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
});

function ModuleMessage({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`mt-4 rounded-xl bg-slate-950/40 px-4 py-10 text-center text-sm ${
        error ? "text-rose-400" : "text-slate-500"
      }`}
    >
      {children}
    </div>
  );
}
