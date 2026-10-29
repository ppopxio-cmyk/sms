import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PageHeader({ eyebrow, title, subtitle, backTo, actions, icon: Icon }) {
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
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">
            {eyebrow}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          {Icon ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 shadow-sm">
              <Icon className="h-5 w-5" />
            </div>
          ) : null}
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1 max-w-3xl text-xs sm:text-sm leading-relaxed text-slate-500">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 pt-1">{actions}</div>
      ) : null}
    </header>
  );
}
