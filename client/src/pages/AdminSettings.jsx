import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BellRing,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Globe2,
  LockKeyhole,
  Mail,
  Save,
  Send,
  ServerCog,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { formatEthiopian } from '../lib/ethiopianDate';
import Card, { CardBody, CardHeader } from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Field from '../components/ui/Field';
import FilterTabs from '../components/ui/FilterTabs';
import LiveStamp from '../components/ui/LiveStamp';
import Modal from '../components/ui/Modal';
import { Skeleton, SkeletonPage } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/StatePanel';

const TABS = [
  { key: 'maintenance', label: 'Maintenance', icon: Wrench },
  { key: 'institution', label: 'Institution', icon: Building2 },
  { key: 'security', label: 'Security', icon: ShieldCheck },
  { key: 'email', label: 'Email & Delivery', icon: Mail },
  { key: 'notifications', label: 'Notifications', icon: BellRing },
  { key: 'localization', label: 'Date & Localization', icon: Globe2 },
  { key: 'system', label: 'System Preferences', icon: SlidersHorizontal },
];

const SECTION_FIELDS = {
  institution: ['name', 'shortName', 'email', 'phone', 'website', 'address', 'city', 'region', 'country', 'establishedYear', 'motto'],
  security: ['idleMinutes', 'absoluteDays', 'lockoutAttempts', 'lockoutMinutes', 'minPasswordLength', 'requireTwoStep', 'singleSession'],
  email: ['announcementEmails', 'securityAlerts', 'replyTo', 'footer', 'batchSize'],
  notifications: ['inApp', 'emailAnnouncements', 'dailyDigest', 'maintenanceAlerts'],
  localization: ['language', 'calendar', 'timezone', 'dateFormat', 'weekStart', 'currency'],
  system: ['schoolYear', 'term', 'timeFormat', 'allowAdminRecovery'],
};

const NUMBER_FIELDS = new Set(['establishedYear', 'idleMinutes', 'absoluteDays', 'lockoutAttempts', 'lockoutMinutes', 'minPasswordLength', 'batchSize']);

