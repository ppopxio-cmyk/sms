import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Calculator,
  GraduationCap,
  Info,
  CheckCircle2,
  AlertCircle,
  Award,
  BookOpen,
} from 'lucide-react';
import { api } from '../../lib/api';
import { REGISTRAR, humanStatus, toneForStatus } from '../../lib/registrar';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import StudentPicker from '../../components/registrar/StudentPicker';
import { SelectField } from '../../components/registrar/Fields';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ExportMenu from '../../components/ui/ExportMenu';
import FilterTabs from '../../components/ui/FilterTabs';
import { ErrorState } from '../../components/ui/StatePanel';
import { SkeletonCard } from '../../components/ui/Skeleton';
import StatCard from '../../components/ui/StatCard';

export default function RegistrarGpa() {
  const [student, setStudent] = useState(null);
  const [program, setProgram] = useState('');
  const [batch, setBatch] = useState('');
  const [level, setLevel] = useState('all');

  const options = useQuery({
    queryKey: ['registrar', 'students', 'options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/options`)).data,
    staleTime: 5 * 60_000,
  });

  const selectedProgramDoc = useMemo(
    () => (options.data?.programs || []).find((p) => p.id === program),
    [options.data?.programs, program],
  );

  const availableBatches = useMemo(() => {
    if (!program) return options.data?.batches || [];
    return (options.data?.batches || []).filter((b) => b.program === program);
  }, [options.data?.batches, program]);

  const durationUnit = useMemo(() => {
    if (!selectedProgramDoc) return 'Year';
    if (selectedProgramDoc.qualificationType === 'degree') return 'Year';
    if (selectedProgramDoc.qualificationType === 'diploma') return 'Level';
    return selectedProgramDoc.shortTerm?.unit === 'months' ? 'Month' : 'Week';
  }, [selectedProgramDoc]);

  const totalStages = useMemo(() => {
    if (!selectedProgramDoc) return 4;
    if (selectedProgramDoc.qualificationType === 'degree') return selectedProgramDoc.durationYears || 4;
    if (selectedProgramDoc.qualificationType === 'diploma') {
      return selectedProgramDoc.levels?.length ? Math.max(...selectedProgramDoc.levels) : 4;
    }
    return selectedProgramDoc.shortTerm?.duration || 1;
  }, [selectedProgramDoc]);

  const stageTabs = useMemo(() => {
    const tabs = [{ key: 'all', label: `All ${durationUnit}s` }];
    for (let i = 1; i <= totalStages; i++) {
      tabs.push({ key: String(i), label: `${durationUnit} ${i}` });
    }
    return tabs;
  }, [durationUnit, totalStages]);

  const detail = useQuery({
    queryKey: ['registrar', 'gpa', student?.id],
    queryFn: async () => (await api.get(`${REGISTRAR}/gpa-cgpa`, { params: { student: student.id } })).data,
    enabled: Boolean(student?.id),
  });

  const listParams = {
    ...(program ? { program } : {}),
    ...(batch ? { batch } : {}),
    ...(level !== 'all' ? { level: Number(level) } : {}),
  };

  const list = useQuery({
    queryKey: ['registrar', 'gpa-list', listParams],
    queryFn: async () => (await api.get(`${REGISTRAR}/gpa-cgpa`, { params: listParams })).data,
    enabled: !student,
  });

  const isStageSelected = level !== 'all';
  const stageCompleted = Boolean(list.data?.stageCompleted);
  const allStagesFinished = Boolean(list.data?.allStagesFinished);

  const courseColumns = [
    {
      key: 'course',
      label: 'Course',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-900">{row.course?.code || '—'}</p>
          <p className="text-xs text-slate-500">{row.course?.title || '—'}</p>
        </div>
      ),
    },
    {
      key: 'level',
      label: 'Stage / Year',
      render: (row) => (row.offering?.level != null ? `${durationUnit} ${row.offering.level}` : '—'),
    },
    {
      key: 'year',
      label: 'Academic Year / Term',
      render: (row) => `${row.academicYear?.label || '—'} · ${row.term || '—'}`,
    },
    { key: 'credits', label: 'Credits', render: (row) => row.creditHours ?? row.course?.creditHours ?? '—' },
    { key: 'mark', label: 'Total Mark', render: (row) => (row.totalMark != null ? row.totalMark : '—') },
    {
      key: 'grade',
      label: 'Grade & Points',
      render: (row) => (
        <span className="font-semibold text-slate-800">
          {row.letterGrade || '—'}{row.gradePoint !== null && row.gradePoint !== undefined ? ` · ${Number(row.gradePoint).toFixed(2)}` : ''}
        </span>
      ),
    },
    { key: 'status', label: 'Status', render: (row) => <Badge tone={toneForStatus(row.status)}>{humanStatus(row.status)}</Badge> },
  ];

  const listRows = list.data?.rows ?? [];
  const listColumns = [
    {
      key: 'student',
      label: 'Student',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-900">{row.fullName}</p>
          <p className="text-xs text-slate-500">
            {row.studentId} · {row.program || '—'}{row.batch ? ` (${row.batch})` : ''}
          </p>
        </div>
      ),
    },
    ...(isStageSelected
      ? [
          {
            key: 'stageGpa',
            label: `${durationUnit} ${level} GPA`,
            render: (row) => (
              <div>
                <span className="text-base font-bold tabular-nums text-brand-600">
                  {row.stageGpa ?? '—'}
                </span>
                <p className="text-[11px] text-slate-500">{row.stageCredits ?? 0} credits · {row.stageCourses ?? 0} courses</p>
              </div>
            ),
          },
        ]
      : []),
    {
      key: 'cgpa',
      label: 'Cumulative CGPA',
      render: (row) => <span className="text-base font-bold tabular-nums text-slate-900">{row.cgpa ?? '—'}</span>,
    },
    { key: 'credits', label: 'Credits counted', render: (row) => row.credits ?? 0 },
    { key: 'courses', label: 'Courses', render: (row) => row.courseCount ?? 0 },
    {
      key: 'action',
      label: '',
      className: 'text-right',
      mobileFull: true,
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setStudent({ id: row.id, fullName: row.fullName, studentId: row.studentId })}
          >
            Open record
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="GPA & CGPA"
        subtitle="Official values follow the configured grading policy and its repeat policy. Only published results from the Results page are counted."
      />

      <Card>
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px_220px] sm:items-end">
            <StudentPicker
              value={student}
              onChange={setStudent}
              label="Find a student"
              hint="Leave empty to review all students by programme, batch or duration stage."
            />
            <SelectField
              label="Programme"
              value={program}
              onChange={(event) => {
                setProgram(event.target.value);
                setBatch('');
                setLevel('all');
              }}
              disabled={Boolean(student)}
            >
              <option value="">All programmes</option>
              {(options.data?.programs || []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} · {row.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Batch"
              value={batch}
              onChange={(event) => setBatch(event.target.value)}
              disabled={Boolean(student)}
            >
              <option value="">All batches</option>
              {availableBatches.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} · {row.name}
                </option>
              ))}
            </SelectField>
          </div>

          {program && !student && (
            <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">{durationUnit} / Stage:</span>
                <FilterTabs tabs={stageTabs} value={level} onChange={setLevel} label="Duration stages" />
              </div>
              <div className="flex items-center gap-2">
                {isStageSelected && (
                  <Button
                    size="sm"
                    variant={stageCompleted ? 'primary' : 'secondary'}
                    onClick={() => list.refetch()}
                    loading={list.isFetching}
                    disabled={!stageCompleted}
                  >
                    Calculate {durationUnit} {level} GPA
                  </Button>
                )}
                {allStagesFinished && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => list.refetch()}
                    loading={list.isFetching}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    Calculate Programme CGPA
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Stage Status / Banner Alerts */}
      {program && !student && (
        <>
          {isStageSelected && stageCompleted && (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-emerald-900 shadow-sm">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
              <div className="flex-1 text-sm">
                <span className="font-semibold">{durationUnit} {level} is marked as finished & verified!</span>
                <p className="text-xs text-emerald-700">
                  All course results for this stage were submitted from the Results review page. Stage GPA is calculated for all students below.
                </p>
              </div>
              <Badge tone="success">Stage Verified</Badge>
            </div>
          )}

          {isStageSelected && !stageCompleted && (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-amber-900 shadow-sm">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
              <div className="flex-1 text-sm">
                <span className="font-semibold">{durationUnit} {level} results pending completion</span>
                <p className="text-xs text-amber-700">
                  Some or all courses for {durationUnit} {level} are still active or not yet submitted/published from the Registrar Results page. Once finalized there, stage GPA will be fully computed.
                </p>
              </div>
              <Badge tone="warning">In Progress</Badge>
            </div>
          )}

          {allStagesFinished && (
            <div className="flex items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/80 p-4 text-indigo-900 shadow-sm">
              <Award className="h-5 w-5 shrink-0 text-indigo-600" />
              <div className="flex-1 text-sm">
                <span className="font-semibold">All {totalStages} {durationUnit}s completed!</span>
                <p className="text-xs text-indigo-700">
                  All programme stages have been finished and verified. Cumulative CGPA is ready for official graduation evaluation and transcript issuance.
                </p>
              </div>
              <Badge tone="indigo">All Stages Complete</Badge>
            </div>
          )}
        </>
      )}

      {student ? (
        detail.isLoading ? (
          <SkeletonCard lines={10} />
        ) : detail.error ? (
          <Card>
            <ErrorState
              message={detail.error?.response?.data?.message || 'The GPA could not be calculated.'}
              onRetry={detail.refetch}
            />
          </Card>
        ) : detail.data && !detail.data.configured ? (
          <ConfigNotice message={detail.data.message} />
        ) : detail.data ? (
          <div className="space-y-5">
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Cumulative CGPA"
                value={detail.data.cgpa ?? '—'}
                icon={GraduationCap}
                tone="indigo"
                hint="Cumulative grade point average"
              />
              <StatCard
                label="Total Credits Counted"
                value={detail.data.credits ?? 0}
                icon={Calculator}
                tone="emerald"
                hint="Earned under official repeat policy"
              />
              <StatCard
                label="Quality Points"
                value={detail.data.qualityPoints ?? 0}
                icon={Calculator}
                tone="amber"
                hint="Grade points × credit hours"
              />
              <StatCard
                label="Published Courses"
                value={detail.data.courseCount ?? 0}
                icon={BookOpen}
                tone="sky"
                hint="Official published results only"
              />
            </section>

            {detail.data.stageBreakdown?.length > 0 && (
              <Card className="p-4 sm:p-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Performance Breakdown by {durationUnit}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                  {detail.data.stageBreakdown.map((sb) => (
                    <div key={sb.level} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                      <p className="text-xs font-medium text-slate-500">
                        {durationUnit} {sb.level}
                      </p>
                      <div className="mt-1 flex items-baseline justify-between">
                        <span className="text-xl font-bold tabular-nums text-brand-700">{sb.gpa ?? '—'}</span>
                        <span className="text-xs text-slate-600">
                          {sb.credits ?? 0} cr · {sb.courseCount ?? 0} crs
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card>
              <CardHeader
                title={`${detail.data.student?.fullName || 'Student'} · Official Academic Record`}
                subtitle={`${detail.data.student?.studentId || ''} · ${detail.data.student?.program || ''}${detail.data.student?.batch ? ` · Batch: ${detail.data.student.batch}` : ''}`}
                icon={GraduationCap}
                action={
                  <div className="flex flex-wrap items-center gap-2">
                    <ExportMenu
                      basePath={`${REGISTRAR}/gpa-cgpa/${student.id}/export`}
                      params={level !== 'all' ? { level: Number(level) } : {}}
                      filenamePrefix={`GPA_${student.studentId || 'record'}`}
                      label="Export Student GPA"
                      formats={['pdf', 'xlsx', 'docx']}
                    />
                    <Button size="sm" variant="secondary" onClick={() => setStudent(null)}>
                      Back to all students
                    </Button>
                  </div>
                }
              />
              <RegistrarTable
                columns={courseColumns}
                rows={detail.data.courses || []}
                rowKey={(row) => row.id || row._id}
                emptyTitle="No published results"
                emptyMessage="A CGPA can only be calculated after results have been published."
              />
            </Card>
          </div>
        ) : null
      ) : list.isLoading ? (
        <SkeletonCard lines={10} />
      ) : list.error ? (
        <Card>
          <ErrorState
            message={list.error?.response?.data?.message || 'GPA records could not be loaded.'}
            onRetry={list.refetch}
          />
        </Card>
      ) : list.data && !list.data.configured ? (
        <ConfigNotice message={list.data.message} />
      ) : (
        <Card>
          <CardHeader
            title="Students with published results"
            subtitle={
              isStageSelected
                ? `Showing ${durationUnit} ${level} GPA and cumulative CGPA for matching students.`
                : 'Up to 500 students matching the selected programme or batch.'
            }
            icon={Calculator}
            action={<Badge tone="neutral">Policy v{list.data?.policyVersion ?? '—'}</Badge>}
          />
          <RegistrarTable
            columns={listColumns}
            rows={listRows}
            loading={list.isFetching}
            rowKey={(row) => row.id}
            emptyTitle="No GPA records yet"
            emptyMessage="Publish results from the Results page before calculating GPA or CGPA."
          />
        </Card>
      )}
    </div>
  );
}

function ConfigNotice({ message }) {
  return (
    <Card>
      <CardBody className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
          <Info className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">Grading policy required</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            {message || 'Configure the grading policy before official GPA or CGPA can be calculated.'}
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
