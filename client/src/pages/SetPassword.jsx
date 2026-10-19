import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { CircleCheck, KeyRound, Lock, TriangleAlert } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import PasswordMeter from '../components/ui/PasswordMeter';
import { api, errorMessage } from '../lib/api';
import { newPasswordSchema } from '../lib/validation';
import { homeFor } from '../lib/roles';
import { useAuth } from '../store/auth';

// Shown once, right after a sign-in with a temporary password. Nothing else in the
// app opens until this is done, on the server as well as here.
export default function SetPassword() {
  const user = useAuth((s) => s.user);
  const refreshUser = useAuth((s) => s.refreshUser);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(newPasswordSchema),
    mode: 'onTouched',
    defaultValues: { password: '', confirm: '' },
  });

  const password = useWatch({ control, name: 'password' }) ?? '';
  const confirm = useWatch({ control, name: 'confirm' }) ?? '';
  const matches = confirm.length > 0 && password === confirm;

  const onSubmit = async (values) => {
    setError(null);
    try {
      // No current password is sent: the temporary one was already proved when this
      // session was started, and it is the password being replaced.
      await api.post('/auth/change-password', { newPassword: values.password });
      const me = await refreshUser();
      toast.success('Password set. Welcome aboard.');
      navigate(homeFor(me?.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'We could not change your password.'));
    }
  };

  return (
    <AuthLayout
      title="Choose your own password"
      subtitle="Your account started with a temporary password. Replace it now, and it stops working."
      footer={
        <button
          type="button"
          onClick={logout}
          className="focus-ring rounded-lg font-semibold text-brand-600 hover:text-brand-700"
        >
          Sign out instead
        </button>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}

        <Alert tone="info" title={`Signed in as ${user?.email ?? ''}`}>
          Everything else opens as soon as your own password is set.
        </Alert>

        <Field
          label="New password"
          type="password"
          icon={KeyRound}
          autoComplete="new-password"
          placeholder="Choose a new password"
          error={errors.password?.message}
          {...register('password')}
        >
          <PasswordMeter value={password} className="mt-3" />
        </Field>

        <Field
          label="Repeat new password"
          type="password"
          icon={Lock}
          autoComplete="new-password"
          placeholder="Type it again"
          error={confirm.length === 0 ? errors.confirm?.message : undefined}
          {...register('confirm')}
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

        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Set my password
        </Button>
      </form>
    </AuthLayout>
  );
}
