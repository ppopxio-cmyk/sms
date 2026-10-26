import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  ArrowRight,
  ClipboardList,
  Copy,
  Eye,
  EyeOff,
  Plus,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
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

const TYPES = ['assignment', 'project', 'presentation'];
const EMPTY_FORM = { assignmentId: '', title: '', type: 'assignment', maxScore: '20', weight: '0', dueDate: '', instructions: '' };
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
  const [briefFile, setBriefFile] = useState(null);
  const [briefError, setBriefError] = useState('');
  const [showSecret, setShowSecret] = useState({});
  const [copiedCode, setCopiedCode] = useState('');
  const queryClient = useQueryClient();

  const classes = useQuery({
    queryKey: ['teacher', 'classes', 'options'],
    queryFn: async () => (await api.get('/teacher/courses', { params: { status: 'all', limit: 100 } })).data,
  });

  const markPolicyQuery = useQuery({
    queryKey: ['teacher', 'mark-policy', form.assignmentId],
    queryFn: async () => (await api.get(`/teacher/courses/${form.assignmentId}/mark-policy`)).data,
    enabled: Boolean(form.assignmentId),
  });
  const hasMarkPolicy = Boolean(markPolicyQuery.data?.policy);

  const policyWeights = markPolicyQuery.data?.policy?.weights;
  const usedByType = markPolicyQuery.data?.usedByType || {};

  const { totalPolicyMark, usedMark, remainingMark, isFull } = useMemo(() => {
    if (!policyWeights) return { totalPolicyMark: 0, usedMark: 0, remainingMark: 0, isFull: false };
    let total = 0;
    if (form.type === 'presentation') {
      total = Number(policyWeights.presentation || 0);
    } else if (form.type === 'project') {
      total = Number(policyWeights.project || 0);
    } else {
      total = Number(policyWeights.assignment ?? policyWeights.assessments ?? 0);
    }
    const used = Number(usedByType[form.type] || 0);
    const rem = Math.max(0, total - used);
    return {
      totalPolicyMark: total,
      usedMark: used,
      remainingMark: rem,
      isFull: total > 0 && rem <= 0,
    };
  }, [policyWeights, usedByType, form.type]);

  useEffect(() => {
    if (remainingMark > 0) {
      setForm((current) => ({
        ...current,
        maxScore: String(remainingMark),
        weight: current.weight === '0' || !current.weight ? String(remainingMark) : current.weight,
      }));
    } else if (isFull) {
      setForm((current) => ({
        ...current,
        maxScore: '0',
        weight: '0',
      }));
    }
  }, [remainingMark, isFull]);

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

  const handleBriefChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setBriefFile(null);
      setBriefError('');
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setBriefError('Brief file must be smaller than 30 MB.');
      setBriefFile(null);
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf', 'doc', 'docx'].includes(ext)) {
      setBriefError('Only PDF, DOC or DOCX files are allowed.');
      setBriefFile(null);
      return;
    }
    setBriefError('');
    setBriefFile(file);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const created = (
        await api.post(`/teacher/courses/${form.assignmentId}/assessments`, {
          title: form.title.trim(),
          type: form.type,
          maxScore: Number(form.maxScore),
          weight: Number(form.weight || 0),
          dueDate: form.dueDate || null,
          instructions: form.instructions.trim(),
        })
      ).data;

      if (briefFile && (form.type === 'assignment' || form.type === 'project')) {
        try {
          await api.post(`/teacher/assessments/${created.id}/portal/document`, briefFile, {
            params: { filename: briefFile.name },
            headers: { 'Content-Type': briefFile.type || 'application/octet-stream' },
          });
        } catch {
          toast.error('Assessment created, but the brief file failed to upload.');
        }
      }
      return created;
    },
    onSuccess: (created) => {
      toast.success('Assessment created as a draft.');
      setFormOpen(false);
      setForm({ ...EMPTY_FORM, assignmentId });
      setBriefFile(null);
      setBriefError('');
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

  const copyToClipboard = (text, code) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(''), 2000);
      toast.success('Copied to clipboard.');
    });
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
                  ? 'Create a mark column for a class, then enter each student\'s raw score.'
                  : 'Assessments can be created once the registrar assigns you an active class.'
              }
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[820px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <th className="pb-3 pr-4">Assessment</th>
                      <th className="pb-3 pr-4">Class</th>
                      <th className="pb-3 pr-4">Type</th>
                      <th className="pb-3 pr-4 text-center">Max</th>
                      <th className="pb-3 pr-4 text-center">Marks</th>
                      <th className="pb-3 pr-4">State</th>
                      <th className="pb-3 pr-4">Secret Code</th>
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
                        <td className="py-3.5 pr-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded">
                              {row.secretCode || '—'}
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowSecret((s) => ({ ...s, [row.id]: !s[row.id] }))}
                              className="text-slate-400 hover:text-slate-600 transition"
                              title={showSecret[row.id] ? 'Hide code' : 'Show code'}
                            >
                              {showSecret[row.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(row.secretCode || '', row.id)}
                              className="text-slate-400 hover:text-slate-600 transition"
                              title="Copy code"
                            >
                              {copiedCode === row.id ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>
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
                      <p className="mt-1 text-xs font-mono text-brand-600">
                        Code: {row.secretCode || '—'}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            copyToClipboard(row.secretCode || '', row.id);
                          }}
                          className="ml-1 inline-flex items-center text-slate-400 hover:text-slate-600"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
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

      {/* Public link info modal */}
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
            <Button
              onClick={submit}
              loading={createMutation.isPending}
              disabled={competencyBlocked || !form.assignmentId || (markPolicyQuery.isSuccess && !hasMarkPolicy) || isFull}
            >
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
          {form.assignmentId && markPolicyQuery.isSuccess && !hasMarkPolicy ? (
            <Alert tone="danger" title="Course mark policy required">
              <p>A course mark policy must be configured for this class before creating assessments.</p>
              <div className="mt-2">
                <Link
                  to={`/teacher/classes/${form.assignmentId}?tab=marks`}
                  className="font-semibold text-brand-700 underline"
                >
                  Configure Course Mark Policy &rarr;
                </Link>
              </div>
            </Alert>
          ) : null}
          {isFull ? (
            <Alert tone="warning" title={`${assessmentTypeLabel(form.type)} marks fully allocated`}>
              The course mark policy allocated {totalPolicyMark} marks for {assessmentTypeLabel(form.type).toLowerCase()}s and all {usedMark} marks have already been assigned to existing assessments. You cannot create another {assessmentTypeLabel(form.type).toLowerCase()}.
            </Alert>
          ) : null}
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
              placeholder="e.g. Assignment 1"
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-slate-700" htmlFor="assessment-max">
                  Maximum score
                </label>
                {policyMaxScore !== null ? (
                  <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    From policy
                  </span>
                ) : null}
              </div>
              <input
                id="assessment-max"
                type="number"
                min="0.01"
                max="1000"
                step="0.01"
                value={form.maxScore}
                readOnly
                disabled
                className={`${inputClass} cursor-not-allowed bg-slate-100/90 text-slate-600 select-none`}
              />
              <p className="mt-1 text-xs text-slate-500">
                {isFull
                  ? `Fully allocated (${usedMark}/${totalPolicyMark} marks used).`
                  : `Remaining mark: ${remainingMark} of ${totalPolicyMark} policy marks available (${usedMark} used).`}
              </p>
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
          {(form.type === 'assignment' || form.type === 'project') ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700" htmlFor="brief-file">
                Assessment task brief / document (PDF or Word, max 30 MB)
              </label>
              <input
                id="brief-file"
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleBriefChange}
                className={inputClass}
              />
              {briefFile ? (
                <p className="mt-1 text-xs font-medium text-emerald-600">Selected: {briefFile.name}</p>
              ) : null}
              {briefError ? (
                <p className="mt-1 text-xs font-medium text-rose-600">{briefError}</p>
              ) : null}
            </div>
          ) : null}
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
          <Alert tone="info" title="Secret code">
            <p className="text-xs text-slate-600">
              When you publish this assessment, a unique secret code will be generated. Students will need this code along
              with their student ID to access the submission portal. The code is never shown on the public page — you tell
              it to students in person.
            </p>
          </Alert>
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
