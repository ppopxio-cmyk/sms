import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, Calculator, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { classMeta, classTitle } from '../../lib/teacher';
import TeacherPageHeader from '../../components/teacher/TeacherPageHeader';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';

const COMPONENTS = [
  { key: 'assessments', label: 'Assessments' },
  { key: 'quizzes', label: 'Quizzes' },
  { key: 'bonus', label: 'Bonus' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'presentation', label: 'Presentation' },
];

const emptyWeights = { assessments: '30', quizzes: '40', bonus: '5', attendance: '5', presentation: '20' };
const inputClass =
  'focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white/85 pl-3.5 pr-14 text-right font-mono text-sm text-slate-800';

export default function TeacherCourseMarkPolicy() {
  const queryClient = useQueryClient();
  const [program, setProgram] = useState('all');
  const [editing, setEditing] = useState(null);
  const [weights, setWeights] = useState(emptyWeights);

  const query = useQuery({
    queryKey: ['teacher', 'course-mark-courses'],
    queryFn: async () => (await api.get('/teacher/course-marks')).data,
  });

  const courses = useMemo(() => query.data?.courses ?? [], [query.data?.courses]);
  const programs = useMemo(() => {
    const map = new Map();
    for (const row of courses) {
      if (row.assignment.programId) {
        map.set(row.assignment.programId, row.assignment.programName || row.assignment.program);
      }
    }
    return [...map.entries()];
  }, [courses]);
  const visible = courses.filter((row) => program === 'all' || row.assignment.programId === program);
  const total = COMPONENTS.reduce((sum, component) => sum + Number(weights[component.key] || 0), 0);
  const valid = Math.abs(total - 100) < 0.001;

  const saveMutation = useMutation({
    mutationFn: async () =>
      (
        await api.put(`/teacher/courses/${editing.assignment.id}/mark-policy`, {
          assessments: Number(weights.assessments || 0),
          quizzes: Number(weights.quizzes || 0),
          bonus: Number(weights.bonus || 0),
          attendance: Number(weights.attendance || 0),
          presentation: Number(weights.presentation || 0),
        })
      ).data,
    onSuccess: async () => {
      toast.success('Course mark policy saved.');
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ['teacher', 'course-mark-courses'] });
      await queryClient.invalidateQueries({ queryKey: ['teacher', 'course-marks'] });
    },
    onError: (error) => toast.error(errorMessage(error, 'We could not save this policy.')),
  });

  function openPolicy(row) {
    setEditing(row);
    setWeights(
      Object.fromEntries(
        COMPONENTS.map((component) => [component.key, String(row.policy?.weights?.[component.key] ?? 0)]),
      ),
    );
  }

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        eyebrow="Assessment"
        title="Course mark policy"
        subtitle="Decide how each of your courses is marked. Every policy must add up to exactly 100."
      />

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">My assigned courses</p>
              <p className="text-xs text-slate-500">Only courses assigned to you by the registrar appear here.</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-500">
              Programme
              <select
                value={program}
                onChange={(event) => setProgram(event.target.value)}
                className="focus-ring h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700"
              >
                <option value="all">All programmes</option>
                {programs.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {query.isError ? (
            <Alert tone="danger">We could not load your courses.</Alert>
          ) : query.isLoading ? (
            <SkeletonRows rows={5} />
          ) : !visible.length ? (
            <EmptyState icon={SlidersHorizontal} title="No assigned courses" message="The registrar will assign your courses first." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {visible.map((row) => (
                <div key={row.assignment.id} className="rounded-2xl border border-slate-200 bg-white/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{classTitle(row.assignment)}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{classMeta(row.assignment)}</p>
                    </div>
                    <Badge tone={row.policy ? 'success' : 'warning'}>{row.policy ? 'Policy ready' : 'Not set'}</Badge>
                  </div>
                  {row.policy ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {COMPONENTS.map((component) => (
                        <span
                          key={component.key}
                          className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600"
                        >
                          {component.label} {row.policy.weights[component.key]} marks
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">Set the weights before entering marks for this course.</p>
                  )}
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant={row.policy ? 'secondary' : 'primary'} onClick={() => openPolicy(row)}>
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      {row.policy ? 'Edit policy' : 'Set policy'}
                    </Button>
                    {row.policy ? (
                      <Link
                        to={`/teacher/course-marks/${row.assignment.id}`}
                        className="focus-ring inline-flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
                      >
                        Enter marks
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Course mark policy"
        subtitle={editing ? classTitle(editing.assignment) : ''}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending} disabled={!valid}>
              Save policy
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-600">
            Allocate the 100 marks across the components your course uses. A component can be zero.
          </p>
          <div className="space-y-2.5">
            {COMPONENTS.map((component) => (
              <label key={component.key} className="grid grid-cols-[1fr_110px] items-center gap-3">
                <span className="text-sm font-medium text-slate-700">{component.label}</span>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={weights[component.key]}
                    onChange={(event) => setWeights((current) => ({ ...current, [component.key]: event.target.value }))}
                    className={inputClass}
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                    marks
                  </span>
                </div>
              </label>
            ))}
          </div>
          <div
            className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
              valid ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'
            }`}
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Calculator className="h-4 w-4" />
              Total
            </span>
            <span className={`font-mono text-lg font-bold ${valid ? 'text-emerald-700' : 'text-amber-700'}`}>
              {total} / 100
            </span>
          </div>
          {!valid ? (
            <p className="text-xs font-medium text-amber-700">
              {total > 100 ? `Remove ${total - 100} marks.` : `Add ${100 - total} more marks.`}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
