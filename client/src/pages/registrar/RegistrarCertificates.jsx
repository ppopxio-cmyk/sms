import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Eye, FileCheck2, Plus, Printer, ShieldCheck, TriangleAlert } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  REGISTRAR,
  displayDateTime,
  downloadFile,
  printBlob,
  printFile,
  fileErrorMessage,
  humanStatus,
  toneForStatus,
} from '../../lib/registrar';
import { formatEthiopian } from '../../lib/ethiopianDate';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import ConfirmDialog from '../../components/registrar/ConfirmDialog';
import StudentPicker from '../../components/registrar/StudentPicker';
import { TextAreaField } from '../../components/registrar/Fields';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';

function newKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `certificate-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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

export default function RegistrarCertificates() {
  const queryClient = useQueryClient();
  const [searchDraft, setSearchDraft] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [issuing, setIssuing] = useState(false);
  const [revoking, setRevoking] = useState(null);
  const [reissuing, setReissuing] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [printingId, setPrintingId] = useState(null);

  const meta = useQuery({
    queryKey: ['registrar', 'certificate-meta'],
    queryFn: async () => (await api.get(`${REGISTRAR}/certificates/meta`)).data,
    staleTime: 60_000,
  });

  const params = useMemo(() => ({
    page,
    limit,
    ...(searchTerm.trim() ? { search: searchTerm.trim() } : {}),
    sort: 'issuedAt',
    order: 'desc',
  }), [page, limit, searchTerm]);

  const query = useQuery({
    queryKey: ['registrar', 'certificates', params],
    queryFn: async () => (await api.get(`${REGISTRAR}/certificates`, { params })).data,
    enabled: hasSearched,
    placeholderData: (previous) => previous,
  });

  const handleShowSearch = (e) => {
    e?.preventDefault?.();
    setSearchTerm(searchDraft.trim());
    setHasSearched(true);
    setPage(1);
  };

  const handleResetSearch = () => {
    setSearchDraft('');
    setSearchTerm('');
    setHasSearched(false);
    setPage(1);
  };

  const rows = query.data?.rows ?? [];
  const pagination = query.data?.pagination ?? { page: 1, pages: 1, total: 0, limit };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['registrar', 'certificates'] });
    queryClient.invalidateQueries({ queryKey: ['registrar', 'dashboard'] });
  };

  const revoke = useMutation({
    mutationFn: async (reason) => (await api.post(`${REGISTRAR}/certificates/${revoking.id}/revoke`, { reason })).data,
    onSuccess: () => {
      toast.success('Certificate revoked. The number and history are preserved.');
      setRevoking(null);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'The certificate could not be revoked.')),
  });

  const reissue = useMutation({
    mutationFn: async ({ reason, idempotencyKey }) => (await api.post(`${REGISTRAR}/certificates/${reissuing.id}/reissue`, { reason, idempotencyKey })).data,
    onSuccess: (data) => {
      toast.success(`Replacement certificate issued${data?.certificate?.certificateNumber ? `: ${data.certificate.certificateNumber}` : ''}.`);
      setReissuing(null);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'The certificate could not be reissued.')),
  });

  const download = async (row) => {
    setDownloadingId(row.id);
    try {
      await downloadFile(`${REGISTRAR}/certificates/${row.id}/pdf`, `Certificate_${row.certificateNumber || row.id}.pdf`);
      toast.success('Certificate PDF generated.');
    } catch (err) {
      toast.error(await fileErrorMessage(err, 'The certificate PDF could not be generated.'));
    } finally {
      setDownloadingId(null);
    }
  };

  const handlePrintCertificate = async (row) => {
    if ((row.printCount || 0) >= 2) {
      toast.error('This certificate has reached its printing limit of 2 times.');
      return;
    }
    setPrintingId(row.id);
    try {
      const res = await api.post(`${REGISTRAR}/certificates/${row.id}/print`, {}, { responseType: 'blob' });
      printBlob(res.data);
      toast.success('Print dialog opened. Print counter updated.');
      invalidate();
    } catch (err) {
      toast.error(await fileErrorMessage(err, 'The certificate PDF could not be printed.'));
    } finally {
      setPrintingId(null);
    }
  };

  const template = meta.data?.template;

  const columns = [
    {
      key: 'certificate',
      label: 'Certificate',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-900">{row.certificateNumber}</p>
          <p className="text-xs text-slate-500">{row.verificationId}</p>
        </div>
      ),
    },
    {
      key: 'student',
      label: 'Student',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-800">{row.student?.fullName || '—'}</p>
          <p className="text-xs text-slate-500">{row.student?.studentId || '—'}</p>
        </div>
      ),
    },
    { key: 'program', label: 'Programme', render: (row) => row.program?.name || '—' },
    { key: 'cgpa', label: 'CGPA', render: (row) => row.cgpa ?? '—' },
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
    { key: 'status', label: 'Status', render: (row) => <Badge tone={toneForStatus(row.status)}>{humanStatus(row.status)}</Badge> },
    { key: 'issued', label: 'Issued', render: (row) => displayDateTime(row.issuedAt) },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      mobileFull: true,
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setDetailId(row.id)} aria-label="View certificate"><Eye className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="secondary" onClick={() => download(row)} loading={downloadingId === row.id}><Download className="h-3.5 w-3.5" /> PDF</Button>
          {(row.printCount || 0) >= 2 ? (
            <span className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800 border border-amber-200">
              Limit reached (2/2)
            </span>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handlePrintCertificate(row)}
              loading={printingId === row.id}
              className="gap-1 text-xs text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100 border border-indigo-200"
            >
              <Printer className="h-3.5 w-3.5" /> Print ({row.printCount || 0}/2)
            </Button>
          )}
          {row.status === 'issued' ? <Button size="sm" variant="ghost" onClick={() => setRevoking(row)}>Revoke</Button> : null}
          {row.status === 'revoked' ? <Button size="sm" variant="secondary" onClick={() => setReissuing(row)}>Reissue</Button> : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Certificates"
        subtitle="One premium PDF combines the certificate page and the course-by-course academic record. Issuance re-checks eligibility and stores an immutable snapshot."
        actions={<Button onClick={() => setIssuing(true)} className="gap-2"><Plus className="h-4 w-4" /> Issue certificate</Button>}
      />

      {!meta.isLoading && !template ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p><strong className="font-semibold">Certificate template not configured.</strong> Issuance is blocked until an active template with the seal, signature and signatory is provisioned.</p>
        </div>
      ) : null}

      {template ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="glass rounded-2xl p-4"><p className="text-[10px] uppercase tracking-wider text-slate-400">Template</p><p className="mt-1 text-sm font-semibold text-slate-900">{template.name} · v{template.version}</p></div>
          <div className="glass rounded-2xl p-4"><p className="text-[10px] uppercase tracking-wider text-slate-400">Photo policy</p><p className="mt-1 text-sm font-semibold text-slate-900">{humanStatus(template.photoPolicy)}</p></div>
          <div className="glass rounded-2xl p-4"><p className="text-[10px] uppercase tracking-wider text-slate-400">Signatory</p><p className="mt-1 text-sm font-semibold text-slate-900">{template.signatoryName || '—'}</p><p className="text-xs text-slate-500">{template.signatoryTitle}</p></div>
          <div className="glass rounded-2xl p-4"><p className="text-[10px] uppercase tracking-wider text-slate-400">Verification</p><p className="mt-1 text-sm font-semibold text-slate-900">{template.verificationBaseUrl ? 'Configured' : 'Missing'}</p></div>
        </div>
      ) : null}

      {/* On-Demand Search Bar (No status or year dropdowns) */}
      <Card className="p-4 sm:p-5">
        <form onSubmit={handleShowSearch} className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <input
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="Search by certificate number, student ID, or student name..."
              className="focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="submit"
              className="flex-1 sm:flex-initial gap-2 bg-brand-600 hover:bg-brand-700 text-white font-bold h-11 px-5"
              loading={query.isFetching}
            >
              Show Certificates
            </Button>
            {hasSearched ? (
              <Button
                type="button"
                variant="secondary"
                onClick={handleResetSearch}
                className="h-11 px-4 text-slate-600"
              >
                Clear
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      {/* Certificate Register History — Visible only when Show is clicked */}
      {hasSearched ? (
        <Card>
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Certificate register history</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {pagination.total ?? 0} certificate{pagination.total === 1 ? '' : 's'} found for "{searchTerm}"
              </p>
            </div>
            <FileCheck2 className="h-4 w-4 text-slate-300" />
          </div>
          <RegistrarTable
            columns={columns}
            rows={rows}
            loading={query.isLoading}
            error={query.error ? query.error?.response?.data?.message || 'Certificates could not be loaded.' : null}
            onRetry={query.refetch}
            rowKey={(row) => row.id}
            noResults={Boolean(searchTerm.trim())}
            emptyTitle="No certificates match your search"
            emptyMessage={`No certificate found matching "${searchTerm}". Check the certificate number or student ID.`}
          />
          <div className="px-5 pb-4">
            <Pagination
              page={pagination.page}
              pages={pagination.pages}
              total={pagination.total}
              limit={pagination.limit}
              onPage={setPage}
              onLimit={(value) => { setLimit(value); setPage(1); }}
            />
          </div>
        </Card>
      ) : (
        <Card className="py-12 text-center border-dashed">
          <div className="max-w-md mx-auto space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 mx-auto">
              <FileCheck2 className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Search Certificate Register</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Enter a certificate number, student ID, or student name in the search box above and click <strong>Show Certificates</strong> to view official issued certificate records and histories.
            </p>
          </div>
        </Card>
      )}

      <IssueCertificateModal open={issuing} onClose={() => setIssuing(false)} onSaved={invalidate} />
      <CertificateDetail
        certificateId={detailId}
        onClose={() => setDetailId(null)}
        onPrint={(c) => handlePrintCertificate(c)}
      />
      <ConfirmDialog
        open={Boolean(revoking)}
        title="Revoke this certificate?"
        message={revoking ? `${revoking.certificateNumber} · ${revoking.student?.fullName}. The certificate becomes invalid and the public verification page will report it as revoked.` : ''}
        confirmLabel="Revoke certificate"
        tone="danger"
        loading={revoke.isPending}
        reason={{ label: 'Reason', minLength: 5, placeholder: 'Why is this certificate being revoked?' }}
        onClose={() => setRevoking(null)}
        onConfirm={(reason) => revoke.mutate(reason)}
      />
      <ReissueModal certificate={reissuing} loading={reissue.isPending} onClose={() => setReissuing(null)} onConfirm={(values) => reissue.mutate(values)} />
    </div>
  );
}

function IssueCertificateModal({ open, onClose, onSaved }) {
  const [student, setStudent] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newKey());

  useEffect(() => {
    if (open) {
      if (previewData?.url) URL.revokeObjectURL(previewData.url);
      setStudent(null);
      setConfirmed(false);
      setError('');
      setPreviewData(null);
      setIdempotencyKey(newKey());
    }
  }, [open]);

  const issue = useMutation({
    mutationFn: async () => {
      if (!student) throw new Error('Choose a student.');
      if (!confirmed) throw new Error('Confirm that eligibility was checked before issuing.');
      return (await api.post(`${REGISTRAR}/certificates/issue`, {
        student: student.id,
        idempotencyKey,
        confirm: true,
      })).data;
    },
    onSuccess: (data) => {
      toast.success(`Certificate issued: ${data.certificate?.certificateNumber || 'record created'}.`);
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
    if (!student) {
      setError('Choose a student before previewing.');
      return;
    }
    setPreviewing(true);
    setError('');
    try {
      const res = await api.post(`${REGISTRAR}/certificates/preview`, { student: student.id }, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPreviewData({ blob, url });
    } catch (err) {
      setError(await fileErrorMessage(err, 'The certificate preview could not be generated.'));
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Issue official graduation certificate"
      subtitle={student ? `${student.fullName} · ${student.studentId || ''}` : 'Select a graduated student to issue their official certificate.'}
      size="xl"
      onClose={onClose}
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
                className="gap-2 text-indigo-700 font-semibold"
                onClick={() => printBlob(previewData.blob)}
              >
                <Printer className="h-4 w-4" /> Print PDF
              </Button>
              <Button
                variant="secondary"
                className="gap-2 text-brand-700 font-semibold"
                onClick={() => {
                  downloadBlob(previewData.blob, `Certificate_${student?.studentId || 'preview'}.pdf`);
                  toast.success('Certificate PDF downloaded.');
                }}
              >
                <Download className="h-4 w-4" /> Download PDF
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={preview} loading={previewing} disabled={!student}>
              <Eye className="h-4 w-4" /> Preview PDF
            </Button>
          )}
          <Button onClick={() => issue.mutate()} loading={issue.isPending} disabled={!student || !confirmed}>
            Issue certificate
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <StudentPicker
          status="graduated"
          value={student}
          onChange={(value) => { setStudent(value); setConfirmed(false); setError(''); setPreviewData(null); }}
          hint="Search only graduated students by student ID or name"
        />

        {previewData ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Official Certificate Preview</span>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs text-rose-600 hover:bg-rose-50"
                onClick={() => setPreviewData(null)}
              >
                Hide Preview
              </Button>
            </div>
            <div className="h-[460px] w-full rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 shadow-inner">
              <iframe
                src={previewData.url}
                className="w-full h-full border-0"
                title="Certificate PDF Preview"
              />
            </div>
          </div>
        ) : null}
        <div className="rounded-2xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600">
          <p className="flex items-center gap-2 font-semibold text-slate-800"><ShieldCheck className="h-4 w-4 text-brand-600" /> Issuance checks</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Re-evaluates curriculum completion and published marks before issuing.</li>
            <li>Assigns a unique institutional certificate number and serial verification reference.</li>
            <li>Enforces a maximum of 2 print/issue copies per record.</li>
          </ul>
        </div>
        <label className="flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm text-brand-900">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-brand-300 text-brand-600"
          />
          <span>I have reviewed the student record and confirm they are officially eligible for this certificate.</span>
        </label>
      </div>
    </Modal>
  );
}

function ReissueModal({ certificate, loading, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (certificate) {
      setReason('');
      setError('');
    }
  }, [certificate]);

  return (
    <Modal
      open={Boolean(certificate)}
      title="Reissue certificate"
      subtitle={certificate ? `${certificate.certificateNumber} remains in history as revoked. A new number is issued only after a fresh eligibility check.` : ''}
      onClose={loading ? undefined : onClose}
      dismissible={!loading}
      footer={<><Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button><Button onClick={() => {
        if (reason.trim().length < 5) { setError('Write at least 5 characters.'); return; }
        onConfirm?.({ reason: reason.trim(), idempotencyKey: newKey() });
      }} loading={loading}>Reissue certificate</Button></>}
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <TextAreaField label="Reason for reissue" rows={3} value={reason} onChange={(event) => { setReason(event.target.value); setError(''); }} required />
      </div>
    </Modal>
  );
}

function CertificateDetail({ certificateId, onClose, onPrint }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['registrar', 'certificate', certificateId],
    queryFn: async () => (await api.get(`${REGISTRAR}/certificates/${certificateId}`)).data,
    enabled: Boolean(certificateId),
  });
  const row = query.data?.certificate;
  const [printing, setPrinting] = useState(false);

  const handlePrint = async () => {
    if (!row) return;
    if ((row.printCount || 0) >= 2) {
      toast.error('This certificate has reached its printing limit of 2 times.');
      return;
    }
    setPrinting(true);
    try {
      const res = await api.post(`${REGISTRAR}/certificates/${row.id}/print`, {}, { responseType: 'blob' });
      printBlob(res.data);
      toast.success('Print dialog opened. Print counter recorded.');
      queryClient.invalidateQueries({ queryKey: ['registrar', 'certificate', certificateId] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'certificates'] });
    } catch (err) {
      toast.error(await fileErrorMessage(err, 'The certificate PDF could not be printed.'));
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Modal
      open={Boolean(certificateId)}
      title={row?.certificateNumber || 'Certificate detail'}
      subtitle={row ? `${row.studentSnapshot?.fullName || row.student?.fullName || ''} · ${row.programSnapshot?.name || ''}` : 'Loading the stored snapshot.'}
      size="lg"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-slate-500 font-medium">
            {row ? `Prints recorded: ${row.printCount || 0} / 2` : null}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>Close</Button>
            {row ? (
              (row.printCount || 0) >= 2 ? (
                <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 border border-amber-200">
                  Print Limit Reached (2/2)
                </span>
              ) : (
                <Button
                  onClick={handlePrint}
                  loading={printing}
                  className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs"
                >
                  <Printer className="h-4 w-4" /> Print Certificate ({row.printCount || 0}/2)
                </Button>
              )
            ) : null}
          </div>
        </div>
      }
    >
      {query.isLoading ? <p className="py-6 text-center text-sm text-slate-500">Loading…</p> : query.error ? (
        <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{query.error?.response?.data?.message || 'The certificate could not be loaded.'}</p>
      ) : row ? (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-400">Status</p><Badge tone={toneForStatus(row.status)}>{humanStatus(row.status)}</Badge></div>
            <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-400">CGPA</p><p className="text-lg font-bold text-slate-900">{row.cgpa ?? '—'}</p></div>
            <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-400">Credits</p><p className="text-lg font-bold text-slate-900">{row.earnedCredits ?? 0} / {row.requiredCredits ?? 0}</p></div>
            <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-400">Print Counter</p><p className="text-lg font-bold text-indigo-700">{row.printCount || 0} / 2</p></div>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-slate-400">Student</dt><dd className="text-slate-700 font-semibold">{row.studentSnapshot?.fullName} · {row.studentSnapshot?.studentId}</dd></div>
            <div><dt className="text-xs text-slate-400">Programme</dt><dd className="text-slate-700">{row.programSnapshot?.code} · {row.programSnapshot?.name}</dd></div>
            <div><dt className="text-xs text-slate-400">Department</dt><dd className="text-slate-700">{row.departmentSnapshot?.name || '—'}</dd></div>
            <div><dt className="text-xs text-slate-400">Academic year</dt><dd className="text-slate-700">{row.academicYearLabel || row.academicYear?.label || '—'}</dd></div>
            <div><dt className="text-xs text-slate-400">Completion date (Eth)</dt><dd className="font-medium text-slate-800">{row.completionDate ? formatEthiopian(row.completionDate) : '—'}</dd></div>
            <div><dt className="text-xs text-slate-400">Issued</dt><dd className="text-slate-700">{displayDateTime(row.issuedAt)}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-slate-400">Verification reference</dt><dd className="break-all font-mono text-slate-700">{row.verificationId}</dd></div>
            {row.revokeReason ? <div className="sm:col-span-2"><dt className="text-xs text-slate-400">Revocation reason</dt><dd className="text-rose-700">{row.revokeReason}</dd></div> : null}
          </dl>
          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Courses & Marks Breakdown ({row.academicSnapshot?.length ?? 0} Courses)
              </span>
              <span className="text-xs text-slate-500 font-medium">All Programme Years / Levels</span>
            </div>
            {row.academicSnapshot?.length ? (
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-semibold sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2">Code</th>
                      <th className="px-3 py-2">Course Title</th>
                      <th className="px-3 py-2 text-center">Year/Level</th>
                      <th className="px-3 py-2 text-center">Credits</th>
                      <th className="px-3 py-2 text-right">Mark</th>
                      <th className="px-3 py-2 text-center">Grade</th>
                      <th className="px-3 py-2 text-right">Points</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {row.academicSnapshot.map((c, i) => (
                      <tr key={c.code || i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono font-bold text-brand-700">{c.code}</td>
                        <td className="px-3 py-2 font-medium text-slate-800">{c.title}</td>
                        <td className="px-3 py-2 text-center text-slate-600">Year {c.level || 1}</td>
                        <td className="px-3 py-2 text-center text-slate-700">{c.credits ?? c.creditHours ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900">{c.mark ?? c.totalMark ?? '—'}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-bold text-indigo-700">
                            {c.letterGrade || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-slate-700">{c.gradePoint != null ? Number(c.gradePoint).toFixed(2) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-4 text-xs text-slate-500">No course entries recorded.</p>
            )}
          </div>
          {row.pdfGeneratedAt ? <p className="text-xs text-slate-400">PDF generated {displayDateTime(row.pdfGeneratedAt)}.</p> : (
            <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-xs text-amber-900">This record has no generated PDF yet. Downloading or reissuing will generate it from the stored snapshot.</p>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
