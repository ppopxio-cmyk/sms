import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { MailCheck } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import CodeInput from '../components/ui/CodeInput';
import { api, errorMessage } from '../lib/api';
import { FLOW_KEYS, clearFlow, readFlow } from '../lib/session-flow';
import useResendTimer, { formatWait } from '../lib/useResendTimer';

export default function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const [flow] = useState(() => readFlow(FLOW_KEYS.pendingVerify));
  // The address comes from the sign-in attempt that sent the code. Nothing else can
  // get here, which is why a stray visit is sent straight to the sign-in page.
  const email = location.state?.email ?? flow?.email ?? '';

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [shake, setShake] = useState(0);
  const [error, setError] = useState(null);
  const timer = useResendTimer('verify-email');

  if (!email) return <Navigate to="/login" replace />;

  const send = async () => {
    setError(null);
    setSending(true);
    try {
      await api.post('/auth/resend-verification', { email });
      timer.start();
      toast.success('A new code is on its way.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data } = await api.post('/auth/verify-email', { email, code });
      clearFlow(FLOW_KEYS.pendingVerify);
      timer.clear();
      toast.success(data.message || 'Email confirmed.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      if (err?.response?.data?.code === 'CODE_WRONG') {
        setCode('');
        setShake((n) => n + 1);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Confirm your email"
      footer={
        <span>
          Already confirmed?{' '}
          <Link to="/login" className="focus-ring rounded-lg font-semibold text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <div className="animate-rise flex items-center gap-2.5 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <MailCheck className="animate-pop h-4 w-4 shrink-0 text-brand-500" />
          <span>
            Code sent to <span className="font-semibold text-slate-800">{email}</span>
          </span>
        </div>

        <CodeInput value={code} onChange={setCode} disabled={busy} shake={shake} />

        <Button type="submit" size="lg" loading={busy} disabled={code.length !== 6} className="w-full">
          Confirm email
        </Button>

        <div className="text-center text-sm text-slate-500">
          {timer.left > 0 ? (
            <span>You can ask for another code in {formatWait(timer.left)}.</span>
          ) : (
            <button
              type="button"
              onClick={send}
              disabled={sending}
              className="focus-ring rounded-lg font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50"
            >
              Send a new code
            </button>
          )}
        </div>
      </form>
    </AuthLayout>
  );
}
