import { memo, useMemo } from "react";
import { usePersistentToggle } from "../hooks/usePersistentToggle";
import type {
  CompanyReports,
  EventFeed,
  InvestorQa,
  MarketFocus,
} from "../types";
import { CollapseButton } from "./CollapseButton";
import { HighlightedText } from "./HighlightedText";

export const CompanyResearchSidebar = memo(function CompanyResearchSidebar({
  eventFeed,
  marketFocus,
  investorQa,
  reports,
  eventLoading,
  marketFocusLoading,
  investorQaLoading,
  reportsLoading,
  eventError,
  marketFocusError,
  investorQaError,
  reportsError,
  onAnalyzeLatest,
  onOpenInvestorQa,
  onOpenReports,
}: {
  eventFeed: EventFeed | null;
  marketFocus: MarketFocus | null;
  investorQa: InvestorQa | null;
  reports: CompanyReports | null;
  eventLoading: boolean;
  marketFocusLoading: boolean;
  investorQaLoading: boolean;
  reportsLoading: boolean;
  eventError: string | null;
  marketFocusError: string | null;
  investorQaError: string | null;
  reportsError: string | null;
  onAnalyzeLatest: () => void;
  onOpenInvestorQa: () => void;
  onOpenReports: () => void;
}) {
  const [eventOpen, toggleEvents] = usePersistentToggle("module:event-feed", true);
  const [focusOpen, toggleFocus] = usePersistentToggle("module:market-focus", false);
  const filteredEvents = useMemo(
    () =>
      (eventFeed?.events ?? []).filter(
        (event) =>
          !event.event_type.includes("董秘") &&
          !event.event_type.includes("互动") &&
          !event.event_type.includes("问答"),
      ),
    [eventFeed],
  );

  return (
    <aside className="space-y-5 pb-8">
      <section className="rounded-2xl border border-line bg-panel p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">事件驱动信息流</h2>
            <p className="mt-1 text-xs text-slate-500">
              电话会、澄清、业绩、订单和董秘回复优先
            </p>
          </div>
          <CollapseButton open={eventOpen} onClick={toggleEvents} />
        </div>
        {eventLoading && <SideMessage>正在聚合近期公开事件...</SideMessage>}
        {eventError && <SideMessage error>{eventError}</SideMessage>}
        {!eventLoading && !eventError && filteredEvents.length === 0 && (
          <SideMessage>暂无可靠公开数据</SideMessage>
        )}
        {!eventOpen && filteredEvents[0] && (
          <p className="mt-4 text-sm leading-6 text-slate-400">
            最新：<HighlightedText text={filteredEvents[0].title} />
          </p>
        )}
        {eventOpen && (
          <div className="mt-4 space-y-3">
            {filteredEvents.slice(0, 8).map((event, index) => (
              <article
                key={`${event.published_at}-${event.title}-${index}`}
                className="rounded-xl border border-line/70 bg-slate-950/35 p-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">
                    {event.event_type}
                  </span>
                  <span className={impactClass(event.impact)}>{event.impact}</span>
                  <span className="rounded bg-sky-400/[0.08] px-1.5 py-0.5 text-sky-300">
                    {event.relevance_level} {event.relevance_score}
                  </span>
                  <span className="text-slate-600">{event.published_at}</span>
                </div>
                <h3 className="mt-2 text-sm font-medium leading-5 text-slate-100">
                  <HighlightedText text={event.title} />
                </h3>
                <p className="mt-2 text-xs leading-5 text-slate-400">
                  <HighlightedText text={event.summary} />
                </p>
                {event.businesses.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {event.businesses.map((business) => (
                      <span
                        key={business}
                        className="rounded-full bg-teal-400/[0.07] px-2 py-0.5 text-[11px] text-teal-300"
                      >
                        {business}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-slate-600">来源：{event.source}</span>
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-teal-300"
                  >
                    查看原文
                  </a>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-panel p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">近期市场关注点摘要</h2>
            <p className="mt-1 text-xs text-slate-500">事件证据优先，概念标签仅补充</p>
          </div>
          <CollapseButton open={focusOpen} onClick={toggleFocus} />
        </div>
        {marketFocusLoading && <SideMessage>正在识别业务主题...</SideMessage>}
        {marketFocusError && <SideMessage error>{marketFocusError}</SideMessage>}
        {!focusOpen && marketFocus && (
          <div className="mt-4 flex flex-wrap gap-2">
            {marketFocus.topics.slice(0, 5).map((topic) => (
              <span
                key={topic.topic}
                className="rounded-full border border-line px-2.5 py-1 text-xs text-slate-300"
              >
                {topic.topic}
              </span>
            ))}
            {marketFocus.topics.length === 0 && (
              <span className="text-sm text-slate-500">暂无可靠公开数据</span>
            )}
          </div>
        )}
        {focusOpen && (
          <div className="mt-4 space-y-3">
            {marketFocus?.topics.slice(0, 6).map((topic) => (
              <article key={topic.topic} className="rounded-xl bg-slate-950/35 p-3">
                <div className="font-medium text-teal-200">
                  <HighlightedText text={topic.topic} />
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  可能催化：<HighlightedText text={topic.possible_catalyst} />
                </div>
                {topic.evidence[0] && (
                  <>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-400">
                      <HighlightedText text={topic.evidence[0].content} />
                    </p>
                    <a
                      href={topic.evidence[0].url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs text-teal-300"
                    >
                      查看证据
                    </a>
                  </>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-panel p-5">
        <h2 className="font-semibold text-white">董秘回复 / 互动问答摘要</h2>
        <p className="mt-1 text-xs text-slate-500">完整问答保留在主内容区</p>
        {investorQaLoading && <SideMessage>正在读取公开问答...</SideMessage>}
        {investorQaError && <SideMessage error>{investorQaError}</SideMessage>}
        {!investorQaLoading &&
          !investorQaError &&
          investorQa?.items.length === 0 && (
            <SideMessage>暂无近一年公开董秘回复/投资者问答</SideMessage>
          )}
        {!investorQaLoading && !investorQaError && investorQa && investorQa.items.length > 0 && (
          <button
            type="button"
            onClick={onOpenInvestorQa}
            className="mt-4 w-full rounded-lg border border-teal-400/25 bg-teal-400/[0.06] px-3 py-2.5 text-left text-sm text-teal-300"
          >
            近一年董秘回复 {investorQa.items.length} 条，点击查看
          </button>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-panel p-5">
        <h2 className="font-semibold text-white">最新公告 / 报告入口</h2>
        <p className="mt-1 text-xs text-slate-500">完整报告与摘要位于主内容区</p>
        {reportsLoading && <SideMessage>正在读取定期报告...</SideMessage>}
        {reportsError && <SideMessage error>{reportsError}</SideMessage>}
        {!reportsLoading && !reportsError && reports?.reports.length === 0 && (
          <SideMessage>暂无可靠公开报告</SideMessage>
        )}
        <div className="mt-4 space-y-2">
          {reports?.reports.slice(0, 4).map((report) => (
            <a
              key={report.id}
              href={report.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg border border-line/70 bg-slate-950/30 p-3 transition hover:bg-slate-900/60"
            >
              <div className="line-clamp-2 text-xs leading-5 text-slate-300">
                <HighlightedText text={report.title} />
              </div>
              <div className="mt-1 text-[11px] text-slate-600">
                {report.published_at}
              </div>
            </a>
          ))}
        </div>
        {reports && reports.reports.length > 0 && (
          <button
            type="button"
            onClick={onOpenReports}
            className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-xs text-slate-400"
          >
            查看全部报告与摘要
          </button>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-panel p-5">
        <h2 className="font-semibold text-white">当日异动原因分析</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          点击日K可分析指定交易日，也可直接分析最近交易日。
        </p>
        <button
          type="button"
          onClick={onAnalyzeLatest}
          className="mt-3 w-full rounded-lg border border-teal-400/30 bg-teal-400/[0.08] px-3 py-2 text-sm text-teal-300"
        >
          分析最近交易日
        </button>
      </section>
    </aside>
  );
});

function impactClass(impact: string) {
  const base = "rounded px-1.5 py-0.5 font-semibold";
  if (impact === "利好") return `${base} bg-amber-400/10 tone-positive`;
  if (impact === "利空") return `${base} bg-rose-400/10 tone-negative`;
  if (impact === "不确定") return `${base} bg-slate-400/10 text-slate-500`;
  return `${base} text-slate-400`;
}

function SideMessage({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div className={`mt-4 rounded-xl bg-slate-950/40 px-3 py-8 text-center text-sm ${error ? "text-rose-400" : "text-slate-600"}`}>
      {children}
    </div>
  );
}
