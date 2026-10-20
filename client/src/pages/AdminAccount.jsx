import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity,
  BellRing,
  CheckCircle2,
  CircleCheck,
  Fingerprint,
  Globe2,
  KeyRound,
  Laptop,
  Lock,
  Mail,
  Palette,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../store/auth';
import { mePasswordSchema } from '../lib/validation';
import { ROLE_LABEL } from '../lib/roles';
import { formatEthiopian, timeAgo } from '../lib/ethiopianDate';
import { humanizeAction, initials, number } from '../lib/format';
import { useNow } from '../lib/useNow';
import Card, { CardBody, CardHeader } from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge, { RoleBadge } from '../components/ui/Badge';
import Button from '../components/ui/Button';
import CodeInput from '../components/ui/CodeInput';
import Field from '../components/ui/Field';
import FilterTabs from '../components/ui/FilterTabs';
import LiveStamp from '../components/ui/LiveStamp';
import Modal from '../components/ui/Modal';
import PasswordMeter from '../components/ui/PasswordMeter';
import PushToggle from '../components/ui/PushToggle';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/StatePanel';

const TABS = [
  { key: 'profile', label: 'Profile', icon: UserRound },
  { key: 'password', label: 'Password', icon: Lock },
  { key: 'security', label: 'Security', icon: ShieldCheck },
  { key: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
  { key: 'activity', label: 'Activity', icon: Activity },
];

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Use at least 2 characters.').max(100, 'Keep the name under 100 characters.'),
});

const CATEGORY_TONE = {
  signin: 'brand',
  security: 'warning',
  admin: 'neutral',
  settings: 'success',
  announcements: 'brand',
  maintenance: 'danger',
  account: 'neutral',
  export: 'success',
  other: 'neutral',
};

