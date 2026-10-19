import { useEffect, useState } from 'react';
import { BellOff, BellRing, LockKeyhole } from 'lucide-react';
import { toast } from 'sonner';
import { disablePush, enablePush, pushState } from '../../lib/push';
import Button from './Button';
import Badge from './Badge';

const TONE = {
  on: 'success',
  off: 'neutral',
  blocked: 'warning',
  unsupported: 'neutral',
};

const LABEL = {
  on: 'on for this browser',
  off: 'off',
  blocked: 'blocked in your browser',
  unsupported: 'not supported here',
};

// Turning notifications on is a choice somebody makes, so nothing is ever asked for on
// page load. With the tab open a notice appears through the page; with the tab closed it
// arrives through the browser's push service.
export default function PushToggle() {
  const [state, setState] = useState('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    pushState().then((value) => {
      if (alive) setState(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  const turnOn = async () => {
    setBusy(true);
    try {
      await enablePush();
      setState(await pushState());
      toast.success('Notifications are on for this browser.');
    } catch (err) {
      toast.error(err?.message || 'We could not turn notifications on.');
      setState(await pushState());
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await disablePush();
      setState(await pushState());
      toast.success('Notifications are off for this browser.');
    } catch (err) {
      toast.error(err?.message || 'We could not turn notifications off.');
    } finally {
      setBusy(false);
    }
  };

  const on = state === 'on';

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-500'}`}>
          {on ? <BellRing className="h-4.5 w-4.5" /> : <BellOff className="h-4.5 w-4.5" />}
        </span>
        <div>
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
            Notifications on this browser
            <Badge tone={TONE[state] ?? 'neutral'}>{LABEL[state] ?? 'checking…'}</Badge>
          </p>
          <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-slate-500">
            {state === 'blocked'
              ? 'Your browser is blocking notifications for this site. Allow them in the browser settings, then try again.'
              : 'Notices reach you while the portal is open in a tab, and also when it is closed, through your browser.'}
          </p>
        </div>
      </div>

      {state === 'unsupported' ? null : on ? (
        <Button variant="secondary" size="sm" onClick={turnOff} loading={busy}>
          Turn off
        </Button>
      ) : state === 'blocked' ? (
        <Badge tone="warning">
          <LockKeyhole className="h-3.5 w-3.5" />
          Allow in browser settings
        </Badge>
      ) : (
        <Button size="sm" onClick={turnOn} loading={busy || state === 'loading'}>
          Turn on
        </Button>
      )}
    </div>
  );
}
