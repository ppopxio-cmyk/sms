import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Lock, Mail, User } from 'lucide-react';
import AuthLayout from '../components/layout/AuthLayout';
import Field from '../components/ui/Field';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import { api, errorMessage } from '../lib/api';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Enter your full name.').max(100),
    email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
    password: z
      .string()
      .min(8, 'Use at least 8 characters.')
      .max(128, 'That password is too long.')
      .regex(/[A-Za-z]/, 'Add at least one letter.')
      .regex(/[0-9]/, 'Add at least one number.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'The two passwords do not match.' });

export default function Register() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', password: '', confirm: '' } });

  const onSubmit = async (values) => {
    setServerError(null);
    try {
      await api.post('/auth/register', { name: values.name, email: values.email, password: values.password });
      toast.success('Account created. Check your email for a 6-digit code.');
      navigate('/verify-email', { replace: true, state: { email: values.email } });
    } catch (err) {
      setServerError(errorMessage(err, 'We could not create your account.'));
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="New accounts start with teacher access. An administrator can change your role later."
      footer={
        <span>
          Already registered?{' '}
          <Link to="/login" className="focus-ring rounded-lg font-semibold text-brand-600 hover:text-brand-700">
            Sign in
          </Link>
        </span>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {serverError ? <Alert tone="danger">{serverError}</Alert> : null}

        <Field label="Full name" icon={User} autoComplete="name" placeholder="Haile Michael" error={errors.name?.message} {...register('name')} />
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
          autoComplete="new-password"
          placeholder="At least 8 characters"
          hint="Use 8 or more characters with at least one letter and one number."
          error={errors.password?.message}
          {...register('password')}
        />
        <Field
          label="Confirm password"
          type="password"
          icon={Lock}
          autoComplete="new-password"
          placeholder="Type it again"
          error={errors.confirm?.message}
          {...register('confirm')}
        />

        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
