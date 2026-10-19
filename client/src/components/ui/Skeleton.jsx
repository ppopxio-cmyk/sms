export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={`skeleton rounded-lg ${className}`} aria-hidden="true" />;
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
