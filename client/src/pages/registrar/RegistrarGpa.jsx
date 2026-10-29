import { useState, useMemo, useEffect, useRef } from 'react';
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
  ArrowLeft,
  Building2,
  UsersRound,
  Check,
  ExternalLink,
  ChevronRight,
  Download,
  Eye,
  Clock,
  History,
  ShieldCheck,
  Printer,
  Camera,
  Upload,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { REGISTRAR, humanStatus, toneForStatus, printBlob, downloadFile } from '../../lib/registrar';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
import Modal from '../../components/ui/Modal';
import ExportMenu from '../../components/ui/ExportMenu';
import { ErrorState, EmptyState } from '../../components/ui/StatePanel';
import { SkeletonCard } from '../../components/ui/Skeleton';

export default function RegistrarGpa() {
  const queryClient = useQueryClient();
  const [activeMainTab, setActiveMainTab] = useState('gpa'); // 'gpa' | 'cgpa'
  const [gpaSubTab, setGpaSubTab] = useState('active'); // 'active' | 'history'
  const [cgpaSubTab, setCgpaSubTab] = useState('active'); // 'active' | 'history'

  // Selected cohort for GPA tab & CGPA tab
  const [selectedGpaCohort, setSelectedGpaCohort] = useState(null);
  const [selectedCgpaCohort, setSelectedCgpaCohort] = useState(null);
  const [selectedLevel, setSelectedLevel] = useState(1);
  const [student, setStudent] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // In-tab Certificate Preview & Download states
  const [certPreviewStudent, setCertPreviewStudent] = useState(null);
  const [certPreviewBlob, setCertPreviewBlob] = useState(null);
  const [certPreviewUrl, setCertPreviewUrl] = useState(null);
  const [certPreviewLoading, setCertPreviewLoading] = useState(false);
  const [downloadingCertId, setDownloadingCertId] = useState(null);
  const [printingCertId, setPrintingCertId] = useState(null);
  const [issuingCertStudent, setIssuingCertStudent] = useState(null);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkPrinting, setBulkPrinting] = useState(false);
  const [uploadingStudent, setUploadingStudent] = useState(null);
  const photoInputRef = useRef(null);

  // 1. Fetch all cohorts ready to calculate (departments, batches, and programs with submitted/published marks)
  const readyCohortsQuery = useQuery({
    queryKey: ['registrar', 'ready-gpa-cohorts'],
    queryFn: async () => (await api.get(`${REGISTRAR}/gpa-cgpa/ready-cohorts`)).data,
  });

  const cohorts = (readyCohortsQuery.data?.cohorts || []).filter(
    (c) => (c.totalPublishedResults ?? 0) > 0,
  );

  // Filter cohorts by search query
  const filteredGpaCohorts = useMemo(() => {
    let list = cohorts;
    if (gpaSubTab === 'active') {
      list = cohorts.filter((c) => !c.readyForCgpa);
    } else {
      list = cohorts.filter((c) => Boolean(c.readyForCgpa));
    }
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (c) =>
        c.department.name.toLowerCase().includes(q) ||
        c.department.code.toLowerCase().includes(q) ||
        c.program.name.toLowerCase().includes(q) ||
        c.program.code.toLowerCase().includes(q) ||
        c.batch.code.toLowerCase().includes(q),
    );
  }, [cohorts, gpaSubTab, searchQuery]);

  // Only submitted cohorts for the CGPA tab (only cohorts sent by the GPA calculation)
  const submittedCgpaCohorts = useMemo(() => {
    const list = cohorts.filter((c) => Boolean(c.readyForCgpa || c.cgpaCalculated));
    if (cgpaSubTab === 'active') {
      return list.filter((c) => !c.cgpaCalculated);
    } else {
      return list.filter((c) => Boolean(c.cgpaCalculated));
    }
  }, [cohorts, cgpaSubTab]);

  // Active cohort depending on main tab
  const activeCohort = activeMainTab === 'gpa' ? selectedGpaCohort : selectedCgpaCohort;

  const durationUnit = activeCohort?.durationUnit || 'Year';

  // GPA list query for the active cohort
  const listParams = useMemo(() => {
    if (!activeCohort) return null;
    return {
      program: activeCohort.program.id,
      batch: activeCohort.batch.id,
      ...(activeMainTab === 'gpa' ? { level: Number(selectedLevel) } : {}),
    };
  }, [activeCohort, activeMainTab, selectedLevel]);

  const list = useQuery({
    queryKey: ['registrar', 'gpa-list', listParams, activeMainTab],
    queryFn: async () => (await api.get(`${REGISTRAR}/gpa-cgpa`, { params: listParams })).data,
    enabled: Boolean(activeCohort && listParams),
  });

  // Individual student detail modal
  const detail = useQuery({
    queryKey: ['registrar', 'gpa-student-detail', student?.id],
    queryFn: async () => (await api.get(`${REGISTRAR}/gpa-cgpa`, { params: { student: student.id } })).data,
    enabled: Boolean(student?.id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['registrar', 'ready-gpa-cohorts'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'gpa-list'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'students'] });
  };

  // Mutation: Calculate Stage GPA
  const calculateGpaMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`${REGISTRAR}/gpa-cgpa/calculate-stage-gpa`, {
        programId: selectedGpaCohort?.program.id,
        batchId: selectedGpaCohort?.batch.id,
        level: selectedLevel,
      });
      await list.refetch();
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(
        data.message ||
          `${durationUnit} ${selectedLevel} GPA calculated successfully for ${selectedGpaCohort?.program.name}!`,
      );
      setSelectedGpaCohort((prev) => {
        if (!prev) return prev;
        const updated = Array.from(new Set([...(prev.calculatedStages || []), Number(selectedLevel)]));
        return {
          ...prev,
          calculatedStages: updated,
          allStagesCalculated: updated.length >= prev.totalStages,
          batch: { ...prev.batch, calculatedStages: updated },
        };
      });
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'Failed to calculate Stage GPA.')),
  });

  // In-tab Certificate Preview, Real Download & Print handlers
  const handlePreviewCert = async (row) => {
    setCertPreviewStudent(row);
    setCertPreviewLoading(true);
    try {
      const res = await api.post(`${REGISTRAR}/certificates/preview`, { student: row.id }, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setCertPreviewBlob(blob);
      setCertPreviewUrl(url);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not generate certificate preview. Ensure student is eligible and template is configured.'));
      setCertPreviewStudent(null);
    } finally {
      setCertPreviewLoading(false);
    }
  };

  const handleDownloadRealCert = async (row) => {
    if (!row.hasPhoto) {
      toast.error('Student photograph is missing. Photo must be uploaded before issuing or downloading official certificate.');
      return;
    }
    setDownloadingCertId(row.id);
    try {
      let certId = row.certificate?.id;
      if (!certId) {
        // Auto-issue official certificate
        const issueRes = await api.post(`${REGISTRAR}/certificates/issue`, {
          student: row.id,
          idempotencyKey: `cert-${Date.now()}-${row.id}`,
        });
        certId = issueRes.data?.certificate?._id || issueRes.data?.certificate?.id;
        toast.success(`Official Certificate issued: ${issueRes.data?.certificate?.certificateNumber || 'saved'}`);
        invalidate();
      }
      await downloadFile(`${REGISTRAR}/certificates/${certId}/pdf`, `Certificate_${row.studentId || row.fullName}.pdf`);
      toast.success('Official Certificate PDF downloaded successfully.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not download certificate PDF.'));
    } finally {
      setDownloadingCertId(null);
    }
  };

  const handlePrintRealCert = async (row) => {
    if (!row.hasPhoto) {
      toast.error('Student photograph is missing. Photo must be uploaded before printing official certificate.');
      return;
    }
    setPrintingCertId(row.id);
    try {
      let certId = row.certificate?.id;
      if (!certId) {
        // Auto-issue official certificate
        const issueRes = await api.post(`${REGISTRAR}/certificates/issue`, {
          student: row.id,
          idempotencyKey: `cert-${Date.now()}-${row.id}`,
        });
        certId = issueRes.data?.certificate?._id || issueRes.data?.certificate?.id;
        toast.success(`Official Certificate issued: ${issueRes.data?.certificate?.certificateNumber || 'saved'}`);
        invalidate();
      }
      const res = await api.post(`${REGISTRAR}/certificates/${certId}/print`, {}, { responseType: 'blob' });
      printBlob(res.data);
      toast.success('Print dialog opened. Print counter updated.');
      invalidate();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not print certificate PDF.'));
    } finally {
      setPrintingCertId(null);
    }
  };

  const handleBulkDownloadCertificates = async () => {
    const cohort = selectedCgpaCohort || activeCohort;
    if (!cohort) return;
    setBulkDownloading(true);
    try {
      const progId = cohort.program?.id || cohort.program?._id;
      const batchId = cohort.batch?.id || cohort.batch?._id;
      const res = await api.post(
        `${REGISTRAR}/certificates/bulk-pdf`,
        { programId: progId, batchId },
        { responseType: 'blob' }
      );
      downloadBlob(res.data, `All_Certificates_${cohort.program?.code || 'PROG'}_${cohort.batch?.code || '2019'}.pdf`);
      toast.success('All department and programme certificates generated and downloaded!');
      invalidate();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to download bulk certificates.'));
    } finally {
      setBulkDownloading(false);
    }
  };

  const handleBulkPrintCertificates = async () => {
    const cohort = selectedCgpaCohort || activeCohort;
    if (!cohort) return;
    setBulkPrinting(true);
    try {
      const progId = cohort.program?.id || cohort.program?._id;
      const batchId = cohort.batch?.id || cohort.batch?._id;
      const res = await api.post(
        `${REGISTRAR}/certificates/bulk-print`,
        { programId: progId, batchId },
        { responseType: 'blob' }
      );
      printBlob(res.data);
      toast.success('Bulk print dialog opened. Certificates issued and counters updated.');
      invalidate();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to print bulk certificates.'));
    } finally {
      setBulkPrinting(false);
    }
  };

  const handleUploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingStudent) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('The photo must be smaller than 5 MB.');
      return;
    }
    const buffer = await file.arrayBuffer();
    try {
      await api.post(`${REGISTRAR}/students/${uploadingStudent.id}/photo`, buffer, {
        headers: { 'Content-Type': file.type || 'image/jpeg' },
      });
      toast.success(`Photo uploaded for ${uploadingStudent.fullName}! Certificate unlocked.`);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['registrar', 'students'] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'certificates'] });
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to upload student photo.'));
    } finally {
      setUploadingStudent(null);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  // Mutation: Send to CGPA & Transcripts (NO EMAIL CODE NEEDED)
  const sendToCgpaMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post(`${REGISTRAR}/gpa-cgpa/send-to-cgpa`, {
          programId: activeCohort?.program.id,
          batchId: activeCohort?.batch.id,
        })
      ).data,
    onSuccess: (data) => {
      toast.success(
        data.message ||
          `${activeCohort?.program.name} (${activeCohort?.department.name}) successfully sent to CGPA & Transcripts!`,
      );
      setSelectedGpaCohort((prev) =>
        prev
          ? {
              ...prev,
              readyForCgpa: true,
              batch: { ...prev.batch, readyForCgpa: true },
            }
          : prev,
      );
      invalidate();
      setSelectedCgpaCohort(activeCohort ? { ...activeCohort, readyForCgpa: true } : null);
      setActiveMainTab('cgpa');
      setCgpaSubTab('active');
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not send programme to CGPA.')),
  });

  // Mutation: Calculate Cumulative CGPA & Graduate Students
  const calculateCgpaMutation = useMutation({
    mutationFn: async ({ programId, batchId }) =>
      (await api.post(`${REGISTRAR}/gpa-cgpa/calculate-cgpa`, { programId, batchId })).data,
    onSuccess: (data) => {
      toast.success(
        data.message ||
          `Cumulative CGPA calculated for all students! Students marked as Graduated & Ready for Certification.`,
      );
      setSelectedCgpaCohort((prev) =>
        prev
          ? {
              ...prev,
              cgpaCalculated: true,
              batch: { ...prev.batch, cgpaCalculated: true },
            }
          : prev,
      );
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not calculate Cumulative CGPA.')),
  });

  const listRows = list.data?.rows ?? [];

  const listColumns = [
    {
      key: 'student',
      label: 'Student',
      render: (row) => (
        <div className="flex items-center gap-3">
          {row.photo?.thumbnailUrl || row.photo?.url ? (
            <img
              src={row.photo.thumbnailUrl || row.photo.url}
              alt=""
              className="h-9 w-9 rounded-full object-cover ring-1 ring-slate-200 shrink-0"
            />
          ) : (
            <span className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-xs">
              {(row.fullName || '?').slice(0, 2).toUpperCase()}
            </span>
          )}
          <div>
            <p className="text-sm font-semibold text-slate-900">{row.fullName}</p>
            <p className="text-xs text-slate-500 font-mono">
              {row.studentId} ·{' '}
              <span className="font-sans">
                {row.program || '—'}
                {row.batch ? ` (${row.batch})` : ''}
              </span>
            </p>
          </div>
        </div>
      ),
    },
    ...(activeMainTab === 'gpa'
      ? [
          {
            key: 'stageGpa',
            label: `${durationUnit} ${selectedLevel} GPA`,
            render: (row) => (
              <div>
                <span className="text-base font-bold tabular-nums text-brand-700">
                  {row.stageGpa != null ? Number(row.stageGpa).toFixed(2) : '—'}
                </span>
                <p className="text-[11px] text-slate-500">
                  {row.stageCredits ?? 0} credits · {row.stageCourses ?? 0} courses
                </p>
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
                {row.cgpa != null ? Number(row.cgpa).toFixed(2) : '—'}
              </span>
            ),
          },
          {
            key: 'certStatus',
            label: 'Certificate Status',
            render: (row) => {
              if (row.certificateIssued) {
                return (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800 border border-emerald-200">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Issued ({row.certificate?.certificateNumber})
                  </span>
                );
              }
              if (!row.hasPhoto) {
                return (
                  <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200">
                    <AlertCircle className="h-3 w-3 text-amber-600" /> Photo Missing
                  </span>
                );
              }
              return (
                <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 border border-blue-200">
                  Ready to Issue
                </span>
              );
            },
          },
          {
            key: 'status',
            label: 'Graduation',
            render: () => (
              <Badge tone={activeCohort?.cgpaCalculated ? 'success' : 'brand'}>
                {activeCohort?.cgpaCalculated ? 'Graduated' : 'Ready for CGPA'}
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
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setStudent({ id: row.id, fullName: row.fullName, studentId: row.studentId, photo: row.photo, hasPhoto: row.hasPhoto })}
          >
            Open Record
          </Button>

          {activeMainTab === 'cgpa' && activeCohort?.cgpaCalculated ? (
            <>
              {/* If photo is missing: no certificate can be issued, only preview is granted, but allow uploading photo */}
              {!row.hasPhoto ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handlePreviewCert(row)}
                    loading={certPreviewLoading && certPreviewStudent?.id === row.id}
                    className="gap-1 text-xs text-indigo-700 hover:text-indigo-800"
                    title="Preview without photo"
                  >
                    <Eye className="h-3.5 w-3.5" /> Preview
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setUploadingStudent(row);
                      photoInputRef.current?.click();
                    }}
                    className="gap-1 text-xs bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 font-bold"
                  >
                    <Camera className="h-3.5 w-3.5 text-amber-600" /> Add Photo
                  </Button>
                </>
              ) : row.certificateIssued ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleDownloadRealCert(row)}
                    loading={downloadingCertId === row.id}
                    className="gap-1 text-xs text-brand-700 font-bold"
                    title="Download Official Certificate"
                  >
                    <Download className="h-3.5 w-3.5" /> PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handlePrintRealCert(row)}
                    loading={printingCertId === row.id}
                    className="gap-1 text-xs text-indigo-700 font-bold"
                    title="Print Official Certificate"
                  >
                    <Printer className="h-3.5 w-3.5" /> Print ({row.certificate?.printCount || 0}/2)
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => setIssuingCertStudent(row)}
                    className="gap-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Award className="h-3.5 w-3.5" /> Issue Certificate
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleDownloadRealCert(row)}
                    loading={downloadingCertId === row.id}
                    className="gap-1 text-xs text-brand-700"
                    title="Issue & Download Official Certificate"
                  >
                    <Download className="h-3.5 w-3.5" /> PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handlePrintRealCert(row)}
                    loading={printingCertId === row.id}
                    className="gap-1 text-xs text-indigo-700"
                    title="Issue & Print Official Certificate"
                  >
                    <Printer className="h-3.5 w-3.5" /> Print
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handlePreviewCert(row)}
                    loading={certPreviewLoading && certPreviewStudent?.id === row.id}
                    className="gap-1 text-xs"
                  >
                    <Eye className="h-3.5 w-3.5 text-slate-600" /> Preview
                  </Button>
                </>
              )}
            </>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="GPA & Cumulative CGPA Workbench"
        subtitle="Only departments and programmes with published marks are displayed. Calculate Stage GPA by year/level or finalize Cumulative CGPA to evaluate graduation and issue transcripts."
      />

      {/* Main Mode Tabs: GPA vs CGPA */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => {
            setActiveMainTab('gpa');
          }}
          className={`focus-ring inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition ${
            activeMainTab === 'gpa'
              ? 'bg-brand-600 text-white shadow-sm ring-2 ring-brand-400'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Calculator className="h-4 w-4" />
          <span>1. Stage GPA Calculation ({cohorts.length} Cohorts Ready)</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveMainTab('cgpa');
          }}
          className={`focus-ring inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition ${
            activeMainTab === 'cgpa'
              ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-400'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Award className="h-4 w-4" />
          <span>2. Cumulative CGPA ({submittedCgpaCohorts.length} Submitted to CGPA)</span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: STAGE GPA CALCULATION
          ========================================================================= */}
      {activeMainTab === 'gpa' && (
        <>
          {/* Sub-tabs: Active vs History */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => {
                setGpaSubTab('active');
                setSelectedGpaCohort(null);
              }}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${
                gpaSubTab === 'active'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Active Cohorts ({cohorts.filter((c) => !c.readyForCgpa).length})
            </button>
            <button
              type="button"
              onClick={() => {
                setGpaSubTab('history');
                setSelectedGpaCohort(null);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${
                gpaSubTab === 'history'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span>Sent to CGPA History ({cohorts.filter((c) => Boolean(c.readyForCgpa)).length})</span>
            </button>
          </div>

          {/* VIEW A: OVERVIEW CARDS (When no cohort is actively opened) */}
          {!selectedGpaCohort ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Cohorts Ready for GPA Calculation
                  </h2>
                  <p className="text-xs text-slate-500">
                    These department and programme cohorts have received submitted or published marks from course teachers.
                  </p>
                </div>
                <div className="w-full sm:w-72">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter department, programme, batch..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                </div>
              </div>

              {readyCohortsQuery.isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <SkeletonCard />
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
              ) : filteredGpaCohorts.length === 0 ? (
                <Card>
                  <CardBody className="py-12 text-center">
                    <Calculator className="mx-auto h-12 w-12 text-slate-300" />
                    <h3 className="mt-3 text-sm font-semibold text-slate-800">
                      No Cohorts Ready for GPA
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                      Go to the <strong>Results page</strong> and click "Accept & Grade" for submitted courses to forward them to GPA calculation.
                    </p>
                    <div className="mt-4">
                      <Link to="/registrar/results">
                        <Button className="gap-2 bg-brand-600 hover:bg-brand-700 text-white text-xs">
                          <CheckCircle2 className="h-4 w-4" /> Go to Submitted Results
                        </Button>
                      </Link>
                    </div>
                  </CardBody>
                </Card>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredGpaCohorts.map((cohort) => (
                    <Card
                      key={cohort.id}
                      className="group flex flex-col justify-between overflow-hidden border border-slate-200 transition hover:border-brand-300 hover:shadow-md"
                    >
                      <div className="p-5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                            <Building2 className="h-3.5 w-3.5" />
                            {cohort.department.name}
                          </span>
                          <Badge tone={cohort.batch.category === 'extension' ? 'warning' : 'neutral'}>
                            {cohort.batch.code} · {humanStatus(cohort.batch.category)}
                          </Badge>
                        </div>

                        <h3 className="mt-3 text-base font-bold text-slate-900 group-hover:text-brand-700 transition">
                          {cohort.program.name}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {cohort.program.qualificationType.toUpperCase()} · {cohort.totalStages} {cohort.durationUnit}s · Batch: {cohort.batch.name}
                        </p>

                        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                          <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                            <UsersRound className="h-4 w-4 text-slate-400" />
                            {cohort.studentCount} Students
                          </span>
                          <span className="font-medium text-slate-500">
                            {cohort.totalPublishedResults} Published Marks
                          </span>
                        </div>

                        {/* Stages breakdown pill list */}
                        <div className="mt-3 space-y-1.5">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            {cohort.durationUnit} Stages Progress:
                          </p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {cohort.stages.map((st) => (
                              <div
                                key={st.level}
                                className={`flex items-center justify-between rounded-lg px-2 py-1 text-[11px] font-medium ${
                                  st.status === 'published'
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : st.status === 'submitted'
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : 'bg-slate-50 text-slate-500 border border-slate-200'
                                }`}
                              >
                                <span>{st.label}</span>
                                <span className="font-bold">
                                  {st.status === 'published' ? 'Ready' : st.status === 'submitted' ? 'Review' : 'Pending'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-slate-100 bg-slate-50/80 p-4">
                        <Button
                          onClick={() => {
                            setSelectedGpaCohort(cohort);
                            setSelectedLevel(cohort.stages[0]?.level || 1);
                          }}
                          className="w-full gap-2 bg-brand-600 hover:bg-brand-700 text-white font-bold"
                        >
                          <Calculator className="h-4 w-4" /> Calculate GPA
                          <ChevronRight className="h-4 w-4 ml-auto" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* VIEW B: SPECIFIC COHORT GPA WORKBENCH */
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedGpaCohort(null)}
                  className="gap-1.5 text-xs font-semibold"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to all ready cohorts
                </Button>
                <div className="flex items-center gap-2">
                  <Badge tone="brand">
                    {selectedGpaCohort.department.name} · {selectedGpaCohort.program.name}
                  </Badge>
                  <Badge tone="neutral">
                    {selectedGpaCohort.batch.code} ({selectedGpaCohort.batch.category})
                  </Badge>
                </div>
              </div>

              {/* Stage Tabs Bar & Calculation Controls */}
              <Card className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      {selectedGpaCohort.program.name} · {durationUnit} {selectedLevel} GPA
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {selectedGpaCohort.department.name} · Batch: {selectedGpaCohort.batch.code} · {selectedGpaCohort.studentCount} enrolled students
                    </p>
                  </div>

                  {/* Stage Switcher Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-slate-100 p-1">
                    {selectedGpaCohort.stages.map((st) => {
                      const isCalculated = (selectedGpaCohort.calculatedStages || []).includes(st.level);
                      return (
                        <button
                          key={st.level}
                          type="button"
                          onClick={() => setSelectedLevel(st.level)}
                          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                            Number(selectedLevel) === st.level
                              ? 'bg-white text-brand-700 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {st.label}
                          {isCalculated ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          ) : st.status === 'published' ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    {(selectedGpaCohort.calculatedStages || []).includes(Number(selectedLevel)) ? (
                      <div className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 shadow-sm">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span>{durationUnit} {selectedLevel} GPA Calculated</span>
                      </div>
                    ) : (
                      <Button
                        onClick={() => calculateGpaMutation.mutate()}
                        loading={calculateGpaMutation.isPending || list.isFetching}
                        className="gap-1.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold"
                      >
                        <RefreshCw className="h-4 w-4" /> Calculate {durationUnit} {selectedLevel} GPA
                      </Button>
                    )}

                    {selectedGpaCohort.readyForCgpa ? (
                      <div className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 shadow-sm">
                        <Check className="h-4 w-4 text-emerald-600" />
                        <span>✓ Sent to CGPA & Transcripts</span>
                      </div>
                    ) : selectedGpaCohort.totalStages > 0 &&
                    (selectedGpaCohort.calculatedStages || []).length >= selectedGpaCohort.totalStages ? (
                      <Button
                        onClick={() => sendToCgpaMutation.mutate()}
                        loading={sendToCgpaMutation.isPending}
                        className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm"
                      >
                        <Send className="h-4 w-4" /> Send to CGPA & Transcripts
                      </Button>
                    ) : (
                      <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-500">
                        {(selectedGpaCohort.calculatedStages || []).length} / {selectedGpaCohort.totalStages} {durationUnit}s calculated
                      </span>
                    )}
                  </div>
                </div>
              </Card>

              {/* Table of Students for Selected Cohort and Stage */}
              <Card>
                <CardHeader
                  title={`Students enrolled in ${selectedGpaCohort.program.name} · ${durationUnit} ${selectedLevel}`}
                  subtitle={`${listRows.length} enrolled student(s) in this cohort.`}
                  icon={Calculator}
                  action={<Badge tone="neutral">Policy v{list.data?.policyVersion ?? '1'}</Badge>}
                />
                <RegistrarTable
                  columns={listColumns}
                  rows={listRows}
                  loading={list.isFetching}
                  rowKey={(row) => row.id}
                  emptyTitle="No student records loaded"
                  emptyMessage="Click 'Calculate GPA' above to view student marks."
                />
              </Card>
            </div>
          )}
        </>
      )}

      {/* =========================================================================
          TAB 2: CUMULATIVE CGPA (ONLY SUBMITTED DEPARTMENTS)
          ========================================================================= */}
      {activeMainTab === 'cgpa' && (
        <>
          {/* Sub-tabs: Active vs History */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => {
                setCgpaSubTab('active');
                setSelectedCgpaCohort(null);
              }}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${
                cgpaSubTab === 'active'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Active Cumulative CGPA ({cohorts.filter((c) => Boolean(c.readyForCgpa && !c.cgpaCalculated)).length})
            </button>
            <button
              type="button"
              onClick={() => {
                setCgpaSubTab('history');
                setSelectedCgpaCohort(null);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition ${
                cgpaSubTab === 'history'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span>Graduated & Certified History ({cohorts.filter((c) => Boolean(c.cgpaCalculated)).length})</span>
            </button>
          </div>

          {/* VIEW A: SUBMITTED COHORTS CARDS (NO FILTER BUTTONS REQUIRED) */}
          {!selectedCgpaCohort ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Submitted Programmes Ready for Cumulative CGPA
                </h2>
                <p className="text-xs text-slate-500">
                  These programmes and departments have completed all stages and have been submitted to the CGPA & Transcripts hub.
                </p>
              </div>

              {submittedCgpaCohorts.length === 0 ? (
                <Card>
                  <CardBody className="py-12 text-center">
                    <Award className="mx-auto h-12 w-12 text-slate-300" />
                    <h3 className="mt-3 text-sm font-semibold text-slate-800">
                      No Programmes Submitted to CGPA Yet
                    </h3>
                    <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                      Go to the <strong>Stage GPA tab</strong> above, select a cohort, and click <strong>"Send to CGPA & Transcripts"</strong>.
                    </p>
                    <div className="mt-4">
                      <Button
                        onClick={() => setActiveMainTab('gpa')}
                        className="gap-2 bg-brand-600 hover:bg-brand-700 text-white text-xs"
                      >
                        <Calculator className="h-4 w-4" /> Go to Stage GPA Tab
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {submittedCgpaCohorts.map((cohort) => (
                    <Card
                      key={cohort.id}
                      className="group flex flex-col justify-between overflow-hidden border border-slate-200 transition hover:border-indigo-300 hover:shadow-md"
                    >
                      <div className="p-5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700">
                            <Building2 className="h-3.5 w-3.5" />
                            {cohort.department.name}
                          </span>
                          <Badge tone={cohort.batch.category === 'extension' ? 'warning' : 'neutral'}>
                            {cohort.batch.code} · {humanStatus(cohort.batch.category)}
                          </Badge>
                        </div>

                        <h3 className="mt-3 text-base font-bold text-slate-900 group-hover:text-indigo-700 transition">
                          {cohort.program.name}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {cohort.program.qualificationType.toUpperCase()} · All {cohort.totalStages} {cohort.durationUnit}s Included
                        </p>

                        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                          <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                            <UsersRound className="h-4 w-4 text-slate-400" />
                            {cohort.studentCount} Graduating Students
                          </span>
                          <Badge tone={cohort.cgpaCalculated ? 'success' : 'indigo'}>
                            {cohort.cgpaCalculated ? 'CGPA Finalized' : 'Ready for CGPA'}
                          </Badge>
                        </div>
                      </div>

                      <div className="border-t border-slate-100 bg-slate-50/80 p-4">
                        <Button
                          onClick={() => setSelectedCgpaCohort(cohort)}
                          className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                        >
                          <Award className="h-4 w-4" /> Open Cumulative CGPA
                          <ChevronRight className="h-4 w-4 ml-auto" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* VIEW B: SPECIFIC COHORT CUMULATIVE CGPA WORKBENCH */
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedCgpaCohort(null)}
                  className="gap-1.5 text-xs font-semibold"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to submitted cohorts
                </Button>
                <div className="flex items-center gap-2">
                  <Badge tone="indigo">
                    {selectedCgpaCohort.department.name} · {selectedCgpaCohort.program.name}
                  </Badge>
                  <Badge tone="neutral">
                    {selectedCgpaCohort.batch.code} ({selectedCgpaCohort.batch.category})
                  </Badge>
                </div>
              </div>

              {/* CGPA Cohort Banner & Finalize Controls */}
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                    <Award className="h-6 w-6" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-slate-900">
                        {selectedCgpaCohort.program.name} · Cumulative Programme CGPA
                      </h3>
                      <Badge tone={selectedCgpaCohort.cgpaCalculated ? 'success' : 'indigo'}>
                        {selectedCgpaCohort.cgpaCalculated ? 'Status: Graduated & Finalized' : 'Ready for Final CGPA'}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Covers all {selectedCgpaCohort.totalStages} {selectedCgpaCohort.durationUnit}s. Finalizing CGPA records official GPA and marks students as <strong>Graduated</strong>.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {selectedCgpaCohort.cgpaCalculated ? (
                    <>
                      <div className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 shadow-sm">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span>Ready for Certification & Graduated</span>
                      </div>

                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleBulkDownloadCertificates}
                        loading={bulkDownloading}
                        className="gap-1.5 text-xs font-bold text-brand-700 bg-white border border-brand-200 hover:bg-brand-50 shadow-xs"
                        title="Bulk download official certificates for all department students in this programme"
                      >
                        <Download className="h-4 w-4" /> Bulk Download Certificates
                      </Button>

                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleBulkPrintCertificates}
                        loading={bulkPrinting}
                        className="gap-1.5 text-xs font-bold text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 shadow-xs"
                        title="Bulk print official certificates for all department students in this programme"
                      >
                        <Printer className="h-4 w-4" /> Bulk Print Certificates
                      </Button>

                      <Link to="/registrar/certificates">
                        <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm">
                          <GraduationCap className="h-4 w-4" /> Issue Certificates
                        </Button>
                      </Link>

                      <Link to="/registrar/transcripts">
                        <Button variant="secondary" className="gap-1.5 text-xs font-medium">
                          <FileText className="h-4 w-4 text-slate-600" /> Transcripts Hub
                        </Button>
                      </Link>
                    </>
                  ) : (
                    <>
                      <Button
                        onClick={() =>
                          calculateCgpaMutation.mutate({
                            programId: selectedCgpaCohort.program.id,
                            batchId: selectedCgpaCohort.batch.id,
                          })
                        }
                        loading={calculateCgpaMutation.isPending}
                        className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                      >
                        <Award className="h-4 w-4" /> Finalize CGPA & Graduate Students
                      </Button>

                      <Link to="/registrar/transcripts">
                        <Button variant="secondary" className="gap-1.5 text-xs">
                          <FileText className="h-4 w-4 text-slate-600" /> Transcripts Hub
                        </Button>
                      </Link>
                    </>
                  )}
                </div>
              </div>

              {/* Table of Graduating Students */}
              <Card>
                <CardHeader
                  title={`All students in ${selectedCgpaCohort.program.name} (Cumulative Overview)`}
                  subtitle={`${listRows.length} graduating student(s) in this cohort.`}
                  icon={Award}
                  action={<Badge tone="neutral">Policy v{list.data?.policyVersion ?? '1'}</Badge>}
                />
                <RegistrarTable
                  columns={listColumns}
                  rows={listRows}
                  loading={list.isFetching}
                  rowKey={(row) => row.id}
                  emptyTitle="No students found"
                  emptyMessage="No students found matching this programme and batch."
                />
              </Card>
            </div>
          )}
        </>
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
                params={selectedLevel ? { level: Number(selectedLevel) } : {}}
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
                <p className="text-xl font-bold text-indigo-700">{detail.data.cgpa != null ? Number(detail.data.cgpa).toFixed(2) : '—'}</p>
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
                      <p className="text-base font-bold text-brand-700 mt-0.5">{sb.gpa != null ? Number(sb.gpa).toFixed(2) : '—'}</p>
                      <p className="text-[10px] text-slate-400">{sb.credits} cr · {sb.courseCount} crs</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Certificate In-App Preview Modal */}
      {certPreviewStudent && certPreviewUrl && (
        <Modal
          open={Boolean(certPreviewStudent && certPreviewUrl)}
          onClose={() => {
            if (certPreviewUrl) URL.revokeObjectURL(certPreviewUrl);
            setCertPreviewUrl(null);
            setCertPreviewBlob(null);
            setCertPreviewStudent(null);
          }}
          title={`Official Certificate Preview · ${certPreviewStudent.fullName}`}
          subtitle={`${certPreviewStudent.studentId} · Graduated Candidate`}
          size="xl"
          footer={
            <div className="flex items-center justify-between w-full">
              <Button
                variant="primary"
                onClick={() => {
                  downloadBlob(certPreviewBlob, `Certificate_${certPreviewStudent.studentId || 'official'}.pdf`);
                  toast.success('Certificate PDF downloaded.');
                }}
                className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
              >
                <Download className="h-4 w-4" /> Download Certificate PDF
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  if (certPreviewUrl) URL.revokeObjectURL(certPreviewUrl);
                  setCertPreviewUrl(null);
                  setCertPreviewBlob(null);
                  setCertPreviewStudent(null);
                }}
              >
                Close Preview
              </Button>
            </div>
          }
        >
          <div className="h-[600px] w-full rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 shadow-inner">
            <iframe
              src={certPreviewUrl}
              className="w-full h-full border-0"
              title="Official Certificate Preview"
            />
          </div>
        </Modal>
      )}

      {issuingCertStudent && (
        <GpaIssueCertificateModal
          student={issuingCertStudent}
          onClose={() => setIssuingCertStudent(null)}
          onSaved={() => {
            invalidate();
            queryClient.invalidateQueries({ queryKey: ['registrar', 'certificates'] });
          }}
        />
      )}

      {/* Hidden file input for uploading student photos directly */}
      <input
        type="file"
        ref={photoInputRef}
        onChange={handleUploadPhoto}
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
      />
    </div>
  );
}

function GpaIssueCertificateModal({ student: initialStudent, onClose, onSaved }) {
  const queryClient = useQueryClient();
  const [student, setStudent] = useState(initialStudent);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(`cert-${Date.now()}`);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const modalPhotoInputRef = useRef(null);

  useEffect(() => {
    if (initialStudent) {
      if (previewData?.url) URL.revokeObjectURL(previewData.url);
      setStudent(initialStudent);
      setConfirmed(false);
      setError('');
      setPreviewData(null);
      setIdempotencyKey(`cert-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    }
  }, [initialStudent]);

  const studentHasPhoto = Boolean(
    student?.hasPhoto ||
    student?.photo?.url ||
    student?.photo?.thumbnailUrl ||
    student?.photo?.filePath ||
    student?.photo?.fileId
  );

  const handleModalPhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !student) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('The photo must be smaller than 5 MB.');
      return;
    }
    setUploadingPhoto(true);
    try {
      const buffer = await file.arrayBuffer();
      const res = await api.post(`${REGISTRAR}/students/${student.id}/photo`, buffer, {
        headers: { 'Content-Type': file.type || 'image/jpeg' },
      });
      toast.success(`Photo uploaded for ${student.fullName}! Certificate unlocked.`);
      setStudent((prev) => ({
        ...prev,
        photo: res.data?.photo,
        hasPhoto: true,
      }));
      queryClient.invalidateQueries({ queryKey: ['registrar', 'gpa-cgpa'] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'students'] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'certificates'] });
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to upload student photo.'));
    } finally {
      setUploadingPhoto(false);
      if (modalPhotoInputRef.current) modalPhotoInputRef.current.value = '';
    }
  };

  const issue = useMutation({
    mutationFn: async () => {
      if (!studentHasPhoto) {
        throw new Error('A verified student photo is required to issue this certificate.');
      }
      return (
        await api.post(`${REGISTRAR}/certificates/issue`, {
          student: student.id,
          idempotencyKey,
        })
      ).data;
    },
    onSuccess: (data) => {
      toast.success(`Certificate issued successfully! Serial: ${data.certificate?.certificateNumber || 'record created'}.`);
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'The certificate could not be issued.');
      setError(message);
      toast.error(message);
    },
  });

  const preview = async () => {
    if (!student) return;
    setPreviewing(true);
    setError('');
    try {
      const res = await api.post(`${REGISTRAR}/certificates/preview`, { student: student.id }, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      setPreviewData({ url, blob: res.data });
      toast.success('Certificate preview generated.');
    } catch (err) {
      const message = errorMessage(err, 'The preview could not be generated.');
      setError(message);
      toast.error(message);
    } finally {
      setPreviewing(false);
    }
  };

  if (!student) return null;

  return (
    <Modal
      open={Boolean(student)}
      title="Issue Official Certificate"
      subtitle={`Issue the verified graduation certificate for ${student.fullName} (${student.studentId || ''}).`}
      size={previewData ? 'xl' : 'lg'}
      onClose={issue.isPending ? undefined : onClose}
      dismissible={!issue.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={issue.isPending}>
            Cancel
          </Button>
          {previewData ? (
            <>
              <Button
                variant="secondary"
                className="gap-2 text-indigo-700"
                onClick={() => {
                  printBlob(previewData.blob);
                  toast.success('Print dialog opened.');
                }}
              >
                <Printer className="h-4 w-4" /> Print PDF
              </Button>
              <Button
                variant="secondary"
                className="gap-2 text-brand-700"
                onClick={() => {
                  downloadBlob(previewData.blob, `Certificate_${student.studentId || student.fullName}.pdf`);
                  toast.success('Certificate PDF downloaded.');
                }}
              >
                <Download className="h-4 w-4" /> Download PDF
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={preview} loading={previewing}>
              <Eye className="h-4 w-4" /> Preview PDF
            </Button>
          )}
          <Button
            onClick={() => issue.mutate()}
            loading={issue.isPending}
            disabled={!confirmed || !studentHasPhoto}
            title={!studentHasPhoto ? 'Verified trainee photo required to issue certificate' : ''}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1"
          >
            <Award className="h-4 w-4" /> Issue Certificate
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}

        {!studentHasPhoto ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                <strong>No Photo:</strong> Trainee photograph is missing. An official certificate cannot be issued without a photo (Preview is allowed).
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => modalPhotoInputRef.current?.click()}
              loading={uploadingPhoto}
              className="gap-1.5 bg-white text-amber-900 border-amber-300 hover:bg-amber-100 shrink-0 font-bold"
            >
              <Camera className="h-3.5 w-3.5 text-amber-700" /> Upload Photo
            </Button>
            <input
              type="file"
              ref={modalPhotoInputRef}
              onChange={handleModalPhotoUpload}
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
            />
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-2.5 text-xs text-emerald-800">
            <img
              src={student.photo?.thumbnailUrl || student.photo?.url}
              alt=""
              className="h-8 w-8 rounded-full object-cover ring-1 ring-emerald-300"
            />
            <span>Verified trainee photograph is attached and ready for certificate printing.</span>
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-bold text-slate-900">{student.fullName}</p>
              <p className="text-xs font-mono text-slate-500 mt-0.5">Student ID: {student.studentId}</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cumulative CGPA</span>
              <p className="text-xl font-black text-emerald-700">{student.cgpa != null ? Number(student.cgpa).toFixed(2) : '—'}</p>
            </div>
          </div>
        </div>

        {previewData ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Official Certificate Preview</span>
              <Button size="sm" variant="ghost" className="text-xs text-rose-600 hover:bg-rose-50" onClick={() => setPreviewData(null)}>
                Hide Preview
              </Button>
            </div>
            <div className="h-[460px] w-full rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 shadow-inner">
              <iframe src={previewData.url} className="w-full h-full border-0" title="Certificate PDF Preview" />
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
          <p className="flex items-center gap-2 font-semibold text-slate-800">
            <ShieldCheck className="h-4 w-4 text-brand-600" /> Official Certificate Issuance
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Recomputes eligibility from published marks and cumulative CGPA.</li>
            <li>Assigns a unique institutional Certificate Number and Verification Reference ID.</li>
            <li>Saves the permanent record to the official Certificate register and history.</li>
          </ul>
        </div>

        <label className="flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm text-brand-900">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-brand-300 text-brand-600"
          />
          <span>I have verified the student record and want to issue the official certificate and academic record.</span>
        </label>
      </div>
    </Modal>
  );
}
