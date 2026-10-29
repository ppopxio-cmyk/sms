import { useState, useMemo, useRef } from 'react';
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
  ArrowLeft,
  ArrowRight,
  Layers,
  UsersRound,
  Printer,
  ChevronRight,
  RefreshCw,
  Plus,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { REGISTRAR, displayDateTime, toJpegFile, printBlob } from '../../lib/registrar';
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

  // Selected Programme Cohort Slug State: null | { programId, batchId, programName, departmentName, batchCode }
  const [openedCohort, setOpenedCohort] = useState(null);
  const [slugSubTab, setSlugSubTab] = useState('students'); // 'students' | 'history'

  // Selection Dropdown States for Root Overview
  const [filterBatch, setFilterBatch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterProg, setFilterProg] = useState('');

  // Single Student Actions / Preview Modal States
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBlob, setPreviewBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewTitle, setPreviewTitle] = useState('Student ID Card Preview');
  const [previewingId, setPreviewingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [printingId, setPrintingId] = useState(null);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkPrinting, setBulkPrinting] = useState(false);
  const [uploadingStudent, setUploadingStudent] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleTriggerUpload = (student) => {
    setUploadingStudent(student);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingStudent) return;
    const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
    if (!ACCEPTED.includes(file.type)) {
      toast.error('Choose a JPEG, PNG or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('The photo must be smaller than 5 MB.');
      return;
    }

    setUploadLoading(true);
    try {
      const jpeg = await toJpegFile(file);
      const buffer = await jpeg.arrayBuffer();
      await api.post(`${REGISTRAR}/students/${uploadingStudent.id}/photo`, buffer, {
        headers: { 'Content-Type': 'image/jpeg' },
      });
      toast.success(`Photo uploaded for ${uploadingStudent.fullName}! ID card is now unlocked.`);
      queryClient.invalidateQueries({ queryKey: ['registrar', 'id-cards-cohort-summary'] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'students'] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'student'] });
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to upload student photo.'));
    } finally {
      setUploadLoading(false);
      setUploadingStudent(null);
    }
  };

  // Fetch all options (batches, departments, programs)
  const optionsQuery = useQuery({
    queryKey: ['registrar', 'students', 'options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/options`)).data,
    staleTime: 5 * 60_000,
  });

  const batches = optionsQuery.data?.batches || [];
  const departments = optionsQuery.data?.departments || [];
  const allPrograms = optionsQuery.data?.programs || [];

  // Deduplicate batches by code / name to prevent repeated batch entries
  const uniqueBatches = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const b of batches) {
      const codeKey = (b.code || b.name || '').trim().toLowerCase();
      if (!seen.has(codeKey)) {
        seen.add(codeKey);
        list.push(b);
      }
    }
    return list;
  }, [batches]);

  // Filter programmes by selected department
  const filteredPrograms = useMemo(() => {
    if (!filterDept) return allPrograms;
    return allPrograms.filter((p) => p.department === filterDept);
  }, [allPrograms, filterDept]);

  // Cohort Cards: derived from batches and programs (deduplicated by programme + batch)
  const cohortCards = useMemo(() => {
    const list = [];
    const seenCohortKey = new Set();

    for (const b of batches) {
      if (filterBatch) {
        const matchesCode = (b.code || '').toLowerCase() === filterBatch.toLowerCase();
        const matchesName = (b.name || '').toLowerCase() === filterBatch.toLowerCase();
        const matchesId = b.id === filterBatch;
        if (!matchesCode && !matchesName && !matchesId) continue;
      }
      for (const p of allPrograms) {
        if (filterDept && p.department !== filterDept) continue;
        if (filterProg && p.id !== filterProg) continue;
        if (b.program && b.program !== p.id) continue;

        const cohortKey = `${p.id}_${(b.code || b.name || '').trim().toLowerCase()}`;
        if (seenCohortKey.has(cohortKey)) continue;
        seenCohortKey.add(cohortKey);

        const dept = departments.find((d) => d.id === p.department) || { name: 'Department' };
        list.push({
          id: `${p.id}_${b.id}`,
          programId: p.id,
          batchId: b.id,
          programName: p.name,
          programCode: p.code,
          qualificationType: p.qualificationType,
          departmentName: dept.name,
          departmentId: dept.id,
          batchCode: b.code,
          batchName: b.name,
          category: b.category || 'regular',
        });
      }
    }
    return list;
  }, [batches, allPrograms, departments, filterBatch, filterDept, filterProg]);

  // Query Programme Cohort Summary when a programme is opened
  const cohortSummaryQuery = useQuery({
    queryKey: ['registrar', 'id-cards-cohort-summary', openedCohort?.programId, openedCohort?.batchId],
    queryFn: async () => {
      const res = await api.get(`${REGISTRAR}/id-cards/cohort-summary`, {
        params: {
          programId: openedCohort.programId,
          batchId: openedCohort.batchId,
        },
      });
      return res.data;
    },
    enabled: Boolean(openedCohort?.programId && openedCohort?.batchId),
  });

  const cohortData = cohortSummaryQuery.data;
  const students = cohortData?.students || [];
  const history = cohortData?.history || [];
  const totalStudents = cohortData?.totalStudents || 0;
  const photoCount = cohortData?.photoCount || 0;
  const issuedCount = cohortData?.issuedCount || 0;
  const allHavePhotos = Boolean(cohortData?.allHavePhotos);
  const allIssued = Boolean(cohortData?.allIssued);

  // Mutation: Issue / Reissue ID Card for a single student
  const issueMutation = useMutation({
    mutationFn: async ({ studentId, notes }) => {
      return (await api.post(`${REGISTRAR}/id-cards/issue`, { studentId, notes })).data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Student ID Card issued successfully!');
      queryClient.invalidateQueries({ queryKey: ['registrar', 'id-cards-cohort-summary'] });
    },
    onError: (err) => {
      toast.error(errorMessage(err, 'Failed to issue student ID card.'));
    },
  });

  // Mutation: Bulk Issue All Eligible ID Cards in the cohort
  const bulkIssueMutation = useMutation({
    mutationFn: async ({ programId, batchId }) => {
      return (await api.post(`${REGISTRAR}/id-cards/bulk-issue`, { programId, batchId })).data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'All eligible student ID cards issued in bulk!');
      queryClient.invalidateQueries({ queryKey: ['registrar', 'id-cards-cohort-summary'] });
    },
    onError: (err) => {
      toast.error(errorMessage(err, 'Failed to bulk issue student ID cards.'));
    },
  });

  // Handle Single Student Preview (Modal iframe)
  const handlePreviewStudent = async (student) => {
    setPreviewingId(student.id);
    try {
      const res = await api.post(
        `${REGISTRAR}/id-cards/preview`,
        { studentId: student.id },
        { responseType: 'blob' },
      );
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPreviewBlob(blob);
      setPreviewUrl(url);
      setPreviewTitle(`ID Card Preview · ${student.fullName} (${student.studentId})`);
      setPreviewOpen(true);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not generate ID card preview.'));
    } finally {
      setPreviewingId(null);
    }
  };

  // Handle Single Student Direct Print
  const handlePrintStudent = async (student) => {
    setPrintingId(student.id);
    try {
      if (student.latestCard?.id) {
        const res = await api.post(
          `${REGISTRAR}/id-cards/${student.latestCard.id}/print`,
          {},
          { responseType: 'blob' },
        );
        printBlob(res.data);
        toast.success(`Printing ID card for ${student.fullName}...`);
        queryClient.invalidateQueries({ queryKey: ['registrar', 'id-cards-cohort-summary'] });
      } else {
        toast.error('Student ID card must be issued before printing.');
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Could not print ID card.'));
    } finally {
      setPrintingId(null);
    }
  };

  // Handle Single Student Direct Download
  const handleDownloadStudent = async (student) => {
    setDownloadingId(student.id);
    try {
      if (student.latestCard?.id) {
        const res = await api.get(`${REGISTRAR}/id-cards/${student.latestCard.id}/pdf`, { responseType: 'blob' });
        downloadBlob(res.data, `ID_Card_${student.studentId || student.fullName}.pdf`);
      } else {
        const res = await api.post(`${REGISTRAR}/id-cards/preview`, { studentId: student.id }, { responseType: 'blob' });
        downloadBlob(res.data, `ID_Card_${student.studentId || student.fullName}.pdf`);
      }
      toast.success('ID Card PDF downloaded.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not download ID card PDF.'));
    } finally {
      setDownloadingId(null);
    }
  };

  // Handle Bulk Download of All Students' IDs in 1 PDF (Landscape View)
  const handleBulkDownload = async () => {
    if (!openedCohort) return;
    setBulkDownloading(true);
    try {
      const res = await api.get(`${REGISTRAR}/id-cards/bulk-pdf`, {
        params: {
          programId: openedCohort.programId,
          batchId: openedCohort.batchId,
        },
        responseType: 'blob',
      });
      downloadBlob(
        res.data,
        `All_IDs_Landscape_${openedCohort.programCode || 'PROG'}_${openedCohort.batchCode || '2019'}.pdf`,
      );
      toast.success('All student ID cards generated in 1 landscape PDF!');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not generate bulk landscape ID cards PDF.'));
    } finally {
      setBulkDownloading(false);
    }
  };

  // Handle Bulk Print of All Students' IDs in Landscape View
  const handleBulkPrint = async () => {
    if (!openedCohort) return;
    setBulkPrinting(true);
    try {
      const res = await api.get(`${REGISTRAR}/id-cards/bulk-pdf`, {
        params: {
          programId: openedCohort.programId,
          batchId: openedCohort.batchId,
        },
        responseType: 'blob',
      });
      printBlob(res.data);
      toast.success('Sending bulk ID cards (A4 Landscape) to printer...');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not generate bulk landscape ID cards for print.'));
    } finally {
      setBulkPrinting(false);
    }
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setPreviewOpen(false);
  };

  // Columns for Students Table in Cohort Slug View
  const studentColumns = [
    {
      key: 'photo',
      label: 'Photo',
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.photo?.url ? (
            <img
              src={row.photo.url}
              alt=""
              className="h-10 w-10 rounded-full object-cover ring-2 ring-emerald-500 shadow-sm"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 ring-1 ring-slate-200">
              <Camera className="h-4 w-4" />
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'student',
      label: 'Student Details',
      render: (row) => (
        <div>
          <p className="text-sm font-bold text-slate-900">{row.fullName}</p>
          <p className="text-xs font-mono text-slate-500">{row.studentId}</p>
        </div>
      ),
    },
    {
      key: 'level',
      label: 'Level / Stage',
      render: (row) => <Badge tone="neutral">Stage / Year {row.level}</Badge>,
    },
    {
      key: 'cardStatus',
      label: 'ID Card Status',
      render: (row) => (
        <div>
          {row.issueCount > 0 ? (
            <Badge tone="success">
              Issue #{row.issueCount} of 2
            </Badge>
          ) : (
            <Badge tone="neutral">Not Issued</Badge>
          )}
          {row.latestCard && (
            <p className="text-[10px] text-slate-500 mt-0.5">
              Prints: {row.latestCard.printCount || 0}/2
            </p>
          )}
          {row.latestCard?.issuedAt && (
            <p className="text-[10px] text-slate-400 mt-0.5">
              {formatEthiopian(row.latestCard.issuedAt)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'photoStatus',
      label: 'Photo Status',
      render: (row) => (
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium ${
            row.hasPhoto ? 'text-emerald-700' : 'text-amber-700'
          }`}
        >
          {row.hasPhoto ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Uploaded
            </>
          ) : (
            <>
              <AlertCircle className="h-3.5 w-3.5 text-amber-600" /> Missing Photo
            </>
          )}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'Actions',
      className: 'text-right',
      mobileFull: true,
      render: (row) => {
        const issueLimitReached = row.issueCount >= 2;
        const printLimitReached = (row.latestCard?.printCount || 0) >= 2;

        return (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {!row.hasPhoto ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleTriggerUpload(row)}
                loading={uploadLoading && uploadingStudent?.id === row.id}
                className="gap-1 text-xs text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 font-semibold"
              >
                <Camera className="h-3.5 w-3.5 text-amber-700" /> Add Photo
              </Button>
            ) : null}

            <Button
              size="sm"
              variant="ghost"
              onClick={() => handlePreviewStudent(row)}
              loading={previewingId === row.id}
              disabled={!row.hasPhoto}
              title={row.hasPhoto ? 'Preview ID Card' : 'Photo required for preview'}
              className="text-xs text-indigo-700 hover:bg-indigo-50"
            >
              <Eye className="h-3.5 w-3.5" /> Preview
            </Button>

            {issueLimitReached ? (
              <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 border border-amber-200">
                Limit reached (2/2)
              </span>
            ) : (
              <Button
                size="sm"
                variant={row.issueCount > 0 ? 'secondary' : 'primary'}
                onClick={() => issueMutation.mutate({ studentId: row.id })}
                loading={issueMutation.isPending && issueMutation.variables?.studentId === row.id}
                disabled={!row.hasPhoto}
                className="gap-1 text-xs font-bold"
              >
                <CreditCard className="h-3.5 w-3.5" />
                {row.issueCount > 0 ? `Reissue (${row.issueCount + 1}/2)` : 'Issue ID'}
              </Button>
            )}

            {row.latestCard?.id && (
              printLimitReached ? (
                <span className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-800 border border-amber-200">
                  Print reached (2/2)
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handlePrintStudent(row)}
                  loading={printingId === row.id}
                  className="gap-1 text-xs text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 font-semibold"
                  title={`Print ID Card (${row.latestCard?.printCount || 0}/2 used)`}
                >
                  <Printer className="h-3.5 w-3.5 text-teal-600" /> Print ID ({row.latestCard?.printCount || 0}/2)
                </Button>
              )
            )}

            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleDownloadStudent(row)}
              loading={downloadingId === row.id}
              disabled={!row.hasPhoto}
              className="gap-1 text-xs"
            >
              <Download className="h-3.5 w-3.5 text-slate-600" /> PDF
            </Button>
          </div>
        );
      },
    },
  ];

  // Columns for History Table in Cohort Slug View
  const historyColumns = [
    {
      key: 'studentId',
      label: 'Student ID',
      render: (row) => <span className="font-mono text-xs font-bold text-slate-800">{row.studentId}</span>,
    },
    {
      key: 'fullName',
      label: 'Student Name',
      render: (row) => <span className="text-xs font-bold text-slate-900">{row.fullName}</span>,
    },
    {
      key: 'issueNumber',
      label: 'Issuance Counter',
      render: (row) => <Badge tone="brand">Issue #{row.issueNumber} of 2</Badge>,
    },
    {
      key: 'printCount',
      label: 'Prints Counter',
      render: (row) => (
        <span className="text-xs font-mono font-semibold text-slate-700">
          {row.printCount || 0} / 2 prints
        </span>
      ),
    },
    {
      key: 'promotions',
      label: 'Promoted Stages',
      render: (row) => {
        const stages = row.promotedStages || [];
        return (
          <div className="flex flex-wrap gap-1">
            {stages.length > 0 ? (
              stages.map((st) => (
                <span
                  key={st}
                  className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-200"
                >
                  ✓ Year {st}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-400">Year 1</span>
            )}
          </div>
        );
      },
    },
    {
      key: 'issuedAt',
      label: 'Issued Date',
      render: (row) => (
        <div>
          <p className="text-xs text-slate-800">{displayDateTime(row.issuedAt)}</p>
          <p className="text-[10px] text-slate-400">{formatEthiopian(row.issuedAt)}</p>
        </div>
      ),
    },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      mobileFull: true,
      render: (row) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            handleDownloadStudent({ id: row.student, latestCard: { id: row.id }, studentId: row.studentId, fullName: row.fullName, hasPhoto: true });
          }}
          className="gap-1 text-xs"
        >
          <Download className="h-3.5 w-3.5" /> Download PDF
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Student ID Cards Management"
        subtitle="Select batch, department, and programme to enter the Programme ID Hub. Issue individual ID cards, preview official 2-sided CR80 cards, and print all student IDs in one bulk landscape PDF."
      />

      {/* =========================================================================
          VIEW 1: ROOT SELECTION & PROGRAMME COHORT CARDS (When no cohort opened)
          ========================================================================= */}
      {!openedCohort ? (
        <div className="space-y-5">
          {/* Cascaded Filter Bar */}
          <div className="grid gap-3 sm:grid-cols-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Batch
              </label>
              <select
                value={filterBatch}
                onChange={(e) => setFilterBatch(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">All Batches</option>
                {uniqueBatches.map((b) => (
                  <option key={b.id} value={b.code || b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Department
              </label>
              <select
                value={filterDept}
                onChange={(e) => {
                  setFilterDept(e.target.value);
                  setFilterProg('');
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Programme
              </label>
              <select
                value={filterProg}
                onChange={(e) => setFilterProg(e.target.value)}
                disabled={!filterDept && filteredPrograms.length === 0}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">All Programmes</option>
                {filteredPrograms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setFilterBatch('');
                  setFilterDept('');
                  setFilterProg('');
                }}
                className="w-full text-xs"
              >
                Reset Filters
              </Button>
            </div>
          </div>

          {/* Programme Cohorts Grid */}
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-1">
              Select Programme to Open ID Hub
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Click on any programme cohort below to open its dedicated slug workbench, list students, and manage ID cards.
            </p>

            {cohortCards.length === 0 ? (
              <Card>
                <CardBody className="py-12 text-center">
                  <CreditCard className="mx-auto h-12 w-12 text-slate-300" />
                  <h3 className="mt-3 text-sm font-semibold text-slate-800">
                    No Programme Cohorts Found
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                    Adjust the filter selections above to find active programme and batch cohorts.
                  </p>
                </CardBody>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cohortCards.map((cohort) => (
                  <Card
                    key={cohort.id}
                    className="group flex flex-col justify-between overflow-hidden border border-slate-200 transition hover:border-brand-400 hover:shadow-md"
                  >
                    <div className="p-5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-800">
                          <Building2 className="h-3.5 w-3.5 text-brand-600" />
                          {cohort.departmentName}
                        </span>
                        <Badge tone={cohort.category === 'extension' ? 'warning' : 'neutral'}>
                          {cohort.batchCode}
                        </Badge>
                      </div>

                      <h3 className="mt-3 text-base font-bold text-slate-900 group-hover:text-brand-700 transition">
                        {cohort.programName}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {cohort.qualificationType?.toUpperCase()} · Batch: {cohort.batchName}
                      </p>
                    </div>

                    <div className="border-t border-slate-100 bg-slate-50/80 p-4">
                      <Button
                        onClick={() => {
                          setOpenedCohort(cohort);
                          setSlugSubTab('students');
                        }}
                        className="w-full gap-2 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs"
                      >
                        <CreditCard className="h-4 w-4" /> Open Programme ID Hub
                        <ChevronRight className="h-4 w-4 ml-auto" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* =========================================================================
            VIEW 2: PROGRAMME SLUG HUB (When a programme cohort is opened)
            ========================================================================= */
        <div className="space-y-5">
          {/* Top Bar with Back Button */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setOpenedCohort(null)}
              className="gap-1.5 text-xs font-semibold"
            >
              <ArrowLeft className="h-4 w-4" /> Back to Programme Selection
            </Button>
            <div className="flex items-center gap-2">
              <Badge tone="brand">
                {openedCohort.departmentName} · {openedCohort.programName}
              </Badge>
              <Badge tone="neutral">
                Batch: {openedCohort.batchCode} ({openedCohort.category})
              </Badge>
            </div>
          </div>

          {/* Top Information / Notification Banners */}
          {allIssued && totalStudents > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50/80 p-4 text-xs font-semibold text-emerald-900 shadow-sm">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <span>
                ✓ All <strong>{totalStudents}</strong> students in this programme have active official ID cards issued!
              </span>
            </div>
          )}

          {cohortData?.bulkLimitReached ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/90 p-4 text-xs font-semibold text-amber-900 shadow-sm">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-amber-950">Bulk Limit Reached (2/2)</h4>
                  <p className="text-amber-800 mt-0.5">
                    This programme cohort has reached the institutional limit of 2 bulk issuance cycles and bulk printing. Bulk issue and mass print actions are now closed.
                  </p>
                </div>
              </div>
              <Button
                onClick={handleBulkDownload}
                loading={bulkDownloading}
                variant="secondary"
                size="sm"
                className="gap-1.5 text-xs font-bold"
              >
                <Download className="h-4 w-4" /> Download PDF Archive
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-300 bg-gradient-to-r from-teal-50 to-blue-50 p-4 text-xs text-teal-950 shadow-sm">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
                  <Printer className="h-5 w-5" />
                </span>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Bulk ID Cards Center (Cycle {cohortData?.bulkCount || 0}/2)
                  </h4>
                  <p className="text-slate-600 mt-0.5">
                    Bulk issue official ID records and generate 2-sided CR80 ID cards onto A4 Landscape sheets ready for immediate mass printing.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {cohortData?.canBulkIssue && (
                  <Button
                    onClick={() =>
                      bulkIssueMutation.mutate({
                        programId: openedCohort.programId,
                        batchId: openedCohort.batchId,
                      })
                    }
                    loading={bulkIssueMutation.isPending}
                    className="gap-2 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-sm"
                  >
                    <CreditCard className="h-4 w-4" /> Bulk Issue All IDs ({cohortData?.bulkCount || 0}/2)
                  </Button>
                )}

                <Button
                  onClick={handleBulkPrint}
                  loading={bulkPrinting}
                  disabled={!allHavePhotos}
                  className="gap-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm"
                  title={allHavePhotos ? 'Print all ID cards in landscape' : 'All students must have uploaded photos'}
                >
                  <Printer className="h-4 w-4" /> Print All (A4 Landscape)
                </Button>

                <Button
                  onClick={handleBulkDownload}
                  loading={bulkDownloading}
                  disabled={!allHavePhotos}
                  variant="secondary"
                  className="gap-2 text-xs font-bold"
                  title={allHavePhotos ? 'Download all ID cards in landscape' : 'All students must have uploaded photos'}
                >
                  <Download className="h-4 w-4" /> Download All (Landscape PDF)
                </Button>
              </div>
            </div>
          )}

          {!allHavePhotos && totalStudents > 0 && (
            <div className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50/70 p-4 text-xs text-amber-900 shadow-sm">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
              <span>
                <strong>{photoCount} of {totalStudents}</strong> students have uploaded photos.{' '}
                {totalStudents - photoCount} student(s) still require a portrait photo before mass printing is unlocked.
              </span>
            </div>
          )}

          {/* Counter Summary Stats Cards */}
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Enrolled</p>
              <p className="text-2xl font-black text-slate-900 mt-1">{totalStudents}</p>
              <p className="text-[11px] text-slate-500">Students in this cohort</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">IDs Issued</p>
              <p className="text-2xl font-black text-emerald-700 mt-1">
                {issuedCount} / {totalStudents}
              </p>
              <p className="text-[11px] text-slate-500">
                {allIssued ? '100% Issued' : `${totalStudents - issuedCount} remaining`}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Photos Uploaded</p>
              <p className="text-2xl font-black text-teal-700 mt-1">
                {photoCount} / {totalStudents}
              </p>
              <p className="text-[11px] text-slate-500">
                {allHavePhotos ? 'All photos verified' : 'Some photos missing'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Max Replacements / Prints</p>
              <p className="text-2xl font-black text-indigo-700 mt-1">2 Max</p>
              <p className="text-[11px] text-slate-500">Institutional limit per student & cohort</p>
            </div>
          </div>

          {/* Sub-Tabs: Students vs Programme History */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => setSlugSubTab('students')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
                slugSubTab === 'students'
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Programme Students List ({students.length})
            </button>
            <button
              type="button"
              onClick={() => setSlugSubTab('history')}
              className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition ${
                slugSubTab === 'history'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span>Programme ID Cards History ({history.length})</span>
            </button>
          </div>

          {/* Tab Content 1: Programme Students List */}
          {slugSubTab === 'students' && (
            <Card>
              <CardHeader
                title={`Students in ${openedCohort.programName}`}
                subtitle="Preview, issue or reissue individual official student ID cards. Maximum 4 issuances per student."
                icon={CreditCard}
              />
              <RegistrarTable
                columns={studentColumns}
                rows={students}
                loading={cohortSummaryQuery.isFetching}
                rowKey={(row) => row.id}
                emptyTitle="No Students Found"
                emptyMessage="No enrolled students found in this programme and batch."
              />
            </Card>
          )}

          {/* Tab Content 2: Programme ID Cards History */}
          {slugSubTab === 'history' && (
            <Card>
              <CardHeader
                title={`Issued ID Cards Audit Trail · ${openedCohort.programName}`}
                subtitle={`${history.length} ID card issuance record(s) recorded in institutional audit.`}
                icon={History}
              />
              <RegistrarTable
                columns={historyColumns}
                rows={history}
                loading={cohortSummaryQuery.isFetching}
                rowKey={(row) => row.id}
                emptyTitle="No History Recorded"
                emptyMessage="No ID cards have been issued yet for this programme."
              />
            </Card>
          )}
        </div>
      )}

      {/* In-App ID Card Modal Preview (Does NOT trigger auto-download) */}
      {previewOpen && previewUrl && (
        <Modal
          open={previewOpen}
          onClose={closePreview}
          title={previewTitle}
          subtitle="Official two-sided horizontal CR80 Student ID card with verified academic progression record."
          size="xl"
          footer={
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    downloadBlob(previewBlob, 'Student_ID_Card.pdf');
                    toast.success('ID Card PDF downloaded.');
                  }}
                  className="gap-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-sm"
                >
                  <Download className="h-4 w-4" /> Download ID Card PDF
                </Button>
                {previewBlob && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      printBlob(previewBlob);
                      toast.success('Sending ID Card to printer...');
                    }}
                    className="gap-1.5 text-xs font-bold"
                  >
                    <Printer className="h-4 w-4" /> Print ID Card
                  </Button>
                )}
              </div>
              <Button variant="secondary" onClick={closePreview}>
                Close Preview
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

      {/* Hidden file input for uploading student photos directly */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileSelected}
      />
    </div>
  );
}
