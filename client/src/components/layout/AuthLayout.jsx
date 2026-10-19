import { Link } from 'react-router-dom';
import { Fingerprint, GraduationCap, MailCheck } from 'lucide-react';

// The animated mark is the whole decoration: no marketing prose, just motion.
function AuthMotif() {
  return (
    <div className="relative mx-auto mb-8 h-28 w-28">
      <span className="animate-pulse-ring absolute inset-0 rounded-[2rem] bg-brand-400/25" />

      <span className="brand-gradient animate-float animate-sweep absolute inset-2 flex items-center justify-center rounded-[1.6rem] text-white shadow-xl shadow-brand-600/30">
        <GraduationCap className="h-9 w-9" />
      </span>

      <span className="glass animate-bob absolute -right-3 top-0 flex h-10 w-10 items-center justify-center rounded-2xl text-brand-600 shadow-lg shadow-brand-600/10">
        <Fingerprint className="h-5 w-5" />
      </span>

      <span
        className="glass animate-bob absolute -left-4 bottom-1 flex h-10 w-10 items-center justify-center rounded-2xl text-sky-600 shadow-lg shadow-sky-600/10"
        style={{ animationDelay: '1.2s' }}
      >
        <MailCheck className="h-5 w-5" />
      </span>
    </div>
  );
}

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
      <div className="animate-rise w-full max-w-md">
        <AuthMotif />

        <main className="glass rounded-3xl p-6 sm:p-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{subtitle}</p> : null}

          <div className="mt-6">{children}</div>

          {footer ? <div className="mt-6 border-t border-slate-100 pt-5 text-sm text-slate-600">{footer}</div> : null}
        </main>

        <p className="mt-6 flex items-center justify-center gap-3 text-xs text-slate-400">
          <Link to="/privacy" className="transition hover:text-slate-600">
            Privacy Policy
          </Link>
          <span aria-hidden="true">·</span>
          <Link to="/terms" className="transition hover:text-slate-600">
            Terms of Service
          </Link>
        </p>
      </div>
    </div>
  );
}
