import { Radio } from 'lucide-react';
import { useLiveTimestamp } from '../../lib/useNow';

export default function LiveStamp({ updatedAt, label = 'Live', className = '' }) {
  const ago = useLiveTimestamp(updatedAt);
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50/80 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ${className}`}
      title={updatedAt ? `Last updated ${new Date(updatedAt).toLocaleString()}` : 'Waiting for the first update'}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <Radio className="h-3 w-3" />
      {label}
      {ago ? <span className="font-normal text-emerald-600/80">· {ago}</span> : null}
    </span>
  );
}
