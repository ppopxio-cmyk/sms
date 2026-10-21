import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, GraduationCap, RefreshCw, ShieldAlert } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  REGISTRAR,
  displayDateTime,
  humanStatus,
  levelLabel,
  toneForStatus,
} from '../../lib/registrar';
import { useDebounced } from '../../lib/useDebounced';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import StudentPicker from '../../components/registrar/StudentPicker';
import { SelectField } from '../../components/registrar/Fields';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';

const STATUSES = ['all', 'eligible', 'in_progress', 'pending_review', 'not_eligible', 'certificate_issued'];

export default function RegistrarGraduation() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [status, setStatus] = useState('all');
  const [program, setProgram] = useState('');
  const [academicYear, setAcademicYear] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [detailStudent, setDetailStudent] = useState(searchParams.get('student') || null);
  const [evaluating, setEvaluating] = useState(false);

  const options = useQuery({
    queryKey: ['registrar', 'students', 'options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/options`)).data,
    staleTime: 5 * 60_000,
  });

  const params = useMemo(() => ({
    page,
    limit,
    ...(debounced.trim() ? { search: debounced.trim() } : {}),
    ...(status !== 'all' ? { status } : {}),
    ...(program ? { program } : {}),
    ...(academicYear ? { academicYear } : {}),
  }), [page, limit, debounced, status, program, academicYear]);

  const query = useQuery({
    queryKey: ['registrar', 'graduation', params],
    queryFn: async () => (await api.get(`${REGISTRAR}/graduation-eligibility`, { params })).data,
    placeholderData: (previous) => previous,
  });

  const rows = query.data?.rows ?? [];
  const pagination = query.data?.pagination ?? { page: 1, pages: 1, total: 0, limit };
  const counts = query.data?.counts ?? {};
  const filtered = Boolean(debounced.trim() || status !== 'all' || program || academicYear);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['registrar', 'graduation'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'dashboard'] });
  };

  const columns = [
    {
      key: 'student',
      label: 'Student',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-900">{row.student?.fullName || '—'}</p>
          <p className="text-xs text-slate-500">{row.student?.studentId || '—'} · {levelLabel(row.student?.level)}</p>
        </div>
      ),
    },
    { key: 'program', label: 'Programme', render: (row) => row.program ? `${row.program.code} · ${row.program.name}` : '—' },
    {
      key: 'credits',
      label: 'Credits',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold tabular-nums text-slate-800">{row.earnedCredits ?? 0} / {row.requiredCredits ?? 0}</p>
          <p className="text-xs text-slate-400">earned / required</p>
        </div>
      ),
    },
    { key: 'cgpa', label: 'CGPA', render: (row) => row.cgpa ?? '—' },
    { key: 'status', label: 'Eligibility', render: (row) => <Badge tone={toneForStatus(row.status)}>{humanStatus(row.status)}</Badge> },
    { key: 'evaluated', label: 'Evaluated', render: (row) => displayDateTime(row.updatedAt || row.createdAt) },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      mobileFull: true,
      render: (row) => <Button size="sm" variant="secondary" onClick={() => setDetailStudent(row.student?.id)}>Open</Button>,
    },
  ];

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Graduation eligibility"
        subtitle="Eligibility is calculated from published results, the configured graduation policy and curriculum credits. A certificate is only issued after a fresh check."
        actions={<Button onClick={() => setEvaluating(true)} className="gap-2"><RefreshCw className="h-4 w-4" /> Evaluate student</Button>}
      />

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {STATUSES.map((value) => (
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
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField label="Programme" value={program} onChange={(event) => { setProgram(event.target.value); setPage(1); }}>
              <option value="">All programmes</option>
              {(options.data?.programs || []).map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}
            </SelectField>
            <SelectField label="Academic year" value={academicYear} onChange={(event) => { setAcademicYear(event.target.value); setPage(1); }}>
              <option value="">All years</option>
              {(options.data?.academicYears || []).map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
            </SelectField>
            <SelectField label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              {STATUSES.map((value) => <option key={value} value={value}>{humanStatus(value)}</option>)}
            </SelectField>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Latest evaluations</h2>
            <p className="mt-0.5 text-xs text-slate-500">{pagination.total ?? 0} student{pagination.total === 1 ? '' : 's'} evaluated</p>
          </div>
          <GraduationCap className="h-4 w-4 text-slate-300" />
        </div>
        <RegistrarTable
          columns={columns}
          rows={rows}
          loading={query.isLoading}
          error={query.error ? query.error?.response?.data?.message || 'Graduation evaluations could not be loaded.' : null}
          onRetry={query.refetch}
          rowKey={(row) => row.id}
          onRowClick={(row) => setDetailStudent(row.student?.id)}
          noResults={filtered}
          emptyTitle="No graduation evaluation yet"
          emptyMessage="Evaluate a student to calculate eligibility from the official record."
        />
        <div className="px-5 pb-4">
          <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPage={setPage} onLimit={(value) => { setLimit(value); setPage(1); }} />
        </div>
      </Card>

      <EvaluateModal open={evaluating} onClose={() => setEvaluating(false)} onSaved={(studentId) => { invalidate(); setDetailStudent(studentId); }} />
      <GraduationDetail studentId={detailStudent} onClose={() => setDetailStudent(null)} onEvaluated={invalidate} />
    </div>
  );
}

function EvaluateModal({ open, onClose, onSaved }) {
  const [student, setStudent] = useState(null);
  const [error, setError] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setStudent(null);
      setError('');
    }
  }, [open]);

  const evaluate = useMutation({
    mutationFn: async () => {
      if (!student) throw new Error('Choose a student.');
      return (await api.post(`${REGISTRAR}/graduation-eligibility/${student.id}/evaluate`)).data;
    },
    onSuccess: (data) => {
      toast.success(`Evaluation complete: ${humanStatus(data.evaluation?.status)}.`);
      queryClient.invalidateQueries({ queryKey: ['registrar', 'graduation'] });
      onSaved?.(student.id);
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'The student could not be evaluated.');
      setError(message);
      toast.error(message);
    },
  });

  return (
    <Modal
      open={open}
      title="Evaluate graduation eligibility"
      subtitle="The server recomputes credits, CGPA and policy requirements from published records."
      onClose={evaluate.isPending ? undefined : onClose}
      dismissible={!evaluate.isPending}
      footer={<><Button variant="secondary" onClick={onClose} disabled={evaluate.isPending}>Cancel</Button><Button onClick={() => evaluate.mutate()} loading={evaluate.isPending} disabled={!student}>Evaluate</Button></>}
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <StudentPicker value={student} onChange={setStudent} />
        <p className="rounded-xl bg-sky-50 px-3.5 py-3 text-xs leading-relaxed text-sky-800">
          A missing grading policy or graduation rule blocks evaluation with a configuration error. Nothing is inferred.
        </p>
      </div>
    </Modal>
  );
}

