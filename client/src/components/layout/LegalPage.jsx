import { Link } from 'react-router-dom';
import { ArrowLeft, Scale } from 'lucide-react';
import Brand from '../ui/Brand';

// The address that receives questions about these pages and about an account.
export const CONTACT_EMAIL = 'haile12michaell@gmail.com';

export function Section({ title, children }) {
  return (
    <section className="mt-7">
      <h2 className="text-base font-bold tracking-tight text-slate-900">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-600">{children}</div>
    </section>
  );
}

export function List({ children }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-brand-400">{children}</ul>;
}

export function Table({ head, rows }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="w-full min-w-[34rem] border-collapse text-left text-xs">
        <thead>
          <tr className="bg-slate-50 text-slate-500">
            {head.map((cell) => (
              <th key={cell} className="px-4 py-2.5 font-semibold">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]} className="border-t border-slate-100 align-top">
              {row.map((cell, index) => (
                <td key={index} className={`px-4 py-2.5 ${index === 0 ? 'font-medium text-slate-800' : 'text-slate-600'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LegalPage({ title, subtitle, updated, children }) {
  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <Brand size="sm" />
          <Link
            to="/"
            className="focus-ring inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-white/80 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </div>

        <article className="animate-rise glass mt-6 rounded-3xl p-6 sm:p-10">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-700">
            <Scale className="h-3.5 w-3.5" />
            Legal
          </span>

          <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>
          <p className="mt-1 text-xs text-slate-400">Last updated: {updated}</p>

          <div className="mt-6 border-t border-slate-100 pt-1">{children}</div>
        </article>

        <p className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-400">
          <Link to="/privacy" className="transition hover:text-slate-600">
            Privacy Policy
          </Link>
          <span aria-hidden="true">·</span>
          <Link to="/terms" className="transition hover:text-slate-600">
            Terms of Service
          </Link>
          <span aria-hidden="true">·</span>
          <a href={`mailto:${CONTACT_EMAIL}`} className="transition hover:text-slate-600">
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>
    </div>
  );
}
