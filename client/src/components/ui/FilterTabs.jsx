// Category tabs with real counts. They scroll sideways on a phone instead of wrapping
// into three rows, and every tab keeps the same height so the card does not jump.
export default function FilterTabs({ tabs, value, onChange, label = 'Categories', className = '' }) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`no-scrollbar flex max-w-full items-center gap-1.5 overflow-x-auto rounded-2xl bg-slate-100/80 p-1.5 ${className}`}
    >
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={`focus-ring group flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition duration-200 ${
              active
                ? 'brand-gradient text-white shadow-md shadow-brand-600/20'
                : 'text-slate-500 hover:bg-white/80 hover:text-slate-800'
            }`}
          >
            {tab.dot ? (
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-white/90' : tab.dot}`}
              />
            ) : null}
            {tab.label}
            {tab.count !== undefined && tab.count !== null ? (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                  active ? 'bg-white/20 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200/80'
                }`}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
