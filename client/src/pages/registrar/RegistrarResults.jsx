import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Award,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  GraduationCap,
  Layers,
  Mail,
  Send,
  ThumbsDown,
} from 'lucide-react';
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
import ConfirmDialog from '../../components/registrar/ConfirmDialog';
import { SelectField, TextAreaField } from '../../components/registrar/Fields';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';
import CodeInput from '../../components/ui/CodeInput';
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';
import { EmptyState } from '../../components/ui/StatePanel';
import { SkeletonCard } from '../../components/ui/Skeleton';

export default function RegistrarResults() {
  const queryClient = useQueryClient();
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedProg, setSelectedProg] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);

  // Single offering modal view
  const [viewOfferingId, setViewOfferingId] = useState(null);

  // Verification modal state for stage completion
  const [stageSubmitModal, setStageSubmitModal] = useState(null); // { programId, programName, level, durationYears, totalYears }
  const [programFinishModal, setProgramFinishModal] = useState(null); // { programId, programName, batchId, batchCode }
  const [verificationCode, setVerificationCode] = useState('');

  // Course level review actions
  const [acceptingSubmission, setAcceptingSubmission] = useState(null);
  const [decliningSubmission, setDecliningSubmission] = useState(null);
  const [publishingSubmission, setPublishingSubmission] = useState(null);

  const options = useQuery({
    queryKey: ['registrar', 'students', 'options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/options`)).data,
    staleTime: 5 * 60_000,
  });

  const structure = useQuery({
    queryKey: ['registrar', 'structure'],
    queryFn: async () => (await api.get(`${REGISTRAR}/academic-structure`)).data,
    staleTime: 5 * 60_000,
  });

  const submissions = useQuery({
    queryKey: ['registrar', 'result-submissions'],
    queryFn: async () => (await api.get(`${REGISTRAR}/results/submissions`)).data,
  });

  const singleOffering = useQuery({
    queryKey: ['registrar', 'offering-results', viewOfferingId],
    queryFn: async () => (await api.get(`${REGISTRAR}/results/offerings/${viewOfferingId}`)).data,
    enabled: Boolean(viewOfferingId),
  });

  const submissionRows = submissions.data?.rows ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['registrar', 'result-submissions'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'results'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'offering-results'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'dashboard'] });
  };

  const requestCodeMutation = useMutation({
    mutationFn: async () => (await api.post(`${REGISTRAR}/results/request-submit-code`)).data,
    onSuccess: () => toast.success('A 6-digit confirmation code has been emailed to you.'),
    onError: (err) => toast.error(errorMessage(err, 'Could not send verification code.')),
  });

  const submitStageMutation = useMutation({
    mutationFn: async ({ programId, level, code }) =>
      (await api.post(`${REGISTRAR}/results/submit-stage-complete`, { programId, level, code })).data,
    onSuccess: (data) => {
      toast.success(data.message || 'Stage results submitted and finalized for GPA calculation!');
      setStageSubmitModal(null);
      setVerificationCode('');
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not submit stage.')),
  });

  const submitProgramMutation = useMutation({
    mutationFn: async ({ programId, batchId, code }) =>
      (await api.post(`${REGISTRAR}/results/submit-program-finished`, { programId, batchId, code })).data,
    onSuccess: (data) => {
      toast.success(data.message || 'Programme all years finished and verified!');
      setProgramFinishModal(null);
      setVerificationCode('');
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not complete programme.')),
  });

  const approveSubmission = useMutation({
    mutationFn: async (row) => (await api.post(`${REGISTRAR}/results/submissions/${row.id}/approve`)).data,
    onSuccess: (data) => {
      toast.success(`${data.updated} result${data.updated === 1 ? '' : 's'} approved.`);
      setAcceptingSubmission(null);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'The course submission could not be approved.')),
  });

  const declineSubmission = useMutation({
    mutationFn: async ({ row, reason }) =>
      (await api.post(`${REGISTRAR}/results/submissions/${row.id}/decline`, { reason })).data,
    onSuccess: (data) => {
      toast.success(`${data.updated} result${data.updated === 1 ? '' : 's'} returned for correction.`);
      setDecliningSubmission(null);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'The course submission could not be declined.')),
  });

  const publishSubmission = useMutation({
    mutationFn: async (row) => (await api.post(`${REGISTRAR}/results/submissions/${row.id}/publish`)).data,
    onSuccess: (data) => {
      toast.success(`${data.updated} result${data.updated === 1 ? '' : 's'} published.`);
      setPublishingSubmission(null);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'The course results could not be published.')),
  });

  // Filter departments and programmes
  const departments = structure.data?.departments || [];
  const rawPrograms = structure.data?.programs || [];

  const filteredPrograms = useMemo(() => {
    if (!selectedDept) return rawPrograms;
    return rawPrograms.filter((p) => p.department?.id === selectedDept || p.department === selectedDept);
  }, [rawPrograms, selectedDept]);

  // Group submitted rows by Programme + Level
  const groupedSubmissions = useMemo(() => {
    const map = new Map();
    for (const row of submissionRows) {
      const prog = row.program;
      const dept = row.department;
      const progId = prog?.id || 'unknown-prog';
      const level = row.level || 1;
      const key = `${progId}-lvl-${level}`;

      if (selectedDept && dept?.id !== selectedDept) continue;
      if (selectedProg && progId !== selectedProg) continue;
      if (selectedLevel && String(level) !== String(selectedLevel)) continue;

      if (!map.has(key)) {
        const fullProg = rawPrograms.find((p) => p.id === progId);
        const qType = prog?.qualificationType || fullProg?.qualificationType || 'degree';
        const totalYears = fullProg?.durationYears || prog?.durationYears || (qType === 'degree' ? 4 : 4);
        const totalLevels = fullProg?.levels?.length || (qType === 'diploma' ? 4 : null);
        const shortTermDuration = fullProg?.shortTermDuration || prog?.shortTerm?.duration || 12;

        map.set(key, {
          key,
          programId: progId,
          programName: prog?.name || 'Programme',
          programCode: prog?.code || 'PROG',
          departmentName: dept?.name || 'Department',
          qualificationType: qType,
          level,
          totalYears,
          totalLevels,
          shortTermDuration,
          batchId: row.batch?.id,
          batchCode: row.batch?.code,
          category: row.category || 'regular',
          courses: [],
          allPublished: true,
          allApproved: true,
          totalStudentsCount: 0,
        });
      }

      const group = map.get(key);
      group.courses.push(row);
      group.totalStudentsCount += row.counts?.total || 0;
      if (row.status !== 'approved' && row.status !== 'published') {
        group.allApproved = false;
      }
      if (row.status !== 'published') {
        group.allPublished = false;
      }
    }
    return Array.from(map.values());
  }, [submissionRows, selectedDept, selectedProg, selectedLevel, rawPrograms]);

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Submitted Course Results"
        subtitle="Only course results submitted by teachers are displayed. Grouped by Programme and Year/Level, review courses, open single course mark sheets, and submit finished stages for GPA/CGPA calculation."
      />

      {/* Filter Tabs Bar (Dept:, Prog:, Year / Level:) */}
      <Card>
        <CardBody className="space-y-3 p-4">
          {/* Department tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0 mr-1">Dept:</span>
            <button
              type="button"
              onClick={() => { setSelectedDept(''); setSelectedProg(''); }}
              className={`focus-ring shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${!selectedDept ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              All departments
            </button>
            {departments.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => { setSelectedDept(d.id); setSelectedProg(''); }}
                className={`focus-ring shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${selectedDept === d.id ? 'bg-brand-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {d.code} · {d.name}
              </button>
            ))}
          </div>

          {/* Programme tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0 mr-1">Prog:</span>
            <button
              type="button"
              onClick={() => setSelectedProg('')}
              className={`focus-ring shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${!selectedProg ? 'border border-brand-300 bg-brand-50 text-brand-800 font-semibold' : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
            >
              All programmes ({filteredPrograms.length})
            </button>
            {filteredPrograms.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProg(p.id)}
                className={`focus-ring shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${selectedProg === p.id ? 'border border-brand-300 bg-brand-50 text-brand-800 font-semibold' : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
              >
                {p.code} ({p.name})
              </button>
            ))}
          </div>

          {/* Year / Level tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0 mr-1">Stage / Level:</span>
            <button
              type="button"
              onClick={() => setSelectedLevel('')}
              className={`focus-ring shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${!selectedLevel ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              All Years & Levels
            </button>
            {[1, 2, 3, 4, 5].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setSelectedLevel(String(lvl))}
                className={`focus-ring shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${String(selectedLevel) === String(lvl) ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                Year {lvl} / Level {lvl}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Grouped Programme Stages View */}
      {submissions.isLoading ? (
        <SkeletonCard lines={8} />
      ) : groupedSubmissions.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={ClipboardCheck}
              title="No submitted results in this view"
              message="When teachers finalize and submit mark sheets for their assigned courses, they will appear here grouped by Programme and Year/Level."
            />
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupedSubmissions.map((group) => {
            const stageLabel =
              group.qualificationType === 'degree'
                ? `Year ${group.level}`
                : group.qualificationType === 'diploma'
                  ? `Level ${group.level}`
                  : `Week ${group.level}`;

            const totalDurationLabel =
              group.qualificationType === 'degree'
                ? `${group.totalYears} Years`
                : group.qualificationType === 'diploma'
                  ? `${group.totalLevels || 4} Levels`
                  : `${group.shortTermDuration || 12} Weeks`;

            const isAllYearsDone =
              group.qualificationType === 'degree'
                ? group.level >= (group.totalYears || 4)
                : group.qualificationType === 'diploma'
                  ? group.level >= (group.totalLevels || 4)
                  : true;

            return (
              <Card key={group.key} className="overflow-hidden border border-slate-200/90 shadow-sm">
                <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 shadow-sm">
                        <GraduationCap className="h-5 w-5" />
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-base font-bold text-slate-900">{group.programName}</h2>
                          <Badge tone="brand">{stageLabel}</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {group.departmentName} · {group.programCode} · Total Duration: {totalDurationLabel} · Batch: {group.batchCode || 'Regular'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={group.category === 'extension' ? 'warning' : 'neutral'}>
                        {group.category === 'extension' ? 'Extension' : 'Regular'}
                      </Badge>
                      <Badge tone="neutral">{group.qualificationType.toUpperCase()}</Badge>
                    </div>
                  </div>
                </div>

                {/* Courses in this Programme Year/Level */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-max border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <th className="px-5 py-3">Course</th>
                        <th className="px-4 py-3">Teacher</th>
                        <th className="px-4 py-3 text-center">Marks Submitted</th>
                        <th className="px-4 py-3 text-center">Status</th>
                        <th className="px-5 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {group.courses.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/70 transition">
                          <td className="px-5 py-3">
                            <span className="font-mono font-bold text-brand-700">{row.course?.code}</span>
                            <p className="font-medium text-slate-900 mt-0.5">{row.course?.title}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {row.teacher?.name || 'No teacher assigned'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="font-semibold text-slate-800">{row.counts?.total ?? 0} students</span>
                            <div className="text-[10px] text-slate-400">
                              {row.counts?.approved ?? 0} approved · {row.counts?.submitted ?? 0} submitted
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge tone={toneForStatus(row.status)}>{humanStatus(row.status)}</Badge>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => setViewOfferingId(row.id)}
                                className="gap-1"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                Open Course Marks
                              </Button>
                              {row.status === 'submitted' || row.status === 'under_review' ? (
                                <Button
                                  size="sm"
                                  onClick={() => setAcceptingSubmission(row)}
                                >
                                  Accept & Grade
                                </Button>
                              ) : row.status === 'approved' ? (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setPublishingSubmission(row)}
                                >
                                  Publish
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Stage Submission Footer Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 p-4">
                  <div className="text-xs text-slate-500">
                    Stage completion publishes all course results for {stageLabel} and forwards them to GPA calculation.
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="primary"
                      onClick={() => setStageSubmitModal(group)}
                      className="gap-1.5"
                    >
                      <ClipboardCheck className="h-4 w-4" />
                      Submit {stageLabel} is Finished (Sent to GPA)
                    </Button>

                    {isAllYearsDone && (
                      <Button
                        variant="secondary"
                        onClick={() => setProgramFinishModal(group)}
                        className="gap-1.5 border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                      >
                        <Award className="h-4 w-4 text-emerald-600" />
                        Submit Programme Batch All Years Finished
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* MODAL 1: Single Course Results Detail */}
      <Modal
        open={Boolean(viewOfferingId)}
        onClose={() => setViewOfferingId(null)}
        title={singleOffering.data?.offering?.course?.code || 'Course Results'}
        subtitle={`${singleOffering.data?.offering?.course?.title || ''} · ${singleOffering.data?.offering?.teacher?.name || ''}`}
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setViewOfferingId(null)}>
            Close
          </Button>
        }
      >
        <div className="space-y-4">
          {singleOffering.isLoading ? (
            <SkeletonCard lines={6} />
          ) : !singleOffering.data?.results?.length ? (
            <EmptyState
              title="No student marks found"
              message="No student marks recorded for this course offering."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-max border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-2.5">Student</th>
                    <th className="px-4 py-2.5">Student ID</th>
                    <th className="px-4 py-2.5 text-center">Total Mark</th>
                    <th className="px-4 py-2.5 text-center">Letter Grade</th>
                    <th className="px-4 py-2.5 text-center">Grade Point</th>
                    <th className="px-4 py-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {singleOffering.data.results.map((r) => (
                    <tr key={r._id || r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-medium text-slate-900">
                        {r.student?.fullName || `${r.student?.firstName || ''} ${r.student?.lastName || ''}`}
                      </td>
                      <td className="px-4 py-2 font-mono text-slate-500">
                        {r.student?.studentId || '—'}
                      </td>
                      <td className="px-4 py-2 text-center font-bold text-slate-800">
                        {r.totalMark !== null && r.totalMark !== undefined ? r.totalMark : '—'}
                      </td>
                      <td className="px-4 py-2 text-center font-semibold text-brand-700">
                        {r.letterGrade || '—'}
                      </td>
                      <td className="px-4 py-2 text-center font-mono">
                        {r.gradePoint !== null && r.gradePoint !== undefined ? r.gradePoint : '—'}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <Badge tone={toneForStatus(r.status)}>{humanStatus(r.status)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      {/* MODAL 2: Submit Stage (Year / Level) Finished */}
      <Modal
        open={Boolean(stageSubmitModal)}
        onClose={() => setStageSubmitModal(null)}
        title={`Submit ${stageSubmitModal?.qualificationType === 'degree' ? `Year ${stageSubmitModal?.level}` : `Level ${stageSubmitModal?.level}`} Finished`}
        subtitle={`${stageSubmitModal?.programName} · Ready for GPA Calculation`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setStageSubmitModal(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                submitStageMutation.mutate({
                  programId: stageSubmitModal.programId,
                  level: stageSubmitModal.level,
                  code: verificationCode,
                })
              }
              loading={submitStageMutation.isPending}
              disabled={verificationCode.length !== 6}
            >
              <Send className="h-4 w-4" />
              Confirm & Send to GPA
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-600">
            Submitting <strong>{stageSubmitModal?.qualificationType === 'degree' ? `Year ${stageSubmitModal?.level}` : `Level ${stageSubmitModal?.level}`}</strong> as finished will finalize and publish all course results for this stage of <strong>{stageSubmitModal?.programName}</strong>.
            The results will be sent to the <strong>GPA/CGPA page</strong> ready to compute official GPAs.
          </p>

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Mail className="h-4 w-4 text-brand-600" />
                Email Confirmation Code
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => requestCodeMutation.mutate()}
                loading={requestCodeMutation.isPending}
              >
                Send verification code
              </Button>
            </div>
            <div className="mt-3">
              <CodeInput
                value={verificationCode}
                onChange={setVerificationCode}
                disabled={submitStageMutation.isPending}
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* MODAL 3: Submit Programme Batch Finished (All Years) */}
      <Modal
        open={Boolean(programFinishModal)}
        onClose={() => setProgramFinishModal(null)}
        title="Submit Programme Batch All Years Finished"
        subtitle={`${programFinishModal?.programName} · Batch: ${programFinishModal?.batchCode || 'All'}`}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setProgramFinishModal(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                submitProgramMutation.mutate({
                  programId: programFinishModal.programId,
                  batchId: programFinishModal.batchId,
                  code: verificationCode,
                })
              }
              loading={submitProgramMutation.isPending}
              disabled={verificationCode.length !== 6}
            >
              <Award className="h-4 w-4" />
              Confirm All Years Finished
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-600">
            This confirms that <strong>all years</strong> required by the academic structure for <strong>{programFinishModal?.programName}</strong> have been completed and verified.
            All student course results will be published and made ready for final <strong>CGPA calculation and graduation eligibility</strong>.
          </p>

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Mail className="h-4 w-4 text-brand-600" />
                Email Confirmation Code
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => requestCodeMutation.mutate()}
                loading={requestCodeMutation.isPending}
              >
                Send verification code
              </Button>
            </div>
            <div className="mt-3">
              <CodeInput
                value={verificationCode}
                onChange={setVerificationCode}
                disabled={submitProgramMutation.isPending}
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Course approval & decline confirmations */}
      <ConfirmDialog
        open={Boolean(acceptingSubmission)}
        title="Approve and grade course submission?"
        message={acceptingSubmission ? `${acceptingSubmission.course?.code} · ${acceptingSubmission.course?.title}. All pending results will receive official letter grades per grading policy.` : ''}
        confirmLabel="Approve course"
        loading={approveSubmission.isPending}
        onClose={() => setAcceptingSubmission(null)}
        onConfirm={() => approveSubmission.mutate(acceptingSubmission)}
      />

      <Modal
        open={Boolean(decliningSubmission)}
        title="Return submission for correction"
        subtitle={decliningSubmission ? `${decliningSubmission.course?.code} · ${decliningSubmission.course?.title}` : ''}
        size="sm"
        onClose={() => setDecliningSubmission(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDecliningSubmission(null)}>
              Cancel
            </Button>
            <Button
              tone="danger"
              onClick={() => {
                const reason = document.getElementById('decline-reason')?.value || 'Returned for mark review.';
                declineSubmission.mutate({ row: decliningSubmission, reason });
              }}
              loading={declineSubmission.isPending}
            >
              Return to teacher
            </Button>
          </>
        }
      >
        <div>
          <label htmlFor="decline-reason" className="block text-xs font-medium text-slate-700 mb-1.5">
            Reason for return
          </label>
          <textarea
            id="decline-reason"
            rows={3}
            defaultValue="Marks need review or verification."
            className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800"
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(publishingSubmission)}
        title="Publish approved results?"
        message={publishingSubmission ? `${publishingSubmission.course?.code} approved results will be officially published and available to students.` : ''}
        confirmLabel="Publish results"
        loading={publishSubmission.isPending}
        onClose={() => setPublishingSubmission(null)}
        onConfirm={() => publishSubmission.mutate(publishingSubmission)}
      />
    </div>
  );
}
