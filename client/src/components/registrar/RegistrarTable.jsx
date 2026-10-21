import { Skeleton } from '../ui/Skeleton';
import { EmptyState, ErrorState } from '../ui/StatePanel';

// A single table that becomes labelled record cards on a phone. Every column can decide how
// its value is rendered, but the surrounding states, overflow and empty messages stay the
// same on every Registrar screen.
export default function RegistrarTable({
  columns,
  rows = [],
  loading = false,
  error = null,
  onRetry,
  rowKey = (row) => row.id,
  emptyTitle = 'Nothing here yet',
  emptyMessage = 'Records will appear here once they have been added.',
  noResults = false,
  noResultsTitle = 'No matching records',
  noResultsMessage = 'Try a different search or clear one of the filters.',
  onRowClick,
}) {
  if (loading) {
    return (
      <div className="space-y-3 p-5">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="hidden h-3 w-24 sm:block" />
            <Skeleton className="hidden h-3 w-20 md:block" />
          </div>
        ))}
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={onRetry} />;

  if (!rows.length) {
    return (
      <EmptyState
        title={noResults ? noResultsTitle : emptyTitle}
        message={noResults ? noResultsMessage : emptyMessage}
      />
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[680px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-400">
              {columns.map((column) => (
                <th key={column.key} scope="col" className={`px-5 py-3 font-semibold ${column.className || ''}`}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-slate-50 align-middle transition last:border-0 ${
                  onRowClick ? 'cursor-pointer hover:bg-brand-50/40' : 'hover:bg-slate-50/50'
                }`}
              >
                {columns.map((column) => (
                  <td key={column.key} className={`px-5 py-3.5 text-slate-600 ${column.className || ''}`}>
                    {column.render ? column.render(row) : row[column.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 p-4 md:hidden">
        {rows.map((row) => (
          <article
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={`rounded-2xl border border-slate-100 bg-white/75 p-4 ${
              onRowClick ? 'cursor-pointer active:bg-brand-50/40' : ''
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                {columns.slice(0, 2).map((column, index) => (
                  <div key={column.key} className={index === 0 ? 'text-sm font-semibold text-slate-900' : 'mt-1 text-xs text-slate-500'}>
                    {column.render ? column.render(row) : row[column.key] ?? '—'}
                  </div>
                ))}
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
              {columns.slice(2).map((column) => (
                <div key={column.key} className={column.mobileFull ? 'col-span-2' : ''}>
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{column.label}</dt>
                  <dd className="mt-0.5 text-xs text-slate-600">
                    {column.render ? column.render(row) : row[column.key] ?? '—'}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}
