import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Archive,
  BellRing,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Copy,
  Eye,
  FileText,
  GraduationCap,
  Info,
  Mail,
  Megaphone,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  TriangleAlert,
  Users,
  Wallet,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { formatEthiopian, timeAgo } from '../lib/ethiopianDate';
import { number, roleLabel } from '../lib/format';
import { useDebounced } from '../lib/useDebounced';
import Card, { CardBody, CardHeader } from '../components/ui/Card';
import Alert from '../components/ui/Alert';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ExportMenu from '../components/ui/ExportMenu';
import Field from '../components/ui/Field';
import FilterTabs from '../components/ui/FilterTabs';
import LiveStamp from '../components/ui/LiveStamp';
import Modal from '../components/ui/Modal';
import Pagination from '../components/ui/Pagination';
import RowMenu from '../components/ui/RowMenu';
import SearchInput from '../components/ui/SearchInput';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState, ErrorState } from '../components/ui/StatePanel';

const TYPES = {
  general: { label: 'General', icon: Megaphone, tone: 'bg-indigo-50 text-indigo-600' },
  academic: { label: 'Academic', icon: GraduationCap, tone: 'bg-violet-50 text-violet-600' },
  exam: { label: 'Exam', icon: ClipboardCheck, tone: 'bg-sky-50 text-sky-600' },
  event: { label: 'Event', icon: CalendarDays, tone: 'bg-fuchsia-50 text-fuchsia-600' },
  administrative: { label: 'Administrative', icon: FileText, tone: 'bg-slate-100 text-slate-600' },
  emergency: { label: 'Emergency', icon: CircleAlert, tone: 'bg-rose-50 text-rose-600' },
  holiday: { label: 'Holiday', icon: Sparkles, tone: 'bg-amber-50 text-amber-600' },
  finance: { label: 'Finance', icon: Wallet, tone: 'bg-emerald-50 text-emerald-600' },
};

const STATUS = {
  draft: { label: 'Draft', tone: 'neutral' },
  scheduled: { label: 'Scheduled', tone: 'brand' },
  published: { label: 'Published', tone: 'success' },
  expired: { label: 'Expired', tone: 'warning' },
  archived: { label: 'Archived', tone: 'neutral' },
};

const PRIORITY = {
  normal: { label: 'Normal', tone: 'brand' },
  high: { label: 'High', tone: 'warning' },
  critical: { label: 'Critical', tone: 'danger' },
};

const ROLES = ['ADMIN', 'REGISTRAR', 'TEACHER', 'ACCOUNTANT'];

const defaults = {
  title: '',
  body: '',
  type: 'general',
  priority: 'normal',
  audience: 'all',
  audienceRole: 'TEACHER',
  audienceEmail: '',
  publishAt: '',
  expiresAt: '',
  pinned: false,
  sendEmail: false,
};

const composeSchema = z
  .object({
    title: z.string().trim().min(3, 'Write a title of at least 3 characters.').max(160),
    body: z.string().trim().min(3, 'Write the announcement.').max(5000),
    type: z.enum(Object.keys(TYPES)),
    priority: z.enum(['normal', 'high', 'critical']),
    audience: z.enum(['all', 'role', 'user']),
    audienceRole: z.string().optional(),
    audienceEmail: z.string().optional(),
    publishAt: z.string().optional(),
    expiresAt: z.string().optional(),
    pinned: z.boolean(),
    sendEmail: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.audience === 'user' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.audienceEmail || '')) {
      ctx.addIssue({ code: 'custom', path: ['audienceEmail'], message: 'Enter the email address of one account.' });
    }
    if (value.expiresAt && value.publishAt && new Date(value.expiresAt) <= new Date(value.publishAt)) {
      ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Expiry must be after the publish time.' });
    }
  });

const toLocalInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const audienceText = (row) => {
  if (row.audience === 'role') return `${roleLabel(row.audienceRole)} only`;
  if (row.audience === 'user') return row.audienceUser?.email || row.audienceUser?.name || 'One person';
  return 'All active accounts';
};

