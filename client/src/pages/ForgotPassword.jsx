import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, KeyRound, Lock, Mail } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import CodeInput from '../components/ui/CodeInput';
import { api, errorMessage } from '../lib/api';

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email address.') });

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Use at least 8 characters.')
      .max(128, 'That password is too long.')
      .regex(/[A-Za-z]/, 'Add at least one letter.')
      .regex(/[0-9]/, 'Add at least one number.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The two passwords do not match.' });

const STEPS = { email: 1, code: 2, password: 3 };

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const emailForm = useForm({ resolver: zodResolver(emailSchema), defaultValues: { email: '' } });
  const passwordForm = useForm({ resolver: zodResolver(passwordSchema), defaultValues: { password: '', confirm: '' } });

  const requestCode = async (values) => {
    setError(null);
    try {
      await api.post('/auth/forgot-password', { email: values.email });
      setEmail(values.email);
      setCode('');
      setWait(60);
      setStep('code');
      toast.success('If that email has an account, a code is on its way.');
    } catch (err) {
      setError(errorMessage(err));
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
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    try {
      await api.post('/auth/forgot-password', { email });
      setWait(60);
      toast.success('We sent a new code.');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const savePassword = async (values) => {
    setError(null);
    try {
      const { data } = await api.post('/auth/reset-password', { resetToken, newPassword: values.password });
      toast.success(data.message || 'Password changed.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      if (err?.response?.data?.code === 'TICKET_INVALID') {
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
    email: ['Reset your password', 'Tell us the email address on your account and we will send a 6-digit code.'],
    code: ['Enter your code', `We sent a 6-digit code to ${email}. It works for 5 minutes.`],
    password: ['Choose a new password', 'This also signs you out on every device, including this one.'],
  };

  return (
    <AuthLayout
      title={titles[step][0]}
      subtitle={titles[step][1]}
      footer={
        step === 'email' ? (
          <span>
            Remembered it?{' '}
            <Link to="/login" className="focus-ring rounded-lg font-semibold text-brand-600 hover:text-brand-700">
              Back to sign in
            </Link>
          </span>
        ) : (
          <button type="button" onClick={back} className="focus-ring inline-flex items-center gap-1.5 rounded-lg font-semibold text-brand-600 hover:text-brand-700">
            <ArrowLeft className="h-4 w-4" />
            Go back
          </button>
        )
      }
    >
      <div className="mb-6 flex items-center gap-2">
        {Object.values(STEPS).map((n) => (
          <span key={n} className={`h-1.5 flex-1 rounded-full transition ${STEPS[step] >= n ? 'brand-gradient' : 'bg-slate-200'}`} />
        ))}
      </div>

      {error ? <Alert tone="danger" className="mb-4">{error}</Alert> : null}

      {step === 'email' ? (
        <form onSubmit={emailForm.handleSubmit(requestCode)} className="space-y-4" noValidate>
          <Field
            label="Email address"
            type="email"
            icon={Mail}
            autoComplete="email"
            placeholder="you@school.edu.et"
            error={emailForm.formState.errors.email?.message}
            {...emailForm.register('email')}
          />
          <Button type="submit" size="lg" loading={emailForm.formState.isSubmitting} className="w-full">
            Send code
          </Button>
        </form>
      ) : null}

      {step === 'code' ? (
        <div className="space-y-5">
          <CodeInput value={code} onChange={setCode} disabled={busy} />
          <Button onClick={verifyCode} size="lg" loading={busy} disabled={code.length !== 6} className="w-full">
            Verify code
          </Button>
          <div className="text-center text-sm text-slate-500">
            {wait > 0 ? <span>You can ask for another code in {wait}s.</span> : (
              <button type="button" onClick={resend} className="focus-ring rounded-lg font-semibold text-brand-600 hover:text-brand-700">
                Send a new code
              </button>
            )}
          </div>
        </div>
      ) : null}

      {step === 'password' ? (
        <form onSubmit={passwordForm.handleSubmit(savePassword)} className="space-y-4" noValidate>
          <Field
            label="New password"
            type="password"
            icon={Lock}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            error={passwordForm.formState.errors.password?.message}
            {...passwordForm.register('password')}
          />
          <Field
            label="Confirm new password"
            type="password"
            icon={KeyRound}
            autoComplete="new-password"
            placeholder="Type it again"
            error={passwordForm.formState.errors.confirm?.message}
            {...passwordForm.register('confirm')}
          />
          <Button type="submit" size="lg" loading={passwordForm.formState.isSubmitting} className="w-full">
            Save new password
          </Button>
        </form>
      ) : null}
    </AuthLayout>
  );
}
