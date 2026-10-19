import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CircleCheck, Fingerprint, Lock, LogOut, MailCheck, ShieldCheck, Trash2, TriangleAlert, UserRound,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { mePasswordSchema, passwordOnlySchema } from '../lib/validation';
import { useAuth } from '../store/auth';
import { ROLE_LABEL } from '../lib/roles';
import Card, { CardBody, CardHeader } from '../components/ui/Card';
import Badge, { RoleBadge } from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import Modal from '../components/ui/Modal';
import Alert from '../components/ui/Alert';
import CodeInput from '../components/ui/CodeInput';
import PasswordMeter from '../components/ui/PasswordMeter';
import PushToggle from '../components/ui/PushToggle';

const initials = (name) =>
  (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'U';

function MatchLine({ ok, show }) {
  if (!show) return null;
  return (
    <p className={`animate-rise mt-1.5 flex items-center gap-1.5 text-xs font-semibold ${ok ? 'text-emerald-600' : 'text-rose-500'}`}>
      {ok ? <CircleCheck className="animate-pop h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
      {ok ? 'Passwords match' : 'Passwords do not match'}
    </p>
  );
}

export default function Me() {
  const user = useAuth((s) => s.user);
  const refreshUser = useAuth((s) => s.refreshUser);
  const logout = useAuth((s) => s.logout);

  const [twoStepOpen, setTwoStepOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteStep, setDeleteStep] = useState('password');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteCode, setDeleteCode] = useState('');
  const [shake, setShake] = useState(0);

  const passwordForm = useForm({
    resolver: zodResolver(mePasswordSchema),
    mode: 'onTouched',
    defaultValues: { currentPassword: '', password: '', confirm: '' },
  });
  const twoStepForm = useForm({
    resolver: zodResolver(passwordOnlySchema),
    mode: 'onTouched',
    defaultValues: { currentPassword: '' },
  });
  const deleteForm = useForm({
    resolver: zodResolver(passwordOnlySchema),
    mode: 'onTouched',
    defaultValues: { password: '' },
  });

  const newPassword = useWatch({ control: passwordForm.control, name: 'password' }) ?? '';
  const confirm = useWatch({ control: passwordForm.control, name: 'confirm' }) ?? '';

  const changePassword = useMutation({
    mutationFn: (values) =>
      api.post('/auth/change-password', { currentPassword: values.currentPassword, newPassword: values.password }),
    onSuccess: async () => {
      toast.success('Password changed. Every other device was signed out.');
      passwordForm.reset();
      await refreshUser();
    },
    onError: (err) => toast.error(errorMessage(err, 'We could not change your password.')),
  });

  const setTwoStep = useMutation({
    mutationFn: (enabled) =>
      api.post('/auth/two-step', { enabled, currentPassword: twoStepForm.getValues('currentPassword') }),
    onSuccess: async (res) => {
      toast.success(res.data?.message || 'Two-step verification updated.');
      setTwoStepOpen(false);
      twoStepForm.reset();
      await refreshUser();
    },
    onError: (err) => toast.error(errorMessage(err, 'We could not change that setting.')),
  });

  const sendDeleteCode = useMutation({
    mutationFn: () => api.post('/auth/delete-account/code', { password: deleteForm.getValues('password') }),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'We emailed you a code.');
      setDeletePassword(deleteForm.getValues('password'));
      setDeleteCode('');
      setDeleteStep('code');
    },
    onError: (err) => toast.error(errorMessage(err, 'We could not send that code.')),
  });

  const deleteMyAccount = useMutation({
    mutationFn: (values) => api.post('/auth/delete-account', values),
    onSuccess: async () => {
      toast.success('Your account was deleted.');
      setDeleteOpen(false);
      await logout();
    },
    onError: (err) => {
      toast.error(errorMessage(err, 'We could not delete your account.'));
      if (err?.response?.data?.code === 'CODE_WRONG') {
        setDeleteCode('');
        setShake((value) => value + 1);
      }
    },
  });

  const closeDelete = () => {
    setDeleteOpen(false);
    setDeleteStep('password');
    setDeleteCode('');
    deleteForm.reset();
  };

  const closing = { open: twoStepOpen, title: 'Two-step verification', onClose: () => setTwoStepOpen(false) };

  return (    <div className="space-y-6">
      <header className="animate-rise">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">My profile</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
          Your account, your password, and your own devices. This page is the same whichever role you have.
        </p>
      </header>

      <Card>
        <CardHeader icon={UserRound} title="Account" subtitle="Your name and address are kept by the administrator." />
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className="brand-gradient flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold text-white">
              {initials(user?.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-lg font-bold text-slate-900">
                {user?.name}
                <RoleBadge role={user?.role} />
              </p>
              <p className="mt-0.5 truncate text-sm text-slate-500">{user?.email}</p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Badge tone={user?.emailVerified ? 'success' : 'warning'}>
                  <MailCheck className="h-3.5 w-3.5" />
                  {user?.emailVerified ? 'email confirmed' : 'email not confirmed'}
                </Badge>
                <Badge tone={user?.twoStepEnabled ? 'success' : 'neutral'}>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  two-step {user?.twoStepEnabled ? 'on' : 'off'}
                </Badge>
                <span>{ROLE_LABEL[user?.role] ?? user?.role}</span>
              </p>
            </div>
            <Link
              to="/me/devices"
              className="focus-ring inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-brand-600 transition hover:bg-brand-50"
            >
              <Fingerprint className="h-4 w-4" />
              My devices
            </Link>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={Lock} title="Password" subtitle="Changing it signs every other device out." />
        <CardBody>
          <form onSubmit={passwordForm.handleSubmit((values) => changePassword.mutate(values))} className="space-y-4" noValidate>
            <Field
              label="Current password"
              type="password"
              icon={Lock}
              autoComplete="current-password"
              placeholder="Your password now"
              error={passwordForm.formState.errors.currentPassword?.message}
              {...passwordForm.register('currentPassword')}
            />
            <Field
              label="New password"
              type="password"
              icon={Lock}
              autoComplete="new-password"
              placeholder="Choose a new password"
              error={passwordForm.formState.errors.password?.message}
              {...passwordForm.register('password')}
            >
              <PasswordMeter value={newPassword} className="mt-3" />
            </Field>
            <Field
              label="Repeat new password"
              type="password"
              icon={Lock}
              autoComplete="new-password"
              placeholder="Type it again"
              error={confirm.length === 0 ? passwordForm.formState.errors.confirm?.message : undefined}
              {...passwordForm.register('confirm')}
            >
              <MatchLine ok={newPassword === confirm} show={confirm.length > 0} />
            </Field>
            <Button type="submit" loading={changePassword.isPending}>
              Change password
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader icon={ShieldCheck} title="Sign-in security" subtitle="A code at every sign-in, on top of your password." />
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${user?.twoStepEnabled ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-500'}`}>
                <ShieldCheck className="h-4.5 w-4.5" />
              </span>
              <div>
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                  Two-step verification
                  <Badge tone={user?.twoStepEnabled ? 'success' : 'neutral'}>{user?.twoStepEnabled ? 'on' : 'off'}</Badge>
                </p>
                <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-slate-500">
                  A new browser always asks for a code, whether this is on or off.
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                twoStepForm.reset({ currentPassword: '' });
                setTwoStepOpen(true);
              }}
            >
              {user?.twoStepEnabled ? 'Turn off' : 'Turn on'}
            </Button>
          </div>

          <PushToggle />
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          icon={TriangleAlert}
          title="Delete my account"
          subtitle="The record stays readable, but you can never sign in with this address again."
        />
        <CardBody>
          {user?.role === 'ADMIN' ? (
            <Alert tone="warning" title="The administrator account cannot be deleted">
              This is the single administrator account, so it has to stay. Hand the role over with the seed script first.
            </Alert>
          ) : (
            <>
              <p className="mb-4 text-sm leading-relaxed text-slate-600">
                We ask for your password and then a code sent to {user?.email}, so nobody else can do this from your computer.
              </p>
              <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" />
                Delete my account
              </Button>
            </>
          )}
        </CardBody>
      </Card>

      <Modal
        open={closing.open}
        title={user?.twoStepEnabled ? 'Turn off two-step verification?' : 'Turn on two-step verification?'}
        subtitle="Enter your password to confirm this change."
        onClose={closing.onClose}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={closing.onClose}>
              Cancel
            </Button>
            <Button
              loading={setTwoStep.isPending}
              onClick={() => setTwoStep.mutate(!user?.twoStepEnabled)}
            >
              {user?.twoStepEnabled ? 'Turn it off' : 'Turn it on'}
            </Button>
          </>
        }
      >
        <form
          id="two-step-form"
          onSubmit={twoStepForm.handleSubmit(() => setTwoStep.mutate(!user?.twoStepEnabled))}
          noValidate
        >
          <Field
            label="Your password"
            type="password"
            icon={Lock}
            autoComplete="current-password"
            placeholder="Your password now"
            error={twoStepForm.formState.errors.currentPassword?.message}
            {...twoStepForm.register('currentPassword')}
          />
        </form>
      </Modal>

      <Modal
        open={deleteOpen}
        title="Delete your account?"
        subtitle={deleteStep === 'password' ? 'Confirm with your password, then with the code we email you.' : `Enter the code sent to ${user?.email}.`}
        onClose={closeDelete}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={closeDelete}>
              Keep my account
            </Button>
            {deleteStep === 'password' ? (
              <Button
                variant="danger"
                loading={sendDeleteCode.isPending}
                onClick={deleteForm.handleSubmit(() => sendDeleteCode.mutate())}
              >
                Send me a code
              </Button>
            ) : (
              <Button
                variant="danger"
                loading={deleteMyAccount.isPending}
                disabled={deleteCode.length !== 6}
                onClick={() => deleteMyAccount.mutate({ password: deletePassword, code: deleteCode })}
              >
                Delete everything
              </Button>
            )}
          </>
        }
      >
        {deleteStep === 'password' ? (
          <Field
            label="Your password"
            type="password"
            icon={Lock}
            autoComplete="current-password"
            placeholder="Your password now"
            error={deleteForm.formState.errors.password?.message}
            {...deleteForm.register('password')}
          />
        ) : (
          <div className="space-y-4">
            <Alert tone="warning" title="This cannot be undone">
              Every device is signed out and the address stays reserved.
            </Alert>
            <CodeInput value={deleteCode} onChange={setDeleteCode} shake={shake} disabled={deleteMyAccount.isPending} />
          </div>
        )}
      </Modal>

      <div className="flex justify-center">
        <Button variant="ghost" onClick={() => logout()}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
