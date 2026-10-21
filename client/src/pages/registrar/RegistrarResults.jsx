import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ClipboardCheck, Eye, PencilLine, ThumbsDown } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  REGISTRAR,
  displayDateTime,
  humanStatus,
  toneForStatus,
} from '../../lib/registrar';
import { useDebounced } from '../../lib/useDebounced';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import ConfirmDialog from '../../components/registrar/ConfirmDialog';
import { SelectField, TextAreaField } from '../../components/registrar/Fields';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';

export default function RegistrarResults() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [academicYear, setAcademicYear] = useState('');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [detailId, setDetailId] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [correcting, setCorrecting] = useState(null);
  const [publishing, setPublishing] = useState(null);

  const options = useQuery({
    queryKey: ['registrar', 'students', 'options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/options`)).data,
    staleTime: 5 * 60_000,
  });
  const calendar = useQuery({
    queryKey: ['registrar', 'calendar'],
    queryFn: async () => (await api.get(`${REGISTRAR}/academic-calendar`)).data,
    staleTime: 5 * 60_000,
  });

  const params = useMemo(() => ({
    page,
    limit,
    ...(debounced.trim() ? { search: debounced.trim() } : {}),
    ...(academicYear ? { academicYear } : {}),
    ...(term ? { term } : {}),
    ...(status !== 'all' ? { status } : {}),
    sort,
    order,
  }), [page, limit, debounced, academicYear, term, status, sort, order]);

  const query = useQuery({
    queryKey: ['registrar', 'results', params],
    queryFn: async () => (await api.get(`${REGISTRAR}/results`, { params })).data,
    placeholderData: (previous) => previous,
  });

  const rows = query.data?.rows ?? [];
  const pagination = query.data?.pagination ?? { page: 1, pages: 1, total: 0, limit };
  const counts = query.data?.counts ?? {};
  const missing = query.data?.missing ?? [];
  const filtered = Boolean(debounced.trim() || academicYear || term || status !== 'all');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['registrar', 'results'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'dashboard'] });
  };

  const simpleAction = useMutation({
    mutationFn: async ({ id, action }) => (await api.post(`${REGISTRAR}/results/${id}/${action}`)).data,
    onSuccess: (_data, variables) => {
      toast.success(variables.action === 'review' ? 'Result taken under review.' : variables.action === 'approve' ? 'Result approved and graded.' : 'Result published.');
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'The result action could not be completed.')),
  });

  const publish = useMutation({
    mutationFn: async () => (await api.post(`${REGISTRAR}/results/${publishing.id}/publish`)).data,
    onSuccess: () => {
      toast.success('Result published. It is now available to the student record.');
      setPublishing(null);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'The result could not be published.')),
  });

  const reject = useMutation({
    mutationFn: async (reason) => (await api.post(`${REGISTRAR}/results/${rejecting.id}/reject`, { reason })).data,
    onSuccess: () => {
      toast.success('Result returned for correction.');
      setRejecting(null);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'The result could not be rejected.')),
  });

  const correct = useMutation({
    mutationFn: async ({ totalMark, reason }) => (await api.patch(`${REGISTRAR}/results/${correcting.id}/correct`, {
      totalMark: Number(totalMark),
      reason,
    })).data,
    onSuccess: () => {
      toast.success('Correction recorded. The result is under review and is not silently overwritten.');
      setCorrecting(null);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'The correction could not be recorded.')),
  });

  const columns = [
    {
      key: 'student',
      label: 'Student',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-900">{row.student?.fullName || '—'}</p>
          <p className="text-xs text-slate-500">{row.student?.studentId || '—'}</p>
        </div>
      ),
    },
    {
      key: 'course',
      label: 'Course',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-800">{row.course?.code || '—'}</p>
          <p className="text-xs text-slate-500">{row.course?.title || '—'}</p>
        </div>
      ),
    },
    {
      key: 'mark',
      label: 'Mark / grade',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold tabular-nums text-slate-800">{row.totalMark ?? '—'}</p>
          <p className="text-xs text-slate-500">{row.letterGrade || 'Ungraded'}{row.gradePoint !== undefined ? ` · ${row.gradePoint}` : ''}</p>
        </div>
      ),
    },
    { key: 'year', label: 'Year / term', render: (row) => `${row.academicYear || '—'} · ${row.term || row.offering?.term || '—'}` },
    { key: 'status', label: 'Status', render: (row) => <Badge tone={toneForStatus(row.status)}>{humanStatus(row.status)}</Badge> },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      mobileFull: true,
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setDetailId(row.id)} aria-label="Open result"><Eye className="h-3.5 w-3.5" /></Button>
          {['submitted', 'rejected'].includes(row.status) ? (
            <Button size="sm" variant="secondary" onClick={() => simpleAction.mutate({ id: row.id, action: 'review' })}>Review</Button>
          ) : null}
          {['submitted', 'under_review'].includes(row.status) ? (
            <Button size="sm" onClick={() => simpleAction.mutate({ id: row.id, action: 'approve' })}>Approve</Button>
          ) : null}
          {['approved', 'submitted', 'under_review'].includes(row.status) ? (
            <Button size="sm" variant="secondary" onClick={() => setPublishing(row)}>Publish</Button>
          ) : null}
          {['submitted', 'under_review', 'approved', 'published'].includes(row.status) ? (
            <Button size="sm" variant="ghost" onClick={() => setRejecting(row)} aria-label="Reject result"><ThumbsDown className="h-3.5 w-3.5 text-rose-500" /></Button>
          ) : null}
          {['approved', 'published'].includes(row.status) ? (
            <Button size="sm" variant="ghost" onClick={() => setCorrecting(row)} aria-label="Correct result"><PencilLine className="h-3.5 w-3.5" /></Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Results review"
        subtitle="Review submitted marks against the configured grading policy. Approval sets the letter grade; corrections are versioned rather than overwritten."
      />

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {['all', 'submitted', 'under_review', 'approved', 'published', 'rejected'].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => { setStatus(value); setPage(1); }}
            className={`focus-ring rounded-2xl border p-3 text-left transition ${status === value ? 'border-brand-200 bg-brand-50/70' : 'border-slate-100 bg-white/70 hover:bg-white'}`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{humanStatus(value)}</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{counts[value] ?? 0}</p>
          </button>
        ))}
      </section>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <SearchInput value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search student name or ID" loading={query.isFetching} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField label="Academic year" value={academicYear} onChange={(event) => { setAcademicYear(event.target.value); setTerm(''); setPage(1); }}>
              <option value="">All years</option>
              {(options.data?.academicYears || []).map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
            </SelectField>
            <SelectField label="Term" value={term} onChange={(event) => { setTerm(event.target.value); setPage(1); }}>
              <option value="">All terms</option>
              {Array.from(new Set((calendar.data?.terms || []).filter((row) => !academicYear || row.academicYear?.id === academicYear).map((row) => row.name))).map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </SelectField>
            <SelectField label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="all">All statuses</option>
              {['draft', 'submitted', 'under_review', 'approved', 'published', 'rejected'].map((value) => <option key={value} value={value}>{humanStatus(value)}</option>)}
            </SelectField>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Sort</span>
              <div className="flex gap-2">
                <select value={sort} onChange={(event) => setSort(event.target.value)} className="focus-ring h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                  <option value="createdAt">Newest</option>
                  <option value="totalMark">Mark</option>
                  <option value="status">Status</option>
                </select>
                <button type="button" onClick={() => setOrder((value) => value === 'asc' ? 'desc' : 'asc')} className="focus-ring h-11 w-11 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600" aria-label="Toggle sort order">
                  {order === 'asc' ? '↑' : '↓'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {missing.length ? (
        <Card>
          <CardHeader title="Published results missing" subtitle="Offerings with registered students who do not yet have a published result." icon={AlertTriangle} />
          <CardBody className="space-y-2">
            {missing.slice(0, 8).map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
                <span>{row.course?.code} · {row.course?.title} · {row.term}</span>
                <span>{row.missing} of {row.registered} missing</span>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Result records</h2>
            <p className="mt-0.5 text-xs text-slate-500">{pagination.total ?? 0} result{pagination.total === 1 ? '' : 's'}</p>
          </div>
          <ClipboardCheck className="h-4 w-4 text-slate-300" />
        </div>
        <RegistrarTable
          columns={columns}
          rows={rows}
          loading={query.isLoading}
          error={query.error ? query.error?.response?.data?.message || 'Results could not be loaded.' : null}
          onRetry={query.refetch}
          rowKey={(row) => row.id}
          onRowClick={(row) => setDetailId(row.id)}
          noResults={filtered}
          emptyTitle="No results yet"
          emptyMessage="Submitted results appear here for review."
        />
        <div className="px-5 pb-4">
          <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPage={setPage} onLimit={(value) => { setLimit(value); setPage(1); }} />
        </div>
      </Card>

      <ResultDetailModal
        resultId={detailId}
        onClose={() => setDetailId(null)}
        onAction={(kind, row) => {
          if (kind === 'reject') setRejecting(row);
          else if (kind === 'correct') setCorrecting(row);
          else if (kind === 'publish') setPublishing(row);
          else simpleAction.mutate({ id: row.id, action: kind });
        }}
        actionPending={simpleAction.isPending}
      />

      <ConfirmDialog
        open={Boolean(publishing)}
        title="Publish this result?"
        message={publishing ? `${publishing.student?.fullName} · ${publishing.course?.code}. The grade is fixed by the current grading policy and becomes part of the academic record.` : ''}
        confirmLabel="Publish result"
        loading={publish.isPending}
        onClose={() => setPublishing(null)}
        onConfirm={() => publish.mutate()}
      />
      <ConfirmDialog
        open={Boolean(rejecting)}
        title="Return result for correction"
        message={rejecting ? `${rejecting.student?.fullName} · ${rejecting.course?.code}. The result becomes rejected and the reason is kept in the revision history.` : ''}
        confirmLabel="Reject result"
        tone="danger"
        loading={reject.isPending}
        reason={{ label: 'Reason', minLength: 5, placeholder: 'What needs to be corrected?' }}
        onClose={() => setRejecting(null)}
        onConfirm={(reason) => reject.mutate(reason)}
      />
      <CorrectionModal
        result={correcting}
        onClose={() => setCorrecting(null)}
        onSaved={(values) => correct.mutate(values)}
        loading={correct.isPending}
      />
    </div>
  );
}

function ResultDetailModal({ resultId, onClose, onAction, actionPending }) {
  const query = useQuery({
    queryKey: ['registrar', 'result', resultId],
    queryFn: async () => (await api.get(`${REGISTRAR}/results/${resultId}`)).data,
    enabled: Boolean(resultId),
  });
  const result = query.data?.result;

  return (
    <Modal
      open={Boolean(resultId)}
      title="Result detail"
      subtitle={result ? `${result.student?.fullName} · ${result.course?.code} · ${result.offering?.academicYear?.label || ''}` : 'Loading the submitted record.'}
      size="lg"
      onClose={onClose}
      footer={result ? (
        <div className="flex flex-wrap justify-end gap-2">
          {['submitted', 'rejected'].includes(result.status) ? <Button variant="secondary" onClick={() => onAction('review', result)}>Take under review</Button> : null}
          {['submitted', 'under_review'].includes(result.status) ? <Button onClick={() => onAction('approve', result)} loading={actionPending}>Approve</Button> : null}
          {['approved', 'submitted', 'under_review'].includes(result.status) ? <Button variant="secondary" onClick={() => onAction('publish', result)}>Publish</Button> : null}
          {['submitted', 'under_review', 'approved', 'published'].includes(result.status) ? <Button variant="ghost" onClick={() => onAction('reject', result)}>Reject</Button> : null}
          {['approved', 'published'].includes(result.status) ? <Button variant="secondary" onClick={() => onAction('correct', result)}>Correct</Button> : null}
        </div>
      ) : null}
    >
      {query.isLoading ? <p className="py-6 text-center text-sm text-slate-500">Loading…</p> : query.error ? (
        <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{query.error?.response?.data?.message || 'The result could not be loaded.'}</p>
      ) : result ? (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-400">Total mark</p><p className="text-xl font-bold text-slate-900">{result.totalMark ?? '—'}</p></div>
            <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-400">Grade</p><p className="text-xl font-bold text-slate-900">{result.letterGrade || '—'} <span className="text-sm text-slate-500">{result.gradePoint ?? ''}</span></p></div>
            <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-400">Status</p><Badge tone={toneForStatus(result.status)}>{humanStatus(result.status)}</Badge></div>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-slate-400">Course</dt><dd className="text-slate-700">{result.course?.code} · {result.course?.title}</dd></div>
            <div><dt className="text-xs text-slate-400">Offering</dt><dd className="text-slate-700">{result.offering?.term || result.term} · {result.offering?.teacher?.name || 'No teacher'}</dd></div>
            <div><dt className="text-xs text-slate-400">Submitted</dt><dd className="text-slate-700">{displayDateTime(result.submittedAt || result.createdAt)}</dd></div>
            <div><dt className="text-xs text-slate-400">Policy version</dt><dd className="text-slate-700">{result.gradingPolicyVersion ?? '—'}</dd></div>
          </dl>
          {result.components?.length ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Components</p>
              <div className="space-y-1">
                {result.components.map((row, index) => (
                  <div key={`${row.name}-${index}`} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{row.name}</span><span className="tabular-nums">{row.score} / {row.max}</span></div>
                ))}
              </div>
            </div>
          ) : null}
          {result.revisionHistory?.length ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Revision history</p>
              <div className="max-h-40 space-y-1.5 overflow-y-auto">
                {result.revisionHistory.map((row, index) => (
                  <div key={row._id || index} className="rounded-xl border border-slate-100 px-3 py-2 text-xs text-slate-600">
                    <p className="font-medium text-slate-700">{row.reason || 'Revision'}</p>
                    <p className="text-slate-400">{displayDateTime(row.at || row.createdAt)}{row.from?.totalMark !== undefined ? ` · ${row.from.totalMark} → ${row.to?.totalMark ?? '—'}` : ''}</p>
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

function CorrectionModal({ result, onClose, onSaved, loading }) {
  const [totalMark, setTotalMark] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (result) {
      setTotalMark(String(result.totalMark ?? ''));
      setReason('');
      setError('');
    }
  }, [result]);

  return (
    <Modal
      open={Boolean(result)}
      title="Correct result"
      subtitle={result ? `${result.student?.fullName} · ${result.course?.code}. The previous values remain in the revision history.` : ''}
      onClose={loading ? undefined : onClose}
      dismissible={!loading}
      footer={<><Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button><Button onClick={() => {
        if (totalMark === '' || Number.isNaN(Number(totalMark)) || Number(totalMark) < 0 || Number(totalMark) > 100) { setError('Enter a mark between 0 and 100.'); return; }
        if (reason.trim().length < 3) { setError('Write the reason for the correction.'); return; }
        onSaved?.({ totalMark: Number(totalMark), reason: reason.trim() });
      }} loading={loading}>Record correction</Button></>}
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <Field label="Corrected total mark" type="number" min="0" max="100" step="0.01" value={totalMark} onChange={(event) => { setTotalMark(event.target.value); setError(''); }} required />
        <TextAreaField label="Reason" rows={3} value={reason} onChange={(event) => { setReason(event.target.value); setError(''); }} required hint="This is stored in the revision history and audit log." />
      </div>
    </Modal>
  );
}
