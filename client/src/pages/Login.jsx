import { useState } from 'react';
import { Navigate, Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Lock, Mail, MapPin } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import CodeInput from '../components/ui/CodeInput';
import Turnstile, { turnstileEnabled } from '../components/ui/Turnstile';
import LocationGate from '../components/auth/LocationGate';
import { api, applyLocationHeader, errorMessage } from '../lib/api';
import { loginSchema, emailField } from '../lib/validation';
import { FLOW_KEYS, clearFlow, writeFlow } from '../lib/session-flow';
import { homeFor } from '../lib/roles';
import useResendTimer, { formatWait } from '../lib/useResendTimer';
import { readLocation, saveLocation } from '../lib/location';
import { useAuth } from '../store/auth';

export default function Login() {
  const setSession = useAuth((s) => s.setSession);
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const adminEntry = params.get('admin') === '1';

  // The public status endpoint is deliberately tiny. It lets a closed portal send people
  // to the maintenance note before they spend time typing a password. `/login?admin=1`
  // is the recovery door for an administrator.
  const system = useQuery({
    queryKey: ['system-status'],
    queryFn: async () => (await api.get('/status')).data,
    staleTime: 30_000,
    refetchOnMount: 'always',
    retry: 0,
  });
  const maintenance = system.data?.maintenance;

  const [step, setStep] = useState('password');
  const [ticket, setTicket] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(0);
  const [serverError, setServerError] = useState(null);
  const [unverified, setUnverified] = useState(null);
  const [locked, setLocked] = useState(false);

  // The sign-in button stays disabled until the browser has shared a place, or the person
  // has chosen the network estimate instead. A place allowed earlier in this tab is reused.
  const [locationMode, setLocationMode] = useState(() => (readLocation() ? 'device' : null));
  const [gate, setGate] = useState(() => (readLocation() ? 'closed' : 'ask'));

  const [captcha, setCaptcha] = useState('');
  const [captchaKey, setCaptchaKey] = useState(0);

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

  const canSubmit = Boolean(locationMode) && (!turnstileEnabled || Boolean(captcha));

  const askForLocation = () => {
    if (!('geolocation' in navigator)) {
      setGate('unavailable');
      return;
    }
    setGate('asking');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const shared = { lat: position.coords.latitude, lon: position.coords.longitude };
        saveLocation(shared);
        applyLocationHeader(shared);
        setLocationMode('device');
        setGate('closed');
        toast.success('Location allowed for this sign-in.');
      },
      (error) => setGate(error?.code === 1 ? 'denied' : 'unavailable'),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 },
    );
  };

  const useNetwork = () => {
    setLocationMode('network');
    setGate('closed');
  };

  const finish = (data, greeting) => {
    clearFlow(FLOW_KEYS.pendingVerify);
    setSession(data);
    toast.success(greeting);
    navigate(location.state?.from || homeFor(data.user.role), { replace: true });
  };

  const onSubmit = async (values) => {
    if (!canSubmit) return;
    setServerError(null);
    setUnverified(null);
    setLocked(false);
    try {
      const headers = captcha ? { 'cf-turnstile-response': captcha } : undefined;
      const { data } = await api.post('/auth/login', values, { headers });
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
      if (code === 'MAINTENANCE') {
        navigate('/maintenance', { replace: true });
        return;
      }
      if (code === 'EMAIL_NOT_VERIFIED' || code === 'ACCOUNT_NOT_SET_UP') {
        const target = err.response.data?.data?.email || getValues('email');
        setUnverified(target);
        // Remember where the link went, so a refresh of the confirm page still knows.
        writeFlow(FLOW_KEYS.pendingVerify, { email: target });
        verifyTimer.start();
      }
      if (code === 'ACCOUNT_LOCKED') setLocked(true);
      setServerError(errorMessage(err, 'We could not sign you in.'));
    } finally {
      // Cloudflare spends a token as soon as the server checks it, even when the password
      // step succeeds and a sign-in code follows. Always replace the widget so going back
      // to the password step cannot submit a token that has already been used.
      if (turnstileEnabled) {
        setCaptcha('');
        setCaptchaKey((n) => n + 1);
      }
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
      if (err?.response?.data?.code === 'MAINTENANCE') {
        navigate('/maintenance', { replace: true });
        return;
      }
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
      if (err?.response?.data?.code === 'MAINTENANCE') {
        navigate('/maintenance', { replace: true });
        return;
      }
      setServerError(errorMessage(err));
    }
  };

  if (maintenance?.enabled && !adminEntry) {
    return <Navigate to="/maintenance" replace />;
  }

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
      <LocationGate
        open={gate !== 'closed'}
        state={gate}
        onAllow={askForLocation}
        onNotNow={() => setGate('denied')}
        onUseNetwork={useNetwork}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {maintenance?.enabled && adminEntry ? (
          <Alert tone="warning" title="Maintenance mode is on">
            Only administrators can sign in while the portal is closed.
          </Alert>
        ) : null}

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

        <Turnstile
          key={captchaKey}
          onToken={setCaptcha}
          className="flex min-h-[65px] justify-center"
        />

        <Button
          type="submit"
          size="lg"
          loading={isSubmitting}
          disabled={!canSubmit}
          className="btn-shine relative w-full overflow-hidden"
        >
          Sign in
        </Button>

        {locationMode === 'device' ? (
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
            <MapPin className="h-3.5 w-3.5 text-emerald-500" />
            This sign-in records this device’s place.
          </p>
        ) : locationMode === 'network' ? (
          <p className="flex flex-wrap items-center justify-center gap-1.5 text-center text-xs text-slate-400">
            <MapPin className="h-3.5 w-3.5 text-amber-500" />
            Recording an approximate place from your network.
            <button
              type="button"
              onClick={() => setGate('ask')}
              className="focus-ring rounded font-semibold text-brand-600 hover:text-brand-700"
            >
              Allow location instead
            </button>
          </p>
        ) : (
          <p className="text-center text-xs font-medium text-slate-500">
            Allow location above to turn on sign-in.
          </p>
        )}
      </form>
    </AuthLayout>
  );
}
