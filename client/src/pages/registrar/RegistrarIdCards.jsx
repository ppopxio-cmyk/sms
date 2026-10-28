import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import {
  CreditCard,
  History,
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  Camera,
  ShieldCheck,
  Building2,
  GraduationCap,
  Sparkles,
  Search,
  ExternalLink,
  Ban,
  ArrowRight,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { REGISTRAR, displayDateTime, downloadFile } from '../../lib/registrar';
import { formatEthiopian } from '../../lib/ethiopianDate';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';

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

export default function RegistrarIdCards() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('issue'); // 'issue' | 'history'

  // Cascaded Selection States for Issuing
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [selectedProgId, setSelectedProgId] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [notes, setNotes] = useState('');

  // History Tab Filters
  const [historyDept, setHistoryDept] = useState('');
  const [historyProg, setHistoryProg] = useState('');
  const [historyBatch, setHistoryBatch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [appliedHistoryFilters, setAppliedHistoryFilters] = useState({});

  // Preview Modal States
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewTitle, setPreviewTitle] = useState('ID Card Preview');
  const [previewing, setPreviewing] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  // Fetch filter options (departments, programmes, batches)
  const optionsQuery = useQuery({
    queryKey: ['registrar', 'students', 'options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/options`)).data,
    staleTime: 5 * 60_000,
  });

  const departments = optionsQuery.data?.departments || [];
  const allPrograms = optionsQuery.data?.programs || [];
  const allBatches = optionsQuery.data?.batches || [];

  // Filter programmes by selected department
  const filteredPrograms = useMemo(() => {
    if (!selectedDeptId) return allPrograms;
    return allPrograms.filter((p) => p.department === selectedDeptId);
  }, [allPrograms, selectedDeptId]);

  // Filter batches by selected programme
  const filteredBatches = useMemo(() => {
    if (!selectedProgId) return allBatches;
    return allBatches.filter((b) => b.program === selectedProgId);
  }, [allBatches, selectedProgId]);

  // Query students matching selected batch and programme
  const studentsQuery = useQuery({
    queryKey: ['registrar', 'id-cards-students', selectedDeptId, selectedProgId, selectedBatchId],
    queryFn: async () => {
      const params = {
        limit: 100,
        ...(selectedProgId ? { program: selectedProgId } : {}),
        ...(selectedDeptId ? { department: selectedDeptId } : {}),
        ...(selectedBatchId ? { batch: selectedBatchId } : {}),
      };
      return (await api.get(`${REGISTRAR}/students`, { params })).data;
    },
    enabled: Boolean(selectedProgId || selectedBatchId),
  });

  const studentsList = studentsQuery.data?.rows || [];

  // Query selected student card eligibility
  const eligibilityQuery = useQuery({
    queryKey: ['registrar', 'id-card-eligibility', selectedStudentId],
    queryFn: async () => (await api.get(`${REGISTRAR}/id-cards/student/${selectedStudentId}`)).data,
    enabled: Boolean(selectedStudentId),
  });

  const eligibility = eligibilityQuery.data;
  const currentStudent = eligibility?.student;
  const issueCount = eligibility?.issueCount ?? 0;
  const hasPhoto = Boolean(eligibility?.hasPhoto);
  const canIssue = Boolean(eligibility?.canIssue);

  // Mutation: Issue Student ID Card
  const issueMutation = useMutation({
    mutationFn: async () => {
      return (
        await api.post(`${REGISTRAR}/id-cards/issue`, {
          studentId: selectedStudentId,
          notes,
        })
      ).data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Student ID Card issued successfully!');
      queryClient.invalidateQueries({ queryKey: ['registrar', 'id-card-eligibility'] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'id-cards-history'] });
      setNotes('');
    },
    onError: (err) => {
      toast.error(errorMessage(err, 'Failed to issue student ID card.'));
    },
  });

  // Query ID Cards History
  const historyQuery = useQuery({
    queryKey: ['registrar', 'id-cards-history', appliedHistoryFilters, historyPage],
    queryFn: async () => {
      const params = {
        page: historyPage,
        limit: 20,
        ...appliedHistoryFilters,
      };
      return (await api.get(`${REGISTRAR}/id-cards`, { params })).data;
    },
    enabled: activeTab === 'history',
  });

  const historyRows = historyQuery.data?.rows || [];
  const historyTotal = historyQuery.data?.total || 0;
  const historyPages = Math.ceil(historyTotal / 20) || 1;

  // Handle Preview ID Card (Calls preview endpoint without issuing)
  const handlePreviewCurrent = async () => {
    if (!selectedStudentId) return;
    setPreviewing(true);
    try {
      const res = await api.post(
        `${REGISTRAR}/id-cards/preview`,
        { studentId: selectedStudentId },
        { responseType: 'blob' },
      );
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPreviewBlob(blob);
      setPreviewUrl(url);
      setPreviewTitle(`Student ID Card Preview · ${currentStudent?.fullName || 'Student'}`);
      setPreviewOpen(true);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not generate ID card preview.'));
    } finally {
      setPreviewing(false);
    }
  };

  // Handle View from History
  const handleViewHistoryCard = async (row) => {
    setDownloadingId(row.id);
    try {
      const res = await api.get(`${REGISTRAR}/id-cards/${row.id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPreviewBlob(blob);
      setPreviewUrl(url);
      setPreviewTitle(`Official ID Card #${row.issueNumber} · ${row.studentSnapshot?.fullName || ''}`);
      setPreviewOpen(true);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not load ID card PDF.'));
    } finally {
      setDownloadingId(null);
    }
  };

  // Handle Direct Download from History
  const handleDownloadHistoryCard = async (row) => {
    setDownloadingId(row.id);
    try {
      const res = await api.get(`${REGISTRAR}/id-cards/${row.id}/pdf`, { responseType: 'blob' });
      downloadBlob(res.data, `ID_Card_${row.studentSnapshot?.studentId || row.id}.pdf`);
      toast.success('ID Card PDF downloaded.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not download ID card PDF.'));
    } finally {
      setDownloadingId(null);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setPreviewOpen(false);
  };

  // Table Columns for Issued ID Cards History
  const historyColumns = [
    {
      key: 'student',
      label: 'Student',
      render: (row) => (
        <div className="flex items-center gap-3">
          {row.studentSnapshot?.photo?.url || row.student?.photo?.url ? (
            <img
              src={row.studentSnapshot?.photo?.url || row.student?.photo?.url}
              alt=""
              className="h-10 w-10 rounded-full object-cover ring-1 ring-slate-200"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
              {row.studentSnapshot?.fullName?.charAt(0) || 'S'}
            </div>
          )}
          <div>
            <p className="text-sm font-bold text-slate-900">{row.studentSnapshot?.fullName || '—'}</p>
            <p className="text-xs font-mono text-slate-500">{row.studentSnapshot?.studentId || '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'program',
      label: 'Programme & Batch',
      render: (row) => (
        <div>
          <p className="text-xs font-semibold text-slate-800">{row.studentSnapshot?.programName || '—'}</p>
          <p className="text-[11px] text-slate-500">
            {row.studentSnapshot?.departmentName} · Batch {row.studentSnapshot?.batchCode}
          </p>
        </div>
      ),
    },
    {
      key: 'issueNumber',
      label: 'Issuance Counter',
      render: (row) => (
        <Badge tone={row.issueNumber >= 4 ? 'danger' : row.issueNumber >= 2 ? 'warning' : 'brand'}>
          Issue #{row.issueNumber} of 4
        </Badge>
      ),
    },
    {
      key: 'promotions',
      label: 'Promotion Record',
      render: (row) => {
        const stages = row.promotedStages || [];
        return (
          <div className="flex flex-wrap items-center gap-1">
            {stages.length > 0 ? (
              stages.map((st) => (
                <span
                  key={st}
                  className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200"
                >
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  Stage {st}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-400">Initial Admission (Stage 1)</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'issuedAt',
      label: 'Issued At',
      render: (row) => (
        <div>
          <p className="text-xs text-slate-800">{displayDateTime(row.issuedAt)}</p>
          <p className="text-[11px] text-slate-500">{formatEthiopian(row.issuedAt)}</p>
        </div>
      ),
    },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      mobileFull: true,
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleViewHistoryCard(row)}
            loading={downloadingId === row.id}
            title="Preview ID Card PDF"
          >
            <Eye className="h-3.5 w-3.5 text-slate-600" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleDownloadHistoryCard(row)}
            loading={downloadingId === row.id}
            className="gap-1 text-xs"
          >
            <Download className="h-3.5 w-3.5" /> PDF
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Student ID Cards Management"
        subtitle="Prepare, preview and issue official 2-sided PVC student identity cards with verified academic promotion seals. Strictly requires an uploaded portrait photo; limited to a maximum of 4 issuances per student."
      />

      {/* Main Mode Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('issue')}
          className={`focus-ring inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition ${
            activeTab === 'issue'
              ? 'bg-brand-600 text-white shadow-sm ring-2 ring-brand-400'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <CreditCard className="h-4 w-4" />
          <span>Issue Student ID Card</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`focus-ring inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition ${
            activeTab === 'history'
              ? 'bg-slate-800 text-white shadow-sm ring-2 ring-slate-600'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <History className="h-4 w-4" />
          <span>Issued ID Cards History</span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: ISSUE STUDENT ID CARD
          ========================================================================= */}
      {activeTab === 'issue' && (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left Column: Cascaded Selector (5 Cols) */}
          <div className="space-y-5 lg:col-span-5">
            <Card>
              <CardHeader
                title="1. Select Student"
                subtitle="Choose the department, programme, batch, and target student."
                icon={Search}
              />
              <CardBody className="space-y-4">
                {/* Department Select */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Department
                  </label>
                  <select
                    value={selectedDeptId}
                    onChange={(e) => {
                      setSelectedDeptId(e.target.value);
                      setSelectedProgId('');
                      setSelectedBatchId('');
                      setSelectedStudentId('');
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="">-- Choose Department --</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Programme Select */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Programme
                  </label>
                  <select
                    value={selectedProgId}
                    onChange={(e) => {
                      setSelectedProgId(e.target.value);
                      setSelectedBatchId('');
                      setSelectedStudentId('');
                    }}
                    disabled={!selectedDeptId && filteredPrograms.length === 0}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">-- Choose Programme --</option>
                    {filteredPrograms.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.qualificationType?.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Batch Select */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Batch
                  </label>
                  <select
                    value={selectedBatchId}
                    onChange={(e) => {
                      setSelectedBatchId(e.target.value);
                      setSelectedStudentId('');
                    }}
                    disabled={!selectedProgId && filteredBatches.length === 0}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">-- Choose Batch --</option>
                    {filteredBatches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Student Select */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Student
                  </label>
                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    disabled={studentsList.length === 0}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">
                      {studentsList.length === 0
                        ? '-- No students loaded --'
                        : `-- Choose Student (${studentsList.length} found) --`}
                    </option>
                    {studentsList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.fullName} · {s.studentId} {s.photo?.url ? '✓ Photo' : '⚠️ No Photo'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Optional Registrar Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Issuance Reason / Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Regular first issuance, Replacement of lost card..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </CardBody>
            </Card>

            {/* Policy Reminder Card */}
            <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-xs leading-relaxed text-blue-900 shadow-sm">
              <p className="flex items-center gap-2 font-bold text-blue-950">
                <ShieldCheck className="h-4 w-4 text-brand-600" /> ID Card Issuance Safeguards
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-blue-800">
                <li>
                  <strong>Portrait Photo Mandatory:</strong> An ID card cannot be prepared or issued without an official portrait photograph.
                </li>
                <li>
                  <strong>Strict 4-Issue Limit:</strong> Each student is limited to at most 4 ID card issuances throughout their institutional enrollment.
                </li>
                <li>
                  <strong>Academic Promotion Slots:</strong> The back of the card features official Registrar stamps for verified promotions, or blank lines for uncompleted stages.
                </li>
              </ul>
            </div>
          </div>

          {/* Right Column: Live Card Preview & Issuance Controls (7 Cols) */}
          <div className="space-y-5 lg:col-span-7">
            {!selectedStudentId ? (
              <Card>
                <CardBody className="py-20 text-center">
                  <CreditCard className="mx-auto h-16 w-16 text-slate-300" />
                  <h3 className="mt-4 text-base font-bold text-slate-800">
                    No Student Selected
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                    Select a department, programme, batch, and student from the left panel to inspect eligibility, preview the ID card, and issue it.
                  </p>
                </CardBody>
              </Card>
            ) : eligibilityQuery.isLoading ? (
              <Card>
                <CardBody className="py-20 text-center">
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                  <p className="mt-3 text-xs text-slate-500">Checking student eligibility...</p>
                </CardBody>
              </Card>
            ) : (
              <div className="space-y-5">
                {/* Eligibility Status Banner */}
                <div
                  className={`rounded-2xl border p-5 shadow-sm transition ${
                    !hasPhoto
                      ? 'border-rose-300 bg-rose-50/70 text-rose-900'
                      : issueCount >= 4
                      ? 'border-amber-300 bg-amber-50/70 text-amber-900'
                      : 'border-emerald-300 bg-emerald-50/70 text-emerald-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {!hasPhoto ? (
                        <AlertCircle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
                      ) : issueCount >= 4 ? (
                        <Ban className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <h4 className="text-sm font-bold">
                          {!hasPhoto
                            ? 'Action Blocked: Student Photo Required'
                            : issueCount >= 4
                            ? 'Issuance Limit Reached (4 of 4)'
                            : `Eligible for ID Card Issuance (Issue #${issueCount + 1} of 4)`}
                        </h4>
                        <p className="text-xs mt-1 leading-relaxed opacity-90">
                          {!hasPhoto ? (
                            <span>
                              This student has no uploaded photo. System policy forbids preparing or issuing an ID card without a verified portrait picture.
                            </span>
                          ) : issueCount >= 4 ? (
                            <span>
                              This student has already reached the institutional maximum of 4 ID card issuances. No additional cards can be printed.
                            </span>
                          ) : (
                            <span>
                              Student photo is verified, and the student has {4 - issueCount} issuance(s) remaining. You can preview and issue the official card below.
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    <Badge
                      tone={
                        !hasPhoto ? 'danger' : issueCount >= 4 ? 'warning' : 'success'
                      }
                    >
                      Issue #{issueCount + 1} of 4
                    </Badge>
                  </div>

                  {!hasPhoto && (
                    <div className="mt-3 pt-3 border-t border-rose-200 flex items-center justify-between">
                      <span className="text-[11px] text-rose-800">
                        Upload a photo on the student's profile page to unblock ID issuance.
                      </span>
                      <Link
                        to={`/registrar/students/${selectedStudentId}`}
                        className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 hover:text-rose-900 underline"
                      >
                        Open Profile <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  )}
                </div>

                {/* ID Card Visual Preview Card */}
                <Card className="overflow-hidden border border-slate-200">
                  <CardHeader
                    title="2. Card Verification Details"
                    subtitle="Front and Back snapshot information to be rendered onto the CR80 card."
                    icon={CreditCard}
                    action={
                      <Badge tone="brand">
                        Level/Year {currentStudent?.level || 1}
                      </Badge>
                    }
                  />
                  <CardBody className="space-y-5">
                    {/* Front-of-card preview representation */}
                    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-indigo-950 p-5 text-white shadow-md">
                      <div className="flex items-center justify-between border-b border-white/10 pb-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-indigo-400" />
                          <span className="text-xs font-bold tracking-wider uppercase text-indigo-200">
                            Higher Education Institution · Student ID
                          </span>
                        </div>
                        <span className="rounded bg-white/20 px-2 py-0.5 text-[10px] font-bold">
                          Issue #{issueCount + 1} of 4
                        </span>
                      </div>

                      <div className="mt-4 flex items-center gap-4">
                        {currentStudent?.photo?.url ? (
                          <img
                            src={currentStudent.photo.url}
                            alt=""
                            className="h-20 w-16 rounded-lg object-cover ring-2 ring-white/30 shadow"
                          />
                        ) : (
                          <div className="flex h-20 w-16 items-center justify-center rounded-lg bg-white/10 text-white/40 ring-1 ring-white/20">
                            <Camera className="h-8 w-8" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="text-base font-extrabold text-white truncate">
                            {currentStudent?.fullName}
                          </p>
                          <p className="text-xs font-mono text-indigo-300">
                            ID: {currentStudent?.studentId}
                          </p>
                          <p className="text-xs text-slate-300">
                            {currentStudent?.program?.name || 'Programme'}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Dept: {currentStudent?.department?.name || 'Department'} · Batch: {currentStudent?.batch?.code || '2019'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Back-of-card Promotion Records */}
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 mb-3">
                        <GraduationCap className="h-4 w-4 text-brand-600" />
                        Academic Promotion Endorsements (Back of Card)
                      </p>
                      <div className="space-y-2">
                        {[1, 2, 3, 4].map((stageNum) => {
                          const isPromoted = stageNum < (currentStudent?.level || 1);
                          return (
                            <div
                              key={stageNum}
                              className="flex items-center justify-between rounded-xl bg-white p-2.5 border border-slate-200 text-xs"
                            >
                              <span className="font-bold text-slate-800">
                                Stage / Year {stageNum}
                              </span>
                              {isPromoted ? (
                                <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                  [ ✓ PROMOTED · REGISTRAR APPROVED ]
                                </span>
                              ) : (
                                <span className="font-mono text-slate-400 tracking-widest">
                                  ______________________
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                      <Button
                        variant="secondary"
                        onClick={handlePreviewCurrent}
                        loading={previewing}
                        disabled={!hasPhoto}
                        className="gap-1.5 text-xs font-bold"
                      >
                        <Eye className="h-4 w-4 text-indigo-600" /> Preview ID Card PDF
                      </Button>

                      <Button
                        onClick={() => issueMutation.mutate()}
                        loading={issueMutation.isPending}
                        disabled={!canIssue}
                        className="gap-2 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-sm"
                      >
                        <CreditCard className="h-4 w-4" /> Issue Official ID Card (#{issueCount + 1} of 4)
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: ISSUED ID CARDS HISTORY
          ========================================================================= */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* Filters Bar with "Show Cards" Button */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="w-full sm:w-48">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Department
              </label>
              <select
                value={historyDept}
                onChange={(e) => setHistoryDept(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-full sm:w-48">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Programme
              </label>
              <select
                value={historyProg}
                onChange={(e) => setHistoryProg(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">All Programmes</option>
                {allPrograms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-full sm:w-48">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Batch
              </label>
              <select
                value={historyBatch}
                onChange={(e) => setHistoryBatch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">All Batches</option>
                {allBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="ml-auto mt-auto flex items-center gap-2 pt-4 sm:pt-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setHistoryDept('');
                  setHistoryProg('');
                  setHistoryBatch('');
                  setAppliedHistoryFilters({});
                  setHistoryPage(1);
                }}
                className="text-xs"
              >
                Reset
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setHistoryPage(1);
                  setAppliedHistoryFilters({
                    ...(historyDept ? { department: historyDept } : {}),
                    ...(historyProg ? { program: historyProg } : {}),
                    ...(historyBatch ? { batch: historyBatch } : {}),
                  });
                }}
                className="gap-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs"
              >
                <Search className="h-3.5 w-3.5" /> Show Cards
              </Button>
            </div>
          </div>

          {/* Issued ID Cards Table */}
          <Card>
            <CardHeader
              title="Official Issued Student ID Cards"
              subtitle={`${historyTotal} ID card record(s) issued and recorded in the audit trail.`}
              icon={History}
            />
            <RegistrarTable
              columns={historyColumns}
              rows={historyRows}
              loading={historyQuery.isFetching}
              rowKey={(row) => row.id}
              emptyTitle="No ID Cards Issued"
              emptyMessage="No student ID cards have been issued yet with the current filter criteria."
            />
            {historyPages > 1 && (
              <div className="border-t border-slate-100 p-4">
                <Pagination
                  page={historyPage}
                  pages={historyPages}
                  onPageChange={setHistoryPage}
                />
              </div>
            )}
          </Card>
        </div>
      )}

      {/* In-App ID Card Preview Modal */}
      {previewOpen && previewUrl && (
        <Modal
          open={previewOpen}
          onClose={closePreview}
          title={previewTitle}
          subtitle="Two-sided PVC Student ID Card preview with institutional branding, barcode, and promotion endorsements."
          size="xl"
          footer={
            <div className="flex items-center justify-between w-full">
              <Button
                variant="primary"
                onClick={() => {
                  downloadBlob(previewBlob, 'Student_ID_Card.pdf');
                  toast.success('ID Card PDF downloaded.');
                }}
                className="gap-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs"
              >
                <Download className="h-4 w-4" /> Download ID Card PDF
              </Button>
              <Button variant="secondary" onClick={closePreview}>
                Close
              </Button>
            </div>
          }
        >
          <div className="h-[600px] w-full rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 shadow-inner">
            <iframe
              src={previewUrl}
              className="w-full h-full border-0"
              title="Student ID Card Preview"
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
