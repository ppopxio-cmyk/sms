import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, CheckCircle2, Save, Send, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { classMeta, classTitle, displayDate } from '../../lib/teacher';
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
  assessments: 'Assessments',
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

  const summary = query.data.summary;
  const ready = summary.total > 0 && summary.missing === 0 && summary.calculated === summary.total;

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        backTo="/teacher/course-marks"
        eyebrow="Course marks"
        title={classTitle(query.data.assignment)}
        subtitle={`${classMeta(query.data.assignment)} Â· Grading policy v${query.data.grading.version}`}
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
        <StatCard icon={CheckCircle2} label="Calculated" value={summary.calculated} hint={`of ${summary.total} students`} tone="emerald" />
        <StatCard icon={TriangleAlert} label="Incomplete" value={summary.missing} tone="amber" />
        <StatCard icon={Calculator} label="Policy total" value={policy.total} hint="marks" tone="indigo" />
        <StatCard icon={Send} label="Submitted" value={summary.submitted} hint="students" tone="violet" />
      </div>

      <Card>
        <CardHeader
          title="Mark sheet"
          subtitle="Enter each component out of its policy maximum. Totals and letter grades use the registrar grading policy."
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
          {!rows.length ? (
            <EmptyState icon={Calculator} title="No registered students" message="The registrar has not registered students in this course." />
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
                  {rows.map((row) => (
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
                        {row.total === null || row.total === undefined ? 'â€”' : row.total}
                      </td>
                      <td className="py-2.5 text-center">
                        {row.letter ? (
                          <Badge tone={row.passed ? 'success' : 'danger'}>{row.letter}</Badge>
                        ) : (
                          <span className="text-xs text-slate-400">â€”</span>
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
          {summary.total} students will be submitted with their calculated totals and letter grades. The registrar
          receives a notification, and this mark sheet becomes read-only.
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

