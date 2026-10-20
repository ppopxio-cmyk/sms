import { ChevronLeft, ChevronRight } from 'lucide-react';

function pageItems(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);

  const items = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);

  if (from > 2) items.push('left-gap');
  for (let value = from; value <= to; value += 1) items.push(value);
  if (to < pages - 1) items.push('right-gap');
  items.push(pages);
  return items;
}

const arrow =
  'focus-ring inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-500 transition hover:bg-white hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40';

export default function Pagination({ page, pages, total, limit, onPage, onLimit, className = '' }) {
  if (!total) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);

  return (
    <div className={`flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <p className="text-xs text-slate-500">
        Showing <span className="font-semibold text-slate-700">{from}</span>–
        <span className="font-semibold text-slate-700">{to}</span> of{' '}
        <span className="font-semibold text-slate-700">{total}</span>
        {onLimit ? (
          <select
            value={limit}
            onChange={(event) => onLimit(Number(event.target.value))}
            aria-label="Rows per page"
            className="focus-ring ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600"
          >
            {[10, 20, 25, 50].map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
        ) : null}
      </p>

      <nav aria-label="Pagination" className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className={arrow}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pageItems(page, pages).map((item) =>
          typeof item === 'number' ? (
            <button
              key={item}
              type="button"
              onClick={() => onPage(item)}
              aria-current={item === page ? 'page' : undefined}
              className={`focus-ring inline-flex h-9 min-w-9 items-center justify-center rounded-xl px-2 text-xs font-semibold transition ${
                item === page
                  ? 'brand-gradient text-white shadow-md shadow-brand-600/20'
                  : 'border border-slate-200 bg-white/80 text-slate-500 hover:bg-white hover:text-slate-800'
              }`}
            >
              {item}
            </button>
          ) : (
            <span key={item} className="px-1 text-xs text-slate-400" aria-hidden="true">
              …
            </span>
          ),
        )}

        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          aria-label="Next page"
          className={arrow}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </nav>
    </div>
  );
}
