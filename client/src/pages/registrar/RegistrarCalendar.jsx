import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarDays, CalendarPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  REGISTRAR,
  cleanPayload,
  dateInput,
  displayDate,
  humanStatus,
  toneForStatus,
} from '../../lib/registrar';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import ConfirmDialog from '../../components/registrar/ConfirmDialog';
import { FormGrid, SelectField, TextAreaField } from '../../components/registrar/Fields';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';
import { ErrorState } from '../../components/ui/StatePanel';
import { SkeletonCard } from '../../components/ui/Skeleton';

const EVENT_LABELS = { registration: 'Registration', exam: 'Examination', important: 'Important date', holiday: 'Holiday' };

export default function RegistrarCalendar() {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const query = useQuery({
    queryKey: ['registrar', 'calendar'],
    queryFn: async () => (await api.get(`${REGISTRAR}/academic-calendar`)).data,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['registrar', 'calendar'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'dashboard'] });
  };

  const remove = useMutation({
    mutationFn: async () => (await api.delete(`${REGISTRAR}/academic-calendar/events/${deleting.id}`)).data,
    onSuccess: () => {
      toast.success('Calendar event removed.');
      setDeleting(null);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'The event could not be removed.')),
  });

  const years = query.data?.years ?? [];
  const terms = query.data?.terms ?? [];
  const events = query.data?.events ?? [];

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Academic calendar"
        subtitle="Academic years and terms frame every enrollment and result. Only a real registration event opens the student registration window."
        actions={
          <>
            <Button variant="secondary" onClick={() => setModal({ type: 'year' })}>
              <Plus className="h-4 w-4" /> Year
            </Button>
            <Button variant="secondary" onClick={() => setModal({ type: 'term' })}>
              <Plus className="h-4 w-4" /> Term
            </Button>
            <Button onClick={() => setModal({ type: 'event' })}>
              <CalendarPlus className="h-4 w-4" /> Event
            </Button>
          </>
        }
      />

      {query.isLoading ? (
        <div className="grid gap-5 lg:grid-cols-2"><SkeletonCard lines={5} /><SkeletonCard lines={5} /></div>
      ) : query.error ? (
        <Card><ErrorState message={query.error?.response?.data?.message || 'The academic calendar could not be loaded.'} onRetry={query.refetch} /></Card>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Academic years" subtitle="Only one year is current at a time." icon={CalendarDays} />
              <CardBody className="space-y-3">
                {years.length ? years.map((year) => (
                  <div key={year.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 p-3.5">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{year.label}</p>
                        {year.isCurrent ? <Badge tone="brand">Current</Badge> : null}
                        <Badge tone={toneForStatus(year.status)}>{humanStatus(year.status)}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{displayDate(year.startDate)} – {displayDate(year.endDate)}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setModal({ type: 'year', record: year })} aria-label={`Edit ${year.label}`}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                  </div>
                )) : <p className="text-sm text-slate-500">No academic year is configured. Add one before creating terms or events.</p>}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Terms and sessions" subtitle="Terms belong to an academic year." icon={CalendarDays} />
              <CardBody className="space-y-3">
                {terms.length ? terms.map((term) => (
                  <div key={term.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 p-3.5">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{term.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {term.academicYear?.label || 'Unknown year'} · {humanStatus(term.type)} {term.sequence ? `#${term.sequence}` : ''}
                      </p>
                      <p className="text-xs text-slate-400">{displayDate(term.startDate)} – {displayDate(term.endDate)}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setModal({ type: 'term', record: term })} aria-label={`Edit ${term.name}`}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                  </div>
                )) : <p className="text-sm text-slate-500">No term is configured.</p>}
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Calendar events"
              subtitle="Registration windows, examinations, holidays and important dates."
              icon={CalendarDays}
              action={<Button size="sm" variant="secondary" onClick={() => setModal({ type: 'event' })}><Plus className="h-3.5 w-3.5" /> Add event</Button>}
            />
            <CardBody className="space-y-3">
              {events.length ? events.map((event) => (
                <div key={event.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-slate-100 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                      <Badge tone={event.type === 'registration' ? 'brand' : event.type === 'exam' ? 'warning' : 'neutral'}>
                        {EVENT_LABELS[event.type] || humanStatus(event.type)}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {event.academicYear?.label || '—'}{event.term ? ` · ${event.term.name}` : ''} · {displayDate(event.startDate)} – {displayDate(event.endDate)}
                    </p>
                    {event.notes ? <p className="mt-1.5 text-xs text-slate-500">{event.notes}</p> : null}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setModal({ type: 'event', record: event })} aria-label={`Edit ${event.title}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDeleting(event)} aria-label={`Delete ${event.title}`}>
                      <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                    </Button>
                  </div>
                </div>
              )) : <p className="text-sm text-slate-500">No calendar event has been added yet.</p>}
            </CardBody>
          </Card>
        </>
      )}

      <CalendarModal
        modal={modal}
        years={years}
        terms={terms}
        onClose={() => setModal(null)}
        onSaved={invalidate}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Remove calendar event?"
        message={deleting ? `${deleting.title} will be removed from the calendar. Existing records are not changed.` : ''}
        confirmLabel="Remove event"
        tone="danger"
        loading={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

function CalendarModal({ modal, years, terms, onClose, onSaved }) {
  const type = modal?.type;
  const record = modal?.record;
  const editing = Boolean(record);
  const [form, setForm] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!modal) return;
    setError('');
    if (type === 'year') {
      setForm({
        label: record?.label || '',
        startDate: dateInput(record?.startDate),
        endDate: dateInput(record?.endDate),
        isCurrent: record?.isCurrent ?? false,
        status: record?.status || 'planned',
      });
    } else if (type === 'term') {
      setForm({
        academicYear: record?.academicYear?.id || years[0]?.id || '',
        name: record?.name || '',
        sequence: record?.sequence || 1,
        type: record?.type || 'semester',
        startDate: dateInput(record?.startDate),
        endDate: dateInput(record?.endDate),
      });
    } else {
      setForm({
        academicYear: record?.academicYear?.id || years[0]?.id || '',
        term: record?.term?.id || '',
        type: record?.type || 'registration',
        title: record?.title || '',
        startDate: dateInput(record?.startDate),
        endDate: dateInput(record?.endDate),
        notes: record?.notes || '',
      });
    }
  }, [modal, type, record, years]);

  const availableTerms = useMemo(
    () => terms.filter((term) => !form.academicYear || term.academicYear?.id === form.academicYear),
    [terms, form.academicYear],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (type === 'year') {
        if (!form.label.trim() || !form.startDate || !form.endDate) throw new Error('Label, start date and end date are required.');
        const path = `${REGISTRAR}/academic-calendar/years${editing ? `/${record.id}` : ''}`;
        return (await api.request({ url: path, method: editing ? 'patch' : 'post', data: cleanPayload(form) })).data;
      }
      if (type === 'term') {
        if (!form.academicYear || !form.name.trim() || !form.startDate || !form.endDate) throw new Error('Academic year, name and dates are required.');
        const path = `${REGISTRAR}/academic-calendar/terms${editing ? `/${record.id}` : ''}`;
        return (await api.request({
          url: path,
          method: editing ? 'patch' : 'post',
          data: cleanPayload({ ...form, sequence: Number(form.sequence) || 1 }),
        })).data;
      }
      if (!form.academicYear || !form.title.trim() || !form.startDate || !form.endDate) throw new Error('Academic year, title and dates are required.');
      const path = `${REGISTRAR}/academic-calendar/events${editing ? `/${record.id}` : ''}`;
      return (await api.request({
        url: path,
        method: editing ? 'patch' : 'post',
        data: cleanPayload({ ...form, term: form.term || null }),
      })).data;
    },
    onSuccess: () => {
      toast.success(editing ? 'Calendar record updated.' : 'Calendar record added.');
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'The calendar record could not be saved.');
      setError(message);
      toast.error(message);
    },
  });

  const title = type === 'year' ? (editing ? 'Edit academic year' : 'Add academic year') : type === 'term' ? (editing ? 'Edit term' : 'Add term') : (editing ? 'Edit event' : 'Add calendar event');
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  return (
    <Modal
      open={Boolean(modal)}
      title={title}
      subtitle={type === 'event' ? 'Registration and examination windows cannot overlap another window of the same type.' : 'Dates are stored in the college timezone.'}
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>{editing ? 'Save changes' : 'Add record'}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        {type === 'year' ? (
          <FormGrid>
            <Field label="Year label" value={form.label || ''} onChange={(event) => set('label', event.target.value)} placeholder="e.g. 2019 E.C." required />
            <SelectField label="Status" value={form.status || 'planned'} onChange={(event) => set('status', event.target.value)}>
              <option value="planned">Planned</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </SelectField>
            <Field label="Start date" type="date" value={form.startDate || ''} onChange={(event) => set('startDate', event.target.value)} required />
            <Field label="End date" type="date" value={form.endDate || ''} onChange={(event) => set('endDate', event.target.value)} required />
            <label className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white/80 px-3.5 py-3 text-sm text-slate-700">
              <input type="checkbox" checked={Boolean(form.isCurrent)} onChange={(event) => set('isCurrent', event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600" />
              Make this the current academic year
            </label>
          </FormGrid>
        ) : type === 'term' ? (
          <FormGrid>
            <SelectField label="Academic year" value={form.academicYear || ''} onChange={(event) => set('academicYear', event.target.value)} required>
              <option value="">Choose a year</option>
              {years.map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}
            </SelectField>
            <Field label="Term name" value={form.name || ''} onChange={(event) => set('name', event.target.value)} placeholder="e.g. Semester I" required />
            <Field label="Sequence" type="number" min="1" value={form.sequence || 1} onChange={(event) => set('sequence', event.target.value)} />
            <SelectField label="Type" value={form.type || 'semester'} onChange={(event) => set('type', event.target.value)}>
              <option value="semester">Semester</option>
              <option value="term">Term</option>
              <option value="session">Session</option>
            </SelectField>
            <Field label="Start date" type="date" value={form.startDate || ''} onChange={(event) => set('startDate', event.target.value)} required />
            <Field label="End date" type="date" value={form.endDate || ''} onChange={(event) => set('endDate', event.target.value)} required />
          </FormGrid>
        ) : (
          <FormGrid>
            <SelectField label="Academic year" value={form.academicYear || ''} onChange={(event) => { set('academicYear', event.target.value); set('term', ''); }} required>
              <option value="">Choose a year</option>
              {years.map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}
            </SelectField>
            <SelectField label="Term" value={form.term || ''} onChange={(event) => set('term', event.target.value)}>
              <option value="">Whole year / not term-specific</option>
              {availableTerms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
            </SelectField>
            <SelectField label="Event type" value={form.type || 'registration'} onChange={(event) => set('type', event.target.value)}>
              {Object.entries(EVENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </SelectField>
            <Field label="Title" value={form.title || ''} onChange={(event) => set('title', event.target.value)} placeholder="e.g. Semester I registration" required />
            <Field label="Start date" type="date" value={form.startDate || ''} onChange={(event) => set('startDate', event.target.value)} required />
            <Field label="End date" type="date" value={form.endDate || ''} onChange={(event) => set('endDate', event.target.value)} required />
            <TextAreaField className="sm:col-span-2" label="Notes" rows={3} value={form.notes || ''} onChange={(event) => set('notes', event.target.value)} />
          </FormGrid>
        )}
      </div>
    </Modal>
  );
}
