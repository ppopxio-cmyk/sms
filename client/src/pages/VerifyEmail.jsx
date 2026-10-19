import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CircleCheck, LoaderCircle, MailCheck, MailWarning, TriangleAlert } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import { api, errorMessage } from '../lib/api';
import { FLOW_KEYS, clearFlow, readFlow } from '../lib/session-flow';
import useResendTimer, { formatWait } from '../lib/useResendTimer';

// Confirming an email is done by opening the link we emailed. There is no code to type.
// A visit without a token - somebody who typed the address, or an old bookmark - is sent
// to the sign-in page, where asking to sign in sends a fresh link.
export default function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [flow] = useState(() => readFlow(FLOW_KEYS.pendingVerify));
  const email = location.state?.email ?? flow?.email ?? '';

  const [state, setState] = useState(token ? 'verifying' : 'waiting');
  const [message, setMessage] = useState(null);
  const [sending, setSending] = useState(false);
  const started = useRef(false);
  const { left, start, clear } = useResendTimer('verify-email');

  useEffect(() => {
    if (!token || started.current) return;
    // The link works exactly once, so a second attempt in the same visit (React calls
    // effects twice while developing) must not be allowed to use it again.
    started.current = true;

    (async () => {
      try {
        const { data } = await api.post('/auth/verify-email', { token });
        setMessage(data?.message || 'Email confirmed.');
        setState('done');
        clearFlow(FLOW_KEYS.pendingVerify);
        clear();
        toast.success('Your email is confirmed.');
        navigate('/verify-email', { replace: true });
      } catch (err) {
        setMessage(errorMessage(err, 'That link could not be used.'));
        setState('error');
      }
    })();
  }, [token, clear, navigate]);

  // Nothing to confirm and nobody to confirm for: go and sign in.
  if (state === 'waiting' && !email) return <Navigate to="/login" replace />;

  const send = async () => {
    setMessage(null);
    setSending(true);
    try {
      await api.post('/auth/resend-verification', { email });
      start();
      toast.success('A new link is on its way.');
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  if (state === 'verifying') {
    return (
      <AuthLayout title="Confirming your email" subtitle="One moment while we check that link.">
        <div className="flex flex-col items-center gap-4 py-6">
          <LoaderCircle className="h-10 w-10 animate-spin text-brand-500" />
          <p className="text-sm text-slate-500">This only takes a second.</p>
        </div>
      </AuthLayout>
    );
  }

  if (state === 'done') {
    return (
      <AuthLayout title="Email confirmed" subtitle={message} footer={null}>
        <div className="space-y-5">
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-emerald-50 px-6 py-8 text-center ring-1 ring-emerald-100">
            <span className="animate-pop flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm">
              <CircleCheck className="h-7 w-7" />
            </span>
            <p className="text-base font-semibold text-emerald-800">Your account is ready.</p>
            <p className="max-w-sm text-sm leading-relaxed text-emerald-700">
              Sign in with the password you were given, and you will choose your own straight away.
            </p>
          </div>

          <Button size="lg" className="w-full" onClick={() => navigate('/login', { replace: true })}>
            Go to sign in
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={state === 'error' ? 'That link did not work' : 'Confirm your email'}
      subtitle={state === 'error' ? null : 'We sent you a link to finish setting up your account.'}
      footer={
        <span>
          Already confirmed?{' '}
          <Link to="/login" className="focus-ring rounded-lg font-semibold text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </span>
      }
    >
      <div className="space-y-5">
        {state === 'error' ? (
          <Alert tone="danger" title="The link has expired or was already used">
            {message} Sign in again and we will email you a fresh link.
          </Alert>
        ) : (
          <div className="animate-rise flex items-center gap-2.5 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {left > 0 ? (
              <MailCheck className="animate-pop h-4 w-4 shrink-0 text-brand-500" />
            ) : (
              <MailWarning className="h-4 w-4 shrink-0 text-amber-500" />
            )}
            <span>
              Link sent to <span className="font-semibold text-slate-800">{email}</span>
            </span>
          </div>
        )}

        {message && state === 'waiting' ? <Alert tone="danger">{message}</Alert> : null}

        {state === 'error' ? (
          <Button size="lg" className="w-full" onClick={() => navigate('/login', { replace: true })}>
            Back to sign in
          </Button>
        ) : (
          <>
            <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              Open the link in this browser. It works once, and only for a few hours.
            </p>

            <div className="text-center text-sm text-slate-500">
              {left > 0 ? (
                <span>You can ask for another link in {formatWait(left)}.</span>
              ) : (
                <button
                  type="button"
                  onClick={send}
                  disabled={sending}
                  className="focus-ring rounded-lg font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50"
                >
                  Send a new link
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
