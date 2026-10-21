import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function TeacherPageHeader({ eyebrow, title, subtitle, backTo, actions }) {
  return (
    <header className="animate-rise flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {backTo ? (
          <Link
            to={backTo}
            className="focus-ring mb-2 inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold text-slate-500 transition hover:text-brand-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
        ) : null}
        {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">{eyebrow}</p> : null}
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
