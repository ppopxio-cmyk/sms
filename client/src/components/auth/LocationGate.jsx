import { MapPin, ShieldCheck, TriangleAlert } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

// Shown before the sign-in button can be pressed. The browser's own permission dialog is
// the real gate; this explains why it is being asked for, and gives somebody who refuses a
// way to continue with the network's approximate answer instead of being locked out.
export default function LocationGate({ open, state, onAllow, onNotNow, onUseNetwork }) {
  const asking = state === 'asking';
  const refused = state === 'denied';
  const unsupported = state === 'unavailable';

  return (
    <Modal
      open={open}
      dismissible={false}
      size="sm"
      title={refused ? 'Location is needed to sign in' : unsupported ? 'Location is unavailable' : 'Allow location?'}
      subtitle={
        refused
          ? 'Your browser refused the request. You can try again, or continue and we will record the network location instead.'
          : unsupported
            ? 'This browser could not tell us where you are. You can continue and we will record the network location instead.'
            : 'Each sign-in records where it came from, so you can spot one that was not you.'
      }
    >
      <div className="space-y-5">
        <div
          className={`flex items-start gap-3 rounded-2xl px-4 py-3.5 text-sm leading-relaxed ${
            refused || unsupported ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-600'
          }`}
        >
          {refused || unsupported ? (
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          ) : (
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
          )}
          <p>
            {refused || unsupported
              ? 'Without it, the place on your sign-in record will come from your network and is only approximate.'
              : 'Your browser will ask for permission. The place is kept with the sign-in record — never the coordinates, and it is not used for anything else.'}
          </p>
        </div>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
          If you refuse, you can still sign in — that record will simply say “estimated”.
        </p>

        <div className="flex flex-wrap justify-end gap-3">
          {refused || unsupported ? (
            <>
              <Button variant="secondary" onClick={onUseNetwork}>
                Sign in with network location
              </Button>
              <Button onClick={onAllow}>Try again</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onNotNow} disabled={asking}>
                Not now
              </Button>
              <Button onClick={onAllow} loading={asking}>
                Allow location
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
