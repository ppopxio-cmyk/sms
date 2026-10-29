import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Eye, FileText, Plus, Printer, ShieldCheck } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  REGISTRAR,
  displayDateTime,
  downloadFile,
  printFile,
  fileErrorMessage,
  humanStatus,
  toneForStatus,
} from '../../lib/registrar';
import { useDebounced } from '../../lib/useDebounced';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import StudentPicker from '../../components/registrar/StudentPicker';
import { TextAreaField } from '../../components/registrar/Fields';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';

export default function RegistrarTranscripts() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [issuing, setIssuing] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [printingId, setPrintingId] = useState(null);

  const params = useMemo(
    () => ({
      page,
      limit,
      ...(debounced.trim() ? { search: debounced.trim() } : {}),
    }),
    [page, limit, debounced],
  );

  const query = useQuery({
    queryKey: ['registrar', 'transcripts', params],
    queryFn: async () => (await api.get(`${REGISTRAR}/transcripts`, { params })).data,
    placeholderData: (previous) => previous,
  });

  const rows = query.data?.rows ?? [];
  const pagination = query.data?.pagination ?? { page: 1, pages: 1, total: 0, limit };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['registrar', 'transcripts'] });

  const downloadPdf = async (row) => {
    setDownloadingId(row.id);
    try {
      await downloadFile(`${REGISTRAR}/transcripts/${row.id}/pdf`, `Transcript_${row.student?.studentId || row.id}.pdf`);
      toast.success('Transcript PDF generated.');
    } catch (err) {
      toast.error(await fileErrorMessage(err, 'The transcript PDF could not be generated.'));
    } finally {
      setDownloadingId(null);
    }
  };

  const handlePrintTranscript = async (row) => {
    if ((row.printCount || 0) >= 2) {
      toast.error('This transcript has reached its printing limit of 2 times.');
      return;
    }
    setPrintingId(row.id);
    try {
      await printFile(`${REGISTRAR}/transcripts/${row.id}/print`, { method: 'post' });
      toast.success('Print dialog opened. Print counter updated.');
      invalidate();
    } catch (err) {
      toast.error(await fileErrorMessage(err, 'The transcript PDF could not be printed.'));
    } finally {
      setPrintingId(null);
    }
  };

  const columns = [
    {
      key: 'student',
      label: 'Student',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-900">{row.student?.fullName || '—'}</p>
          <p className="text-xs text-slate-500">{row.student?.studentId || '—'}</p>
        </div>
      ),
    },
    {
      key: 'issueNumber',
      label: 'Issue #',
      render: (row) => (
        <span className="inline-flex items-center rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
          Issue {row.issueNumber || 1} of 2
        </span>
      ),
    },
    {
      key: 'prints',
      label: 'Print Counter',
      render: (row) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
          (row.printCount || 0) >= 2 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
        }`}>
          Prints: {row.printCount || 0} / 2
        </span>
      ),
    },
    { key: 'program', label: 'Programme', render: (row) => row.program?.name || '—' },
    { key: 'credits', label: 'Total Credits', render: (row) => row.totalCredits ?? '—' },
    {
      key: 'cgpa',
      label: 'CGPA',
      render: (row) => <span className="font-bold text-slate-900">{row.cgpa ?? '—'}</span>,
    },
    { key: 'purpose', label: 'Purpose', render: (row) => row.purpose || '—' },
    { key: 'status', label: 'Status', render: (row) => <Badge tone={toneForStatus(row.status)}>{humanStatus(row.status)}</Badge> },
    { key: 'issued', label: 'Issued', render: (row) => displayDateTime(row.issuedAt) },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      mobileFull: true,
      render: (row) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => setViewing(row)}>
            <Eye className="h-3.5 w-3.5" /> View
          </Button>
          <Button
            size="sm"
            className="gap-1.5 bg-brand-600 hover:bg-brand-700 text-white font-medium"
            onClick={() => downloadPdf(row)}
            loading={downloadingId === row.id}
          >
            <Download className="h-3.5 w-3.5" /> PDF
          </Button>
          {(row.printCount || 0) >= 2 ? (
            <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 border border-amber-200">
              Limit reached (2/2)
            </span>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handlePrintTranscript(row)}
              loading={printingId === row.id}
              className="gap-1 text-xs text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200"
            >
              <Printer className="h-3.5 w-3.5" /> Print ({row.printCount || 0}/2)
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Transcripts"
        subtitle="Official academic transcripts snapshot published results, stage levels, grades, and cumulative CGPA. Rendered as print-ready PDF and exportable to Word & Excel."
        actions={
          <Button onClick={() => setIssuing(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Issue transcript
          </Button>
        }
      />

      {/* Clean Search Bar: Only search by student name or ID */}
      <Card className="p-4 sm:p-5">
        <SearchInput
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search by student name or student ID..."
          loading={query.isFetching}
        />
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Transcript register</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {pagination.total ?? 0} document{pagination.total === 1 ? '' : 's'}
            </p>
          </div>
          <FileText className="h-4 w-4 text-slate-300" />
        </div>
        <RegistrarTable
          columns={columns}
          rows={rows}
          loading={query.isLoading}
          error={query.error ? query.error?.response?.data?.message || 'Transcripts could not be loaded.' : null}
          onRetry={query.refetch}
          rowKey={(row) => row.id}
          noResults={Boolean(debounced.trim())}
          emptyTitle="No transcripts found"
          emptyMessage="Issue a transcript for an enrolled or graduated student with published course results."
        />
        <div className="px-5 pb-4">
          <Pagination
            page={pagination.page}
            pages={pagination.pages}
            total={pagination.total}
            limit={pagination.limit}
            onPage={setPage}
            onLimit={(value) => {
              setLimit(value);
              setPage(1);
            }}
          />
        </div>
      </Card>

      <IssueTranscriptModal open={issuing} onClose={() => setIssuing(false)} onSaved={invalidate} />

      {/* Transcript Detail / Preview Modal */}
      {viewing && (
        <TranscriptDetailModal
          transcript={viewing}
          onClose={() => setViewing(null)}
          onDownload={downloadPdf}
          onPrint={handlePrintTranscript}
        />
      )}
    </div>
  );
}

function IssueTranscriptModal({ open, onClose, onSaved }) {
  const [student, setStudent] = useState(null);
  const [purpose, setPurpose] = useState('');
  const [selectedLevels, setSelectedLevels] = useState([]);
  const [error, setError] = useState('');

  const countQuery = useQuery({
    queryKey: ['registrar', 'transcript-count', student?.id],
    queryFn: async () => (await api.get(`${REGISTRAR}/transcripts/student/${student.id}/count`)).data,
    enabled: Boolean(student?.id && open),
  });

  const gpaQuery = useQuery({
    queryKey: ['registrar', 'gpa-preview', student?.id],
    queryFn: async () => (await api.get(`${REGISTRAR}/gpa-cgpa`, { params: { student: student.id } })).data,
    enabled: Boolean(student?.id && open),
  });

  const availableStages = useMemo(() => {
    return gpaQuery.data?.stageBreakdown || [];
  }, [gpaQuery.data?.stageBreakdown]);

  useEffect(() => {
    if (open) {
      setStudent(null);
      setPurpose('');
      setSelectedLevels([]);
      setError('');
    }
  }, [open]);

  useEffect(() => {
    if (availableStages.length) {
      // By default select all available stages
      setSelectedLevels(availableStages.map((s) => s.level));
    } else {
      setSelectedLevels([]);
    }
  }, [availableStages]);

  const toggleLevel = (level) => {
    setSelectedLevels((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level].sort((a, b) => a - b),
    );
  };

  const toggleAll = () => {
    if (selectedLevels.length === availableStages.length) {
      setSelectedLevels([]);
    } else {
      setSelectedLevels(availableStages.map((s) => s.level));
    }
  };

  const issue = useMutation({
    mutationFn: async () => {
      if (!student) throw new Error('Choose a student.');
      if (countQuery.data && !countQuery.data.canIssue) {
        throw new Error('This student has already reached the maximum issuance limit of 2 transcripts.');
      }
      if (!selectedLevels.length) throw new Error('Select at least one Year/Level to include in the transcript.');
      return (
        await api.post(`${REGISTRAR}/transcripts`, {
          student: student.id,
          purpose: purpose.trim(),
          selectedLevels,
        })
      ).data;
    },
    onSuccess: () => {
      toast.success('Official transcript issued.');
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'The transcript could not be issued.');
      setError(message);
      toast.error(message);
    },
  });

  const studentHasResults = Boolean(gpaQuery.data?.courses?.length);
  const canIssueByCount = countQuery.data ? countQuery.data.count < 2 : true;

  return (
    <Modal
      open={open}
      title="Issue official transcript"
      subtitle="Select the years or levels to include, or issue for all completed stages. Maximum 2 issuances per student."
      onClose={issue.isPending ? undefined : onClose}
      dismissible={!issue.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={issue.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => issue.mutate()}
            loading={issue.isPending}
            disabled={!student || (gpaQuery.isSuccess && !studentHasResults) || !selectedLevels.length || !canIssueByCount}
          >
            Issue transcript
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}

        <StudentPicker
          status="all"
          value={student}
          onChange={(val) => {
            setStudent(val);
            setError('');
          }}
          hint="Search both graduated and active students by name or student ID"
        />

        {countQuery.data && (
          <div
            className={`rounded-xl p-3 text-xs font-semibold flex items-center justify-between ${
              countQuery.data.count < 2
                ? 'bg-blue-50 text-blue-800 border border-blue-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            <span>
              Transcript Issuance Counter: <strong>{countQuery.data.count} of 2</strong>
            </span>
            <span>{countQuery.data.count < 2 ? `${Math.max(0, 2 - countQuery.data.count)} remaining` : 'Limit reached (Max 2)'}</span>
          </div>
        )}

        {student && (
          <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
            {gpaQuery.isLoading ? (
              <p className="text-xs text-slate-500">Checking student's academic records...</p>
            ) : studentHasResults ? (
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Programme:</span>
                  <span className="text-slate-900">{gpaQuery.data?.student?.program || '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Cumulative CGPA:</span>
                  <span className="text-sm font-bold text-brand-700">{gpaQuery.data?.cgpa ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700">Credits / Courses:</span>
                  <span className="text-slate-900">
                    {gpaQuery.data?.credits ?? 0} credits ({gpaQuery.data?.courseCount ?? 0} courses)
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs font-medium text-amber-700">
                ⚠️ This student has 0 published results. Publish course results from the Results page first.
              </p>
            )}
          </div>
        )}

        {student && studentHasResults && availableStages.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Select Year / Level to Include
              </span>
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs font-medium text-brand-600 hover:text-brand-700 underline"
              >
                {selectedLevels.length === availableStages.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {availableStages.map((stage) => {
                const checked = selectedLevels.includes(stage.level);
                return (
                  <label
                    key={stage.level}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition ${
                      checked ? 'border-brand-300 bg-brand-50/60' : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleLevel(stage.level)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-800">
                        Year / Level {stage.level}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {stage.courseCount} course{stage.courseCount === 1 ? '' : 's'} · {stage.credits} credits · GPA: <span className="font-semibold text-slate-700">{stage.gpa ?? '—'}</span>
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400">
              Pick all years, a single year, or any combination of years to export.
            </p>
          </div>
        )}

        <TextAreaField
          label="Purpose"
          rows={3}
          value={purpose}
          onChange={(event) => setPurpose(event.target.value)}
          placeholder="e.g. Further study application, Scholarship verification"
          hint="Optional; printed on the document and stored with the official record."
        />

        <p className="rounded-xl bg-sky-50 px-3.5 py-3 text-xs leading-relaxed text-sky-800">
          The transcript seals all verified stage GPAs, cumulative CGPA, and course grades into a tamper-evident record with an official verification hash.
        </p>
      </div>
    </Modal>
  );
}

function TranscriptDetailModal({ transcript, onClose, onDownload, onPrint }) {
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const handlePdf = async () => {
    setDownloading(true);
    try {
      await onDownload(transcript);
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await onPrint(transcript);
    } finally {
      setPrinting(false);
    }
  };

  const courses = transcript.academicSnapshot || [];

  return (
    <Modal
      open={Boolean(transcript)}
      title="Official academic transcript details"
      subtitle={`${transcript.student?.fullName || transcript.studentSnapshot?.fullName} · ${transcript.student?.studentId || transcript.studentSnapshot?.studentId}`}
      onClose={onClose}
      className="max-w-3xl"
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>ID: <code className="font-mono text-slate-700">{transcript.verificationId}</code></span>
            <span className="ml-2 font-semibold">Prints: {transcript.printCount || 0}/2</span>
          </div>
          <div className="flex items-center gap-2">
            {(transcript.printCount || 0) >= 2 ? (
              <span className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 border border-amber-200">
                Print Limit Reached (2/2)
              </span>
            ) : (
              <Button size="sm" variant="secondary" onClick={handlePrint} loading={printing} className="gap-1 text-indigo-700">
                <Printer className="h-3.5 w-3.5" /> Print Transcript
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={handlePdf} loading={downloading}>
              <Download className="h-3.5 w-3.5" /> Download PDF
            </Button>
            <Button size="sm" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-slate-500">Programme</p>
            <p className="text-sm font-semibold text-slate-900">{transcript.program?.name || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Cumulative CGPA</p>
            <p className="text-lg font-bold text-brand-700">{transcript.cgpa ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Total Credits</p>
            <p className="text-sm font-semibold text-slate-900">{transcript.totalCredits ?? '—'}</p>
          </div>
        </div>

        {transcript.purpose && (
          <p className="text-xs text-slate-600">
            <span className="font-semibold text-slate-800">Purpose: </span>
            {transcript.purpose}
          </p>
        )}

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Academic Courses Snapshot ({courses.length})
          </h4>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-700">
                <tr>
                  <th className="p-2.5 font-semibold">Course</th>
                  <th className="p-2.5 font-semibold">Stage</th>
                  <th className="p-2.5 font-semibold">Academic Year</th>
                  <th className="p-2.5 text-right font-semibold">Credits</th>
                  <th className="p-2.5 text-right font-semibold">Mark</th>
                  <th className="p-2.5 text-center font-semibold">Grade</th>
                  <th className="p-2.5 text-right font-semibold">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {courses.length ? (
                  courses.map((c, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="p-2.5">
                        <span className="font-semibold text-slate-900">{c.code}</span>
                        <p className="text-[11px] text-slate-500">{c.title}</p>
                      </td>
                      <td className="p-2.5 text-slate-600">{c.level != null ? `Stage ${c.level}` : '—'}</td>
                      <td className="p-2.5 text-slate-600">{c.academicYear || '—'}</td>
                      <td className="p-2.5 text-right font-medium text-slate-800">{c.credits ?? '—'}</td>
                      <td className="p-2.5 text-right text-slate-800">{c.mark != null ? c.mark : '—'}</td>
                      <td className="p-2.5 text-center font-bold text-slate-900">{c.letterGrade || '—'}</td>
                      <td className="p-2.5 text-right font-mono text-slate-700">{c.gradePoint != null ? Number(c.gradePoint).toFixed(2) : '—'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-slate-500">
                      No course records found in this transcript snapshot.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}