function Select({ label, value, onChange, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <select
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white/85 px-3.5 text-sm text-slate-900"
      >
        {children}
      </select>
      {hint ? <span className="mt-1.5 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

function Area({ label, value, onChange, rows = 3, hint, maxLength }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <textarea
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        maxLength={maxLength}
        className="focus-ring w-full resize-y rounded-xl border border-slate-200 bg-white/85 px-3.5 py-3 text-sm text-slate-900"
      />
      {hint ? <span className="mt-1.5 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

function SwitchRow({ title, description, checked, onChange, disabled = false, tone = 'brand' }) {
  return (
    <div className="flex items-start justify-between gap-5 rounded-2xl border border-slate-100 bg-white/60 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        {description ? <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={Boolean(checked)}
        aria-label={title}
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`focus-ring relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? (tone === 'danger' ? 'bg-rose-500' : 'brand-gradient') : 'bg-slate-200'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}

function SaveBar({ onSave, loading, dirty, note }) {
  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-slate-500">{note || (dirty ? 'You have unsaved changes in this section.' : 'Everything here is saved.')}</p>
      <Button type="button" onClick={onSave} loading={loading} disabled={!dirty}>
        <Save className="h-4 w-4" />
        Save changes
      </Button>
    </div>
  );
}

const toLocalInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function AdminSettings() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const initialTab = TABS.some((tab) => tab.key === location.state?.tab) ? location.state.tab : 'maintenance';
  const [tab, setTab] = useState(initialTab);
  const [draft, setDraft] = useState(null);
  const [baseline, setBaseline] = useState(null);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [maintenanceForm, setMaintenanceForm] = useState({ message: '', until: '', password: '' });

  const settingsQuery = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => (await api.get('/admin/settings')).data,
    // Deliberately not polled: a background refresh would replace the draft while an
    // administrator is halfway through editing a section.
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!settingsQuery.data?.settings) return;
    const safe = JSON.parse(JSON.stringify(settingsQuery.data.settings));
    setDraft(safe);
    setBaseline(safe);
  }, [settingsQuery.data]);

  const update = useMutation({
    mutationFn: async (payload) => (await api.patch('/admin/settings', payload)).data,
    onSuccess: (data) => {
      toast.success(data.message || 'Settings saved.');
      const safe = data.settings ? JSON.parse(JSON.stringify(data.settings)) : null;
      if (safe) {
        setDraft(safe);
        setBaseline(safe);
      }
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      queryClient.invalidateQueries({ queryKey: ['system-status'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'We could not save those settings.')),
  });

  const maintenance = useMutation({
    mutationFn: async (payload) => (await api.post('/admin/settings/maintenance', payload)).data,
    onSuccess: (data) => {
      toast.success(data.message || 'Maintenance mode updated.');
      setMaintenanceOpen(false);
      setMaintenanceForm((value) => ({ ...value, password: '' }));
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      queryClient.invalidateQueries({ queryKey: ['system-status'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'We could not change maintenance mode.')),
  });

  const testMail = useMutation({
    mutationFn: async () => (await api.post('/admin/settings/test-email', {})).data,
    onSuccess: (data) => toast.success(data.message || 'Test message sent.'),
    onError: (err) => toast.error(errorMessage(err, 'The test message could not be sent.')),
  });

  const mail = settingsQuery.data?.mail;
  const maintenanceState = draft?.maintenance ?? settingsQuery.data?.settings?.maintenance;
  const loading = settingsQuery.isLoading || !draft;

  const sectionDirty = (section) => {
    if (!draft || !baseline) return false;
    return SECTION_FIELDS[section].some(
      (field) => JSON.stringify(draft[section]?.[field] ?? null) !== JSON.stringify(baseline[section]?.[field] ?? null),
    );
  };

  const set = (section, field, value) => {
    setDraft((current) => ({ ...current, [section]: { ...current[section], [field]: value } }));
  };

  const saveSection = (section) => {
    const payload = { [section]: {} };
    for (const field of SECTION_FIELDS[section]) {
      let value = draft[section]?.[field];
      if (NUMBER_FIELDS.has(field)) {
        value = value === '' || value === null || value === undefined ? null : Number(value);
      }
      payload[section][field] = value;
    }
    update.mutate(payload);
  };

  const openMaintenance = () => {
    setMaintenanceForm({
      message: maintenanceState?.message || draft?.system?.maintenanceMessage || '',
      until: toLocalInput(maintenanceState?.until || draft?.system?.maintenanceUntil),
      password: '',
    });
    setMaintenanceOpen(true);
  };

  const submitMaintenance = (event) => {
    event.preventDefault();
    const enabled = !maintenanceState?.enabled;
    maintenance.mutate({
      enabled,
      password: maintenanceForm.password,
      ...(enabled
        ? {
            message: maintenanceForm.message,
            until: maintenanceForm.until ? new Date(maintenanceForm.until).toISOString() : null,
          }
        : {}),
    });
  };

  const tabsWithIcons = useMemo(
    () => TABS.map((entry) => ({ ...entry, label: entry.label })),
    [],
  );

  if (settingsQuery.isError) {
    return (
      <div className="space-y-6">
        <header className="animate-rise">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">System settings</h1>
          <p className="mt-2 text-sm text-slate-600">The levers behind the portal.</p>
        </header>
        <Card>
          <ErrorState message={errorMessage(settingsQuery.error)} onRetry={() => settingsQuery.refetch()} />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">Platform control</span>
            <LiveStamp updatedAt={settingsQuery.data?.generatedAt} label="Settings live" />
          </div>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-slate-900">System settings</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Institution identity, security policy, mail delivery and the maintenance switch. Every save is recorded in the audit log.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={mail?.transport === 'gmail-api' ? 'success' : 'warning'}>
            <Mail className="h-3.5 w-3.5" />
            {mail?.transport === 'gmail-api' ? 'Gmail API connected' : 'SMTP delivery'}
          </Badge>
          {maintenanceState?.enabled ? (
            <Badge tone="danger">
              <TriangleAlert className="h-3.5 w-3.5" />
              Maintenance on
            </Badge>
          ) : (
            <Badge tone="success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Portal open
            </Badge>
          )}
        </div>
      </header>

      <FilterTabs
        tabs={tabsWithIcons}
        value={tab}
        onChange={setTab}
        label="Settings sections"
        className="animate-rise"
      />

      {loading ? (
        <SkeletonPage cards={2} />
      ) : (
        <div className="animate-rise">
          {tab === 'maintenance' ? (
            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <Card>
                <CardHeader
                  icon={Wrench}
                  title="Maintenance mode"
                  subtitle="Close the portal without deleting data or signing anyone out."
                  action={
                    <Badge tone={maintenanceState?.enabled ? 'danger' : 'success'}>
                      {maintenanceState?.enabled ? 'Closed' : 'Open'}
                    </Badge>
                  }
                />
                <CardBody className="space-y-5">
                  <div className={`overflow-hidden rounded-3xl border p-5 ${maintenanceState?.enabled ? 'border-rose-200 bg-rose-50/70' : 'border-emerald-200 bg-emerald-50/60'}`}>
                    <div className="flex items-start gap-4">
                      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${maintenanceState?.enabled ? 'bg-white text-rose-600' : 'bg-white text-emerald-600'}`}>
                        {maintenanceState?.enabled ? <LockKeyhole className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-base font-bold text-slate-900">
                          {maintenanceState?.enabled ? 'The college portal is closed' : 'The college portal is open'}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-slate-600">
                          {maintenanceState?.enabled
                            ? maintenanceState.message
                            : 'Everyone can use the portal normally. Turning maintenance on keeps sessions and data intact.'}
                        </p>
                        {maintenanceState?.enabled && maintenanceState.until ? (
                          <p className="mt-2 text-xs font-medium text-slate-500">
                            Planned to end {formatEthiopian(maintenanceState.until, { time: true })}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Button
                        variant={maintenanceState?.enabled ? 'secondary' : 'danger'}
                        onClick={openMaintenance}
                      >
                        <Wrench className="h-4 w-4" />
                        {maintenanceState?.enabled ? 'Open the portal' : 'Close for maintenance'}
                      </Button>
                    </div>
                  </div>

                  <Alert tone="info" title="What remains available while maintenance is on">
                    Sign-in, health checks, and the admin workspace stay reachable so you can always reopen it. Every other API answers
                    with a maintenance response. Sessions, audit history and announcements are not deleted.
                  </Alert>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3 text-xs leading-relaxed text-slate-500">
                    <span className="font-semibold text-slate-700">Recovery guard:</span> admin recovery cannot be turned off while
                    maintenance is active. Changing the switch needs your password and writes an audit entry.
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader icon={Clock3} title="How the switch behaves" subtitle="No reloads, no lost sessions" />
                <CardBody className="space-y-4 text-sm text-slate-600">
                  {[
                    ['Server-enforced', 'The maintenance check runs in the API before protected routes. Hiding a screen in the browser is not enough.'],
                    ['Admin recovery', 'Admins can still sign in, read the audit trail and turn maintenance off.'],
                    ['Data preserved', 'Sessions are not revoked. People resume where they were when the portal reopens.'],
                    ['Audited', 'Both activation and deactivation record who changed it, when, and the message shown.'],
                  ].map(([title, text]) => (
                    <div key={title} className="rounded-2xl border border-slate-100 bg-white/60 p-3.5">
                      <p className="text-sm font-semibold text-slate-800">{title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">{text}</p>
                    </div>
                  ))}
                </CardBody>
              </Card>
            </div>
          ) : null}

          {tab === 'institution' ? (
            <Card>
              <CardHeader icon={Building2} title="Institution identity" subtitle="The name and contact details used across the portal and in exports." />
              <CardBody className="grid gap-5 sm:grid-cols-2">
                <Field label="Institution name" value={draft.institution.name ?? ''} onChange={(e) => set('institution', 'name', e.target.value)} maxLength={120} />
                <Field label="Short name" value={draft.institution.shortName ?? ''} onChange={(e) => set('institution', 'shortName', e.target.value)} maxLength={40} />
                <Field label="Public email" type="email" value={draft.institution.email ?? ''} onChange={(e) => set('institution', 'email', e.target.value)} />
                <Field label="Phone" value={draft.institution.phone ?? ''} onChange={(e) => set('institution', 'phone', e.target.value)} maxLength={40} />
                <Field label="Website" value={draft.institution.website ?? ''} onChange={(e) => set('institution', 'website', e.target.value)} maxLength={160} />
                <Field label="Established year" type="number" min="1800" max="2200" value={draft.institution.establishedYear ?? ''} onChange={(e) => set('institution', 'establishedYear', e.target.value)} />
                <Field label="City" value={draft.institution.city ?? ''} onChange={(e) => set('institution', 'city', e.target.value)} maxLength={80} />
                <Field label="Region" value={draft.institution.region ?? ''} onChange={(e) => set('institution', 'region', e.target.value)} maxLength={80} />
                <Field label="Country" value={draft.institution.country ?? ''} onChange={(e) => set('institution', 'country', e.target.value)} maxLength={80} />
                <Field label="Motto" value={draft.institution.motto ?? ''} onChange={(e) => set('institution', 'motto', e.target.value)} maxLength={160} />
                <div className="sm:col-span-2">
                  <Area label="Address" value={draft.institution.address ?? ''} onChange={(value) => set('institution', 'address', value)} rows={2} maxLength={220} />
                </div>
              </CardBody>
              <SaveBar onSave={() => saveSection('institution')} loading={update.isPending} dirty={sectionDirty('institution')} />
            </Card>
          ) : null}

          {tab === 'security' ? (
            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <Card>
                <CardHeader icon={ShieldCheck} title="Security policy" subtitle="Applies to new sign-ins and the next request from an idle session." />
                <CardBody className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Idle timeout (minutes)" type="number" min="5" max="1440" hint="A session that stays unused this long is ended." value={draft.security.idleMinutes ?? ''} onChange={(e) => set('security', 'idleMinutes', e.target.value)} />
                    <Field label="Absolute session life (days)" type="number" min="1" max="365" hint="No session outlives this, even with activity." value={draft.security.absoluteDays ?? ''} onChange={(e) => set('security', 'absoluteDays', e.target.value)} />
                    <Field label="Wrong passwords before lock" type="number" min="3" max="20" value={draft.security.lockoutAttempts ?? ''} onChange={(e) => set('security', 'lockoutAttempts', e.target.value)} />
                    <Field label="Lockout duration (minutes)" type="number" min="1" max="1440" value={draft.security.lockoutMinutes ?? ''} onChange={(e) => set('security', 'lockoutMinutes', e.target.value)} />
                    <Field label="Minimum password length" type="number" min="8" max="64" value={draft.security.minPasswordLength ?? ''} onChange={(e) => set('security', 'minPasswordLength', e.target.value)} />
                  </div>
                  <div className="space-y-3">
                    <SwitchRow
                      title="Require two-step verification"
                      description="Everyone must enter an emailed code when they sign in, even before they turn it on themselves."
                      checked={draft.security.requireTwoStep}
                      onChange={(value) => set('security', 'requireTwoStep', value)}
                    />
                    <SwitchRow
                      title="Allow one active session"
                      description="Signing in on a new device ends the older sessions. Useful for shared offices; inconvenient for people who use a phone and a laptop."
                      checked={draft.security.singleSession}
                      onChange={(value) => set('security', 'singleSession', value)}
                    />
                  </div>
                </CardBody>
                <SaveBar onSave={() => saveSection('security')} loading={update.isPending} dirty={sectionDirty('security')} />
              </Card>
              <Card>
                <CardHeader icon={ServerCog} title="Session safety" subtitle="Changes take effect without signing people out." />
                <CardBody className="space-y-3 text-sm text-slate-600">
                  <Alert tone="warning" title="Keep recovery in mind">
                    If you require two-step verification, make sure the school mailbox can receive mail before you save. The test message in
                    Email & Delivery proves the path.
                  </Alert>
                  <div className="rounded-2xl border border-slate-100 p-4">
                    <p className="text-sm font-semibold text-slate-800">Current effect</p>
                    <dl className="mt-3 space-y-2 text-xs">
                      <div className="flex justify-between gap-3"><dt className="text-slate-500">Idle sessions end after</dt><dd className="font-semibold text-slate-700">{draft.security.idleMinutes} min</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-slate-500">Absolute maximum</dt><dd className="font-semibold text-slate-700">{draft.security.absoluteDays} days</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-slate-500">Lockout</dt><dd className="font-semibold text-slate-700">{draft.security.lockoutAttempts} tries / {draft.security.lockoutMinutes} min</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-slate-500">Two-step</dt><dd className="font-semibold text-slate-700">{draft.security.requireTwoStep ? 'Required' : 'Optional'}</dd></div>
                    </dl>
                  </div>
                </CardBody>
              </Card>
            </div>
          ) : null}

          {tab === 'email' ? (
            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <Card>
                <CardHeader icon={Mail} title="Email & delivery" subtitle="How announcements and security messages leave the portal." />
                <CardBody className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Reply-to address" type="email" hint="People reply here; leave blank to use the school sender." value={draft.email.replyTo ?? ''} onChange={(e) => set('email', 'replyTo', e.target.value)} />
                    <Field label="Batch size" type="number" min="1" max="100" hint="Messages sent per delivery batch." value={draft.email.batchSize ?? ''} onChange={(e) => set('email', 'batchSize', e.target.value)} />
                  </div>
                  <div className="space-y-3">
                    <SwitchRow title="Announcement email allowed" description="The announcement composer may offer an email copy in addition to in-app delivery." checked={draft.email.announcementEmails} onChange={(value) => set('email', 'announcementEmails', value)} />
                    <SwitchRow title="Security alert email" description="Send a message when a new device signs in or a password changes." checked={draft.email.securityAlerts} onChange={(value) => set('email', 'securityAlerts', value)} />
                  </div>
                  <Area label="Footer" value={draft.email.footer ?? ''} onChange={(value) => set('email', 'footer', value)} rows={2} maxLength={300} />
                  <Alert tone="info" title="Credentials stay on the server">
                    SMTP and Google credentials are environment variables. They are never shown, read or written by this screen.
                  </Alert>
                </CardBody>
                <SaveBar onSave={() => saveSection('email')} loading={update.isPending} dirty={sectionDirty('email')} />
              </Card>

              <Card>
                <CardHeader
                  icon={Send}
                  title="Delivery proof"
                  subtitle="A test goes only to your own admin address."
                  action={<Badge tone={mail?.transport === 'gmail-api' ? 'success' : 'warning'}>{mail?.transport || 'mail'}</Badge>}
                />
                <CardBody className="space-y-4">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-xs leading-relaxed text-slate-600">
                    <p className="text-sm font-semibold text-slate-800">Configured transport</p>
                    <dl className="mt-3 space-y-2">
                      <div className="flex justify-between gap-3"><dt className="text-slate-500">Mode</dt><dd className="font-semibold text-slate-700">{mail?.transport === 'gmail-api' ? 'Gmail API (HTTPS)' : 'SMTP app password'}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-slate-500">Sender</dt><dd className="font-semibold text-slate-700">{mail?.sender || 'Server mailbox'}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-slate-500">Gmail API ready</dt><dd className="font-semibold text-slate-700">{mail?.gmailApiConfigured ? 'Yes' : 'No'}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-slate-500">SMTP ready</dt><dd className="font-semibold text-slate-700">{mail?.smtpConfigured ? 'Yes' : 'No'}</dd></div>
                    </dl>
                  </div>
                  <Button variant="secondary" onClick={() => testMail.mutate()} loading={testMail.isPending} className="w-full">
                    <Send className="h-4 w-4" />
                    Send a test message
                  </Button>
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    The test writes a line to the audit log but never contains a credential. If delivery fails, fix the server environment and try again.
                  </p>
                </CardBody>
              </Card>
            </div>
          ) : null}

          {tab === 'notifications' ? (
            <Card>
              <CardHeader icon={BellRing} title="Notification defaults" subtitle="The defaults used by the portal. Each person can still choose their own." />
              <CardBody className="space-y-3">
                <SwitchRow title="In-app notifications" description="Show the bell, live notices and the notification page." checked={draft.notifications.inApp} onChange={(value) => set('notifications', 'inApp', value)} />
                <SwitchRow title="Email announcements by default" description="Offer an email copy when an administrator writes an announcement." checked={draft.notifications.emailAnnouncements} onChange={(value) => set('notifications', 'emailAnnouncements', value)} />
                <SwitchRow title="Daily digest" description="A single daily summary instead of separate email notices." checked={draft.notifications.dailyDigest} onChange={(value) => set('notifications', 'dailyDigest', value)} />
                <SwitchRow title="Maintenance alerts" description="Tell administrators when the portal is closed or reopened." checked={draft.notifications.maintenanceAlerts} onChange={(value) => set('notifications', 'maintenanceAlerts', value)} />
              </CardBody>
              <SaveBar onSave={() => saveSection('notifications')} loading={update.isPending} dirty={sectionDirty('notifications')} />
            </Card>
          ) : null}

          {tab === 'localization' ? (
            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <Card>
                <CardHeader icon={Globe2} title="Dates, language and money" subtitle="Ethiopian dates are shown with their Amharic month names in exports." />
                <CardBody className="grid gap-5 sm:grid-cols-2">
                  <Select label="Language" value={draft.localization.language} onChange={(value) => set('localization', 'language', value)} hint="Amharic interface text rolls out separately; exports already use Amharic dates.">
                    <option value="en">English</option>
                    <option value="am">አማርኛ (Amharic)</option>
                  </Select>
                  <Select label="Calendar" value={draft.localization.calendar} onChange={(value) => set('localization', 'calendar', value)}>
                    <option value="ethiopian">Ethiopian</option>
                    <option value="gregorian">Gregorian</option>
                  </Select>
                  <Select label="Date display" value={draft.localization.dateFormat} onChange={(value) => set('localization', 'dateFormat', value)}>
                    <option value="amharic">Amharic months (1 ጥቅምት 2019)</option>
                    <option value="english">English months</option>
                  </Select>
                  <Select label="Week starts on" value={draft.localization.weekStart} onChange={(value) => set('localization', 'weekStart', value)}>
                    <option value="monday">Monday</option>
                    <option value="sunday">Sunday</option>
                  </Select>
                  <Field label="Timezone" value={draft.localization.timezone ?? ''} onChange={(e) => set('localization', 'timezone', e.target.value)} hint="Dates are calculated in this zone." />
                  <Field label="Currency code" value={draft.localization.currency ?? ''} onChange={(e) => set('localization', 'currency', e.target.value)} maxLength={10} />
                </CardBody>
                <SaveBar onSave={() => saveSection('localization')} loading={update.isPending} dirty={sectionDirty('localization')} />
              </Card>
              <Card>
                <CardHeader icon={CalendarClock} title="Ethiopian calendar" subtitle="Used by the portal, exports and reports." />
                <CardBody className="space-y-3">
                  <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Today</p>
                    <p className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900">{formatEthiopian(new Date())}</p>
                    <p className="mt-1 text-xs text-slate-500">The Gregorian equivalent is {new Date().toLocaleDateString()}.</p>
                  </div>
                  <p className="text-xs leading-relaxed text-slate-500">
                    Exports show a date such as “1 ጥቅምት 2019”. The English fallback remains available for printed forms that require it.
                  </p>
                </CardBody>
              </Card>
            </div>
          ) : null}

          {tab === 'system' ? (
            <Card>
              <CardHeader icon={ServerCog} title="System preferences" subtitle="The academic context used by reports and the dashboard." />
              <CardBody className="grid gap-5 sm:grid-cols-2">
                <Field label="School year" value={draft.system.schoolYear ?? ''} onChange={(e) => set('system', 'schoolYear', e.target.value)} maxLength={30} hint="Example: 2019 EC" />
                <Select label="Term" value={draft.system.term} onChange={(value) => set('system', 'term', value)}>
                  <option value="Term 1">Term 1</option>
                  <option value="Term 2">Term 2</option>
                  <option value="Semester 1">Semester 1</option>
                  <option value="Semester 2">Semester 2</option>
                </Select>
                <Select label="Clock" value={draft.system.timeFormat} onChange={(value) => set('system', 'timeFormat', value)}>
                  <option value="24h">24-hour</option>
                  <option value="12h">12-hour</option>
                </Select>
                <div className="sm:col-span-2">
                  <SwitchRow
                    title="Admin recovery while closed"
                    description="Must stay on while maintenance mode is active, otherwise the person who closed the portal could be locked out."
                    checked={draft.system.allowAdminRecovery}
                    onChange={(value) => set('system', 'allowAdminRecovery', value)}
                    disabled={maintenanceState?.enabled}
                  />
                </div>
              </CardBody>
              <SaveBar onSave={() => saveSection('system')} loading={update.isPending} dirty={sectionDirty('system')} />
            </Card>
          ) : null}
        </div>
      )}

      <Modal
        open={maintenanceOpen}
        onClose={() => setMaintenanceOpen(false)}
        title={maintenanceState?.enabled ? 'Reopen the portal?' : 'Close the portal for maintenance?'}
        subtitle={
          maintenanceState?.enabled
            ? 'Everyone will be able to use the portal again. Sessions and data stay exactly as they are.'
            : 'Every non-admin API will answer with a maintenance response. Admins can still sign in and reopen it.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setMaintenanceOpen(false)}>Cancel</Button>
            <Button
              variant={maintenanceState?.enabled ? 'primary' : 'danger'}
              type="submit"
              form="maintenance-form"
              loading={maintenance.isPending}
            >
              {maintenanceState?.enabled ? 'Open the portal' : 'Turn on maintenance'}
            </Button>
          </>
        }
      >
        <form id="maintenance-form" onSubmit={submitMaintenance} className="space-y-4">
          {!maintenanceState?.enabled ? (
            <>
              <Area
                label="Message shown to people"
                value={maintenanceForm.message}
                onChange={(value) => setMaintenanceForm((form) => ({ ...form, message: value }))}
                rows={3}
                maxLength={500}
                hint="At least 10 characters. Be specific about when service returns."
              />
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Planned end (optional)</span>
                <input
                  type="datetime-local"
                  value={maintenanceForm.until}
                  onChange={(event) => setMaintenanceForm((form) => ({ ...form, until: event.target.value }))}
                  className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900"
                />
                <span className="mt-1.5 block text-xs text-slate-500">An end time is shown to visitors and lets the API stop reporting maintenance after it passes.</span>
              </label>
            </>
          ) : (
            <Alert tone="info" title="Nothing is deleted">
              Signing in, the admin workspace and health checks continue to work. People are told the portal is being updated.
            </Alert>
          )}
          <Field
            label="Confirm with your password"
            type="password"
            autoComplete="current-password"
            value={maintenanceForm.password}
            onChange={(event) => setMaintenanceForm((form) => ({ ...form, password: event.target.value }))}
            hint="Required for both turning maintenance on and off."
          />
        </form>
      </Modal>
    </div>
  );
}
