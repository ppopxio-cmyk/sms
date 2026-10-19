import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, Lock, Mail } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import CodeInput from '../components/ui/CodeInput';
import { api, errorMessage } from '../lib/api';
import { loginSchema, emailField } from '../lib/validation';
import { FLOW_KEYS, clearFlow, writeFlow } from '../lib/session-flow';
import { homeFor } from '../lib/roles';
import useResendTimer, { formatWait } from '../lib/useResendTimer';
import { useAuth } from '../store/auth';

export default function Login() {
  const setSession = useAuth((s) => s.setSession);
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState('password');
  const [ticket, setTicket] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [serverError, setServerError] = useState(null);
  const [unverified, setUnverified] = useState(null);
  const [locked, setLocked] = useState(false);

  // One countdown per journey, kept in sessionStorage so a refresh does not restart it.
  const loginTimer = useResendTimer('login');
  const verifyTimer = useResendTimer('verify-email');

  const {
    register,
    handleSubmit,
    getValues,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
    // Finishing a brand new account lands here with the address already known.
    defaultValues: { email: location.state?.email ?? '', password: '' },
  });

  const email = useWatch({ control, name: 'email' }) ?? '';
  const emailOk = email.length > 0 && emailField.safeParse(email).success;

  const finish = (data, greeting) => {
    clearFlow(FLOW_KEYS.pendingVerify);
    setSession(data);
    toast.success(greeting);
    navigate(location.state?.from || homeFor(data.user.role), { replace: true });
  };

  const onSubmit = async (values) => {
    setServerError(null);
    setUnverified(null);
    setLocked(false);
    try {
      const { data } = await api.post('/auth/login', values);
      if (data.requires2fa) {
        setTicket(data.ticket);
        setCode('');
        setStep('code');
        loginTimer.start();
        toast.info(
          data.reason === 'newDevice'
            ? 'This browser is new, so we emailed you a code.'
            : 'We emailed you a 6-digit sign-in code.',
        );
        return;
      }
      finish(data, `Welcome back, ${data.user.name.split(' ')[0]}.`);
    } catch (err) {
      const code = err?.response?.data?.code;
      if (code === 'EMAIL_NOT_VERIFIED' || code === 'ACCOUNT_NOT_SET_UP') {
        const target = err.response.data?.data?.email || getValues('email');
        setUnverified(target);
        // Remember where the link went, so a refresh of the confirm page still knows.
        writeFlow(FLOW_KEYS.pendingVerify, { email: target });
        verifyTimer.start();
      }
      if (code === 'ACCOUNT_LOCKED') setLocked(true);
      setServerError(errorMessage(err, 'We could not sign you in.'));
    }
  };

  const onVerify = async () => {
    setServerError(null);
    setBusy(true);
    try {
      const { data } = await api.post('/auth/login/verify', { ticket, code });
      loginTimer.clear();
      finish(data, 'Signed in.');
    } catch (err) {
      setServerError(errorMessage(err));
      if (err?.response?.data?.code === 'CODE_WRONG') {
        setCode('');
        setShake((n) => n + 1);
      }
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setServerError(null);
    try {
      await api.post('/auth/login/resend', { ticket });
      loginTimer.start();
      toast.success('We sent a new code.');
    } catch (err) {
      setServerError(errorMessage(err));
    }
  };

  if (step === 'code') {
    return (
      <AuthLayout
        title="Enter your code"
        subtitle="Enter the 6-digit code we emailed you."
        footer={
          <button
            type="button"
            onClick={() => setStep('password')}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg font-semibold text-brand-600 hover:text-brand-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Use a different account
          </button>
        }
      >
        <div className="space-y-5">
          {serverError ? <Alert tone="danger">{serverError}</Alert> : null}

          <CodeInput value={code} onChange={setCode} disabled={busy} shake={shake} />

          <div className="flex items-center gap-3">
            <Button onClick={onVerify} loading={busy} disabled={code.length !== 6} className="flex-1">
              Verify and sign in
            </Button>
            <Button variant="ghost" onClick={resend} disabled={busy || loginTimer.left > 0}>
              {loginTimer.left > 0 ? formatWait(loginTimer.left) : 'Resend'}
            </Button>
          </div>

          {loginTimer.left > 0 ? (
            <p className="text-center text-xs text-slate-400">You can ask for another code in {formatWait(loginTimer.left)}.</p>
          ) : null}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Welcome back"
      footer={<span>Accounts are created by your school administrator.</span>}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {serverError ? <Alert tone="danger">{serverError}</Alert> : null}

        {unverified ? (
          <Alert tone="info" title="Open the link we emailed you">
            We sent a link to {unverified}.{' '}
            <Link
              to="/verify-email"
              state={{ email: unverified }}
              className="focus-ring rounded font-semibold underline"
            >
              Open the confirmation page
            </Link>
            .
          </Alert>
        ) : null}

        {locked ? (
          <Alert tone="warning" title="Account locked for a moment">
            Too many wrong attempts.{' '}
            <Link to="/forgot-password" className="focus-ring rounded font-semibold underline">
              Reset your password
            </Link>{' '}
            to get back in sooner.
          </Alert>
        ) : null}

        <Field
          label="Gmail address"
          type="email"
          icon={Mail}
          autoComplete="email"
          placeholder="you@gmail.com"
          status={emailOk ? 'ok' : undefined}
          hint="Must end with @gmail.com"
          error={errors.email?.message}
          {...register('email')}
        />

        <Field
          label="Password"
          type="password"
          icon={Lock}
          autoComplete="current-password"
          placeholder="Your password"
          error={errors.password?.message}
          {...register('password')}
        />

        <div className="flex justify-end">
          <Link to="/forgot-password" className="focus-ring rounded-lg text-sm font-medium text-brand-600 hover:text-brand-700">
            Forgot your password?
          </Link>
        </div>

        <Button
          type="submit"
          size="lg"
          loading={isSubmitting}
          className="btn-shine relative w-full overflow-hidden"
        >
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
