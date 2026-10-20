export function Skeleton({ className = 'h-4 w-full', style }) {
  return <div className={`skeleton rounded-lg ${className}`} style={style} aria-hidden="true" />;
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="glass rounded-3xl p-6">
      <Skeleton className="h-5 w-40" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={i % 2 ? 'h-3 w-3/4' : 'h-3 w-full'} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonPage({ cards = 3 }) {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <SkeletonCard key={i} lines={2} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonStats({ count = 4 }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="glass animate-rise rounded-3xl p-5" style={{ animationDelay: `${index * 55}ms` }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-7 w-20" />
              <Skeleton className="mt-2 h-3 w-32" />
            </div>
            <Skeleton className="h-11 w-11 rounded-2xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ rows = 6 }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white/60 px-4 py-3.5">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="hidden h-7 w-20 rounded-full sm:block" />
          <Skeleton className="hidden h-9 w-9 rounded-xl md:block" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ height = 260, compact = false }) {
  return (
    <div className="space-y-4">
      {compact ? null : <Skeleton className="h-4 w-40" />}
      <div className="flex items-end gap-2" style={{ height }}>
        {[45, 70, 38, 82, 55, 68, 30, 76, 62, 48, 72, 52].map((value, index) => (
          <Skeleton key={index} className="flex-1 rounded-xl" style={{ height: `${value}%` }} />
        ))}
      </div>
    </div>
  );
}
