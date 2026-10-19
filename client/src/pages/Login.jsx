import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, Lock, Mail } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import CodeInput from '../components/ui/CodeInput';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../store/auth';

const schema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

export default function Login() {
  const setSession = useAuth((s) => s.setSession);
  const navigate = useNavigate();
  const location = useLocation();

  const [step, setStep] = useState('password');
  const [ticket, setTicket] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [unverified, setUnverified] = useState(null);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  const finish = (data, greeting) => {
    setSession(data);
    toast.success(greeting);
    navigate(location.state?.from || '/dashboard', { replace: true });
  };

  const onSubmit = async (values) => {
    setServerError(null);
    setUnverified(null);
    try {
      const { data } = await api.post('/auth/login', values);
      if (data.requires2fa) {
        setTicket(data.ticket);
        setCode('');
        setStep('code');
        toast.info('We emailed you a 6-digit sign-in code.');
        return;
      }
      finish(data, `Welcome back, ${data.user.name.split(' ')[0]}.`);
    } catch (err) {
      if (err?.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
        setUnverified(err.response.data?.data?.email || getValues('email'));
      }
      setServerError(errorMessage(err, 'We could not sign you in.'));
    }
  };

  const onVerify = async () => {
    setServerError(null);
    setBusy(true);
    try {
      const { data } = await api.post('/auth/login/verify', { ticket, code });
      finish(data, 'Signed in.');
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setServerError(null);
    try {
      await api.post('/auth/login/resend', { ticket });
      toast.success('We sent a new code.');
    } catch (err) {
      setServerError(errorMessage(err));
    }
  };

  if (step === 'code') {
    return (
      <AuthLayout
        title="Enter your code"
        subtitle="For your security this account uses a second step. The code works for 5 minutes."
        footer={
          <button type="button" onClick={() => setStep('password')} className="focus-ring inline-flex items-center gap-1.5 rounded-lg font-semibold text-brand-600 hover:text-brand-700">
            <ArrowLeft className="h-4 w-4" />
            Use a different account
          </button>
        }
      >
        <div className="space-y-5">
          {serverError ? <Alert tone="danger">{serverError}</Alert> : null}
          <CodeInput value={code} onChange={setCode} disabled={busy} />
          <div className="flex items-center gap-3 text-sm">
            <Button onClick={onVerify} loading={busy} disabled={code.length !== 6} className="flex-1">
              Verify and sign in
            </Button>
            <Button variant="ghost" onClick={resend}>
              Resend
            </Button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in with the email address your school registered for you."
      footer={
        <span>
          No account yet?{' '}
          <Link to="/register" className="focus-ring rounded-lg font-semibold text-brand-600 hover:text-brand-700">
            Create one
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {serverError ? <Alert tone="danger">{serverError}</Alert> : null}
        {unverified ? (
          <Alert tone="info" title="Confirm your email first">
            We sent a fresh code to {unverified}.{' '}
            <Link to="/verify-email" state={{ email: unverified }} className="focus-ring rounded font-semibold underline">
              Enter it now
            </Link>
            .
          </Alert>
        ) : null}

        <Field
          label="Email address"
          type="email"
          icon={Mail}
          autoComplete="email"
          placeholder="you@school.edu.et"
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

        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
