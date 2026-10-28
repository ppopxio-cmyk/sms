import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, Eye, FileCheck2, Plus, ShieldCheck, TriangleAlert } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  REGISTRAR,
  displayDateTime,
  downloadFile,
  fileErrorMessage,
  humanStatus,
  toneForStatus,
} from '../../lib/registrar';
import { formatEthiopian } from '../../lib/ethiopianDate';
import { useDebounced } from '../../lib/useDebounced';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import ConfirmDialog from '../../components/registrar/ConfirmDialog';
import StudentPicker from '../../components/registrar/StudentPicker';
import { SelectField, TextAreaField } from '../../components/registrar/Fields';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';

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
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [status, setStatus] = useState('all');
  const [academicYear, setAcademicYear] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [issuing, setIssuing] = useState(false);
  const [revoking, setRevoking] = useState(null);
  const [reissuing, setReissuing] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const options = useQuery({
    queryKey: ['registrar', 'students', 'options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/options`)).data,
    staleTime: 5 * 60_000,
  });
  const meta = useQuery({
    queryKey: ['registrar', 'certificate-meta'],
    queryFn: async () => (await api.get(`${REGISTRAR}/certificates/meta`)).data,
    staleTime: 60_000,
  });

  const params = useMemo(() => ({
    page,
    limit,
    ...(debounced.trim() ? { search: debounced.trim() } : {}),
    ...(status !== 'all' ? { status } : {}),
    ...(academicYear ? { academicYear } : {}),
    sort: 'issuedAt',
    order: 'desc',
  }), [page, limit, debounced, status, academicYear]);

  const query = useQuery({
    queryKey: ['registrar', 'certificates', params],
    queryFn: async () => (await api.get(`${REGISTRAR}/certificates`, { params })).data,
    placeholderData: (previous) => previous,
  });

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

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <SearchInput value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search certificate number, student name or ID" loading={query.isFetching} />
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="all">All statuses</option>
              {['issued', 'revoked', 'reissued'].map((value) => <option key={value} value={value}>{humanStatus(value)}</option>)}
            </SelectField>
            <SelectField label="Academic year" value={academicYear} onChange={(event) => { setAcademicYear(event.target.value); setPage(1); }}>
              <option value="">All years</option>
              {(options.data?.academicYears || []).map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
            </SelectField>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Certificate register</h2>
            <p className="mt-0.5 text-xs text-slate-500">{pagination.total ?? 0} certificate{pagination.total === 1 ? '' : 's'}</p>
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
          noResults={Boolean(debounced.trim() || status !== 'all' || academicYear)}
          emptyTitle="No certificates issued"
          emptyMessage="Issue a certificate for an eligible student."
        />
        <div className="px-5 pb-4">
          <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPage={setPage} onLimit={(value) => { setLimit(value); setPage(1); }} />
        </div>
      </Card>

      <IssueCertificateModal open={issuing} onClose={() => setIssuing(false)} onSaved={invalidate} />
      <CertificateDetail certificateId={detailId} onClose={() => setDetailId(null)} />
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
      const url = URL.createObjectURL(res.data);
      setPreviewData({ url, blob: res.data });
      toast.success('Certificate preview loaded.');
    } catch (err) {
      const message = await fileErrorMessage(err, 'The preview could not be generated.');
      setError(message);
      toast.error(message);
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Issue certificate"
      subtitle="The server recomputes eligibility from published results and the current policy. The client cannot confirm eligibility on its own."
      size={previewData ? 'xl' : 'lg'}
      onClose={issue.isPending ? undefined : onClose}
      dismissible={!issue.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={issue.isPending}>
            Cancel
          </Button>
          {previewData ? (
            <Button
              variant="secondary"
              className="gap-2 text-brand-700"
              onClick={() => {
                downloadBlob(previewData.blob, `Certificate_${student?.studentId || 'preview'}.pdf`);
                toast.success('Certificate PDF downloaded.');
              }}
            >
              <Download className="h-4 w-4" /> Download PDF
            </Button>
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
          value={student}
          onChange={(value) => { setStudent(value); setConfirmed(false); setError(''); setPreviewData(null); }}
          status="graduated"
          hint="Only graduated students are eligible for certificate issuance"
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
            <li>Published results, required credits and the programme graduation policy.</li>
            <li>The active certificate template, signatory and photo policy (no seal required).</li>
            <li>The student's completion date and an available certificate number.</li>
          </ul>
          <p className="mt-2">An ineligible student or missing configuration blocks issuance; nothing is fabricated.</p>
        </div>
        <label className="flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm text-brand-900">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-brand-300 text-brand-600" />
          <span>I have verified the student record and want to issue the official certificate and academic record.</span>
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

function CertificateDetail({ certificateId, onClose }) {
  const query = useQuery({
    queryKey: ['registrar', 'certificate', certificateId],
    queryFn: async () => (await api.get(`${REGISTRAR}/certificates/${certificateId}`)).data,
    enabled: Boolean(certificateId),
  });
  const row = query.data?.certificate;

  return (
    <Modal
      open={Boolean(certificateId)}
      title={row?.certificateNumber || 'Certificate detail'}
      subtitle={row ? `${row.studentSnapshot?.fullName || row.student?.fullName || ''} · ${row.programSnapshot?.name || ''}` : 'Loading the stored snapshot.'}
      size="lg"
      onClose={onClose}
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      {query.isLoading ? <p className="py-6 text-center text-sm text-slate-500">Loading…</p> : query.error ? (
        <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{query.error?.response?.data?.message || 'The certificate could not be loaded.'}</p>
      ) : row ? (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-400">Status</p><Badge tone={toneForStatus(row.status)}>{humanStatus(row.status)}</Badge></div>
            <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-400">CGPA</p><p className="text-lg font-bold text-slate-900">{row.cgpa ?? '—'}</p></div>
            <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] uppercase tracking-wider text-slate-400">Credits</p><p className="text-lg font-bold text-slate-900">{row.earnedCredits ?? 0} / {row.requiredCredits ?? 0}</p></div>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs text-slate-400">Student</dt><dd className="text-slate-700">{row.studentSnapshot?.fullName} · {row.studentSnapshot?.studentId}</dd></div>
            <div><dt className="text-xs text-slate-400">Programme</dt><dd className="text-slate-700">{row.programSnapshot?.code} · {row.programSnapshot?.name}</dd></div>
            <div><dt className="text-xs text-slate-400">Department</dt><dd className="text-slate-700">{row.departmentSnapshot?.name || '—'}</dd></div>
            <div><dt className="text-xs text-slate-400">Academic year</dt><dd className="text-slate-700">{row.academicYearLabel || row.academicYear?.label || '—'}</dd></div>
            <div><dt className="text-xs text-slate-400">Completion date (Eth)</dt><dd className="font-medium text-slate-800">{row.completionDate ? formatEthiopian(row.completionDate) : '—'}</dd></div>
            <div><dt className="text-xs text-slate-400">Issued</dt><dd className="text-slate-700">{displayDateTime(row.issuedAt)}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs text-slate-400">Verification reference</dt><dd className="break-all text-slate-700">{row.verificationId}</dd></div>
            {row.revokeReason ? <div className="sm:col-span-2"><dt className="text-xs text-slate-400">Revocation reason</dt><dd className="text-rose-700">{row.revokeReason}</dd></div> : null}
          </dl>
          <div className="rounded-2xl border border-slate-100 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Academic snapshot</p>
            <p className="mt-1 text-sm text-slate-600">{row.academicSnapshot?.length ?? 0} course entries stored with this certificate. The PDF is generated from this snapshot, not from the live student record.</p>
          </div>
          {row.pdfGeneratedAt ? <p className="text-xs text-slate-400">PDF generated {displayDateTime(row.pdfGeneratedAt)}.</p> : (
            <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-xs text-amber-900">This record has no generated PDF yet. Downloading or reissuing will generate it from the stored snapshot.</p>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
