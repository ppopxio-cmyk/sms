import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import {
  Calculator,
  GraduationCap,
  Info,
  CheckCircle2,
  AlertCircle,
  Award,
  BookOpen,
  RefreshCw,
  Send,
  FileText,
  Search,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { REGISTRAR, humanStatus, toneForStatus } from '../../lib/registrar';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import StudentPicker from '../../components/registrar/StudentPicker';
import { SelectField } from '../../components/registrar/Fields';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import ExportMenu from '../../components/ui/ExportMenu';
import { ErrorState } from '../../components/ui/StatePanel';
import { SkeletonCard } from '../../components/ui/Skeleton';
import StatCard from '../../components/ui/StatCard';

export default function RegistrarGpa() {
  const queryClient = useQueryClient();
  const [activeMainTab, setActiveMainTab] = useState('gpa'); // 'gpa' | 'cgpa'

  // Dropdown filter states (strict cascaded dropdowns, no 'All')
  const [batch, setBatch] = useState('');
  const [department, setDepartment] = useState('');
  const [program, setProgram] = useState('');
  const [level, setLevel] = useState('');
  const [student, setStudent] = useState(null);

  const options = useQuery({
    queryKey: ['registrar', 'students', 'options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/options`)).data,
    staleTime: 5 * 60_000,
  });

  const departments = options.data?.departments || [];
  const allPrograms = options.data?.programs || [];
  const rawBatches = options.data?.batches || [];

  // Unique batches
  const availableBatches = useMemo(() => {
    const map = new Map();
    for (const b of rawBatches) {
      if (b.status === 'archived') continue;
      const cat = b.category || 'regular';
      const key = `${b.code}::${cat}`;
      if (!map.has(key)) {
        map.set(key, {
          id: b.id || b._id,
          code: b.code,
          category: cat,
          program: b.program,
        });
      }
    }
    return Array.from(map.values());
  }, [rawBatches]);

  // Filter programmes by selected department
  const programsInDept = useMemo(() => {
    if (!department) return [];
    return allPrograms.filter(
      (p) => String(p.department?.id || p.department) === String(department),
    );
  }, [allPrograms, department]);

  const selectedProgramDoc = useMemo(
    () => allPrograms.find((p) => p.id === program),
    [allPrograms, program],
  );

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

  const stageOptions = useMemo(() => {
    const list = [];
    for (let i = 1; i <= totalStages; i++) {
      list.push({ stage: i, label: `${durationUnit} ${i}` });
    }
    return list;
  }, [durationUnit, totalStages]);

  const listParams = {
    ...(program ? { program } : {}),
    ...(batch ? { batch } : {}),
    ...(activeMainTab === 'gpa' && level ? { level: Number(level) } : {}),
  };

  const list = useQuery({
    queryKey: ['registrar', 'gpa-list', listParams, activeMainTab],
    queryFn: async () => (await api.get(`${REGISTRAR}/gpa-cgpa`, { params: listParams })).data,
    enabled: Boolean(program && batch && (activeMainTab === 'cgpa' || level)),
  });

  const detail = useQuery({
    queryKey: ['registrar', 'gpa', student?.id],
    queryFn: async () => (await api.get(`${REGISTRAR}/gpa-cgpa`, { params: { student: student.id } })).data,
    enabled: Boolean(student?.id),
  });

  const isStageSelected = activeMainTab === 'gpa' && Boolean(level);
  const stageCompleted = Boolean(list.data?.stageCompleted);
  const allStagesFinished = Boolean(list.data?.allStagesFinished);
  const readyForCgpa = Boolean(list.data?.programInfo?.readyForCgpa || allStagesFinished);
  const isCgpaCalculated = Boolean(list.data?.programInfo?.cgpaCalculated);

  const calculateGpaMutation = useMutation({
    mutationFn: async () => {
      await list.refetch();
      return list.data?.rows?.length ?? 0;
    },
    onSuccess: (count) => {
      toast.success(
        `${durationUnit} ${level} GPA calculated for all ${count} student(s) and recorded for single-year transcripts!`,
      );
      queryClient.invalidateQueries({ queryKey: ['registrar', 'gpa-list'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to calculate Stage GPA.')),
  });

  const sendToCgpaMutation = useMutation({
    mutationFn: async () =>
      (await api.post(`${REGISTRAR}/gpa-cgpa/send-to-cgpa`, { programId: program, batchId: batch })).data,
    onSuccess: (data) => {
      toast.success(data.message || 'All years GPA verified! Programme sent to CGPA tab.');
      queryClient.invalidateQueries({ queryKey: ['registrar', 'gpa-list'] });
      setActiveMainTab('cgpa');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not send programme to CGPA.')),
  });

  const calculateCgpaMutation = useMutation({
    mutationFn: async () =>
      (await api.post(`${REGISTRAR}/gpa-cgpa/calculate-cgpa`, { programId: program, batchId: batch })).data,
    onSuccess: (data) => {
      toast.success(data.message || 'Cumulative CGPA calculated and all students marked as Graduated!');
      queryClient.invalidateQueries({ queryKey: ['registrar', 'gpa-list'] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'students'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not calculate CGPA.')),
  });

  const listRows = list.data?.rows ?? [];

  const listColumns = [
    {
      key: 'student',
      label: 'Student',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-900">{row.fullName}</p>
          <p className="text-xs text-slate-500 font-mono">
            {row.studentId} · <span className="font-sans">{row.program || '—'}{row.batch ? ` (${row.batch})` : ''}</span>
          </p>
        </div>
      ),
    },
    ...(activeMainTab === 'gpa' && isStageSelected
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
    ...(activeMainTab === 'cgpa'
      ? [
          {
            key: 'cgpa',
            label: 'Cumulative CGPA',
            render: (row) => (
              <span className="text-base font-bold tabular-nums text-indigo-700">
                {row.cgpa ?? '—'}
              </span>
            ),
          },
          {
            key: 'status',
            label: 'Graduation Status',
            render: (row) => (
              <Badge tone={isCgpaCalculated ? 'success' : 'neutral'}>
                {isCgpaCalculated ? 'Calculated · Graduated' : 'Ready for CGPA'}
              </Badge>
            ),
          },
        ]
      : []),
    { key: 'credits', label: 'Credits counted', render: (row) => row.credits ?? 0 },
    { key: 'courses', label: 'Courses counted', render: (row) => row.courseCount ?? 0 },
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
        title="GPA & CGPA Calculation"
        subtitle="Calculate Stage GPA for single-year transcripts or Cumulative CGPA for all completed years and graduation evaluation."
      />

      {/* Main Mode Tabs: GPA vs CGPA */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveMainTab('gpa')}
          className={`focus-ring inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition ${
            activeMainTab === 'gpa'
              ? 'bg-brand-600 text-white shadow-sm ring-2 ring-brand-400'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Calculator className="h-4 w-4" />
          <span>Stage GPA</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab('cgpa')}
          className={`focus-ring inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition ${
            activeMainTab === 'cgpa'
              ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-400'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Award className="h-4 w-4" />
          <span>Cumulative CGPA</span>
        </button>
      </div>

      {/* Cascaded Filter Dropdowns (Strictly selects, no 'All' options) */}
      <Card>
        <CardBody className="p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
            <SelectField
              label="1. Batch"
              value={batch}
              onChange={(e) => {
                setBatch(e.target.value);
                setDepartment('');
                setProgram('');
                setLevel('');
              }}
              required
            >
              <option value="">Choose batch...</option>
              {availableBatches.map((b) => (
                <option key={b.id || b.code} value={b.id}>
                  {b.code} ({b.category || 'regular'})
                </option>
              ))}
            </SelectField>

            <SelectField
              label="2. Department"
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value);
                setProgram('');
                setLevel('');
              }}
              disabled={!batch}
              required
            >
              <option value="">Choose department...</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} · {d.name}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="3. Programme"
              value={program}
              onChange={(e) => {
                setProgram(e.target.value);
                setLevel('');
              }}
              disabled={!department}
              required
            >
              <option value="">Choose programme...</option>
              {programsInDept.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </SelectField>

            {activeMainTab === 'gpa' ? (
              <SelectField
                label={`4. ${durationUnit} / Stage`}
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                disabled={!program}
                required
              >
                <option value="">Choose stage / year...</option>
                {stageOptions.map((s) => (
                  <option key={s.stage} value={s.stage}>
                    {s.label}
                  </option>
                ))}
              </SelectField>
            ) : (
              <div className="flex flex-col justify-end">
                <span className="text-xs font-semibold text-slate-500 mb-2">Cumulative Scope:</span>
                <Badge tone="indigo" className="py-2 justify-center">
                  All {totalStages} {durationUnit}s Included
                </Badge>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Main View Area */}
      {!program || !batch || (activeMainTab === 'gpa' && !level) ? (
        <Card>
          <CardBody className="py-12 text-center">
            <Calculator className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-3 text-sm font-semibold text-slate-800">
              Select Batch, Department, Programme {activeMainTab === 'gpa' ? 'and Stage' : ''}
            </h3>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              Choose from the cascaded dropdowns above to calculate {activeMainTab === 'gpa' ? `Stage GPA for ${durationUnit} ${level || ''}` : 'Cumulative CGPA across all years'}.
            </p>
          </CardBody>
        </Card>
      ) : list.isLoading ? (
        <SkeletonCard lines={8} />
      ) : list.error ? (
        <Card>
          <ErrorState message={list.error?.response?.data?.message || 'GPA records could not be loaded.'} />
        </Card>
      ) : (
        <div className="space-y-5">
          {/* Action Bar based on Mode */}
          {activeMainTab === 'gpa' ? (
            /* GPA TAB HEADER & ACTIONS */
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 shadow-sm">
                  <Calculator className="h-6 w-6" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      {selectedProgramDoc?.name} · {durationUnit} {level} GPA
                    </h3>
                    {stageCompleted ? (
                      <Badge tone="success">Results Accepted & Ready</Badge>
                    ) : (
                      <Badge tone="warning">Pending Results Submission</Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Calculated for single {durationUnit} {level} transcript. Does not send to CGPA until all years finish.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => calculateGpaMutation.mutate()}
                  loading={calculateGpaMutation.isPending || list.isFetching}
                  className="gap-1.5 bg-brand-600 hover:bg-brand-700 text-white"
                >
                  <RefreshCw className="h-4 w-4" /> Calculate {durationUnit} {level} GPA
                </Button>

                {allStagesFinished && (
                  <Button
                    onClick={() => sendToCgpaMutation.mutate()}
                    loading={sendToCgpaMutation.isPending}
                    className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold ring-2 ring-indigo-300"
                  >
                    <Send className="h-4 w-4" /> Send to CGPA (All {totalStages} {durationUnit}s Finished)
                  </Button>
                )}
              </div>
            </div>
          ) : (
            /* CGPA TAB HEADER & ACTIONS */
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                  <Award className="h-6 w-6" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      {selectedProgramDoc?.name} · Cumulative Programme CGPA
                    </h3>
                    <Badge tone={isCgpaCalculated ? 'success' : readyForCgpa ? 'indigo' : 'warning'}>
                      {isCgpaCalculated
                        ? 'Status: Calculated · Graduated'
                        : readyForCgpa
                        ? 'Ready for CGPA Calculation'
                        : 'Waiting for all years completion'}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Covers all {totalStages} {durationUnit}s. Calculating CGPA finalizes student academic status and sets students to <strong>Graduated</strong>.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => calculateCgpaMutation.mutate()}
                  loading={calculateCgpaMutation.isPending || list.isFetching}
                  disabled={!readyForCgpa}
                  className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  <Award className="h-4 w-4" /> Calculate Cumulative CGPA & Graduate
                </Button>

                {isCgpaCalculated && (
                  <Link to="/registrar/graduated">
                    <Button variant="secondary" className="gap-1.5 border-emerald-300 text-emerald-800">
                      <GraduationCap className="h-4 w-4 text-emerald-600" /> View in Graduated Page
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Table of Students */}
          <Card>
            <CardHeader
              title={
                activeMainTab === 'gpa'
                  ? `Students enrolled in ${selectedProgramDoc?.name} · ${durationUnit} ${level}`
                  : `All students in ${selectedProgramDoc?.name} (Cumulative Overview)`
              }
              subtitle={`${listRows.length} enrolled student(s) in this batch.`}
              icon={activeMainTab === 'gpa' ? Calculator : Award}
              action={<Badge tone="neutral">Policy v{list.data?.policyVersion ?? '—'}</Badge>}
            />
            <RegistrarTable
              columns={listColumns}
              rows={listRows}
              loading={list.isFetching}
              rowKey={(row) => row.id}
              emptyTitle="No students found"
              emptyMessage="No students found matching this selection."
            />
          </Card>
        </div>
      )}

      {/* Student Detail Modal */}
      {student && detail.data && (
        <Modal
          open={Boolean(student)}
          onClose={() => setStudent(null)}
          title={`${detail.data.student?.fullName || 'Student'} · Academic Record`}
          subtitle={`${detail.data.student?.studentId || ''} · ${detail.data.student?.program || ''}`}
          size="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              <ExportMenu
                basePath={`${REGISTRAR}/gpa-cgpa/${student.id}/export`}
                params={level ? { level: Number(level) } : {}}
                filenamePrefix={`GPA_${student.studentId || 'record'}`}
                label="Export Student GPA"
                formats={['pdf', 'xlsx', 'docx']}
              />
              <Button variant="secondary" onClick={() => setStudent(null)}>
                Close
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <section className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <span className="text-xs text-slate-400">Cumulative CGPA</span>
                <p className="text-xl font-bold text-indigo-700">{detail.data.cgpa ?? '—'}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <span className="text-xs text-slate-400">Total Credits Counted</span>
                <p className="text-xl font-bold text-slate-800">{detail.data.credits ?? 0}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <span className="text-xs text-slate-400">Total Courses Published</span>
                <p className="text-xl font-bold text-emerald-700">{detail.data.courseCount ?? 0}</p>
              </div>
            </section>

            {detail.data.stageBreakdown?.length > 0 && (
              <div className="rounded-xl border border-slate-100 p-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Performance Breakdown by {durationUnit}
                </h4>
                <div className="grid gap-2 sm:grid-cols-4">
                  {detail.data.stageBreakdown.map((sb) => (
                    <div key={sb.level} className="rounded-lg bg-slate-50 p-2.5 text-xs">
                      <span className="font-semibold text-slate-700">{durationUnit} {sb.level}</span>
                      <p className="text-base font-bold text-brand-700 mt-0.5">{sb.gpa ?? '—'}</p>
                      <p className="text-[10px] text-slate-400">{sb.credits} cr · {sb.courseCount} crs</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
