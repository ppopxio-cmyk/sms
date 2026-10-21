import { Link, Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  GraduationCap,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../store/auth';
import { homeFor } from '../lib/roles';
import { formatEthiopian } from '../lib/ethiopianDate';
import { useLiveTimestamp, useNow } from '../lib/useNow';

function countdown(until, now) {
  if (!until) return null;
  const total = Math.max(0, new Date(until).getTime() - now);
  const seconds = Math.floor(total / 1000);
  return {
    done: total <= 0,
    days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  };
}

function OrbitMark() {
  return (
    <div className="relative flex h-56 w-56 items-center justify-center sm:h-64 sm:w-64">
      <span className="animate-pulse-ring absolute inset-8 rounded-full bg-teal-400/10" />
      <span className="absolute inset-0 rounded-full border border-white/10" />
      <span className="absolute inset-6 rounded-full border border-dashed border-white/10" />
      <span className="animate-orbit absolute inset-0">
        <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-teal-300 shadow-[0_0_18px_5px_rgba(45,212,191,.55)]" />
      </span>
      <span className="animate-orbit absolute inset-10" style={{ animationDirection: 'reverse', animationDuration: '14s' }}>
        <span className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-amber-300 shadow-[0_0_16px_4px_rgba(251,191,36,.4)]" />
      </span>

      <div className="relative flex h-28 w-28 flex-col items-center justify-center rounded-[2rem] border border-white/15 bg-white/[0.07] shadow-2xl backdrop-blur-xl">
        <Wrench className="h-9 w-9 text-teal-300" strokeWidth={1.7} />
        <span className="mt-2 text-[10px] font-semibold tracking-[0.16em] text-slate-300">Careful work</span>
      </div>
    </div>
  );
}

export default function Maintenance() {
  const location = useLocation();
  const user = useAuth((state) => state.user);
  const now = useNow(1000);
  const fromApp = location.state?.maintenance;

  const status = useQuery({
    queryKey: ['system-status'],
    queryFn: async () => (await api.get('/status')).data,
    refetchInterval: 20_000,
    refetchOnMount: 'always',
    retry: 1,
    staleTime: 10_000,
  });

  // A fresh response wins over the cached status and the state that sent us here. That
  // prevents a stale "maintenance on" hand-off from keeping this page open after the
  // portal has already reopened.
  const freshMaintenance = status.isFetchedAfterMount ? status.data?.maintenance : null;
  const maintenance =
    freshMaintenance ?? (fromApp?.enabled ? fromApp : status.data?.maintenance ?? fromApp ?? null);
  const open = status.data ? !maintenance?.enabled : false;
  const until = maintenance?.until ? new Date(maintenance.until) : null;
  const left = countdown(until, now);
  const checked = useLiveTimestamp(status.dataUpdatedAt);
  const name = status.data?.name || 'College portal';
  const home = user?.role ? homeFor(user.role) : '/login';
  const adminHome = user?.role === 'ADMIN';

  // This screen only exists while the portal is closed. Direct visits, old bookmarks
  // and the automatic reopening all leave it for the person's own workspace.
  if (status.isSuccess && status.isFetchedAfterMount && !status.isFetching && !maintenance?.enabled) {
    const back = location.state?.from;
    return <Navigate to={back && back !== '/maintenance' ? back : home} replace />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#060b17] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.16]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(148,163,184,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.12) 1px, transparent 1px)',
          backgroundSize: '54px 54px',
          maskImage: 'radial-gradient(ellipse at 50% 20%, black 20%, transparent 78%)',
        }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute -left-32 top-[-10rem] h-[34rem] w-[34rem] rounded-full bg-teal-500/10 blur-[110px]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 bottom-[-14rem] h-[38rem] w-[38rem] rounded-full bg-teal-400/10 blur-[120px]" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="brand-gradient flex h-10 w-10 items-center justify-center rounded-2xl shadow-lg shadow-black/30">
            <GraduationCap className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold tracking-tight">SMS Portal</p>
            <p className="text-[11px] text-slate-400">College management system</p>
          </div>
        </div>

        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-slate-300 backdrop-blur">
          <span className={`h-2 w-2 rounded-full ${open ? 'bg-teal-300' : 'bg-amber-300'} animate-pulse-dot`} />
          {open ? 'Portal is open' : 'Planned maintenance'}
        </span>
      </header>

      <main className="relative z-10 mx-auto grid max-w-6xl gap-12 px-5 pb-14 pt-8 sm:px-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:gap-8 lg:pb-20 lg:pt-14">
        <section className="animate-rise">
          <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/[0.08] px-3 py-1.5 text-[11px] font-semibold text-teal-200">
            <Wrench className="h-3.5 w-3.5" />
            {open ? 'The doors are open again' : 'A short pause, handled carefully'}
          </div>

          <h1 className="mt-6 max-w-2xl text-[2.65rem] font-black leading-[0.98] tracking-[-0.055em] text-balance sm:text-6xl lg:text-[4.15rem]">
            {open ? (
              <>
                Everything is
                <span className="block font-light text-slate-400">back in place.</span>
              </>
            ) : (
              <>
                We are making
                <span className="block font-light text-slate-400">the portal safer.</span>
              </>
            )}
          </h1>

          <p className="mt-6 max-w-xl text-[15px] leading-7 text-slate-300 sm:text-base">
            {open
              ? 'The college portal is available. Sign in again and pick up where you left off.'
              : maintenance?.message ||
                'The college portal is being updated. We are keeping every record safe and will open the doors as soon as the work is complete.'}
          </p>

          {!open ? (
            <div className="mt-8 max-w-xl rounded-3xl border border-white/10 bg-white/[0.045] p-5 backdrop-blur-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                    <Clock3 className="h-4 w-4 text-amber-300" />
                    Planned return
                  </p>
                  <p className="mt-1.5 text-lg font-semibold text-white">
                    {until ? formatEthiopian(until, { time: true }) : 'As soon as the work is finished'}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {until && !left?.done
                      ? 'The portal is set to reopen automatically. This page checks every 20 seconds.'
                      : until
                        ? 'The planned time has passed. The team is finishing the work.'
                        : 'No end time has been announced. This page checks again every 20 seconds.'}
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold text-slate-300">
                  {name}
                </span>
              </div>

              {left && !left.done ? (
                <div className="mt-5 grid grid-cols-4 gap-2">
                  {[
                    ['days', left.days],
                    ['hours', left.hours],
                    ['min', left.minutes],
                    ['sec', left.seconds],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/[0.08] bg-black/20 px-2 py-3 text-center">
                      <p className="text-xl font-black tabular-nums tracking-tight text-white">
                        {String(value).padStart(2, '0')}
                      </p>
                      <p className="mt-0.5 text-[10px] font-medium text-slate-400">{label}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-8 flex max-w-xl items-start gap-3 rounded-3xl border border-teal-300/20 bg-teal-300/[0.07] p-4 text-sm text-teal-100">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-teal-300" />
              <p>You can return to the portal now. Accounts and college records are exactly where you left them.</p>
            </div>
          )}

          <div className="mt-7 flex flex-wrap items-center gap-3">
            {open ? (
              <Link
                to={home}
                className="focus-ring inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-950 shadow-xl shadow-black/20 transition hover:bg-teal-50"
              >
                {user ? 'Return to your workspace' : 'Go to sign in'}
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <Link
                to={adminHome ? '/admin' : '/login?admin=1'}
                className="focus-ring inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.08] px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/[0.13]"
              >
                <LockKeyhole className="h-4 w-4 text-teal-300" />
                {adminHome ? 'Return to admin workspace' : 'Administrator sign in'}
              </Link>
            )}

            <button
              type="button"
              onClick={() => status.refetch()}
              disabled={status.isFetching}
              className="focus-ring inline-flex items-center gap-2 rounded-2xl px-3 py-3 text-sm font-medium text-slate-300 transition hover:text-white disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${status.isFetching ? 'animate-spin' : ''}`} />
              {status.isFetching ? 'Checking…' : 'Check again'}
            </button>
          </div>

          {status.error ? (
            <p className="mt-4 max-w-xl text-xs text-amber-200/90">
              {errorMessage(status.error, 'We could not read the portal status just now.')}
            </p>
          ) : null}

          <div className="mt-10 grid max-w-xl gap-3 sm:grid-cols-3">
            {[
              [ShieldCheck, 'Data is untouched', 'Accounts, marks and records stay safe.'],
              [LockKeyhole, 'Sessions are closed', 'Other roles are signed out and must sign in again.'],
              [Clock3, 'No work for you', 'Come back at the planned time.'],
            ].map(([Icon, title, body]) => (
              <div key={title} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5">
                <Icon className="h-4 w-4 text-teal-300" />
                <p className="mt-2 text-xs font-semibold text-slate-200">{title}</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-400">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="animate-fade relative flex min-h-[24rem] flex-col items-center justify-center rounded-[2.5rem] border border-white/[0.08] bg-gradient-to-b from-white/[0.055] to-transparent p-6 shadow-2xl shadow-black/20 backdrop-blur-sm sm:min-h-[30rem]">
          <div className="absolute inset-x-8 top-8 flex items-center justify-between text-[10px] font-semibold tracking-wide text-slate-400">
            <span>Portal pulse</span>
            <span className="flex items-center gap-1.5 text-teal-200">
              <span className="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-teal-300" />
              live
            </span>
          </div>

          <OrbitMark />

          <div className="relative mt-4 w-full max-w-xs overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3 text-[11px]">
              <span className="text-slate-400">Public status</span>
              <span className={open ? 'font-semibold text-teal-300' : 'font-semibold text-amber-300'}>
                {open ? 'Open' : 'Closed for care'}
              </span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 text-[11px]">
              <span className="text-slate-400">Accounts</span>
              <span className="font-semibold text-slate-200">Preserved</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 text-[11px]">
              <span className="text-slate-400">Admin recovery</span>
              <span className="font-semibold text-slate-200">Available</span>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2 text-[10px] text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5" />
            Updates are logged for the audit trail.
          </div>
        </section>
      </main>

      <footer className="relative z-10 mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] px-5 py-5 text-[11px] text-slate-500 sm:px-8">
        <p>College management system · Addis Ababa</p>
        <p>{checked ? `Status checked ${checked}` : 'Checking the portal status'}</p>
      </footer>
    </div>
  );
}
