import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, FileText, Plus } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  REGISTRAR,
  displayDateTime,
  downloadFile,
  fileErrorMessage,
  humanStatus,
  toneForStatus,
} from '../../lib/registrar';
import { useDebounced } from '../../lib/useDebounced';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import ConfirmDialog from '../../components/registrar/ConfirmDialog';
import StudentPicker from '../../components/registrar/StudentPicker';
import { TextAreaField, SelectField } from '../../components/registrar/Fields';
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
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [issuing, setIssuing] = useState(false);
  const [revoking, setRevoking] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const params = useMemo(() => ({
    page,
    limit,
    ...(debounced.trim() ? { search: debounced.trim() } : {}),
    ...(status !== 'all' ? { status } : {}),
  }), [page, limit, debounced, status]);

  const query = useQuery({
    queryKey: ['registrar', 'transcripts', params],
    queryFn: async () => (await api.get(`${REGISTRAR}/transcripts`, { params })).data,
    placeholderData: (previous) => previous,
  });

  const rows = query.data?.rows ?? [];
  const pagination = query.data?.pagination ?? { page: 1, pages: 1, total: 0, limit };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['registrar', 'transcripts'] });

  const revoke = useMutation({
    mutationFn: async (reason) => (await api.post(`${REGISTRAR}/transcripts/${revoking.id}/revoke`, { reason })).data,
    onSuccess: () => {
      toast.success('Transcript revoked. The history remains available.');
      setRevoking(null);
      invalidate();
    },
    onError: (err) => toast.error(errorMessage(err, 'The transcript could not be revoked.')),
  });

  const download = async (row) => {
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
    { key: 'program', label: 'Programme', render: (row) => row.program?.name || '—' },
    { key: 'credits', label: 'Credits', render: (row) => row.totalCredits ?? '—' },
    { key: 'cgpa', label: 'CGPA', render: (row) => row.cgpa ?? '—' },
    { key: 'purpose', label: 'Purpose', render: (row) => row.purpose || '—' },
    { key: 'status', label: 'Status', render: (row) => <Badge tone={toneForStatus(row.status)}>{humanStatus(row.status)}</Badge> },
    { key: 'issued', label: 'Issued', render: (row) => displayDateTime(row.issuedAt) },
    {
      key: 'actions',
      label: '',
      className: 'text-right',
      mobileFull: true,
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => download(row)} loading={downloadingId === row.id}>
            <Download className="h-3.5 w-3.5" /> PDF
          </Button>
          {row.status === 'issued' ? <Button size="sm" variant="ghost" onClick={() => setRevoking(row)}>Revoke</Button> : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Transcripts"
        subtitle="Every transcript is a stored academic snapshot rendered as a print-ready PDF. Revoking preserves the record and its verification history."
        actions={<Button onClick={() => setIssuing(true)} className="gap-2"><Plus className="h-4 w-4" /> Issue transcript</Button>}
      />

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <SearchInput className="flex-1" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search student name or ID" loading={query.isFetching} />
          <SelectField label="Status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
            <option value="all">All statuses</option>
            {['issued', 'revoked'].map((value) => <option key={value} value={value}>{humanStatus(value)}</option>)}
          </SelectField>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Issued transcripts</h2>
            <p className="mt-0.5 text-xs text-slate-500">{pagination.total ?? 0} document{pagination.total === 1 ? '' : 's'}</p>
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
          noResults={Boolean(debounced.trim() || status !== 'all')}
          emptyTitle="No transcripts yet"
          emptyMessage="Issue a transcript for a student with published results."
        />
        <div className="px-5 pb-4">
          <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPage={setPage} onLimit={(value) => { setLimit(value); setPage(1); }} />
        </div>
      </Card>

      <IssueTranscriptModal open={issuing} onClose={() => setIssuing(false)} onSaved={invalidate} />
      <ConfirmDialog
        open={Boolean(revoking)}
        title="Revoke this transcript?"
        message={revoking ? `${revoking.student?.fullName} · issued ${displayDateTime(revoking.issuedAt)}. The PDF remains on file as revoked.` : ''}
        confirmLabel="Revoke transcript"
        tone="danger"
        loading={revoke.isPending}
        reason={{ label: 'Reason', minLength: 5, placeholder: 'Why is this transcript being revoked?' }}
        onClose={() => setRevoking(null)}
        onConfirm={(reason) => revoke.mutate(reason)}
      />
    </div>
  );
}

function IssueTranscriptModal({ open, onClose, onSaved }) {
  const [student, setStudent] = useState(null);
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setStudent(null);
      setPurpose('');
      setError('');
    }
  }, [open]);

  const issue = useMutation({
    mutationFn: async () => {
      if (!student) throw new Error('Choose a student.');
      return (await api.post(`${REGISTRAR}/transcripts`, { student: student.id, purpose: purpose.trim() })).data;
    },
    onSuccess: () => {
      toast.success('Transcript issued.');
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'The transcript could not be issued.');
      setError(message);
      toast.error(message);
    },
  });

  return (
    <Modal
      open={open}
      title="Issue transcript"
      subtitle="The server snapshots the student's published results and the configured grading legend."
      onClose={issue.isPending ? undefined : onClose}
      dismissible={!issue.isPending}
      footer={<><Button variant="secondary" onClick={onClose} disabled={issue.isPending}>Cancel</Button><Button onClick={() => issue.mutate()} loading={issue.isPending} disabled={!student}>Issue transcript</Button></>}
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}
        <StudentPicker value={student} onChange={setStudent} />
        <TextAreaField label="Purpose" rows={3} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="e.g. Further study application" hint="Optional; printed on the document and stored with the snapshot." />
        <p className="rounded-xl bg-sky-50 px-3.5 py-3 text-xs leading-relaxed text-sky-800">
          If the grading policy is missing, issuance is blocked. No grades or credits are invented on the client.
        </p>
      </div>
    </Modal>
  );
}