const dateOr = (value, fallback = 'Not set') => (value ? formatEthiopian(value, { time: true }) : fallback);

function FilterSelect({ label, value, onChange, children }) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
      <span className="hidden sm:inline">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="focus-ring h-11 rounded-xl border border-slate-200 bg-white/85 px-3 text-sm font-medium text-slate-700"
      >
        {children}
      </select>
    </label>
  );
}

function ComposeModal({ open, onClose, editing, onSaved }) {
  const queryClient = useQueryClient();
  const [intent, setIntent] = useState('draft');
  const initialValues = editing
    ? {
        ...defaults,
        title: editing.title || '',
        body: editing.body || '',
        type: editing.type || 'general',
        priority: editing.priority || 'normal',
        audience: editing.audience || 'all',
        audienceRole: editing.audienceRole || 'TEACHER',
        audienceEmail: editing.audienceUser?.email || '',
        publishAt: toLocalInput(editing.publishAt),
        expiresAt: toLocalInput(editing.expiresAt),
        pinned: Boolean(editing.pinned),
        sendEmail: Boolean(editing.sendEmail),
      }
    : defaults;
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(composeSchema),
    defaultValues: initialValues,
  });

  const audience = watch('audience');
  const audienceRole = watch('audienceRole');
  const audienceEmail = watch('audienceEmail');
  const pinned = watch('pinned');
  const sendEmail = watch('sendEmail');
  const debouncedEmail = useDebounced(audienceEmail, 350);
  const emailReady = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(audienceEmail || '');
  const debouncedReady = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(debouncedEmail || '');

  const preview = useQuery({
    queryKey: ['announcement-audience', audience, audienceRole, debouncedEmail],
    queryFn: async () => {
      const params = { audience };
      if (audience === 'role') params.audienceRole = audienceRole;
      if (audience === 'user') params.email = debouncedEmail;
      return (await api.get('/admin/announcements/audience', { params })).data;
    },
    enabled: open && (audience === 'all' || (audience === 'role' && Boolean(audienceRole)) || (audience === 'user' && debouncedReady)),
    staleTime: 20_000,
    retry: 0,
  });

  const save = useMutation({
    mutationFn: async (payload) => {
      if (editing) {
        return (await api.patch(`/admin/announcements/${editing.id}`, payload)).data;
      }
      return (await api.post('/admin/announcements', payload)).data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Announcement saved.');
      queryClient.invalidateQueries({ queryKey: ['admin-announcements'] });
      onSaved?.(data.announcement);
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, 'We could not save that announcement.')),
  });

  const submit = (values, modeOverride) => {
    const mode = modeOverride || (editing ? 'save' : intent);
    if (mode === 'schedule' && !values.publishAt) {
      toast.error('Choose the date and time this should be published.');
      return;
    }
    const payload = {
      ...values,
      ...(mode === 'schedule' ? { intent: 'schedule' } : mode === 'draft' ? { intent: 'draft' } : mode === 'publish' ? { intent: 'publish' } : {}),
      publishAt: values.publishAt ? new Date(values.publishAt).toISOString() : null,
      expiresAt: values.expiresAt ? new Date(values.expiresAt).toISOString() : null,
      audienceRole: values.audience === 'role' ? values.audienceRole : undefined,
      audienceEmail: values.audience === 'user' ? values.audienceEmail : undefined,
    };
    save.mutate(payload);
  };

  const submitAs = (mode) => {
    setIntent(mode);
    handleSubmit((values) => submit(values, mode))();
  };

  // The page passes a fresh `open` flag for every action, so the form is reset by the
  // caller through the key prop rather than carrying one draft into the next.
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Edit announcement' : 'New announcement'}
      subtitle={
        editing
          ? 'Content and audience rules can be changed until the notice is archived.'
          : 'Write once, choose exactly who sees it, and decide whether it leaves by email too.'
      }
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            {editing ? (
              <Button type="submit" form="announcement-form" loading={save.isPending}>
                <Pencil className="h-4 w-4" />
                Save changes
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={() => submitAs('draft')}
                  loading={save.isPending && intent === 'draft'}
                >
                  Save draft
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => submitAs('schedule')}
                  loading={save.isPending && intent === 'schedule'}
                >
                  <CalendarClock className="h-4 w-4" />
                  Schedule
                </Button>
                <Button
                  onClick={() => submitAs('publish')}
                  loading={save.isPending && intent === 'publish'}
                >
                  <Send className="h-4 w-4" />
                  Publish now
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <form id="announcement-form" onSubmit={handleSubmit(submit)} className="space-y-5">
        {editing?.status === 'published' ? (
          <Alert tone="info" title="This notice is already published">
            The words and priority can still be corrected. The audience cannot change, and delivery has already happened.
          </Alert>
        ) : null}

        <Field
          label="Title"
          placeholder="Midterm examination timetable"
          maxLength={160}
          error={errors.title?.message}
          {...register('title')}
        />

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Announcement</span>
          <textarea
            rows={5}
            maxLength={5000}
            placeholder="Write the details people need. Line breaks are preserved."
            className={`focus-ring w-full resize-y rounded-xl border bg-white/85 px-3.5 py-3 text-sm leading-relaxed text-slate-900 ${
              errors.body ? 'border-rose-300' : 'border-slate-200'
            }`}
            {...register('body')}
          />
          <span className="mt-1.5 flex items-center justify-between gap-2 text-xs text-slate-500">
            <span className={errors.body ? 'font-medium text-rose-600' : ''}>{errors.body?.message || 'Plain text. Links are not clickable in email for safety.'}</span>
          </span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Type</span>
            <select className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white/85 px-3.5 text-sm text-slate-900" {...register('type')}>
              {Object.entries(TYPES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Priority</span>
            <select className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white/85 px-3.5 text-sm text-slate-900" {...register('priority')}>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
          <p className="text-sm font-semibold text-slate-800">Who receives it</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              { key: 'all', title: 'All users', hint: 'Every active account' },
              { key: 'role', title: 'One role', hint: 'A single group' },
              { key: 'user', title: 'One person', hint: 'By email address' },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                disabled={editing?.status === 'published'}
                onClick={() => setValue('audience', option.key, { shouldValidate: true })}
                className={`focus-ring rounded-xl border px-3.5 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  audience === option.key ? 'border-brand-300 bg-white shadow-sm ring-2 ring-brand-100' : 'border-slate-200 bg-white/60 hover:bg-white'
                }`}
              >
                <span className="block text-sm font-semibold text-slate-800">{option.title}</span>
                <span className="mt-0.5 block text-[11px] text-slate-500">{option.hint}</span>
              </button>
            ))}
          </div>

          {audience === 'role' ? (
            <label className="mt-4 block max-w-xs">
              <span className="mb-1.5 block text-xs font-medium text-slate-600">Role</span>
              <select
                disabled={editing?.status === 'published'}
                className="focus-ring h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800"
                {...register('audienceRole')}
              >
                {ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
              </select>
            </label>
          ) : null}

          {audience === 'user' ? (
            <div className="mt-4 max-w-md">
              <Field
                label="Account email"
                type="email"
                placeholder="name@college.edu.et"
                disabled={editing?.status === 'published'}
                error={errors.audienceEmail?.message}
                {...register('audienceEmail')}
              />
              {emailReady && !debouncedReady ? <p className="mt-1 text-xs text-slate-400">Checking that address…</p> : null}
            </div>
          ) : null}

          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <Users className="h-3.5 w-3.5" />
            {preview.isFetching ? (
              'Counting recipients…'
            ) : preview.data ? (
              <span>
                <span className="font-semibold text-slate-700">{number(preview.data.count)}</span>{' '}
                {preview.data.count === 1 ? 'person will receive this' : 'people will receive this'}
                {preview.data.message ? <span className="block text-amber-600">{preview.data.message}</span> : null}
              </span>
            ) : (
              'The recipient count appears here.'
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Publish time</span>
            <input
              type="datetime-local"
              className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white/85 px-3.5 text-sm text-slate-900"
              {...register('publishAt')}
            />
            <span className="mt-1.5 block text-xs text-slate-500">Leave blank to publish now, or set a future time and use Schedule.</span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Expires</span>
            <input
              type="datetime-local"
              className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white/85 px-3.5 text-sm text-slate-900"
              {...register('expiresAt')}
            />
            {errors.expiresAt ? <span className="mt-1.5 block text-xs font-medium text-rose-600">{errors.expiresAt.message}</span> : <span className="mt-1.5 block text-xs text-slate-500">Optional. Expired notices stop appearing in the published list.</span>}
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setValue('pinned', !pinned)}
            className={`focus-ring flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${pinned ? 'border-brand-200 bg-brand-50/70' : 'border-slate-100 bg-white/60'}`}
          >
            <Pin className={`mt-0.5 h-4 w-4 ${pinned ? 'text-brand-600' : 'text-slate-400'}`} />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Pin to the top</span>
              <span className="mt-0.5 block text-xs text-slate-500">Pinned notices stay above newer ones.</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setValue('sendEmail', !sendEmail)}
            className={`focus-ring flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${sendEmail ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-100 bg-white/60'}`}
          >
            <Mail className={`mt-0.5 h-4 w-4 ${sendEmail ? 'text-emerald-600' : 'text-slate-400'}`} />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Send email too</span>
              <span className="mt-0.5 block text-xs text-slate-500">In-app delivery happens either way. Email is marked only after it succeeds.</span>
            </span>
          </button>
        </div>

        {!editing ? (
          <div className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-[11px] leading-relaxed text-slate-500">
            <Info className="mr-1 inline h-3.5 w-3.5" />
            Drafts are private to administrators. A scheduled notice publishes automatically; you can also publish it from the list before its time.
          </div>
        ) : null}
      </form>
    </Modal>
  );
}

