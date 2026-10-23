import { GraduationCap } from 'lucide-react';

const SIZES = {
  sm: { box: 'h-9 w-9 rounded-xl', icon: 'h-4.5 w-4.5', title: 'text-sm', sub: 'text-[11px]' },
  md: { box: 'h-11 w-11 rounded-2xl', icon: 'h-5 w-5', title: 'text-base', sub: 'text-xs' },
  lg: { box: 'h-14 w-14 rounded-2xl', icon: 'h-7 w-7', title: 'text-lg', sub: 'text-sm' },
};

export default function Brand({ size = 'md', subtitle = 'School Management System', layout = 'row', compact = false }) {
  const s = SIZES[size] ?? SIZES.md;

  return (
    <div className={layout === 'row' ? 'flex items-center gap-3' : 'flex flex-col items-center gap-3 text-center'}>
      <span className={`brand-gradient flex ${s.box} shrink-0 items-center justify-center text-white shadow-lg shadow-brand-600/25`}>
        <GraduationCap className={s.icon} />
      </span>
      {compact ? null : (
        <div>
          <p className={`${s.title} font-bold tracking-tight`}>
            <span className="text-brand-gradient">SMS</span>
            <span className="text-slate-300"> - </span>
            <span className="text-slate-700">PORTAL</span>
          </p>
          <p className={`${s.sub} text-slate-500`}>{subtitle}</p>
        </div>
      )}
    </div>
  );
}
