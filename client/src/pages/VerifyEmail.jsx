import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Mail, MailCheck } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import CodeInput from '../components/ui/CodeInput';
import { api, errorMessage } from '../lib/api';

const RESEND_SECONDS = 60;

export default function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(location.state?.email ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = async () => {
    setError(null);
    try {
      await api.post('/auth/resend-verification', { email });
      setWait(RESEND_SECONDS);
      toast.success('If that account still needs confirming, a new code is on its way.');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data } = await api.post('/auth/verify-email', { email, code });
      toast.success(data.message || 'Email confirmed.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Confirm your email"
      subtitle="Enter the 6-digit code we sent you. It works for 5 minutes."
      footer={
        <span>
          Wrong address?{' '}
          <Link to="/register" className="focus-ring rounded-lg font-semibold text-brand-600 hover:text-brand-700">
            Start again
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}

        {!location.state?.email ? (
          <Field
            label="Email address"
            type="email"
            icon={Mail}
            autoComplete="email"
            placeholder="you@school.edu.et"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        ) : (
          <div className="flex items-center gap-2.5 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <MailCheck className="h-4 w-4 shrink-0 text-brand-500" />
            <span>
              Code sent to <span className="font-semibold text-slate-800">{email}</span>
            </span>
          </div>
        )}

        <CodeInput value={code} onChange={setCode} disabled={busy} />

        <Button type="submit" size="lg" loading={busy} disabled={code.length !== 6 || !email} className="w-full">
          Confirm email
        </Button>

        <div className="text-center text-sm text-slate-500">
          {wait > 0 ? (
            <span>You can ask for another code in {wait}s.</span>
          ) : (
            <button type="button" onClick={send} disabled={!email} className="focus-ring rounded-lg font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50">
              Send a new code
            </button>
          )}
        </div>
      </form>
    </AuthLayout>
  );
}