function DetailModal({ id, onClose }) {
  const detail = useQuery({
    queryKey: ['admin-announcement', id],
    queryFn: async () => (await api.get(`/admin/announcements/${id}`)).data.announcement,
    enabled: Boolean(id),
  });
  const row = detail.data;

  return (
    <Modal open={Boolean(id)} onClose={onClose} size="lg" title={row?.title || 'Announcement'} subtitle={row ? `${audienceText(row)} · ${dateOr(row.publishedAt, 'Not published yet')}` : 'Loading the full record…'}>
      {detail.isLoading ? (
        <div className="space-y-3"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-28 w-full" /><Skeleton className="h-20 w-full" /></div>
      ) : detail.isError ? (
        <ErrorState message={errorMessage(detail.error)} onRetry={() => detail.refetch()} />
      ) : row ? (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Badge tone={STATUS[row.status]?.tone}>{STATUS[row.status]?.label || row.status}</Badge>
            <Badge tone={PRIORITY[row.priority]?.tone}>{PRIORITY[row.priority]?.label || row.priority}</Badge>
            <Badge>{TYPES[row.type]?.label || row.type}</Badge>
            {row.pinned ? <Badge tone="warning"><Pin className="h-3 w-3" /> Pinned</Badge> : null}
          </div>

          <div className="whitespace-pre-line rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-sm leading-relaxed text-slate-700">
            {row.body}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Recipients', number(row.recipientCount)],
              ['Delivered', number(row.deliveredCount)],
              ['Read', number(row.readCount)],
              ['Email', row.sendEmail ? `${number(row.emailSentCount)} sent` : 'Not requested'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-slate-100 bg-white/70 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{value}</p>
              </div>
            ))}
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Read rate</span><span className="font-semibold text-slate-700">{row.readRate ?? 0}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-linear-to-r from-emerald-400 to-teal-500" style={{ width: `${Math.min(100, row.readRate ?? 0)}%` }} />
            </div>
          </div>

          <div className="grid gap-2 rounded-2xl border border-slate-100 p-4 text-xs sm:grid-cols-2">
            <p><span className="text-slate-400">Created:</span> <span className="font-medium text-slate-700">{dateOr(row.createdAt)}</span></p>
            <p><span className="text-slate-400">Published:</span> <span className="font-medium text-slate-700">{dateOr(row.publishedAt)}</span></p>
            <p><span className="text-slate-400">Expires:</span> <span className="font-medium text-slate-700">{dateOr(row.expiresAt, 'Never')}</span></p>
            <p><span className="text-slate-400">Email:</span> <span className="font-medium text-slate-700">{row.emailStatus}</span></p>
          </div>

          {row.recipients?.length ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">First recipients</p>
              <div className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-100">
                {row.recipients.map((person) => (
                  <div key={person.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-700">{person.name || person.email}</p>
                      <p className="truncate text-slate-400">{person.email}</p>
                    </div>
                    <Badge tone={person.readAt ? 'success' : person.deliveredAt ? 'brand' : 'neutral'}>
                      {person.readAt ? 'Read' : person.deliveredAt ? 'Delivered' : 'Pending'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

export default function AdminAnnouncements() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [priority, setPriority] = useState('all');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeKey, setComposeKey] = useState(0);
  const [editing, setEditing] = useState(null);
  const [detailsId, setDetailsId] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const search = useDebounced(term, 350);

  const list = useQuery({
    queryKey: ['admin-announcements', { status, type, priority, search, page, limit }],
    queryFn: async () => {
      const params = { status, type, priority, page, limit };
      if (search) params.search = search;
      return (await api.get('/admin/announcements', { params })).data;
    },
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });

  const action = useMutation({
    mutationFn: async ({ kind, row }) => {
      if (kind === 'publish') return (await api.post(`/admin/announcements/${row.id}/publish`)).data;
      if (kind === 'archive') return (await api.post(`/admin/announcements/${row.id}/archive`)).data;
      return (await api.post(`/admin/announcements/${row.id}/duplicate`)).data;
    },
    onSuccess: (data, variables) => {
      toast.success(data.message || 'Announcement updated.');
      queryClient.invalidateQueries({ queryKey: ['admin-announcements'] });
      setConfirm(null);
      if (variables.kind === 'duplicate' && data.announcement) {
        // The duplicate already exists as a draft. Open it for editing instead of
        // leaving the administrator to hunt for the new copy in the register.
        setEditing(data.announcement);
        setComposeKey((value) => value + 1);
        setComposeOpen(true);
      }
    },
    onError: (err) => toast.error(errorMessage(err, 'We could not complete that action.')),
  });

  const rows = list.data?.announcements ?? [];
  const counts = list.data?.counts?.byStatus ?? {};
  const tabs = [
    { key: 'all', label: 'All', count: list.data?.counts?.all ?? 0 },
    { key: 'draft', label: 'Drafts', count: counts.draft ?? 0 },
    { key: 'scheduled', label: 'Scheduled', count: counts.scheduled ?? 0 },
    { key: 'published', label: 'Published', count: counts.published ?? 0 },
    { key: 'expired', label: 'Expired', count: counts.expired ?? 0 },
    { key: 'archived', label: 'Archived', count: counts.archived ?? 0 },
  ];

  const openCreate = () => {
    setEditing(null);
    setComposeKey((value) => value + 1);
    setComposeOpen(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setComposeKey((value) => value + 1);
    setComposeOpen(true);
  };

  const resetFilters = () => {
    setStatus('all');
    setType('all');
    setPriority('all');
    setTerm('');
    setPage(1);
  };

  const hasFilters = Boolean(term || type !== 'all' || priority !== 'all' || status !== 'all');

  return (
    <div className="space-y-6">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-brand-600">Reach people</span>
            <LiveStamp updatedAt={list.dataUpdatedAt} label="Announcements live" />
          </div>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-slate-900">Announcements</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Send one clear notice to everyone, a whole role, or one person. Draft it now, schedule it for later, and see who actually read it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportMenu
            basePath="/admin/announcements/export"
            filenamePrefix="announcements"
            params={{ status, type, priority, ...(search ? { search } : {}) }}
            disabled={!rows.length}
          />
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New announcement
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader
          icon={Megaphone}
          title="Notice register"
          subtitle={list.isLoading ? 'Loading announcements…' : `${number(list.data?.total ?? 0)} matching, ${number(list.data?.counts?.all ?? 0)} in total`}
          action={
            <Button variant="ghost" size="sm" onClick={() => list.refetch()} loading={list.isFetching && !list.isLoading}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          }
        />
        <CardBody className="space-y-4">
          <FilterTabs
            tabs={tabs}
            value={status}
            onChange={(value) => { setStatus(value); setPage(1); }}
            label="Announcement status"
          />

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SearchInput
              id="announcement-search"
              value={term}
              onChange={(event) => { setTerm(event.target.value); setPage(1); }}
              placeholder="Search titles and text"
              label="Search announcements"
              loading={list.isFetching && Boolean(term)}
              className="w-full lg:max-w-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect label="Type" value={type} onChange={(value) => { setType(value); setPage(1); }}>
                <option value="all">All types</option>
                {Object.entries(TYPES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
              </FilterSelect>
              <FilterSelect label="Priority" value={priority} onChange={(value) => { setPriority(value); setPage(1); }}>
                <option value="all">All priorities</option>
                {Object.entries(PRIORITY).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
              </FilterSelect>
              {hasFilters ? (
                <button type="button" onClick={resetFilters} className="focus-ring rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-800">
                  Clear filters
                </button>
              ) : null}
            </div>
          </div>

          {list.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : list.isError ? (
            <ErrorState message={errorMessage(list.error)} onRetry={() => list.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={hasFilters ? Megaphone : BellRing}
              title={hasFilters ? 'No notices match' : 'No announcements yet'}
              message={
                hasFilters
                  ? 'Try a different status, type or search word. Clear the filters to see the whole register.'
                  : 'The first announcement will appear here. Write a welcome note, a timetable change, or an emergency notice.'
              }
              actionLabel={hasFilters ? 'Clear filters' : 'Write the first announcement'}
              onAction={hasFilters ? resetFilters : openCreate}
            />
          ) : (
            <div className="space-y-3">
              {rows.map((row) => {
                const typeMeta = TYPES[row.type] ?? TYPES.general;
                const TypeIcon = typeMeta.icon;
                const rate = row.readRate ?? 0;
                return (
                  <article
                    key={row.id}
                    className={`group relative overflow-hidden rounded-3xl border bg-white/80 p-4 transition hover:bg-white hover:shadow-md sm:p-5 ${
                      row.priority === 'critical' && row.status !== 'archived'
                        ? 'border-rose-200'
                        : row.priority === 'high' && row.status !== 'archived'
                          ? 'border-amber-200'
                          : 'border-slate-100'
                    }`}
                  >
                    {row.status !== 'archived' ? (
                      <span
                        aria-hidden="true"
                        className={`absolute inset-y-0 left-0 w-1 ${
                          row.priority === 'critical' ? 'bg-rose-400' : row.priority === 'high' ? 'bg-amber-400' : 'bg-brand-300'
                        }`}
                      />
                    ) : null}

                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 gap-3.5">
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${typeMeta.tone}`}>
                          <TypeIcon className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-bold leading-snug text-slate-900">{row.title}</h2>
                            {row.pinned ? <Pin className="h-3.5 w-3.5 text-amber-500" aria-label="Pinned" /> : null}
                            <Badge tone={STATUS[row.status]?.tone}>{STATUS[row.status]?.label || row.status}</Badge>
                            {row.priority !== 'normal' ? <Badge tone={PRIORITY[row.priority]?.tone}>{PRIORITY[row.priority]?.label}</Badge> : null}
                          </div>
                          <p className="mt-1.5 line-clamp-2 max-w-3xl text-sm leading-relaxed text-slate-600">{row.body}</p>
                          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-slate-400">
                            <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {audienceText(row)}</span>
                            <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> {row.status === 'scheduled' ? dateOr(row.publishAt) : dateOr(row.publishedAt, 'Draft')}</span>
                            {row.sendEmail ? <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> Email {row.emailSentCount ? `${row.emailSentCount} sent` : row.emailStatus}</span> : null}
                            <span>Edited {timeAgo(row.updatedAt || row.createdAt)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-start gap-2 sm:pl-3">
                        <div className="min-w-[138px] rounded-2xl bg-slate-50/80 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            <span>Read</span><span className="text-slate-700">{rate}%</span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
                            <div className="h-full rounded-full bg-linear-to-r from-emerald-400 to-teal-500" style={{ width: `${Math.min(100, rate)}%` }} />
                          </div>
                          <p className="mt-1.5 text-[10px] text-slate-400">{number(row.readCount)} of {number(row.recipientCount)} recipients</p>
                        </div>
                        <RowMenu
                          label={`Actions for ${row.title}`}
                          items={[
                            { label: 'Preview', icon: Eye, onClick: () => setDetailsId(row.id) },
                            row.status !== 'archived' && row.status !== 'published'
                              ? { label: 'Edit', icon: Pencil, onClick: () => openEdit(row) }
                              : null,
                            ['draft', 'scheduled'].includes(row.status)
                              ? { label: row.status === 'scheduled' ? 'Publish now' : 'Publish', icon: Send, onClick: () => setConfirm({ kind: 'publish', row }) }
                              : null,
                            { label: 'Duplicate', icon: Copy, onClick: () => action.mutate({ kind: 'duplicate', row }) },
                            row.status !== 'archived'
                              ? { separator: true }
                              : null,
                            row.status !== 'archived'
                              ? { label: 'Archive', icon: Archive, tone: 'danger', onClick: () => setConfirm({ kind: 'archive', row }) }
                              : null,
                          ]}
                        />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <Pagination
            page={page}
            pages={list.data?.pages ?? 1}
            total={list.data?.total ?? 0}
            limit={limit}
            onPage={setPage}
            onLimit={(value) => { setLimit(value); setPage(1); }}
          />
        </CardBody>
      </Card>

      {composeOpen ? (
        <ComposeModal
          key={`${editing?.id || 'new'}-${composeKey}`}
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          editing={editing}
          onSaved={() => {
            setEditing(null);
          }}
        />
      ) : null}

      <DetailModal id={detailsId} onClose={() => setDetailsId(null)} />

      <Modal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'publish' ? 'Publish this announcement?' : 'Archive this announcement?'}
        subtitle={
          confirm?.kind === 'publish'
            ? 'It will be delivered in-app immediately. If email was requested, the delivery job starts in the background.'
            : 'It leaves the active register but stays in the archive and the audit trail.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              variant={confirm?.kind === 'publish' ? 'primary' : 'danger'}
              loading={action.isPending}
              onClick={() => action.mutate(confirm)}
            >
              {confirm?.kind === 'publish' ? 'Publish now' : 'Archive'}
            </Button>
          </>
        }
      >
        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
          <p className="text-sm font-semibold text-slate-800">{confirm?.row?.title}</p>
          <p className="mt-1 text-xs text-slate-500">{confirm ? audienceText(confirm.row) : ''}</p>
          {confirm?.kind === 'publish' ? (
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-600">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              Publishing cannot be undone. You can archive the notice afterwards, but recipients will already have it.
            </p>
          ) : (
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-600">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
              Read and delivery counts stay in the record.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
