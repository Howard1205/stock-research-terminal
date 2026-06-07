import { memo, useEffect, useMemo, useState } from "react";
import { usePersistentToggle } from "../hooks/usePersistentToggle";
import type { InvestorQa } from "../types";
import { CollapseButton } from "./CollapseButton";
import { HighlightedText } from "./HighlightedText";

export const InvestorQaPanel = memo(function InvestorQaPanel({
  data,
  loading,
  error,
}: {
  data: InvestorQa | null;
  loading: boolean;
  error: string | null;
}) {
  const [open, toggle] = usePersistentToggle("module:investor-qa", false);
  const [query, setQuery] = useState("");
  const [keyword, setKeyword] = useState("全部");
  const [visibleCount, setVisibleCount] = useState(20);
  const keywords = useMemo(
    () => Array.from(new Set(data?.items.flatMap((item) => item.keywords) ?? [])),
    [data],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return (data?.items ?? []).filter((item) => {
      const keywordMatch = keyword === "全部" || item.keywords.includes(keyword);
      const textMatch =
        !normalized ||
        `${item.question} ${item.answer}`.toLowerCase().includes(normalized);
      return keywordMatch && textMatch;
    });
  }, [data, keyword, query]);
  const preview = filtered.slice(0, 3);
  const visibleItems = filtered.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount(20);
  }, [data, keyword, query]);

  return (
    <section
      id="investor-qa-section"
      className="mt-5 scroll-mt-4 rounded-2xl border border-line bg-panel p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-white">董秘回复与投资者问答</h2>
          <p className="mt-1 text-xs text-slate-500">
            近一年有公司正式回复的公开问答
          </p>
        </div>
        <CollapseButton open={open} onClick={toggle} />
      </div>

      {loading && <PanelMessage>正在读取公开问答...</PanelMessage>}
      {error && <PanelMessage error>{error}</PanelMessage>}
      {!loading && !error && data?.items.length === 0 && (
        <PanelMessage>
          {data.message || "暂无近一年公开董秘回复/投资者问答"}
        </PanelMessage>
      )}
      {!loading && !error && data && (
        <>
          {open && (
            <div className="mt-4 space-y-3">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索问题、回复或业务关键词"
                className="w-full rounded-lg border border-line bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-400"
              />
              <div className="flex flex-wrap gap-2">
                {["全部", ...keywords].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setKeyword(item)}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      keyword === item
                        ? "border-teal-400/50 bg-teal-400/10 text-teal-300"
                        : "border-line text-slate-500"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4 space-y-3">
            {(open ? visibleItems : preview).map((item, index) => (
              <article
                key={`${item.published_at}-${index}`}
                className="rounded-xl border border-line/70 bg-slate-950/35 p-4"
              >
                <div className="text-xs text-slate-600">
                  {item.source} · {item.published_at}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-200">
                  问：<HighlightedText text={item.question} />
                </p>
                <p
                  className={`mt-2 text-sm leading-6 text-slate-400 ${
                    open ? "" : "line-clamp-3"
                  }`}
                >
                  答：<HighlightedText text={item.answer} />
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.keywords.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-teal-400/[0.07] px-2 py-0.5 text-xs text-teal-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-xs text-teal-300"
                >
                  查看原文
                </a>
              </article>
            ))}
          </div>
          {open && filtered.length === 0 && (
            <PanelMessage>没有匹配当前筛选条件的问答</PanelMessage>
          )}
          {open && filtered.length > visibleCount && (
            <button
              type="button"
              onClick={() => setVisibleCount((count) => count + 20)}
              className="mt-4 w-full rounded-lg border border-line py-2 text-xs text-slate-500 transition hover:bg-slate-950/40 hover:text-slate-300"
            >
              再显示 {Math.min(20, filtered.length - visibleCount)} 条
            </button>
          )}
        </>
      )}
    </section>
  );
});

function PanelMessage({
  children,
  error = false,
}: {
  children: React.ReactNode;
  error?: boolean;
}) {
  return (
    <div className={`mt-4 py-8 text-center text-sm ${error ? "text-rose-400" : "text-slate-500"}`}>
      {children}
    </div>
  );
}
