import Brand from '../ui/Brand';
import { ShieldCheck, Fingerprint, Mail } from 'lucide-react';

const POINTS = [
  { icon: ShieldCheck, title: 'Sessions you control', text: 'Short-lived access tokens with rotating refresh cookies.' },
  { icon: Fingerprint, title: 'Every device, visible', text: 'See each signed-in device and end any of them at once.' },
  { icon: Mail, title: 'Six-digit codes', text: 'Email confirmation, sign-in checks and password reset.' },
];

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <div className="grid w-full max-w-5xl gap-10 lg:grid-cols-[1.05fr_1fr] lg:items-center">
        <aside className="hidden lg:block">
          <Brand size="lg" />
          <h1 className="mt-9 text-4xl font-bold leading-[1.15] tracking-tight text-slate-900">
            Run your school
            <br />
            <span className="text-brand-gradient">without the paperwork.</span>
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-slate-600">
            Students, attendance, marks and finance in one place, with the Ethiopian calendar built in.
          </p>
          <ul className="mt-9 space-y-4">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3.5">
                <span className="glass-soft mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-brand-600">
                  <p.icon className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{p.title}</p>
                  <p className="text-sm text-slate-500">{p.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        <main className="animate-rise glass rounded-3xl p-6 sm:p-8">
          <div className="mb-7 lg:hidden">
            <Brand size="md" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
          {footer ? <div className="mt-6 text-sm text-slate-600">{footer}</div> : null}
        </main>
      </div>
    </div>
  );
}
