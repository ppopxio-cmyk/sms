import { Loader2, Search, X } from 'lucide-react';

// Live search on every list. Typing is still debounced by the page; this component
// only owns the look, the clear button, and the small spinner while an answer is on
// its way.
export default function SearchInput({
  value = '',
  onChange,
  placeholder = 'Search',
  loading = false,
  label,
  className = '',
  id = 'page-search',
  ...rest
}) {
  const handleChange = (event) => onChange?.(event);

  return (
    <div className={`relative ${className}`}>
      <label className="sr-only" htmlFor={id}>
        {label || placeholder}
      </label>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label={label || placeholder}
        className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white/85 pl-10 pr-10 text-sm text-slate-800 transition placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden"
        {...rest}
      />
      <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin text-brand-500" aria-label="Searching" />
        ) : value ? (
          <button
            type="button"
            onClick={() => onChange?.({ target: { value: '' } })}
            aria-label="Clear search"
            className="focus-ring rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </span>
    </div>
  );
}
