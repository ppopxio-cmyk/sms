import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Award,
  BookOpen,
  Calculator,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  GraduationCap,
  Layers,
  Mail,
  Search,
  Send,
  Timer,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  REGISTRAR,
  displayDateTime,
  humanStatus,
  levelLabel,
  toneForStatus,
} from '../../lib/registrar';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import { SelectField } from '../../components/registrar/Fields';
import Card, { CardBody } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import CodeInput from '../../components/ui/CodeInput';
import { EmptyState } from '../../components/ui/StatePanel';
import { SkeletonCard } from '../../components/ui/Skeleton';

export default function RegistrarResults() {
  const queryClient = useQueryClient();

  // Filters state (strictly dropdowns, no "All" options)
  const [selectedBatch, setSelectedBatch] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedProg, setSelectedProg] = useState('');
  const [selectedLevel, setSelectedLevel] = useState('');

  // Active query applied when clicking "Show Results"
  const [activeQuery, setActiveQuery] = useState(null);

  // Single offering modal view
  const [viewOfferingId, setViewOfferingId] = useState(null);

  // Verification modal state for stage completion
  const [stageSubmitModal, setStageSubmitModal] = useState(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // 2-minute cooldown timer effect
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

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

  const rawBatches = options.data?.batches || [];
  const uniqueBatches = useMemo(() => {
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

  const departments = structure.data?.departments || [];
  const rawPrograms = structure.data?.programs || [];

  const filteredPrograms = useMemo(() => {
    if (!selectedDept) return [];
    return rawPrograms.filter(
      (p) => String(p.department?.id || p.department) === String(selectedDept),
    );
  }, [rawPrograms, selectedDept]);

  const selectedProgDoc = useMemo(() => {
    return rawPrograms.find((p) => String(p.id) === String(selectedProg));
  }, [rawPrograms, selectedProg]);

  const stageUnit = useMemo(() => {
    if (!selectedProgDoc) return 'Year';
    if (selectedProgDoc.qualificationType === 'degree') return 'Year';
    if (selectedProgDoc.qualificationType === 'diploma') return 'Level';
    return selectedProgDoc.shortTerm?.unit === 'months' ? 'Month' : 'Week';
  }, [selectedProgDoc]);

  const availableStages = useMemo(() => {
    if (!selectedProgDoc) return [];
    const count =
      selectedProgDoc.qualificationType === 'degree'
        ? selectedProgDoc.durationYears || 4
        : selectedProgDoc.qualificationType === 'diploma'
        ? selectedProgDoc.levels?.length || 4
        : selectedProgDoc.shortTerm?.duration || 3;
    const list = [];
    for (let i = 1; i <= count; i++) {
      list.push({ stage: i, label: `${stageUnit} ${i}` });
    }
    return list;
  }, [selectedProgDoc, stageUnit]);

  const selectedBatchDoc = useMemo(
    () => uniqueBatches.find((b) => b.id === (activeQuery?.batch || selectedBatch)),
    [uniqueBatches, activeQuery, selectedBatch],
  );

  const resolvedBatchId = useMemo(() => {
    const progId = activeQuery?.program || selectedProg;
    const batchKeyOrId = activeQuery?.batch || selectedBatch;
    if (!progId || !batchKeyOrId) return batchKeyOrId;
    const batchObj = uniqueBatches.find((b) => b.id === batchKeyOrId || b.code === batchKeyOrId);
    if (!batchObj) return batchKeyOrId;
    const progBatch = rawBatches.find(
      (b) =>
        String(b.program?.id || b.program) === String(progId) &&
        b.code === batchObj.code &&
        (b.category || 'regular') === (batchObj.category || 'regular'),
    );
    return progBatch ? (progBatch.id || progBatch._id) : batchKeyOrId;
  }, [rawBatches, uniqueBatches, activeQuery, selectedProg, selectedBatch]);

  const handleShowResults = () => {
    if (!selectedBatch || !selectedDept || !selectedProg || !selectedLevel) {
      toast.error('Please choose Batch, Department, Programme, and Stage/Year.');
      return;
    }
    setActiveQuery({
      batch: resolvedBatchId || selectedBatch,
      department: selectedDept,
      program: selectedProg,
      level: selectedLevel === 'all' ? 'all' : Number(selectedLevel),
    });
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['registrar', 'result-submissions'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'results'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'offering-results'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'dashboard'] });
  };

  const requestCodeMutation = useMutation({
    mutationFn: async () => (await api.post(`${REGISTRAR}/results/request-submit-code`)).data,
    onSuccess: (data) => {
      toast.success(data.message || 'Verification code sent to your email.');
      setResendCooldown(120); // 2 minutes cooldown
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not send verification code.')),
  });

  const submitStageMutation = useMutation({
    mutationFn: async ({ programId, level, batchId, code }) =>
      (await api.post(`${REGISTRAR}/results/submit-stage-complete`, { programId, level, batchId, code })).data,
    onSuccess: (data) => {
      toast.success(data.message || 'Results accepted, graded, and sent to GPA page!');
      setStageSubmitModal(null);
      setVerificationCode('');
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not accept and grade stage.')),
  });

  // Filter submissions matching active query
  const matchingCourses = useMemo(() => {
    if (!activeQuery) return [];
    const rows = submissions.data?.rows || [];
    return rows.filter((r) => {
      const matchProg = String(r.program?.id || r.program) === String(activeQuery.program);
      const matchLevel = activeQuery.level === 'all' || Number(r.level || 1) === Number(activeQuery.level);
      return matchProg && matchLevel;
    });
  }, [submissions.data?.rows, activeQuery]);

  const totalStagesCount = availableStages.length || 4;
  const finalizedStages = selectedProgDoc?.finalizedStages || [];
  const allPublished = matchingCourses.length > 0 && matchingCourses.every(
    (c) => c.status === 'published' || (c.counts?.total > 0 && c.counts?.published === c.counts?.total)
  );
  const isAlreadyFinalized = activeQuery?.level === 'all'
    ? (allPublished || finalizedStages.length >= totalStagesCount)
    : (allPublished || finalizedStages.includes(Number(activeQuery?.level)));

  const selectedDeptDoc = useMemo(
    () => departments.find((d) => d.id === (activeQuery?.department || selectedDept)),
    [departments, activeQuery, selectedDept],
  );

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Submitted Course Results"
        subtitle="Review submitted course marks by batch, department, programme and stage. Accept & grade complete stages to send for GPA calculation."
      />

      {/* Cascaded Filter Dropdowns (Strictly selects, no 'All' options) */}
      <Card>
        <CardBody className="p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
            <SelectField
              label="1. Batch"
              value={selectedBatch}
              onChange={(e) => {
                setSelectedBatch(e.target.value);
                setSelectedDept('');
                setSelectedProg('');
                setSelectedLevel('');
                setActiveQuery(null);
              }}
              required
            >
              <option value="">Choose batch...</option>
              {uniqueBatches.map((b) => (
                <option key={b.id || b.code} value={b.id}>
                  {b.code} ({b.category || 'regular'})
                </option>
              ))}
            </SelectField>

            <SelectField
              label="2. Department"
              value={selectedDept}
              onChange={(e) => {
                setSelectedDept(e.target.value);
                setSelectedProg('');
                setSelectedLevel('');
                setActiveQuery(null);
              }}
              disabled={!selectedBatch}
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
              value={selectedProg}
              onChange={(e) => {
                setSelectedProg(e.target.value);
                setSelectedLevel('');
                setActiveQuery(null);
              }}
              disabled={!selectedDept}
              required
            >
              <option value="">Choose programme...</option>
              {filteredPrograms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="4. Stage / Year"
              value={selectedLevel}
              onChange={(e) => {
                setSelectedLevel(e.target.value);
                setActiveQuery(null);
              }}
              disabled={!selectedProg}
              required
            >
              <option value="">Choose stage / year...</option>
              <option value="all">All Years / Stages (Complete Programme)</option>
              {availableStages.map((s) => (
                <option key={s.stage} value={s.stage}>
                  {s.label}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Select all 4 filters above to view and submit that stage's courses.
            </p>
            <Button
              onClick={handleShowResults}
              disabled={!selectedBatch || !selectedDept || !selectedProg || !selectedLevel}
              className="gap-2 bg-brand-600 hover:bg-brand-700 text-white"
            >
              <Search className="h-4 w-4" /> Show Results
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Main Results Display */}
      {!activeQuery ? (
        <Card>
          <CardBody className="py-12 text-center">
            <ClipboardCheck className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-3 text-sm font-semibold text-slate-800">
              Select Filters and Click "Show Results"
            </h3>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              Choose an active batch, department, programme, and stage/year above to load submitted course marks.
            </p>
          </CardBody>
        </Card>
      ) : submissions.isLoading ? (
        <SkeletonCard lines={8} />
      ) : matchingCourses.length === 0 ? (
        <Card>
          <CardBody className="py-10 text-center">
            {isAlreadyFinalized ? (
              <>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="mt-3 text-sm font-bold text-slate-800">
                  {activeQuery.level === 'all' ? 'All Years / Stages' : `${stageUnit} ${activeQuery.level}`} Already Finalized & Published
                </h3>
                <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                  Course marks for {selectedProgDoc?.name} have been graded according to policy and forwarded to the GPA calculation page.
                </p>
                <div className="mt-4 flex justify-center">
                  <Link
                    to="/registrar/gpa-cgpa"
                    className="focus-ring inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition"
                  >
                    <Calculator className="h-4 w-4" /> Go to GPA Calculation →
                  </Link>
                </div>
              </>
            ) : (
              <EmptyState
                icon={ClipboardCheck}
                title="No results found"
                message={`No submitted course marks found for ${selectedProgDoc?.name || 'this programme'} · ${activeQuery.level === 'all' ? 'All Stages' : `${stageUnit} ${activeQuery.level}`}.`}
              />
            )}
          </CardBody>
        </Card>
      ) : (
        /* SINGLE CARD LISTING ALL COURSES FOR THAT STAGE TOGETHER */
        <Card className="overflow-hidden border border-slate-200 shadow-sm">
          <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 shadow-sm">
                  <GraduationCap className="h-6 w-6" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">
                      {selectedProgDoc?.name} ({selectedProgDoc?.code})
                    </h2>
                    <Badge tone={isAlreadyFinalized ? 'success' : 'brand'}>
                      {activeQuery.level === 'all' ? 'All Years / Stages' : `${stageUnit} ${activeQuery.level}`}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {selectedDeptDoc?.name} · Batch: <strong className="text-slate-700">{selectedBatchDoc?.code}</strong> ({selectedBatchDoc?.category || 'regular'})
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isAlreadyFinalized && (
                  <Badge tone="success" className="gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Published
                  </Badge>
                )}
                <Badge tone="neutral">{matchingCourses.length} Courses</Badge>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3">Course Code & Title</th>
                  <th className="px-4 py-3">Assigned Teacher</th>
                  <th className="px-4 py-3 text-center">Enrolled Students</th>
                  <th className="px-4 py-3 text-center">Marks Status</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {matchingCourses.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/70 transition">
                    <td className="px-6 py-3">
                      <span className="font-mono font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded">
                        {row.course?.code}
                      </span>
                      <p className="font-semibold text-slate-900 mt-1">{row.course?.title}</p>
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
                    <td className="px-6 py-3 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setViewOfferingId(row.id)}
                        className="gap-1.5"
                      >
                        <Eye className="h-3.5 w-3.5" /> View Mark Sheet
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Unified Stage Footer */}
          {isAlreadyFinalized ? (
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-emerald-100 bg-emerald-50/70 p-5">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <p className="text-xs font-bold text-emerald-900">
                    {activeQuery.level === 'all'
                      ? `All years/stages for ${selectedProgDoc?.name} are finalized, graded, and published!`
                      : `${stageUnit} ${activeQuery.level} results finalized, graded, and published!`}
                  </p>
                </div>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  Results are officially recorded and forwarded to the GPA calculation page for stage GPA and transcripts.
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <Button
                  disabled
                  className="gap-2 bg-emerald-700 text-white cursor-default opacity-90 shadow-none hover:bg-emerald-700"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Results Published
                </Button>
                <Link
                  to="/registrar/gpa-cgpa"
                  className="focus-ring inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition"
                >
                  <Calculator className="h-4 w-4" />
                  Open in GPA Tab →
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 bg-slate-50/80 p-5">
              <div>
                <p className="text-xs font-semibold text-slate-800">
                  Accept all {matchingCourses.length} course results for {activeQuery.level === 'all' ? `All ${stageUnit}s` : `${stageUnit} ${activeQuery.level}`}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Submitting will grade all student marks according to official grading policy and forward this stage to the GPA tab.
                </p>
              </div>

              <Button
                variant="primary"
                onClick={() => {
                  setStageSubmitModal({
                    programId: activeQuery.program,
                    programName: selectedProgDoc?.name,
                    level: activeQuery.level,
                    batchId: resolvedBatchId || activeQuery.batch,
                    coursesCount: matchingCourses.length,
                  });
                  setVerificationCode('');
                }}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <CheckCircle2 className="h-4 w-4" />
                Accept & Grade {activeQuery.level === 'all' ? `All ${stageUnit}s` : `${stageUnit} ${activeQuery.level}`}
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* MODAL 1: Single Course Results Detail */}
      <Modal
        open={Boolean(viewOfferingId)}
        onClose={() => setViewOfferingId(null)}
        title="Course Mark Sheet Review"
        subtitle={
          singleOffering.data?.offering
            ? `${singleOffering.data.offering.course?.code} · ${singleOffering.data.offering.course?.title} · ${singleOffering.data.offering.teacher?.name || ''}`
            : 'Loading offering results...'
        }
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setViewOfferingId(null)}>
            Close
          </Button>
        }
      >
        {singleOffering.isLoading ? (
          <p className="p-6 text-center text-sm text-slate-500">Loading student marks…</p>
        ) : singleOffering.error ? (
          <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
            {singleOffering.error?.response?.data?.message || 'Could not load course results.'}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Student ID</th>
                    <th className="p-2.5">Full Name</th>
                    <th className="p-2.5 text-center">Total Mark</th>
                    <th className="p-2.5 text-center">Grade</th>
                    <th className="p-2.5 text-center">Points</th>
                    <th className="p-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(singleOffering.data?.results || []).map((r) => (
                    <tr key={r.id || r._id} className="hover:bg-slate-50">
                      <td className="p-2.5 font-mono font-semibold">{r.student?.studentId}</td>
                      <td className="p-2.5 text-slate-800">{r.student?.fullName}</td>
                      <td className="p-2.5 text-center font-bold text-slate-900">{r.totalMark ?? '—'}</td>
                      <td className="p-2.5 text-center font-bold text-brand-700">{r.letterGrade || '—'}</td>
                      <td className="p-2.5 text-center">{r.gradePoint != null ? Number(r.gradePoint).toFixed(2) : '—'}</td>
                      <td className="p-2.5 text-center">
                        <Badge tone={toneForStatus(r.status)}>{humanStatus(r.status)}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL 2: Accept & Grade Stage with 2-min Cooldown Timer */}
      <Modal
        open={Boolean(stageSubmitModal)}
        onClose={() => setStageSubmitModal(null)}
        title={stageSubmitModal?.level === 'all' ? `Accept & Grade All ${stageUnit}s (Complete Programme)` : `Accept & Grade ${stageUnit} ${stageSubmitModal?.level}`}
        subtitle={`${stageSubmitModal?.programName} · All ${stageSubmitModal?.coursesCount} courses`}
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setStageSubmitModal(null)}
              disabled={submitStageMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                submitStageMutation.mutate({
                  programId: stageSubmitModal.programId,
                  level: stageSubmitModal.level,
                  batchId: stageSubmitModal.batchId,
                  code: verificationCode,
                })
              }
              loading={submitStageMutation.isPending}
              disabled={verificationCode.length !== 6}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle2 className="h-4 w-4" />
              Confirm & Send to GPA
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-600">
            {stageSubmitModal?.level === 'all' ? (
              <>
                Accepting <strong>All Years/Stages</strong> will finalize and grade all course results for <strong>{stageSubmitModal?.programName}</strong>. All results will be officially recorded and forwarded to the <strong>GPA page</strong> for GPA calculation.
              </>
            ) : (
              <>
                Accepting <strong>{stageUnit} {stageSubmitModal?.level}</strong> will finalize and grade all course results for <strong>{stageSubmitModal?.programName}</strong>. Results will be officially recorded and forwarded to the <strong>GPA page</strong> for stage GPA calculation.
              </>
            )}
          </p>

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Mail className="h-4 w-4 text-brand-600" />
                Registrar Email Verification
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => requestCodeMutation.mutate()}
                loading={requestCodeMutation.isPending}
                disabled={resendCooldown > 0}
                className="gap-1.5"
              >
                {resendCooldown > 0 ? (
                  <>
                    <Timer className="h-3.5 w-3.5 text-slate-400" />
                    Resend in {formatTimer(resendCooldown)}
                  </>
                ) : (
                  'Send verification code'
                )}
              </Button>
            </div>
            <div className="mt-3">
              <CodeInput
                value={verificationCode}
                onChange={setVerificationCode}
                disabled={submitStageMutation.isPending}
              />
            </div>
            {resendCooldown > 0 && (
              <p className="mt-2 text-[11px] text-slate-500">
                Code sent to your email. You can request a new code in {formatTimer(resendCooldown)}.
              </p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
