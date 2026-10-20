import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, CircleCheck, KeyRound, Lock, Mail, TriangleAlert } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import CodeInput from '../components/ui/CodeInput';
import PasswordMeter from '../components/ui/PasswordMeter';
import Turnstile, { turnstileEnabled } from '../components/ui/Turnstile';
import { api, errorMessage } from '../lib/api';
import { emailOnlySchema, resetPasswordSchema, emailField } from '../lib/validation';
import { FLOW_KEYS, clearFlow, readFlow, writeFlow } from '../lib/session-flow';
import useResendTimer, { formatWait } from '../lib/useResendTimer';

const STEPS = { email: 1, code: 2, password: 3 };

// The journey is kept in sessionStorage, so a refresh in the middle of it — while a
// code is valid, or after it has been accepted — carries on from where it was.
export default function ForgotPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // An administrator can send a reset link. That link already carries a reset ticket,
  // so it goes straight to choosing the new password and skips the code steps.
  const linkToken = params.get('token');
  // Read once on mount: whatever the last refresh left behind.
  const [saved] = useState(() => readFlow(FLOW_KEYS.reset));

  const [step, setStep] = useState(linkToken ? 'password' : saved?.step ?? 'email');
  const [email, setEmail] = useState(saved?.email ?? '');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState(linkToken ?? saved?.resetToken ?? null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [error, setError] = useState(null);
  const timer = useResendTimer('forgot-password');

  // Two widgets, because a token is single use and the code step can ask for another
  // code after the first one has already been spent.
  const [emailToken, setEmailToken] = useState('');
  const [emailKey, setEmailKey] = useState(0);
  const [codeToken, setCodeToken] = useState('');
  const [codeKey, setCodeKey] = useState(0);

  const freshEmailCheck = () => {
    setEmailToken('');
    setEmailKey((n) => n + 1);
  };
  const freshCodeCheck = () => {
    setCodeToken('');
    setCodeKey((n) => n + 1);
  };

  const emailOk = email.length > 0 && emailField.safeParse(email).success;

  const emailForm = useForm({
    resolver: zodResolver(emailOnlySchema),
    mode: 'onTouched',
    defaultValues: { email: saved?.email ?? '' },
  });
  const passwordForm = useForm({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onTouched',
    defaultValues: { password: '', confirm: '' },
  });

  const password = useWatch({ control: passwordForm.control, name: 'password' }) ?? '';
  const confirm = useWatch({ control: passwordForm.control, name: 'confirm' }) ?? '';
  const matches = confirm.length > 0 && password === confirm;

  // Remember the step for the next refresh.
  useEffect(() => {
    if (step === 'email') clearFlow(FLOW_KEYS.reset);
    else writeFlow(FLOW_KEYS.reset, { step, email, resetToken: resetToken ?? null });
  }, [step, email, resetToken]);

  const requestCode = async (values) => {
    setError(null);
    try {
      await api.post(
        '/auth/forgot-password',
        { email: values.email },
        emailToken ? { headers: { 'cf-turnstile-response': emailToken } } : undefined,
      );
      setEmail(values.email);
      setCode('');
      timer.start();
      setStep('code');
      toast.success('If that email has an account, a code is on its way.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      // The request spends the token whether it succeeds or fails.
      if (turnstileEnabled) freshEmailCheck();
    }
  };

  const verifyCode = async () => {
    setError(null);
    setBusy(true);
    try {
      const { data } = await api.post('/auth/verify-reset-code', { email, code });
      setResetToken(data.resetToken);
      setStep('password');
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

  const resend = async () => {
    setError(null);
    try {
      await api.post(
        '/auth/forgot-password',
        { email },
        codeToken ? { headers: { 'cf-turnstile-response': codeToken } } : undefined,
      );
      timer.start();
      toast.success('We sent a new code.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      // The resend widget stays on screen, so replace the spent token before the next try.
      if (turnstileEnabled) freshCodeCheck();
    }
  };

  const savePassword = async (values) => {
    setError(null);
    try {
      const { data } = await api.post('/auth/reset-password', { resetToken, newPassword: values.password });
      clearFlow(FLOW_KEYS.reset);
      timer.clear();
      toast.success(data.message || 'Password changed.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      if (err?.response?.data?.code === 'TICKET_INVALID') {
        clearFlow(FLOW_KEYS.reset);
        timer.clear();
        setStep('email');
        setResetToken(null);
      }
    }
  };

  const back = () => {
    setError(null);
    setStep(step === 'password' ? 'code' : 'email');
  };

  const titles = {
    email: ['Reset your password', null],
    code: ['Enter your code', `Sent to ${email}`],
    password: ['Choose a new password', 'You will be signed out on every device.'],
  };

  return (
    <AuthLayout
      title={titles[step][0]}
      subtitle={titles[step][1]}
      footer={
        step === 'email' || linkToken ? (
          <span>
            Remembered it?{' '}
            <Link to="/login" className="focus-ring rounded-lg font-semibold text-brand-600 hover:text-brand-700">
              Back to sign in
            </Link>
          </span>
        ) : (
          <button
            type="button"
            onClick={back}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg font-semibold text-brand-600 hover:text-brand-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Go back
          </button>
        )
      }
    >
      <div className="mb-6 flex items-center gap-2">
        {Object.values(STEPS).map((n) => (
          <span
            key={n}
            className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${STEPS[step] >= n ? 'brand-gradient' : 'bg-slate-200'}`}
          />
        ))}
      </div>

      {error ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}

      {step === 'email' ? (
        <form onSubmit={emailForm.handleSubmit(requestCode)} className="space-y-4" noValidate>
          <Field
            label="Gmail address"
            type="email"
            icon={Mail}
            autoComplete="email"
            placeholder="you@gmail.com"
            status={emailOk ? 'ok' : undefined}
            hint="Must end with @gmail.com"
            error={emailForm.formState.errors.email?.message}
            {...emailForm.register('email')}
          />
          <Button type="submit" size="lg" loading={emailForm.formState.isSubmitting} className="w-full">
            Send code
          </Button>
          <Turnstile
            key={emailKey}
            onToken={setEmailToken}
            className="flex min-h-[65px] justify-center"
          />
        </form>
      ) : null}

      {step === 'code' ? (
        <div className="space-y-5">
          <CodeInput value={code} onChange={setCode} disabled={busy} shake={shake} />

          <Button onClick={verifyCode} size="lg" loading={busy} disabled={code.length !== 6} className="w-full">
            Verify code
          </Button>

          <div className="text-center text-sm text-slate-500">
            {timer.left > 0 ? (
              <span>You can ask for another code in {formatWait(timer.left)}.</span>
            ) : (
              <button type="button" onClick={resend} className="focus-ring rounded-lg font-semibold text-brand-600 hover:text-brand-700">
                Send a new code
              </button>
            )}
          </div>

          <Turnstile key={codeKey} onToken={setCodeToken} className="flex min-h-[65px] justify-center" />
        </div>
      ) : null}

      {step === 'password' ? (
        <form onSubmit={passwordForm.handleSubmit(savePassword)} className="space-y-4" noValidate>
          {linkToken ? (
            <Alert tone="info">You opened a reset link sent by your administrator. Choose a new password below.</Alert>
          ) : null}
          <Field
            label="New password"
            type="password"
            icon={Lock}
            autoComplete="new-password"
            placeholder="Choose a new password"
            error={passwordForm.formState.errors.password?.message}
            {...passwordForm.register('password')}
          >
            <PasswordMeter value={password} className="mt-3" />
          </Field>

          <Field
            label="Repeat new password"
            type="password"
            icon={KeyRound}
            autoComplete="new-password"
            placeholder="Type it again"
            error={confirm.length === 0 ? passwordForm.formState.errors.confirm?.message : undefined}
            {...passwordForm.register('confirm')}
          >
            {confirm.length > 0 ? (
              <p
                className={`animate-rise mt-1.5 flex items-center gap-1.5 text-xs font-semibold ${
                  matches ? 'text-emerald-600' : 'text-rose-500'
                }`}
              >
                {matches ? <CircleCheck className="animate-pop h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
                {matches ? 'Passwords match' : 'Passwords do not match'}
              </p>
            ) : null}
          </Field>

          <Button type="submit" size="lg" loading={passwordForm.formState.isSubmitting} className="w-full">
            Save new password
          </Button>
        </form>
      ) : null}
    </AuthLayout>
  );
}