function GraduationDetail({ studentId, onClose, onEvaluated }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['registrar', 'graduation-student', studentId],
    queryFn: async () => (await api.get(`${REGISTRAR}/graduation-eligibility/${studentId}`)).data,
    enabled: Boolean(studentId),
  });

  const evaluate = useMutation({
    mutationFn: async () => (await api.post(`${REGISTRAR}/graduation-eligibility/${studentId}/evaluate`)).data,
    onSuccess: () => {
      toast.success('Eligibility re-evaluated.');
      queryClient.invalidateQueries({ queryKey: ['registrar', 'graduation-student', studentId] });
      onEvaluated?.();
    },
    onError: (err) => toast.error(errorMessage(err, 'The student could not be evaluated.')),
  });

  const data = query.data;
  const evaluation = data?.evaluation;

  return (
    <Modal
      open={Boolean(studentId)}
      title={data?.student?.fullName || 'Graduation record'}
      subtitle={data?.student ? `${data.student.studentId} · ${data.student.program?.name || ''}` : 'Loading the official evaluation.'}
      size="lg"
      onClose={evaluate.isPending ? undefined : onClose}
      dismissible={!evaluate.isPending}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={() => evaluate.mutate()} loading={evaluate.isPending} disabled={!data?.student} className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" /> Re-evaluate</Button>
        </div>
      }
    >
      {query.isLoading ? <p className="py-6 text-center text-sm text-slate-500">Loading…</p> : query.error ? (
        <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{query.error?.response?.data?.message || 'The evaluation could not be loaded.'}</p>
      ) : data ? (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">Status</p>
              <Badge tone={toneForStatus(evaluation?.status)}>{humanStatus(evaluation?.status || 'not evaluated')}</Badge>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">Credits</p>
              <p className="text-lg font-bold text-slate-900">{evaluation?.earnedCredits ?? 0} / {evaluation?.requiredCredits ?? 0}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-400">CGPA</p>
              <p className="text-lg font-bold text-slate-900">{evaluation?.cgpa ?? '—'}</p>
            </div>
          </div>

          {!evaluation ? (
            <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900">No evaluation is stored. Use Re-evaluate to calculate eligibility now.</p>
          ) : (
            <>
              <div className="rounded-2xl border border-slate-100 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Requirements</p>
                <div className="mt-3 space-y-2">
                  {(evaluation.requirements || []).map((row, index) => (
                    <div key={`${row.key || row.label || index}`} className="flex items-start justify-between gap-3 text-sm">
                      <span className="text-slate-700">{row.label || row.name || row.key}</span>
                      <Badge tone={row.met ? 'success' : 'danger'}>{row.met ? 'Met' : 'Not met'}</Badge>
                    </div>
                  ))}
                  {!(evaluation.requirements || []).length ? <p className="text-sm text-slate-500">No individual requirements were stored for this evaluation.</p> : null}
                </div>
              </div>
              {evaluation.reasons?.length ? (
                <div className="rounded-2xl bg-rose-50 p-4">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-700"><ShieldAlert className="h-3.5 w-3.5" /> Blocking reasons</p>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-rose-900">
                    {evaluation.reasons.map((reason, index) => <li key={index}>{reason}</li>)}
                  </ul>
                </div>
              ) : evaluation.status === 'eligible' ? (
                <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><CheckCircle2 className="h-4 w-4" /> All configured requirements are met.</p>
              ) : null}
              <p className="text-xs text-slate-400">Evaluated {displayDateTime(evaluation.updatedAt || evaluation.createdAt)}{evaluation.evaluatedBy ? ' by the Registrar' : ''}.</p>
            </>
          )}

          {data.certificate ? (
            <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4 text-sm text-brand-900">
              Certificate {data.certificate.certificateNumber} is already issued.
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
