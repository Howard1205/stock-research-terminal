export function CollapseButton({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-line px-3 py-1.5 text-xs text-slate-500 transition hover:text-slate-200"
      aria-expanded={open}
    >
      {open ? "收起" : "展开"}
      <span className="ml-1">{open ? "⌃" : "⌄"}</span>
    </button>
  );
}
