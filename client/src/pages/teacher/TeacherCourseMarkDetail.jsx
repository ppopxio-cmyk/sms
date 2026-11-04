import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, CheckCircle2, Lock, Save, Send, TriangleAlert, AlertCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { classMeta, classTitle, displayDate } from '../../lib/teacher';
import { formatEthiopian } from '../../lib/ethiopianDate';
import TeacherPageHeader from '../../components/teacher/TeacherPageHeader';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import CodeInput from '../../components/ui/CodeInput';
import ExportMenu from '../../components/ui/ExportMenu';
import Modal from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';
import StatCard from '../../components/ui/StatCard';

const COMPONENT_LABELS = {
  assignment: 'Assignment',
  project: 'Project',
  assessments: 'Assignment',
  quizzes: 'Quizzes',
  bonus: 'Bonus',
  attendance: 'Attendance',
  presentation: 'Presentation',
};
const valueOf = (value) => (value === null || value === undefined ? '' : String(value));
const LOCKED_STATUSES = ['submitted', 'under_review', 'approved', 'published'];

export default function TeacherCourseMarkDetail() {
  const { assignmentId } = useParams();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ key: '', values: {} });
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitCode, setSubmitCode] = useState('');
  const [activeTab, setActiveTab] = useState('eligible');

  const query = useQuery({
    queryKey: ['teacher', 'course-marks', assignmentId],
    queryFn: async () => (await api.get(`/teacher/courses/${assignmentId}/marks`)).data,
    retry: false,
  });

  const rows = useMemo(() => query.data?.rows ?? [], [query.data?.rows]);
  const policy = query.data?.policy;
  const baseScores = useMemo(
    () =>
      Object.fromEntries(
        rows.map((row) => [
          row.studentId,
          Object.fromEntries((query.data?.components ?? []).map((component) => [component.key, valueOf(row.scores?.[component.key])])),
        ]),
      ),
    [rows, query.data?.components],
  );
  const dataKey = useMemo(
    () =>
      rows
        .map((row) => `${row.studentId}:${(query.data?.components ?? []).map((component) => row.scores?.[component.key] ?? '').join(',')}`)
        .join('|'),
    [rows, query.data?.components],
  );
  const scores = draft.key === dataKey ? draft.values : baseScores;
  const dirty = useMemo(
    () =>
      rows.some((row) =>
        (query.data?.components ?? []).some((component) => (scores[row.studentId]?.[component.key] ?? '') !== (baseScores[row.studentId]?.[component.key] ?? '')),
      ),
    [rows, scores, baseScores, query.data?.components],
  );
  const eligibleRows = useMemo(() => rows.filter((r) => !r.hasFinancialHold), [rows]);
  const incompleteRows = useMemo(() => rows.filter((r) => r.hasFinancialHold || !r.calculated), [rows]);
  const heldRows = useMemo(() => rows.filter((r) => r.hasFinancialHold), [rows]);
  const submitted = rows.length > 0 && rows.every((row) => row.status === 'submitted');
  const locked = rows.some((row) => LOCKED_STATUSES.includes(row.status));
  const lockLabel = submitted
    ? 'Sent to registrar'
    : rows.some((row) => row.status === 'published')
      ? 'Published'
      : rows.some((row) => row.status === 'approved')
        ? 'Approved'
        : locked
          ? 'Under review'
          : '';

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = rows.map((row) => ({
        studentId: row.studentId,
        ...Object.fromEntries(
          (query.data?.components ?? []).map((component) => {
            const raw = scores[row.studentId]?.[component.key];
            return [component.key, raw === '' || raw === undefined ? null : Number(raw)];
          }),
        ),
      }));
      return (await api.put(`/teacher/courses/${assignmentId}/marks`, { students: payload })).data;
    },
    onSuccess: (data) => {
      toast.success('Marks saved.');
      setDraft({ key: '', values: {} });
      queryClient.setQueryData(['teacher', 'course-marks', assignmentId], data);
      queryClient.invalidateQueries({ queryKey: ['teacher', 'course-mark-courses'] });
    },
    onError: (error) => toast.error(errorMessage(error, 'We could not save these marks.')),
  });

  const calculateMutation = useMutation({
    mutationFn: async () => {
      if (dirty) {
        const payload = rows.map((row) => ({
          studentId: row.studentId,
          ...Object.fromEntries(
            (query.data?.components ?? []).map((component) => {
              const raw = scores[row.studentId]?.[component.key];
              return [component.key, raw === '' || raw === undefined ? null : Number(raw)];
            }),
          ),
        }));
        await api.put(`/teacher/courses/${assignmentId}/marks`, { students: payload });
      }
      return (await api.post(`/teacher/courses/${assignmentId}/marks/calculate`)).data;
    },
    onSuccess: (data) => {
      toast.success(`Totals calculated. ${data.summary.missing} still incomplete.`);
      setDraft({ key: '', values: {} });
      queryClient.setQueryData(['teacher', 'course-marks', assignmentId], data);
      queryClient.invalidateQueries({ queryKey: ['teacher', 'course-mark-courses'] });
    },
    onError: (error) => toast.error(errorMessage(error, 'We could not calculate these marks.')),
  });

  const requestCodeMutation = useMutation({
    mutationFn: async () => (await api.post('/teacher/course-marks/submit-code')).data,
    onSuccess: (data) => {
      setSubmitCode('');
      toast.success(data?.message || 'A confirmation code was emailed to your account.');
    },
    onError: (error) => toast.error(errorMessage(error, 'The confirmation code could not be sent.')),
  });

  const submitMutation = useMutation({
    mutationFn: async () =>
      (await api.post('/teacher/course-marks/submit', { offeringIds: [assignmentId], code: submitCode })).data,
    onSuccess: async () => {
      setConfirmSubmit(false);
      setSubmitCode('');
      toast.success('Course marks sent to the registrar.');
      await query.refetch();
      queryClient.invalidateQueries({ queryKey: ['teacher', 'course-mark-courses'] });
    },
    onError: (error) => toast.error(errorMessage(error, 'We could not submit these marks.')),
  });

  const setScore = (studentId, key, value) => {
    setDraft((current) => {
      const values = current.key === dataKey ? current.values : baseScores;
      return {
        key: dataKey,
        values: {
          ...values,
          [studentId]: { ...(values[studentId] || {}), [key]: value },
        },
      };
    });
  };

  function validate() {
    for (const row of rows) {
      for (const component of query.data?.components ?? []) {
        const raw = scores[row.studentId]?.[component.key];
        if (raw === '' || raw === undefined) continue;
        const number = Number(raw);
        if (!Number.isFinite(number) || number < 0 || number > component.max) {
          toast.error(`${component.label} must be between 0 and ${component.max} for ${row.name}.`);
          return false;
        }
      }
    }
    return true;
  }

  function calculate() {
    if (!validate()) return;
    calculateMutation.mutate();
  }

  if (query.isLoading) return <SkeletonRows rows={8} />;

  if (query.isError) {
    return (
      <div className="space-y-6">
        <TeacherPageHeader backTo="/teacher/course-marks" eyebrow="Assessment" title="Course mark sheet" />
        <Alert tone="warning" title="This mark sheet cannot be opened">
          {query.error?.response?.data?.message || 'The course mark policy may not be set yet.'}
        </Alert>
      </div>
    );
  }

  const summary = query.data?.summary || {};
  const eligibleTotal = summary.eligibleTotal ?? eligibleRows.length;
  const eligibleCalculated = summary.eligibleCalculated ?? eligibleRows.filter((r) => r.calculated).length;
  const eligibleMissing = summary.eligibleMissing ?? eligibleRows.filter((r) => !r.calculated).length;
  const ready = eligibleTotal > 0 && eligibleMissing === 0 && eligibleCalculated === eligibleTotal;

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        backTo="/teacher/course-marks"
        eyebrow="Course marks"
        title={classTitle(query.data?.assignment)}
        subtitle={`${classMeta(query.data?.assignment)} · Grading policy v${query.data?.grading?.version || '1'}`}
        actions={
          <>
            <ExportMenu
              basePath={`/teacher/courses/${assignmentId}/marks/export`}
              filenamePrefix={`course-marks-${query.data.assignment.courseCode || 'course'}`}
              label="Export"
            />
            {!locked ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (validate()) saveMutation.mutate();
                  }}
                  loading={saveMutation.isPending}
                  disabled={!dirty || calculateMutation.isPending}
                >
                  <Save className="h-4 w-4" />
                  Save
                </Button>
                <Button onClick={calculate} loading={calculateMutation.isPending}>
                  <Calculator className="h-4 w-4" />
                  Calculate totals
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="brand">Policy {policy.total} marks</Badge>
        {policy.components.map((component) => (
          <Badge key={component.key} tone="neutral">
            {COMPONENT_LABELS[component.key] || component.label} {component.max}
          </Badge>
        ))}
        {lockLabel ? <Badge tone="success">{lockLabel}</Badge> : null}
      </div>

      {locked ? (
        <Alert tone="success" title={submitted ? 'These marks are with the registrar' : 'These marks are locked'}>
          {submitted
            ? 'The mark sheet is locked. Submitted totals are visible in the registrar results workspace.'
            : 'The registrar has started reviewing this mark sheet, so it can no longer be changed.'}
        </Alert>
      ) : dirty ? (
        <p className="text-xs font-medium text-amber-700">Save and calculate again after changing any mark.</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={CheckCircle2}
          label="Calculated (Eligible)"
          value={eligibleCalculated}
          hint={`of ${eligibleTotal} eligible`}
          tone="emerald"
        />
        <StatCard
          icon={Lock}
          label="Financial Holds"
          value={heldRows.length}
          hint="submission restricted"
          tone={heldRows.length > 0 ? 'rose' : 'neutral'}
        />
        <StatCard
          icon={TriangleAlert}
          label="Incomplete (Eligible)"
          value={eligibleMissing}
          hint="uncalculated marks"
          tone={eligibleMissing > 0 ? 'amber' : 'neutral'}
        />
        <StatCard icon={Send} label="Submitted" value={summary.submitted} hint="students" tone="violet" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('eligible')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
            activeTab === 'eligible'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
          }`}
        >
          <CheckCircle2 className="h-4 w-4" />
          <span>Eligible Mark Sheet ({eligibleRows.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('incomplete')}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${
            activeTab === 'incomplete'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
          }`}
        >
          <TriangleAlert className="h-4 w-4 text-amber-500" />
          <span>Incomplete & Holds ({incompleteRows.length})</span>
          {heldRows.length > 0 && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">
              {heldRows.length} hold
            </span>
          )}
        </button>
      </div>

      {activeTab === 'eligible' ? (
        <Card>
          <CardHeader
            title="Eligible Students Mark Sheet"
            subtitle="Marks entered and calculated here can be submitted to the registrar without waiting for deferred students on hold."
            icon={Calculator}
            action={
              !locked ? (
                <Button
                  onClick={() => {
                    if (dirty) return toast.info('Save or calculate your latest changes first.');
                    setConfirmSubmit(true);
                  }}
                  disabled={!ready || dirty}
                >
                  <Send className="h-4 w-4" />
                  Send to registrar
                </Button>
              ) : null
            }
          />
          <CardBody>
            {!eligibleRows.length ? (
              <EmptyState
                icon={Calculator}
                title="No eligible students"
                message="All registered students in this course are currently on financial hold or missing."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <th className="pb-3 pr-4">Student</th>
                      {policy.components.map((component) => (
                        <th key={component.key} className="pb-3 pr-3 text-center">
                          {COMPONENT_LABELS[component.key] || component.label}
                          <span className="ml-1 font-mono text-[10px] text-slate-400">/{component.max}</span>
                        </th>
                      ))}
                      <th className="pb-3 pl-2 pr-3 text-right">Total</th>
                      <th className="pb-3 text-center">Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {eligibleRows.map((row) => (
                      <tr key={row.studentId}>
                        <td className="py-2.5 pr-4">
                          <Link to={`/teacher/students/${row.studentId}`} className="font-medium text-slate-800 hover:text-brand-700">
                            {row.name}
                          </Link>
                          <p className="font-mono text-[11px] text-slate-500">{row.studentNumber}</p>
                        </td>
                        {policy.components.map((component) => (
                          <td key={component.key} className="py-2.5 pr-3 text-center">
                            <input
                              type="number"
                              min="0"
                              max={component.max}
                              step="0.01"
                              value={scores[row.studentId]?.[component.key] ?? ''}
                              disabled={locked}
                              onChange={(event) => setScore(row.studentId, component.key, event.target.value)}
                              className="focus-ring h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 text-right font-mono text-xs text-slate-800 disabled:bg-slate-50 disabled:text-slate-500"
                              aria-label={`${COMPONENT_LABELS[component.key] || component.label} for ${row.name}`}
                            />
                          </td>
                        ))}
                        <td className="py-2.5 pl-2 pr-3 text-right font-mono text-sm font-semibold text-slate-800">
                          {row.total === null || row.total === undefined ? '—' : row.total}
                        </td>
                        <td className="py-2.5 text-center">
                          {row.letter ? (
                            <Badge tone={row.passed ? 'success' : 'danger'}>{row.letter}</Badge>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Incomplete & Financial Holds"
            subtitle="Students on financial hold or with missing marks. Eligible students can still be submitted independently."
            icon={TriangleAlert}
          />
          <CardBody className="p-0">
            {!incompleteRows.length ? (
              <p className="p-8 text-center text-xs text-slate-400">
                All students in this class are financially cleared and have complete marks!
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase text-slate-400">
                      <th className="py-3 px-6">Student</th>
                      <th className="py-3 px-4">Financial Status</th>
                      <th className="py-3 px-4">Reason / Outstanding Cycle</th>
                      <th className="py-3 px-4">Due Date</th>
                      <th className="py-3 px-4 text-center">Marks Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {incompleteRows.map((row) => (
                      <tr key={row.studentId} className={row.hasFinancialHold ? 'bg-rose-50/20' : ''}>
                        <td className="py-3.5 px-6">
                          <p className="font-semibold text-slate-800">{row.name}</p>
                          <p className="font-mono text-xs text-slate-500">{row.studentNumber}</p>
                        </td>
                        <td className="py-3.5 px-4">
                          {row.hasFinancialHold ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                              <Lock className="h-3 w-3 text-rose-600" />
                              HOLD ACTIVE
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              CLEARED
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-xs">
                          {row.hasFinancialHold ? (
                            <div>
                              <p className="font-semibold text-rose-700">
                                {row.financialHoldDetails?.title || 'Monthly Fee'}
                              </p>
                              <p className="font-mono text-slate-600">
                                {row.financialHoldDetails?.amountDueEtb || '0.00'} ETB Overdue
                              </p>
                            </div>
                          ) : (
                            <span className="text-amber-700 font-medium">Marks entry pending</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-600">
                          {row.financialHoldDetails?.dueAt ? formatEthiopian(row.financialHoldDetails.dueAt) : '—'}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {row.calculated ? (
                            <Badge tone="success">Calculated ({row.total})</Badge>
                          ) : (
                            <Badge tone="warning">Incomplete</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Modal
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        title="Send course marks to the registrar?"
        subtitle={classTitle(query.data.assignment)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmSubmit(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => submitMutation.mutate()}
              loading={submitMutation.isPending}
              disabled={submitCode.length !== 6}
            >
              Send marks
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-slate-600">
          {eligibleCalculated} eligible student{eligibleCalculated === 1 ? '' : 's'} will be submitted with their calculated totals and letter grades.
          {heldRows.length > 0 ? (
            <span className="mt-2 block text-xs font-medium text-amber-700">
              Note: {heldRows.length} student(s) currently on active financial hold are deferred in draft status and will not be submitted until cleared by finance.
            </span>
          ) : null}
        </p>
        <p className="mt-3 text-xs text-slate-500">Prepared {displayDate(new Date().toISOString().slice(0, 10))}</p>
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-700">Email confirmation code</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => requestCodeMutation.mutate()}
              loading={requestCodeMutation.isPending}
            >
              Email me a code
            </Button>
          </div>
          <div className="mt-3">
            <CodeInput value={submitCode} onChange={setSubmitCode} disabled={submitMutation.isPending} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