function MatchLine({ ok, show }) {
  if (!show) return null;
  return (
    <p className={`animate-rise mt-1.5 flex items-center gap-1.5 text-xs font-semibold ${ok ? 'text-emerald-600' : 'text-rose-500'}`}>
      {ok ? <CircleCheck className="animate-pop h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
      {ok ? 'Passwords match' : 'Passwords do not match'}
    </p>
  );
}

function Toggle({ title, description, checked, onChange, icon: Icon }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`focus-ring flex w-full items-start gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition ${
        checked ? 'border-brand-100 bg-brand-50/50' : 'border-slate-100 bg-white/60 hover:bg-white'
      }`}
    >
      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${checked ? 'bg-white text-brand-600 shadow-sm' : 'bg-slate-100 text-slate-400'}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-800">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{description}</span>
      </span>
      <span className={`relative mt-1 h-6 w-11 shrink-0 rounded-full transition ${checked ? 'brand-gradient' : 'bg-slate-200'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

export default function AdminAccount() {
  const user = useAuth((state) => state.user);
  const refreshUser = useAuth((state) => state.refreshUser);
  const logout = useAuth((state) => state.logout);
  const navigate = useNavigate();
  const [tab, setTab] = useState('profile');
  const [twoStepOpen, setTwoStepOpen] = useState(false);
  const [twoStepPassword, setTwoStepPassword] = useState('');
  const [prefs, setPrefs] = useState(null);
  const now = useNow(1000);

  const profileForm = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name || '' },
  });
  const passwordForm = useForm({
    resolver: zodResolver(mePasswordSchema),
    mode: 'onTouched',
    defaultValues: { currentPassword: '', password: '', confirm: '' },
  });

  const newPassword = useWatch({ control: passwordForm.control, name: 'password' }) ?? '';
  const confirmPassword = useWatch({ control: passwordForm.control, name: 'confirm' }) ?? '';

  useEffect(() => {
    profileForm.reset({ name: user?.name || '' });
  }, [profileForm, user?.name]);

  useEffect(() => {
    if (user?.preferences) setPrefs({ ...user.preferences });
  }, [user?.preferences]);

  const sessions = useQuery({
    queryKey: ['my-sessions'],
    queryFn: async () => (await api.get('/auth/sessions')).data,
    enabled: tab === 'security',
  });

  const activity = useQuery({
    queryKey: ['my-activity'],
    queryFn: async () => (await api.get('/auth/activity')).data,
    enabled: tab === 'activity',
    refetchInterval: tab === 'activity' ? 60_000 : false,
  });

  const saveProfile = useMutation({
    mutationFn: async (values) => (await api.patch('/auth/profile', values)).data,
    onSuccess: async (data) => {
      toast.success(data.message || 'Profile saved.');
      await refreshUser();
    },
    onError: (err) => toast.error(errorMessage(err, 'We could not save your profile.')),
  });

  const changePassword = useMutation({
    mutationFn: async (values) =>
      (await api.post('/auth/change-password', { currentPassword: values.currentPassword, newPassword: values.password })).data,
    onSuccess: async (data) => {
      toast.success(data.message || 'Password changed. Every other device was signed out.');
      passwordForm.reset();
      await refreshUser();
    },
    onError: (err) => toast.error(errorMessage(err, 'We could not change your password.')),
  });

  const setTwoStep = useMutation({
    mutationFn: async (password) =>
      (await api.post('/auth/two-step', { enabled: !user?.twoStepEnabled, currentPassword: password })).data,
    onSuccess: async (data) => {
      toast.success(data.message || 'Two-step verification updated.');
      setTwoStepOpen(false);
      setTwoStepPassword('');
      await refreshUser();
    },
    onError: (err) => toast.error(errorMessage(err, 'We could not change two-step verification.')),
  });

  const savePreferences = useMutation({
    mutationFn: async () => (await api.patch('/auth/preferences', prefs)).data,
    onSuccess: async (data) => {
      toast.success(data.message || 'Preferences saved.');
      await refreshUser();
    },
    onError: (err) => toast.error(errorMessage(err, 'We could not save your preferences.')),
  });

  if (!user) return null;

  const activeSessions = sessions.data?.sessions?.length ?? 0;

  return (
    <div className="space-y-6">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">Your account</span>
            <span className="text-[11px] font-medium text-slate-400">{formatEthiopian(now, { time: true })}</span>
          </div>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-slate-900">My account</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Your name, password, sign-in security and the activity recorded against your account. These controls belong to you alone.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RoleBadge role={user.role} />
          <Badge tone={user.emailVerified ? 'success' : 'warning'}>
            <Mail className="h-3.5 w-3.5" /> {user.emailVerified ? 'Email confirmed' : 'Email not confirmed'}
          </Badge>
          <Badge tone={user.twoStepEnabled ? 'success' : 'neutral'}>
            <ShieldCheck className="h-3.5 w-3.5" /> Two-step {user.twoStepEnabled ? 'on' : 'off'}
          </Badge>
        </div>
      </header>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <span className="brand-gradient flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-lg shadow-brand-600/20">
            {initials(user.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-lg font-bold text-slate-900">
              {user.name}
              <RoleBadge role={user.role} />
            </p>
            <p className="mt-0.5 truncate text-sm text-slate-500">{user.email}</p>
            <p className="mt-1 text-xs text-slate-400">
              {ROLE_LABEL[user.role] ?? user.role} · joined {formatEthiopian(user.createdAt || now)}
              {user.lastLoginAt ? ` · last sign-in ${timeAgo(user.lastLoginAt)}` : ''}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setTab('security')}>
            <Laptop className="h-4 w-4" />
            Sign-in security
          </Button>
        </div>
      </Card>

      <FilterTabs tabs={TABS} value={tab} onChange={setTab} label="Account sections" />

      {tab === 'profile' ? (
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader icon={UserRound} title="Profile" subtitle="Your name appears on audits, exports and the people list." />
            <CardBody>
              <form onSubmit={profileForm.handleSubmit((values) => saveProfile.mutate(values))} className="space-y-5" noValidate>
                <Field
                  label="Full name"
                  placeholder="Your full name"
                  autoComplete="name"
                  error={profileForm.formState.errors.name?.message}
                  {...profileForm.register('name')}
                />
                <div>
                  <p className="mb-1.5 text-sm font-medium text-slate-700">Email address</p>
                  <div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-sm text-slate-500">
                    <Mail className="mr-2 h-4 w-4 text-slate-400" /> {user.email}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">Only an administrator can change the address. It is where security links and codes go.</p>
                </div>
                <div className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-xs text-slate-500 sm:grid-cols-2">
                  <p><span className="text-slate-400">Role:</span> <span className="font-semibold text-slate-700">{ROLE_LABEL[user.role] ?? user.role}</span></p>
                  <p><span className="text-slate-400">Account created:</span> <span className="font-semibold text-slate-700">{formatEthiopian(user.createdAt || now, { time: true })}</span></p>
                  <p><span className="text-slate-400">Last sign-in:</span> <span className="font-semibold text-slate-700">{user.lastLoginAt ? formatEthiopian(user.lastLoginAt, { time: true }) : 'No sign-in recorded'}</span></p>
                  <p><span className="text-slate-400">Email:</span> <span className="font-semibold text-slate-700">{user.emailVerified ? 'Confirmed' : 'Not confirmed'}</span></p>
                </div>
                <Button type="submit" loading={saveProfile.isPending} disabled={!profileForm.formState.isDirty}>
                  <CheckCircle2 className="h-4 w-4" />
                  Save name
                </Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={Fingerprint} title="Your devices" subtitle="The browsers currently signed in to this account." />
            <CardBody className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600">
                  <Laptop className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Device list</p>
                  <p className="text-xs text-slate-500">Review and sign out browsers you do not recognise.</p>
                </div>
              </div>
              <Button variant="secondary" onClick={() => navigate('/admin/devices')}>
                <Fingerprint className="h-4 w-4" />
                Open my devices
              </Button>
              <Alert tone="info" title="Name your browser">
                A laptop cannot always tell the portal its model. Give each browser a name you recognize in the device list.
              </Alert>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === 'password' ? (
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader icon={KeyRound} title="Change password" subtitle="Every other device is signed out as soon as the new password is saved." />
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
                  error={passwordForm.formState.errors.confirm?.message}
                  {...passwordForm.register('confirm')}
                >
                  <MatchLine ok={newPassword === confirmPassword} show={confirmPassword.length > 0} />
                </Field>
                <Button type="submit" loading={changePassword.isPending}>
                  <KeyRound className="h-4 w-4" />
                  Change password
                </Button>
              </form>
            </CardBody>
          </Card>
          <Card>
            <CardHeader icon={ShieldCheck} title="A strong admin password" subtitle="This account can change the whole portal." />
            <CardBody className="space-y-3 text-sm text-slate-600">
              {[
                'Use a unique password you do not use anywhere else.',
                'A long phrase with numbers and symbols is stronger than a short complicated word.',
                'Changing this password signs every other browser out.',
                'If you suspect a compromise, change it first and then review My Devices.',
              ].map((line) => (
                <p key={line} className="flex items-start gap-2 text-xs leading-relaxed">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  {line}
                </p>
              ))}
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === 'security' ? (
        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader icon={ShieldCheck} title="Sign-in security" subtitle="Two-step verification and browser notifications." />
            <CardBody className="space-y-3">
              <div className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${user.twoStepEnabled ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-500'}`}>
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                      Two-step verification
                      <Badge tone={user.twoStepEnabled ? 'success' : 'neutral'}>{user.twoStepEnabled ? 'on' : 'off'}</Badge>
                    </p>
                    <p className="mt-0.5 max-w-lg text-xs leading-relaxed text-slate-500">
                      Every new browser already asks for an emailed code. Turning this on asks for a code at every sign-in.
                    </p>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => { setTwoStepPassword(''); setTwoStepOpen(true); }}>
                  {user.twoStepEnabled ? 'Turn off' : 'Turn on'}
                </Button>
              </div>

              <PushToggle />
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={Laptop} title="Active devices" subtitle={sessions.isLoading ? 'Checking…' : `${number(activeSessions)} active ${activeSessions === 1 ? 'session' : 'sessions'}`} />
            <CardBody className="space-y-4">
              {sessions.isLoading ? (
                <><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></>
              ) : sessions.isError ? (
                <ErrorState message={errorMessage(sessions.error)} onRetry={() => sessions.refetch()} />
              ) : (
                <div className="space-y-2">
                  {(sessions.data?.sessions ?? []).slice(0, 4).map((session) => (
                    <div key={session.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5 text-xs">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-slate-700">{session.deviceLabel || session.browser || 'Browser'}</span>
                        <span className="mt-0.5 block text-slate-400">{session.location || session.ip || 'Unknown place'}</span>
                      </span>
                      <Badge tone={session.current ? 'success' : 'neutral'}>{session.current ? 'this device' : 'active'}</Badge>
                    </div>
                  ))}
                </div>
              )}
              <Button variant="secondary" className="w-full" onClick={() => navigate('/admin/devices')}>
                <Fingerprint className="h-4 w-4" />
                Manage all devices
              </Button>
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === 'preferences' ? (
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card>
            <CardHeader icon={BellRing} title="Notifications" subtitle="Choose what reaches you outside the portal." />
            <CardBody className="space-y-3">
              {prefs ? (
                <>
                  <Toggle
                    title="In-app notifications"
                    description="The bell, live notices and the notification page."
                    checked={prefs.inAppNotifications}
                    onChange={(value) => setPrefs((current) => ({ ...current, inAppNotifications: value }))}
                    icon={BellRing}
                  />
                  <Toggle
                    title="Security email"
                    description="New-device alerts and password-change confirmations by email."
                    checked={prefs.emailSecurity}
                    onChange={(value) => setPrefs((current) => ({ ...current, emailSecurity: value }))}
                    icon={ShieldCheck}
                  />
                  <Toggle
                    title="Announcement email"
                    description="Receive an email copy when the college sends an announcement."
                    checked={prefs.emailAnnouncements}
                    onChange={(value) => setPrefs((current) => ({ ...current, emailAnnouncements: value }))}
                    icon={Mail}
                  />
                </>
              ) : <Skeleton className="h-32 w-full" />}
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={Palette} title="Display" subtitle="Your own view of dates, time and motion." />
            <CardBody className="space-y-4">
              {prefs ? (
                <>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Language</span>
                    <select value={prefs.language} onChange={(event) => setPrefs((current) => ({ ...current, language: event.target.value }))} className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900">
                      <option value="en">English</option>
                      <option value="am">አማርኛ (Amharic)</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Calendar</span>
                    <select value={prefs.calendar} onChange={(event) => setPrefs((current) => ({ ...current, calendar: event.target.value }))} className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900">
                      <option value="ethiopian">Ethiopian</option>
                      <option value="gregorian">Gregorian</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Clock</span>
                    <select value={prefs.timeFormat} onChange={(event) => setPrefs((current) => ({ ...current, timeFormat: event.target.value }))} className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900">
                      <option value="24h">24-hour</option>
                      <option value="12h">12-hour</option>
                    </select>
                  </label>
                  <Toggle
                    title="Reduce motion"
                    description="Prefer calm transitions and fewer animated charts."
                    checked={prefs.reducedMotion}
                    onChange={(value) => setPrefs((current) => ({ ...current, reducedMotion: value }))}
                    icon={Activity}
                  />
                  <Toggle
                    title="Compact tables"
                    description="Fit more rows on screen on a wide monitor."
                    checked={prefs.compactTables}
                    onChange={(value) => setPrefs((current) => ({ ...current, compactTables: value }))}
                    icon={SlidersHorizontal}
                  />
                </>
              ) : <Skeleton className="h-64 w-full" />}
            </CardBody>
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
              <p className="text-xs text-slate-500">Display preferences apply to this account.</p>
              <Button onClick={() => savePreferences.mutate()} loading={savePreferences.isPending} disabled={!prefs}>
                Save preferences
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'activity' ? (
        <Card>
          <CardHeader
            icon={Activity}
            title="Your recent activity"
            subtitle="Actions recorded against your account. This is your own trail, not the full college audit log."
            action={<LiveStamp updatedAt={activity.dataUpdatedAt} label="Live" />}
          />
          <CardBody className="space-y-2">
            {activity.isLoading ? (
              <><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></>
            ) : activity.isError ? (
              <ErrorState message={errorMessage(activity.error)} onRetry={() => activity.refetch()} />
            ) : (activity.data?.activity ?? []).length === 0 ? (
              <EmptyState icon={Activity} title="Nothing recorded yet" message="Actions you take will appear here as they are audited." />
            ) : (
              activity.data.activity.map((entry) => (
                <div key={entry.id} className="flex flex-col gap-2 rounded-2xl border border-slate-100 bg-white/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${entry.status === 'fail' ? 'bg-rose-50 text-rose-500' : 'bg-slate-100 text-slate-500'}`}>
                      {entry.status === 'fail' ? <TriangleAlert className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{humanizeAction(entry.action)}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {formatEthiopian(entry.createdAt, { time: true })}
                        {entry.ip ? ` · ${entry.ip}` : ''}
                        {entry.targetType ? ` · ${entry.targetType}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={CATEGORY_TONE[entry.category] || 'neutral'}>{entry.category}</Badge>
                    <Badge tone={entry.status === 'fail' ? 'danger' : 'success'}>{entry.status === 'fail' ? 'failed' : 'done'}</Badge>
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      ) : null}

      <div className="flex justify-center">
        <Button variant="ghost" onClick={() => logout()}>
          Sign out
        </Button>
      </div>

      <Modal
        open={twoStepOpen}
        onClose={() => setTwoStepOpen(false)}
        title={user.twoStepEnabled ? 'Turn off two-step verification?' : 'Turn on two-step verification?'}
        subtitle="Confirm with your password. This affects every future sign-in."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTwoStepOpen(false)}>Cancel</Button>
            <Button loading={setTwoStep.isPending} disabled={!twoStepPassword} onClick={() => setTwoStep.mutate(twoStepPassword)}>
              {user.twoStepEnabled ? 'Turn it off' : 'Turn it on'}
            </Button>
          </>
        }
      >
        <Field
          label="Your password"
          type="password"
          icon={Lock}
          autoComplete="current-password"
          placeholder="Your password now"
          value={twoStepPassword}
          onChange={(event) => setTwoStepPassword(event.target.value)}
        />
      </Modal>
    </div>
  );
}
