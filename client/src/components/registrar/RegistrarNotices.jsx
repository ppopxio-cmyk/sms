import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Archive,
  Bell,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Info,
  Megaphone,
  Pencil,
  Plus,
  Send,
  Users,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  REGISTRAR,
  dateTimeInput,
  displayDateTime,
  humanStatus,
  toneForStatus,
} from '../../lib/registrar';
import { useDebounced } from '../../lib/useDebounced';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import ConfirmDialog from '../../components/registrar/ConfirmDialog';
import { FormGrid, SelectField, TextAreaField } from '../../components/registrar/Fields';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';
import { EmptyState, ErrorState } from '../../components/ui/StatePanel';
import { Skeleton } from '../../components/ui/Skeleton';

const TYPES = ['general', 'academic', 'exam', 'event', 'administrative', 'emergency', 'holiday', 'finance'];
const PRIORITIES = ['normal', 'high', 'critical'];

const audienceLabel = (row) => {
  if (row.audience === 'role') return row.audienceRole === 'ACCOUNTANT' ? 'All accountants' : 'All teachers';
  if (row.audience === 'user') return 'One named account';
  return 'Restricted audience';
};

const isEditable = (row) => ['draft', 'scheduled'].includes(row.status);

export default function RegistrarNotices({ kind = 'announcement' }) {
  const queryClient = useQueryClient();
  const noun = kind === 'notification' ? 'notification' : 'announcement';
  const plural = kind === 'notification' ? 'notifications' : 'announcements';
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [compose, setCompose] = useState(null);
  const [archiving, setArchiving] = useState(null);
  const [publishing, setPublishing] = useState(null);

  const params = useMemo(() => ({
    kind,
    page,
    limit,
    ...(debounced.trim() ? { search: debounced.trim() } : {}),
    ...(status !== 'all' ? { status } : {}),
    sort,
    order,
  }), [kind, page, limit, debounced, status, sort, order]);

  const query = useQuery({
    queryKey: ['registrar', 'notices', params],
    queryFn: async () => (await api.get(`${REGISTRAR}/announcements`, { params })).data,
    placeholderData: (previous) => previous,
  });

  const summary = useQuery({
    queryKey: ['registrar', 'notification-summary'],
    queryFn: async () => (await api.get(`${REGISTRAR}/notifications/summary`)).data,
    enabled: kind === 'notification',
  });

  const rows = query.data?.rows ?? [];
  const pagination = query.data?.pagination ?? { page: 1, pages: 1, total: 0, limit };
  const filtered = Boolean(debounced.trim() || status !== 'all');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['registrar', 'notices'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const publish = useMutation({
    mutationFn: async () => (await api.post(`${REGISTRAR}/announcements/${publishing.id}/publish`)).data,
    onSuccess: (data) => {
      toast.success(`Published to ${data.notice?.recipientCount ?? 'the selected'} recipient${data.notice?.recipientCount === 1 ? '' : 's'}.`);
      setPublishing(null);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'The notice could not be published.')),
  });

  const archive = useMutation({
    mutationFn: async () => (await api.post(`${REGISTRAR}/announcements/${archiving.id}/archive`)).data,
    onSuccess: () => {
      toast.success('Notice archived.');
      setArchiving(null);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'The notice could not be archived.')),
  });

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title={kind === 'notification' ? 'Notifications' : 'Announcements'}
        subtitle={kind === 'notification'
          ? 'Send short operational notifications to all teachers, all accountants, or one eligible account. Administrator accounts are never eligible.'
          : 'Publish academic notices to all teachers, all accountants, or one eligible account. Recipients are revalidated on the server at send time.'}
        actions={<Button onClick={() => setCompose({ record: null })} className="gap-2"><Plus className="h-4 w-4" /> New {noun}</Button>}
      />

      {kind === 'notification' ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50/70 px-4 py-3 text-sm text-brand-900">
          <BellRing className="h-4 w-4 shrink-0" />
          <p className="min-w-0 flex-1">This page manages notices you send. Your own inbox has {summary.data?.unread ?? 0} unread notification{summary.data?.unread === 1 ? '' : 's'}.</p>
          <a href="/notifications" className="focus-ring rounded-lg text-xs font-semibold underline">Open my inbox</a>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-sky-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Recipients are limited by policy to all teachers, all accountants, or one active teacher/accountant. The Admin account and an all-users broadcast are not available.</p>
        </div>
      )}

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <SearchInput value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={`Search ${plural} by title or text`} loading={query.isFetching} />
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="all">All statuses</option>
              {['draft', 'scheduled', 'published', 'expired', 'archived'].map((value) => <option key={value} value={value}>{humanStatus(value)}</option>)}
            </SelectField>
            <SelectField label="Sort" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="createdAt">Newest created</option>
              <option value="publishAt">Publish date</option>
              <option value="status">Status</option>
            </SelectField>
            <SelectField label="Order" value={order} onChange={(event) => setOrder(event.target.value)}>
              <option value="desc">Newest first</option>
              <option value="asc">Oldest first</option>
            </SelectField>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title={kind === 'notification' ? 'Sent notifications' : 'Announcement history'}
          subtitle="Only notices created by your Registrar account are listed."
          icon={kind === 'notification' ? Bell : Megaphone}
          action={<Badge tone="neutral">{pagination.total ?? 0} total</Badge>}
        />
        <CardBody className="space-y-3">
          {query.isLoading ? (
            <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
          ) : query.error ? (
            <ErrorState message={query.error?.response?.data?.message || `${humanStatus(plural)} could not be loaded.`} onRetry={query.refetch} />
          ) : rows.length ? rows.map((row) => (
            <article key={row.id} className="rounded-2xl border border-slate-100 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">{row.title}</h3>
                    <Badge tone={toneForStatus(row.status)}>{humanStatus(row.status)}</Badge>
                    {row.priority !== 'normal' ? <Badge tone={row.priority === 'critical' ? 'danger' : 'warning'}>{humanStatus(row.priority)}</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    To {audienceLabel(row)} · {row.recipientCount ?? 0} recipient{(row.recipientCount ?? 0) === 1 ? '' : 's'}
                    {row.deliveredCount !== undefined ? ` · ${row.deliveredCount} delivered` : ''}
                    {row.readCount !== undefined ? ` · ${row.readCount} read` : ''}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{row.body}</p>
                  <p className="mt-2 text-[11px] text-slate-400">
                    {row.status === 'scheduled' && row.publishAt ? `Scheduled for ${displayDateTime(row.publishAt)}` : row.publishedAt ? `Published ${displayDateTime(row.publishedAt)}` : `Created ${displayDateTime(row.createdAt)}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {isEditable(row) ? (
                    <Button size="sm" variant="secondary" onClick={() => setCompose({ record: row })}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                  ) : null}
                  {['draft', 'scheduled'].includes(row.status) ? (
                    <Button size="sm" onClick={() => setPublishing(row)}><Send className="h-3.5 w-3.5" /> Publish</Button>
                  ) : null}
                  {row.status !== 'archived' ? (
                    <Button size="sm" variant="ghost" onClick={() => setArchiving(row)}><Archive className="h-3.5 w-3.5" /> Archive</Button>
                  ) : null}
                </div>
              </div>
            </article>
          )) : (
            <EmptyState
              title={filtered ? 'No notice matches' : `No ${plural} yet`}
              message={filtered ? 'Try a different search or status.' : `Create the first ${noun} for an eligible audience.`}
            />
          )}
          <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPage={setPage} onLimit={(value) => { setLimit(value); setPage(1); }} />
        </CardBody>
      </Card>

      <ComposeNoticeModal
        open={Boolean(compose)}
        kind={kind}
        record={compose?.record}
        onClose={() => setCompose(null)}
        onSaved={invalidate}
      />
      <ConfirmDialog
        open={Boolean(publishing)}
        title={`Publish this ${noun} now?`}
        message={publishing ? `${publishing.title} will be sent to ${audienceLabel(publishing).toLowerCase()}. The server checks the audience again before delivery.` : ''}
        confirmLabel={`Publish ${noun}`}
        loading={publish.isPending}
        onClose={() => setPublishing(null)}
        onConfirm={() => publish.mutate()}
      />
      <ConfirmDialog
        open={Boolean(archiving)}
        title={`Archive this ${noun}?`}
        message={archiving ? `${archiving.title} will be removed from active delivery. The history and recipient record are preserved.` : ''}
        confirmLabel="Archive notice"
        tone="danger"
        loading={archive.isPending}
        onClose={() => setArchiving(null)}
        onConfirm={() => archive.mutate()}
      />
    </div>
  );
}

function ComposeNoticeModal({ open, kind, record, onClose, onSaved }) {
  const [form, setForm] = useState(defaultForm(kind));
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const debouncedEmail = useDebounced(form.audienceEmail, 350);
  const emailReady = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(debouncedEmail || '');
  const audienceReady = form.audience === 'role' || (form.audience === 'user' && emailReady);

  useEffect(() => {
    if (!open) return;
    setSent(false);
    setError('');
    setForm(record ? {
      ...defaultForm(kind),
      title: record.title || '',
      body: record.body || '',
      type: record.type || 'general',
      priority: record.priority || 'normal',
      audience: record.audience === 'user' ? 'user' : 'role',
      audienceRole: record.audienceRole || 'TEACHER',
      audienceEmail: '',
      delivery: record.status === 'scheduled' ? 'scheduled' : 'now',
      scheduledFor: dateTimeInput(record.publishAt),
    } : defaultForm(kind));
  }, [open, record, kind]);

  const preview = useQuery({
    queryKey: ['registrar', 'audience-preview', form.audience, form.audienceRole, debouncedEmail],
    queryFn: async () => (await api.post(`${REGISTRAR}/announcements/audience`, {
      audience: form.audience,
      audienceRole: form.audience === 'role' ? form.audienceRole : null,
      audienceEmail: form.audience === 'user' ? debouncedEmail : '',
    })).data,
    enabled: open && audienceReady,
    staleTime: 15_000,
    retry: false,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (form.title.trim().length < 3) throw new Error('Write a title of at least 3 characters.');
      if (form.body.trim().length < 3) throw new Error('Write the notice body.');
      if (form.audience === 'user' && !emailReady) throw new Error('Enter a valid email for the single recipient.');
      if (form.delivery === 'scheduled' && !form.scheduledFor) throw new Error('Choose the date and time to publish.');
      const payload = {
        title: form.title.trim(),
        body: form.body.trim(),
        type: form.type,
        priority: form.priority,
        audience: form.audience,
        audienceRole: form.audience === 'role' ? form.audienceRole : null,
        audienceEmail: form.audience === 'user' ? form.audienceEmail.trim().toLowerCase() : '',
        scheduledFor: form.delivery === 'scheduled' ? new Date(form.scheduledFor).toISOString() : null,
        kind,
      };
      if (record) {
        const saved = (await api.patch(`${REGISTRAR}/announcements/${record.id}`, payload)).data;
        if (form.delivery === 'now') {
          return (await api.post(`${REGISTRAR}/announcements/${record.id}/publish`)).data;
        }
        return saved;
      }
      return (await api.post(`${REGISTRAR}/announcements`, payload)).data;
    },
    onSuccess: (data) => {
      setSent(true);
      toast.success(record ? 'Notice updated.' : form.delivery === 'scheduled' ? 'Notice scheduled.' : `Notice published to ${data.notice?.recipientCount ?? 'the selected'} recipient${data.notice?.recipientCount === 1 ? '' : 's'}.`);
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'The notice could not be saved.');
      setError(message);
      toast.error(message);
    },
  });

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const title = record ? `Edit ${kind}` : `New ${kind}`;

  return (
    <Modal
      open={open}
      title={title}
      subtitle={kind === 'notification'
        ? 'Notifications are short operational messages. They use the same restricted audience rules as announcements.'
        : 'Choose a permitted audience and review the recipient count before sending.'}
      size="lg"
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={<><Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!audienceReady}><Send className="h-3.5 w-3.5" /> {record ? 'Save changes' : form.delivery === 'scheduled' ? 'Schedule notice' : 'Publish now'}</Button></>}
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <Field label="Title" value={form.title} onChange={(event) => set('title', event.target.value)} placeholder="e.g. Semester I registration reminder" maxLength={160} required />
        <TextAreaField label="Body" rows={kind === 'notification' ? 3 : 5} value={form.body} onChange={(event) => set('body', event.target.value)} placeholder="Write the message teachers or accountants should receive." maxLength={kind === 'notification' ? 300 : 5000} required hint={kind === 'notification' ? `${form.body.length} / 300 characters.` : `${form.body.length} / 5000 characters.`} />

        <FormGrid>
          <SelectField label="Type" value={form.type} onChange={(event) => set('type', event.target.value)}>
            {TYPES.map((value) => <option key={value} value={value}>{humanStatus(value)}</option>)}
          </SelectField>
          <SelectField label="Priority" value={form.priority} onChange={(event) => set('priority', event.target.value)}>
            {PRIORITIES.map((value) => <option key={value} value={value}>{humanStatus(value)}</option>)}
          </SelectField>
          <SelectField label="Audience" value={form.audience} onChange={(event) => { set('audience', event.target.value); if (event.target.value === 'role' && !form.audienceRole) set('audienceRole', 'TEACHER'); }}>
            <option value="role">All teachers or all accountants</option>
            <option value="user">One teacher or accountant</option>
          </SelectField>
          {form.audience === 'role' ? (
            <SelectField label="Role" value={form.audienceRole} onChange={(event) => set('audienceRole', event.target.value)}>
              <option value="TEACHER">All teachers</option>
              <option value="ACCOUNTANT">All accountants</option>
            </SelectField>
          ) : (
            <Field label="Recipient email" type="email" value={form.audienceEmail} onChange={(event) => set('audienceEmail', event.target.value)} placeholder="name@college.edu.et" hint="Must belong to an active teacher or accountant." required />
          )}
          <SelectField label="Delivery" value={form.delivery} onChange={(event) => set('delivery', event.target.value)}>
            <option value="now">{record ? 'Publish when saved' : 'Publish now'}</option>
            <option value="scheduled">Schedule for later</option>
          </SelectField>
          {form.delivery === 'scheduled' ? (
            <Field label="Publish date and time" type="datetime-local" value={form.scheduledFor} onChange={(event) => set('scheduledFor', event.target.value)} required />
          ) : null}
        </FormGrid>

        <div className={`rounded-2xl border p-4 text-sm ${preview.error ? 'border-rose-100 bg-rose-50 text-rose-800' : 'border-slate-100 bg-slate-50 text-slate-700'}`}>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            <Users className="h-3.5 w-3.5" /> Recipient preview
          </p>
          {!audienceReady ? (
            <p className="mt-1 text-xs">Enter a valid email to preview the single recipient.</p>
          ) : preview.isLoading ? (
            <p className="mt-1 text-xs">Counting active recipients…</p>
          ) : preview.error ? (
            <p className="mt-1 text-xs">{preview.error?.response?.data?.message || 'The audience could not be checked.'}</p>
          ) : (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold tabular-nums">{preview.data?.count ?? 0}</span>
              <span className="text-xs">active recipient{preview.data?.count === 1 ? '' : 's'}</span>
              {preview.data?.sample?.length ? <span className="text-xs text-slate-500">· {preview.data.sample.slice(0, 2).map((row) => row.name || row.email).join(', ')}{preview.data.count > 2 ? '…' : ''}</span> : null}
              {preview.data?.count ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : null}
            </div>
          )}
          {form.delivery === 'scheduled' ? (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500"><CalendarClock className="h-3 w-3" /> The audience is checked again at send time. If it is no longer eligible, the send is blocked rather than widened.</p>
          ) : null}
        </div>
        {sent ? <p className="text-xs text-emerald-700">Saved. The list refreshes automatically.</p> : null}
      </div>
    </Modal>
  );
}

function defaultForm(kind) {
  return {
    title: '',
    body: '',
    type: 'general',
    priority: 'normal',
    audience: 'role',
    audienceRole: 'TEACHER',
    audienceEmail: '',
    delivery: 'now',
    scheduledFor: '',
    kind,
  };
}
