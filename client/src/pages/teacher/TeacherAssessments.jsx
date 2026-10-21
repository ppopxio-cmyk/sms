import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { ArrowRight, ClipboardList, Plus, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { assessmentTypeLabel, classTitle, displayDate, statusLabel, statusTone } from '../../lib/teacher';
import ClassSelect from '../../components/teacher/ClassSelect';
import EthiopianDateField from '../../components/teacher/EthiopianDateField';
import TeacherPageHeader from '../../components/teacher/TeacherPageHeader';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card, { CardBody } from '../../components/ui/Card';
import FilterTabs from '../../components/ui/FilterTabs';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import { EmptyState, ErrorState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';

const TYPES = ['quiz', 'assignment', 'project', 'midterm', 'final', 'practical', 'presentation', 'other'];
const EMPTY_FORM = { assignmentId: '', title: '', type: 'quiz', maxScore: '20', weight: '0', dueDate: '', instructions: '' };
const inputClass =
  'focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white/85 px-3.5 text-sm text-slate-800 transition placeholder:text-slate-400';

export default function TeacherAssessments() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [assignmentId, setAssignmentId] = useState(params.get('assignmentId') || '');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM, assignmentId: params.get('assignmentId') || '' });
  const queryClient = useQueryClient();

  const classes = useQuery({
    queryKey: ['teacher', 'classes', 'options'],
    queryFn: async () => (await api.get('/teacher/courses', { params: { status: 'all', limit: 100 } })).data,
  });

  const query = useQuery({
    queryKey: ['teacher', 'assessments', { assignmentId, status, type, page, limit }],
    queryFn: async () =>
      (
        await api.get('/teacher/assessments', {
          params: { assignmentId: assignmentId || undefined, status, type, page, limit },
        })
      ).data,
    placeholderData: keepPreviousData,
  });

  const assignments = useMemo(() => classes.data?.assignments ?? [], [classes.data?.assignments]);
  const activeClasses = assignments.filter((row) => ['open', 'in_progress'].includes(row.status));
  const selectedClass = useMemo(() => assignments.find((row) => row.id === form.assignmentId), [assignments, form.assignmentId]);
  const competencyBlocked = selectedClass?.assessmentMode === 'competency';
  const rows = query.data?.assessments ?? [];
  const pagination = query.data?.pagination ?? { page: 1, pages: 1, total: 0 };

  const createMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/teacher/courses/${form.assignmentId}/assessments`, {
          title: form.title.trim(),
          type: form.type,
          maxScore: Number(form.maxScore),
          weight: Number(form.weight || 0),
          dueDate: form.dueDate || null,
          instructions: form.instructions.trim(),
        })
      ).data,
    onSuccess: (created) => {
      toast.success('Assessment created as a draft.');
      setFormOpen(false);
      setForm({ ...EMPTY_FORM, assignmentId });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'assessments'] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'class', form.assignmentId] });
      navigate(`/teacher/assessments/${created.id}`);
    },
    onError: (error) => toast.error(errorMessage(error, 'We could not create this assessment.')),
  });

  const openForm = () => {
    const preferred = activeClasses.some((row) => row.id === assignmentId) ? assignmentId : activeClasses[0]?.id || '';
    setForm({ ...EMPTY_FORM, assignmentId: preferred });
    setFormOpen(true);
  };

  const submit = (event) => {
    event.preventDefault();
    if (!form.assignmentId) return toast.error('Choose a class first.');
    if (competencyBlocked) return toast.error('This class needs competency configuration before numeric assessments can be created.');
    if (form.title.trim().length < 2) return toast.error('Give this assessment a title.');
    if (!(Number(form.maxScore) > 0)) return toast.error('The maximum score must be greater than zero.');
    if (Number(form.weight) < 0 || Number(form.weight) > 100) return toast.error('The weight must be between 0 and 100.');
    return createMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        eyebrow="Teaching"
        title="Assessments"
        subtitle="Create mark columns, enter raw scores and submit them. Only your own classes are available."
        actions={
          <Button onClick={openForm} disabled={!activeClasses.length}>
            <Plus className="h-4 w-4" />
            New assessment
          </Button>
        }
      />

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <FilterTabs
              label="Assessment status"
              value={status}
              onChange={(next) => {
                setStatus(next);
                setPage(1);
              }}
              tabs={[
                { key: 'all', label: 'All' },
                { key: 'draft', label: 'Draft' },
                { key: 'published', label: 'Published' },
                { key: 'closed', label: 'Closed' },
                { key: 'submitted', label: 'Submitted' },
              ]}
            />
            <div className="flex flex-wrap gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="assessment-type">
                  Type
                </label>
                <select
                  id="assessment-type"
                  value={type}
                  onChange={(event) => {
                    setType(event.target.value);
                    setPage(1);
                  }}
                  className="focus-ring h-11 rounded-xl border border-slate-200 bg-white/85 px-3 text-sm text-slate-700"
                >
                  <option value="all">All types</option>
                  {TYPES.map((value) => (
                    <option key={value} value={value}>
                      {assessmentTypeLabel(value)}
                    </option>
                  ))}
                </select>
              </div>
              <ClassSelect
                assignments={assignments}
                value={assignmentId}
                allLabel="All my classes"
                label="Class"
                className="min-w-[240px]"
                onChange={(value) => {
                  setAssignmentId(value);
                  setPage(1);
                  if (value) setParams({ assignmentId: value });
                  else setParams({});
                }}
              />
            </div>
          </div>

          {query.isError ? (
            <ErrorState message="We could not load assessments." onRetry={query.refetch} />
          ) : query.isLoading ? (
            <SkeletonRows rows={5} />
          ) : !rows.length ? (
            <EmptyState
              icon={ClipboardList}
              title={status !== 'all' || type !== 'all' || assignmentId ? 'No assessments match these filters' : 'No assessments yet'}
              message={
                activeClasses.length
                  ? 'Create a mark column for a class, then enter each student’s raw score.'
                  : 'Assessments can be created once the registrar assigns you an active class.'
              }
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[780px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <th className="pb-3 pr-4">Assessment</th>
                      <th className="pb-3 pr-4">Class</th>
                      <th className="pb-3 pr-4">Type</th>
                      <th className="pb-3 pr-4 text-center">Max</th>
                      <th className="pb-3 pr-4 text-center">Marks</th>
                      <th className="pb-3 pr-4">State</th>
                      <th className="pb-3 text-right">Open</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td className="py-3.5 pr-4">
                          <Link to={`/teacher/assessments/${row.id}`} className="font-semibold text-slate-800 hover:text-brand-700">
                            {row.title}
                          </Link>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {row.dueDate ? `Due ${displayDate(String(row.dueDate).slice(0, 10))}` : 'No due date'} · weight {row.weight}%
                          </p>
                        </td>
                        <td className="py-3.5 pr-4 text-slate-600">{classTitle(row)}</td>
                        <td className="py-3.5 pr-4 text-slate-600">{assessmentTypeLabel(row.type)}</td>
                        <td className="py-3.5 pr-4 text-center font-mono text-xs text-slate-700">{row.maxScore}</td>
                        <td className="py-3.5 pr-4 text-center">
                          <span className="text-xs font-semibold text-slate-700">{row.graded}</span>
                          <span className="text-xs text-slate-400"> / {row.studentCount}</span>
                          {row.missing > 0 ? <p className="text-[11px] text-amber-600">{row.missing} missing</p> : null}
                        </td>
                        <td className="py-3.5 pr-4">
                          <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
                        </td>
                        <td className="py-3.5 text-right">
                          <Link
                            to={`/teacher/assessments/${row.id}`}
                            className="focus-ring inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-brand-600 transition hover:bg-brand-50"
                          >
                            Grades
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="space-y-2 md:hidden">
                {rows.map((row) => (
                  <li key={row.id}>
                    <Link
                      to={`/teacher/assessments/${row.id}`}
                      className="focus-ring block rounded-2xl border border-slate-100 bg-white/75 p-4 transition hover:bg-white"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{row.title}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{classTitle(row)}</p>
                        </div>
                        <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {assessmentTypeLabel(row.type)} · /{row.maxScore} · weight {row.weight}%
                      </p>
                      <p className={`mt-1 text-xs ${row.missing ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {row.graded} of {row.studentCount} marks entered
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}

          {rows.length ? (
            <Pagination
              page={pagination.page}
              pages={pagination.pages}
              total={pagination.total}
              limit={limit}
              onPage={setPage}
              onLimit={(value) => {
                setLimit(value);
                setPage(1);
              }}
            />
          ) : null}
        </CardBody>
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="New assessment"
        subtitle="Create a draft mark column. You can publish it when you are ready to enter scores."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={createMutation.isPending} disabled={competencyBlocked || !form.assignmentId}>
              Create assessment
            </Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={submit}>
          <ClassSelect
            assignments={activeClasses}
            value={form.assignmentId}
            onChange={(value) => setForm((current) => ({ ...current, assignmentId: value }))}
            label="Class"
            disabled={createMutation.isPending}
          />
          {selectedClass?.assessmentMode === 'competency' ? (
            <Alert tone="warning" title="This class uses competency assessment">
              The institution has not configured competency scales or passing rules, so numeric assessments cannot be created for this class.
            </Alert>
          ) : null}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="assessment-title">
              Title
            </label>
            <input
              id="assessment-title"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="e.g. Quiz 1"
              maxLength={160}
              className={inputClass}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="assessment-kind">
                Type
              </label>
              <select
                id="assessment-kind"
                value={form.type}
                onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
                className={inputClass}
              >
                {TYPES.map((value) => (
                  <option key={value} value={value}>
                    {assessmentTypeLabel(value)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="assessment-max">
                Maximum score
              </label>
              <input
                id="assessment-max"
                type="number"
                min="0.01"
                max="1000"
                step="0.01"
                value={form.maxScore}
                onChange={(event) => setForm((current) => ({ ...current, maxScore: event.target.value }))}
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="assessment-weight">
                Weight (%)
              </label>
              <input
                id="assessment-weight"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.weight}
                onChange={(event) => setForm((current) => ({ ...current, weight: event.target.value }))}
                className={inputClass}
              />
            </div>
          </div>
          <EthiopianDateField
            label="Due date (optional)"
            value={form.dueDate}
            max={null}
            allowEmpty
            onChange={(value) => setForm((current) => ({ ...current, dueDate: value }))}
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="assessment-instructions">
              Instructions (optional)
            </label>
            <textarea
              id="assessment-instructions"
              value={form.instructions}
              onChange={(event) => setForm((current) => ({ ...current, instructions: event.target.value }))}
              maxLength={2000}
              rows={3}
              className="focus-ring w-full rounded-xl border border-slate-200 bg-white/85 px-3.5 py-3 text-sm text-slate-800"
            />
          </div>
          {Number(form.weight) > 0 ? (
            <p className="text-xs text-slate-500">
              The server checks that the combined weights in this class stay at or below 100%.
            </p>
          ) : null}
          {!activeClasses.length ? (
            <p className="inline-flex items-center gap-2 text-xs text-amber-700">
              <TriangleAlert className="h-4 w-4" />
              You need an active class before creating an assessment.
            </p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
