const positiveKeywords = [
  "AI",
  "光模块",
  "CPO",
  "数据中心",
  "算力",
  "GPU",
  "机器人",
  "半导体",
  "订单",
  "中标",
  "扩产",
  "客户突破",
  "技术突破",
  "新产品",
  "增长",
  "提升",
  "改善",
];

const negativeKeywords = [
  "风险",
  "亏损",
  "减值",
  "诉讼",
  "处罚",
  "下滑",
  "下降",
  "恶化",
  "不及预期",
  "辟谣",
  "终止",
  "失败",
];

const positiveSet = new Set(positiveKeywords.map((keyword) => keyword.toLowerCase()));
const negativeSet = new Set(negativeKeywords.map((keyword) => keyword.toLowerCase()));
const keywordSource = [...positiveKeywords, ...negativeKeywords]
  .sort((left, right) => right.length - left.length)
  .map(escapeRegExp)
  .join("|");
const tokenPattern = new RegExp(
  `(${keywordSource}|[-+]?\\d+(?:\\.\\d+)?(?:%|个百分点|亿元|万元|元)?)`,
  "gi",
);

export function HighlightedText({
  text,
  financial = false,
}: {
  text: string;
  financial?: boolean;
}) {
  return (
    <>
      {text.split(/([。！？；])/).map((sentence, sentenceIndex) => {
        const lower = sentence.toLowerCase();
        const tone = negativeKeywords.some((keyword) =>
          lower.includes(keyword.toLowerCase()),
        )
          ? "negative"
          : positiveKeywords.some((keyword) =>
                lower.includes(keyword.toLowerCase()),
              )
            ? "positive"
            : null;
        return sentence.split(tokenPattern).map((part, partIndex) => {
          const normalized = part.toLowerCase();
          const keywordTone = negativeSet.has(normalized)
            ? "negative"
            : positiveSet.has(normalized)
              ? "positive"
              : null;
          const numeric = /^[-+]?\d/.test(part);
          const appliedTone = keywordTone ?? (numeric ? tone : null);
          if (!appliedTone) return part;
          return (
            <mark
              className={
                financial
                  ? appliedTone === "positive"
                    ? "financial-good"
                    : "financial-bad"
                  : appliedTone === "positive"
                    ? "keyword-positive"
                    : "keyword-negative"
              }
              key={`${sentenceIndex}-${partIndex}`}
            >
              {part}
            </mark>
          );
        });
      })}
    </>
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
