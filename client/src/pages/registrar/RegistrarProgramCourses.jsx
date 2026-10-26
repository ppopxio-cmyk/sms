import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Download,
  FileText,
  Lock,
  Plus,
  Send,
  Upload,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { REGISTRAR, levelLabel, qualificationLabel } from '../../lib/registrar';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import Modal from '../../components/ui/Modal';
import SearchInput from '../../components/ui/SearchInput';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/StatePanel';

function shortenFileName(fileName, maxBase = 16) {
  if (!fileName) return '';
  const str = String(fileName).trim();
  const dotIndex = str.lastIndexOf('.');
  const ext = dotIndex !== -1 ? str.slice(dotIndex) : '';
  const base = dotIndex !== -1 ? str.slice(0, dotIndex) : str;
  if (base.length <= maxBase) return str;
  return `${base.slice(0, maxBase)}...${ext}`;
}

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function RegistrarProgramCourses() {
  const { id, programId = id } = useParams();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [activeStage, setActiveStage] = useState(1);
  const [addModal, setAddModal] = useState(false);
  const [previewSubmitModal, setPreviewSubmitModal] = useState(false);

  const programQuery = useQuery({
    queryKey: ['registrar', 'program-detail', programId],
    queryFn: async () => (await api.get(`${REGISTRAR}/academic-structure/programs/${programId}`)).data,
    enabled: Boolean(programId),
  });

  const materialsQuery = useQuery({
    queryKey: ['registrar', 'program-materials', programId],
    queryFn: async () => (await api.get(`${REGISTRAR}/course-registration/resources`, { params: { program: programId } })).data,
    enabled: Boolean(programId),
  });

  const program = programQuery.data?.program;
  const rawCourses = programQuery.data?.courses || [];
  const materials = materialsQuery.data?.resources || [];

  // Determine stage unit and count based on qualification
  const { stageUnit, totalStages } = useMemo(() => {
    if (!program) return { stageUnit: 'Year', totalStages: 4 };
    const qType = program.qualificationType || 'degree';
    if (qType === 'degree') {
      return { stageUnit: 'Year', totalStages: program.durationYears || 4 };
    }
    if (qType === 'diploma') {
      return { stageUnit: 'Level', totalStages: program.levels?.length || 4 };
    }
    const unit = program.shortTerm?.unit === 'months' ? 'Month' : 'Week';
    return { stageUnit: unit, totalStages: program.shortTerm?.duration || 3 };
  }, [program]);

  const stageTabs = useMemo(() => {
    const tabs = [];
    for (let i = 1; i <= totalStages; i++) {
      tabs.push({ stage: i, label: `${stageUnit} ${i}` });
    }
    return tabs;
  }, [stageUnit, totalStages]);

  // Combine courses & resources, noting their level/stage
  const allEnrichedCourses = useMemo(() => {
    const list = [];
    const seenCodes = new Set();

    // Add material courses first (they have explicit level)
    for (const mat of materials) {
      const codeUpper = String(mat.courseCode || '').toUpperCase();
      if (!codeUpper) continue;
      seenCodes.add(codeUpper);
      list.push({
        id: mat.id,
        code: mat.courseCode,
        title: mat.courseName,
        creditHours: mat.creditHours ?? 3,
        level: mat.level ?? 1,
        materials: [mat],
        isFromMaterial: true,
      });
    }

    // Add curriculum/catalogue courses
    for (const c of rawCourses) {
      const codeUpper = String(c.code || '').toUpperCase();
      const existing = list.find((item) => item.code.toUpperCase() === codeUpper);
      if (existing) {
        if (!existing.title && c.title) existing.title = c.title;
        if (c.creditHours) existing.creditHours = c.creditHours;
        if (c.level) existing.level = c.level;
      } else {
        seenCodes.add(codeUpper);
        list.push({
          id: c.id || c._id,
          code: c.code,
          title: c.title,
          creditHours: c.creditHours ?? 3,
          level: c.level ?? 1,
          materials: [],
          isFromMaterial: false,
        });
      }
    }

    return list;
  }, [rawCourses, materials]);

  // Filter courses for active stage
  const currentStageCourses = useMemo(() => {
    return allEnrichedCourses.filter((c) => Number(c.level || 1) === Number(activeStage));
  }, [allEnrichedCourses, activeStage]);

  // Filter courses by search
  const visibleCourses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return currentStageCourses;
    return currentStageCourses.filter(
      (c) =>
        String(c.code || '').toLowerCase().includes(q) ||
        String(c.title || '').toLowerCase().includes(q) ||
        (c.materials || []).some((m) => m.fileName?.toLowerCase().includes(q)),
    );
  }, [currentStageCourses, search]);

  const finalizedStages = program?.finalizedStages || [];
  const isCurrentStageFinalized = finalizedStages.includes(Number(activeStage));

  // Lock / Finalize mutation
  const finalizeStage = useMutation({
    mutationFn: async () => {
      return (
        await api.post(`${REGISTRAR}/academic-structure/programs/${programId}/finalize-stage`, {
          stage: Number(activeStage),
        })
      ).data;
    },
    onSuccess: () => {
      toast.success(`${stageUnit} ${activeStage} courses finalized and locked.`);
      setPreviewSubmitModal(false);
      queryClient.invalidateQueries({ queryKey: ['registrar', 'program-detail', programId] });
    },
    onError: (err) => {
      toast.error(errorMessage(err, `Could not finalize ${stageUnit} ${activeStage} courses.`));
    },
  });

  const columns = [
    {
      key: 'code',
      label: 'Course code',
      render: (row) => (
        <span className="font-mono text-xs font-bold text-brand-700 bg-brand-50 px-2.5 py-1 rounded-md">
          {row.code}
        </span>
      ),
    },
    {
      key: 'title',
      label: 'Course title',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-900">{row.title}</p>
        </div>
      ),
    },
    {
      key: 'creditHours',
      label: 'Credit hours',
      render: (row) => (
        <span className="inline-flex items-center text-xs font-semibold text-slate-700">
          {row.creditHours ?? 3} Cr.
        </span>
      ),
    },
    {
      key: 'materials',
      label: 'Course materials (PDF / Word)',
      render: (row) => {
        const mats = row.materials || [];
        if (!mats.length) {
          return <span className="text-xs text-slate-400">No documents</span>;
        }
        return (
          <div className="space-y-1">
            {mats.map((mat) => (
              <a
                key={mat.id}
                href={mat.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:border-brand-300 hover:text-brand-700 hover:bg-brand-50 transition"
              >
                <FileText className="h-3.5 w-3.5 text-brand-600" />
                <span className="max-w-[160px] truncate" title={mat.fileName}>
                  {shortenFileName(mat.fileName)}
                </span>
                <Download className="h-3 w-3 text-slate-400 ml-1" />
              </a>
            ))}
          </div>
        );
      },
    },
  ];

  if (programQuery.isLoading) {
    return (
      <div className="space-y-6">
        <SkeletonCard lines={6} />
      </div>
    );
  }

  if (programQuery.isError || !program) {
    return (
      <EmptyState
        title="Programme not found"
        message="The requested programme could not be located."
        action={
          <Link to="/registrar/course-registration">
            <Button variant="secondary" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back to course registration
            </Button>
          </Link>
        }
      />
    );
  }

  const totalCredits = currentStageCourses.reduce((sum, c) => sum + (Number(c.creditHours) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to="/registrar/course-registration"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to course registration
        </Link>
      </div>

      <RegistrarPageHeader
        title={`${program.name} (${program.code})`}
        subtitle={`Department of ${program.department?.name || 'Department'}. Manage stage courses and curriculum documents.`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={program.active ? 'success' : 'neutral'}>
              {program.active ? 'Active programme' : 'Inactive'}
            </Badge>
            <Badge tone="brand">
              {qualificationLabel(program.qualificationType)}
            </Badge>
          </div>
        }
      />

      {/* Stage Tabs (Year 1, Year 2 ... / Level 1, Level 2 ... / Month 1, Month 2 ...) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Programme Stages ({stageUnit}s):
          </span>
          <span className="text-xs text-slate-500">
            Total Duration: <strong className="text-slate-800">{totalStages} {stageUnit}{totalStages === 1 ? '' : 's'}</strong>
          </span>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {stageTabs.map((tab) => {
            const isActive = activeStage === tab.stage;
            const isLocked = finalizedStages.includes(tab.stage);
            return (
              <button
                key={tab.stage}
                type="button"
                onClick={() => setActiveStage(tab.stage)}
                className={`focus-ring inline-flex items-center gap-2 shrink-0 rounded-xl px-4 py-2 text-xs font-semibold transition ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-sm ring-2 ring-brand-400'
                    : 'bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>{tab.label}</span>
                {isLocked && (
                  <Lock className={`h-3 w-3 ${isActive ? 'text-brand-200' : 'text-slate-400'}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stage Status Card / Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className={`grid h-10 w-10 place-items-center rounded-xl ${isCurrentStageFinalized ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-50 text-brand-600'}`}>
            {isCurrentStageFinalized ? <Lock className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900">
                {stageUnit} {activeStage} Courses
              </h3>
              {isCurrentStageFinalized ? (
                <Badge tone="success">Finalized & Locked (View Only)</Badge>
              ) : (
                <Badge tone="warning">Draft / Editable</Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {currentStageCourses.length} course{currentStageCourses.length === 1 ? '' : 's'} · {totalCredits} credit hours total in {stageUnit} {activeStage}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {!isCurrentStageFinalized ? (
            <>
              <Button onClick={() => setAddModal(true)} className="gap-1.5" size="sm">
                <Plus className="h-4 w-4" /> Add course
              </Button>
              {currentStageCourses.length > 0 && (
                <Button
                  onClick={() => setPreviewSubmitModal(true)}
                  variant="primary"
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  size="sm"
                >
                  <Send className="h-4 w-4" /> Submit {stageUnit} {activeStage} courses
                </Button>
              )}
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> All courses submitted & locked
            </span>
          )}
        </div>
      </div>

      {/* Courses Table */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {stageUnit} {activeStage} Course List
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {isCurrentStageFinalized
                ? `Courses and materials in ${stageUnit} ${activeStage} are finalized.`
                : `Upload materials and add all courses required for ${stageUnit} ${activeStage}.`}
            </p>
          </div>
          <div className="w-72">
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search course name or code..."
            />
          </div>
        </div>

        <RegistrarTable
          columns={columns}
          rows={visibleCourses}
          loading={programQuery.isLoading || materialsQuery.isLoading}
          rowKey={(row) => row.id || row.code}
          emptyTitle={`No courses added for ${stageUnit} ${activeStage}`}
          emptyMessage={
            isCurrentStageFinalized
              ? `No courses were registered for ${stageUnit} ${activeStage}.`
              : `Click "Add course" above to register courses and attach learning documents.`
          }
          noResultsTitle="No courses match search"
          noResultsMessage="Try clearing your search query."
        />
      </Card>

      {/* Add Course Modal */}
      <AddProgramCourseModal
        open={addModal}
        program={program}
        stage={activeStage}
        stageUnit={stageUnit}
        onClose={() => setAddModal(false)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ['registrar', 'program-detail', programId] });
          queryClient.invalidateQueries({ queryKey: ['registrar', 'program-materials', programId] });
        }}
      />

      {/* Preview & Submit Modal */}
      <Modal
        open={previewSubmitModal}
        title={`Submit ${stageUnit} ${activeStage} courses?`}
        subtitle={`Please review the ${currentStageCourses.length} course(s) below. Once submitted, this stage is locked and cannot be edited.`}
        size="lg"
        onClose={finalizeStage.isPending ? undefined : () => setPreviewSubmitModal(false)}
        dismissible={!finalizeStage.isPending}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setPreviewSubmitModal(false)}
              disabled={finalizeStage.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => finalizeStage.mutate()}
              loading={finalizeStage.isPending}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle2 className="h-4 w-4" /> Confirm & Lock {stageUnit} {activeStage}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-semibold">Confirm Year / Stage Completion</p>
              <p className="mt-0.5 text-amber-800">
                Are these all courses for {stageUnit} {activeStage}? Confirming will set this stage as finalized. Further additions or edits to {stageUnit} {activeStage} courses will be disabled.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                <tr>
                  <th className="p-2.5">Code</th>
                  <th className="p-2.5">Course title</th>
                  <th className="p-2.5 text-center">Credits</th>
                  <th className="p-2.5">Attached document</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentStageCourses.map((c) => (
                  <tr key={c.id || c.code} className="hover:bg-slate-50">
                    <td className="p-2.5 font-mono font-bold text-brand-700">{c.code}</td>
                    <td className="p-2.5 font-medium text-slate-800">{c.title}</td>
                    <td className="p-2.5 text-center font-semibold text-slate-700">{c.creditHours}</td>
                    <td className="p-2.5 text-slate-600 truncate max-w-[180px]">
                      {c.materials?.[0]?.fileName || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-slate-800">
                <tr>
                  <td colSpan={2} className="p-2.5">Total: {currentStageCourses.length} Courses</td>
                  <td className="p-2.5 text-center">{totalCredits} Cr.</td>
                  <td className="p-2.5"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AddProgramCourseModal({ open, program, stage, stageUnit, onClose, onSaved }) {
  const [courseCode, setCourseCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [creditHours, setCreditHours] = useState('3');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  const autoNextCode = useMemo(() => {
    if (!program?.code) return 'CS-001';
    return `${program.code}-${String(stage)}01`;
  }, [program, stage]);

  // Reset form on open
  useMemo(() => {
    if (open) {
      setCourseCode(autoNextCode);
      setCourseName('');
      setCreditHours('3');
      setFile(null);
      setError('');
    }
  }, [open, autoNextCode]);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
    if (selectedFile) {
      const cleanName = selectedFile.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[_-]/g, ' ')
        .trim();
      setCourseName((prev) => prev || cleanName);
    }
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!courseCode.trim() || !courseName.trim()) {
        throw new Error('Course code and course name are required.');
      }
      if (!file) {
        throw new Error('Please attach a PDF or Word syllabus/material document.');
      }
      if (file.size > 50 * 1024 * 1024) {
        throw new Error('File size exceeds 50 MB limit.');
      }
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!['pdf', 'doc', 'docx'].includes(ext)) {
        throw new Error('Upload a PDF, DOC or DOCX file.');
      }
      const contentType = file.type || {
        pdf: 'application/pdf',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }[ext];

      return (
        await api.post(`${REGISTRAR}/course-registration/resources`, file, {
          params: {
            program: program.id || program._id,
            courseName: courseName.trim(),
            courseCode: courseCode.trim().toUpperCase(),
            creditHours: Number(creditHours) || 3,
            filename: file.name,
            level: stage,
          },
          headers: { 'Content-Type': contentType },
          timeout: 60_000,
        })
      ).data;
    },
    onSuccess: () => {
      toast.success(`Course ${courseCode.trim().toUpperCase()} added to ${stageUnit} ${stage}.`);
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const msg = errorMessage(err, 'Could not upload course and material.');
      setError(msg);
      toast.error(msg);
    },
  });

  return (
    <Modal
      open={open}
      title={`Add Course · ${stageUnit} ${stage}`}
      subtitle={`Add a new course and curriculum material to ${program?.name || 'programme'}.`}
      size="md"
      onClose={uploadMutation.isPending ? undefined : onClose}
      dismissible={!uploadMutation.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={uploadMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => uploadMutation.mutate()}
            loading={uploadMutation.isPending}
            className="gap-1.5"
          >
            <Upload className="h-4 w-4" /> Save & Upload Course
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
            {error}
          </p>
        )}

        <Field
          label="Course code"
          value={courseCode}
          onChange={(e) => setCourseCode(e.target.value)}
          placeholder="e.g. CS-101"
          required
        />

        <Field
          label="Course name"
          value={courseName}
          onChange={(e) => setCourseName(e.target.value)}
          placeholder="e.g. Fundamental Computer Programming"
          required
        />

        <Field
          label="Credit hours"
          type="number"
          min="0.5"
          max="1000"
          step="0.5"
          value={creditHours}
          onChange={(e) => setCreditHours(e.target.value)}
          required
        />

        <Field
          label="PDF or Word curriculum document"
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileChange}
          hint="Maximum 50 MB. PDF, DOC or DOCX."
          required
        />
      </div>
    </Modal>
  );
}
