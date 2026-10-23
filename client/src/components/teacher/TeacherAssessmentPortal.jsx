import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ClipboardCopy,
  Download,
  ExternalLink,
  FileText,
  KeyRound,
  Link2,
  LockKeyhole,
  RefreshCw,
  Send,
  Trash2,
  UploadCloud,
  UsersRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import Alert from '../ui/Alert';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card, { CardBody, CardHeader } from '../ui/Card';
import FilterTabs from '../ui/FilterTabs';
import Modal from '../ui/Modal';
import Pagination from '../ui/Pagination';
import { EmptyState } from '../ui/StatePanel';
import { SkeletonRows } from '../ui/Skeleton';
import StatCard from '../ui/StatCard';

const inputClass =
  'focus-ring h-11 w-full rounded-xl border border-slate-200 bg-white/85 px-3.5 text-sm text-slate-800 transition placeholder:text-slate-400';
const ACCEPT = '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const PORTAL_TONE = {
  open: 'success',
  scheduled: 'warning',
  closed: 'neutral',
  disabled: 'neutral',
  draft: 'neutral',
};

function formatDate(value) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error('Your browser blocked clipboard access.');
  }
}

export default function TeacherAssessmentPortal({ assessmentId, maxScore, section = 'portal' }) {
  const queryClient = useQueryClient();
  const [opensAt, setOpensAt] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [allowResubmission, setAllowResubmission] = useState(true);
  const [initialised, setInitialised] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [review, setReview] = useState(null);
  const [reviewForm, setReviewForm] = useState({ status: 'graded', score: '', feedback: '' });

  const portal = useQuery({
    queryKey: ['teacher', 'assessment-portal', assessmentId],
    queryFn: async () => (await api.get(`/teacher/assessments/${assessmentId}/portal`)).data,
  });

  const submissions = useQuery({
    queryKey: ['teacher', 'assessment-submissions', assessmentId, status, page],
    queryFn: async () =>
      (
        await api.get(`/teacher/assessments/${assessmentId}/submissions`, {
          params: { status, page, limit: 25 },
        })
      ).data,
  });

  useEffect(() => {
    if (portal.data && !initialised) {
      setOpensAt(toLocalInput(portal.data.opensAt));
      setClosesAt(toLocalInput(portal.data.closesAt));
      setAllowResubmission(portal.data.allowResubmission !== false);
      setInitialised(true);
    }
  }, [portal.data, initialised]);

  const data = portal.data;
  const configMutation = useMutation({
    mutationFn: async ({ rotateCode = false, enabled = true } = {}) =>
      (
        await api.put(`/teacher/assessments/${assessmentId}/portal`, {
          enabled,
          opensAt: opensAt ? new Date(opensAt).toISOString() : null,
          closesAt: closesAt ? new Date(closesAt).toISOString() : null,
          allowResubmission,
          rotateCode,
        })
      ).data,
    onSuccess: async (updated, variables) => {
      toast.success(
        variables?.enabled === false
          ? 'Public portal disabled.'
          : variables?.rotateCode
            ? 'Portal saved and a new access code generated.'
            : 'Public portal saved.',
      );
      queryClient.setQueryData(['teacher', 'assessment-portal', assessmentId], updated);
      await queryClient.invalidateQueries({ queryKey: ['teacher', 'assessment-submissions', assessmentId] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'assessments'] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'gradebook', assessmentId] });
    },
    onError: (error) => toast.error(errorMessage(error, 'We could not update the portal.')),
  });

  const removeMutation = useMutation({
    mutationFn: async () => (await api.delete(`/teacher/assessments/${assessmentId}/portal/document`)).data,
    onSuccess: async () => {
      toast.success('Assessment document removed.');
      await portal.refetch();
    },
    onError: (error) => toast.error(errorMessage(error, 'We could not remove the document.')),
  });

  const reviewMutation = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/teacher/assessment-submissions/${review.id}`, {
          status: reviewForm.status,
          score: reviewForm.status === 'submitted' ? null : reviewForm.score === '' ? null : Number(reviewForm.score),
          feedback: reviewForm.feedback.trim(),
        })
      ).data,
    onSuccess: async () => {
      setReview(null);
      toast.success(reviewForm.status === 'returned' ? 'Submission returned to the student.' : 'Submission graded.');
      await queryClient.invalidateQueries({ queryKey: ['teacher', 'assessment-submissions', assessmentId] });
      await portal.refetch();
      queryClient.invalidateQueries({ queryKey: ['teacher', 'gradebook', assessmentId] });
      queryClient.invalidateQueries({ queryKey: ['teacher', 'dashboard'] });
    },
    onError: (error) => toast.error(errorMessage(error, 'We could not save this review.')),
  });

  const publicUrl = useMemo(() => {
    if (!data?.enabled || !data.publicHash) return '';
    return `${window.location.origin}/assessments?hash=${data.publicHash}`;
  }, [data?.enabled, data?.publicHash]);

  const rows = submissions.data?.submissions ?? [];
  const counts = submissions.data?.counts ?? {};

  async function upload(event) {
    event.preventDefault();
    if (!file) {
      toast.error('Choose a PDF or Word document first.');
      return;
    }
    setUploading(true);
    try {
      await api.post(`/teacher/assessments/${assessmentId}/portal/document`, file, {
        params: { filename: file.name },
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        timeout: 60_000,
      });
      toast.success('Assessment document uploaded.');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      await portal.refetch();
    } catch (error) {
      toast.error(errorMessage(error, 'We could not upload that document.'));
    } finally {
      setUploading(false);
    }
  }

  function openReview(row) {
    setReview(row);
    setReviewForm({
      status: row.status === 'submitted' ? 'graded' : row.status,
      score: row.score === null || row.score === undefined ? '' : String(row.score),
      feedback: row.feedback || '',
    });
  }

  function submitReview(event) {
    event.preventDefault();
    if (reviewForm.status === 'graded' && reviewForm.score === '') {
      toast.error('Enter a score before marking this submission as graded.');
      return;
    }
    if (Number(reviewForm.score) > maxScore) {
      toast.error(`A score cannot be above ${maxScore}.`);
      return;
    }
    if (reviewForm.status === 'returned' && !reviewForm.feedback.trim()) {
      toast.error('Explain what the student needs to change.');
      return;
    }
    reviewMutation.mutate();
  }

  if (portal.isLoading) return <SkeletonRows rows={6} />;

  if (portal.isError) {
    return <Alert tone="danger">We could not load the public portal for this assessment.</Alert>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={UsersRound} label="Expected" value={counts.expected ?? 0} hint="registered students" tone="indigo" />
        <StatCard icon={Send} label="Received" value={counts.submitted ?? 0} hint={`${counts.all ?? 0} total versions`} tone="emerald" />
        <StatCard icon={Check} label="Graded" value={counts.graded ?? 0} tone="violet" />
        <StatCard icon={LockKeyhole} label="Missing" value={counts.missing ?? 0} hint="no file yet" tone="amber" />
      </div>

      {section !== 'submissions' ? (
        <>
      <Card>
        <CardHeader
          title="Public assessment link"
          subtitle="Students use this link with their student ID and the private code you give them."
          icon={Link2}
          action={<Badge tone={PORTAL_TONE[data?.status] ?? 'neutral'}>{String(data?.status || 'disabled').replace(/^\w/, (letter) => letter.toUpperCase())}</Badge>}
        />
        <CardBody className="space-y-5">
          {!data?.enabled ? (
            <Alert tone="info" title="The public portal is off">
              Turn it on to create a shareable link and access code for this assessment.
            </Alert>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Public link</span>
              <div className="flex gap-2">
                <input readOnly value={publicUrl || 'Enable the portal to create a link'} className={`${inputClass} font-mono text-xs`} />
                <Button variant="secondary" disabled={!publicUrl} onClick={() => copyText(publicUrl, 'Public link copied.')}>
                  <ClipboardCopy className="h-4 w-4" />
                </Button>
                {publicUrl ? (
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-white"
                    aria-label="Open public portal"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Access code</span>
              <div className="flex gap-2">
                <div className="focus-ring flex h-11 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 font-mono text-sm font-bold tracking-[0.2em] text-slate-800">
                  <KeyRound className="h-4 w-4 text-slate-400" />
                  {data?.accessCode || 'No code yet'}
                </div>
                <Button
                  variant="secondary"
                  disabled={!data?.accessCode}
                  onClick={() => copyText(data.accessCode, 'Access code copied.')}
                >
                  <ClipboardCopy className="h-4 w-4" />
                </Button>
              </div>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Opens</span>
              <input
                type="datetime-local"
                value={opensAt}
                onChange={(event) => setOpensAt(event.target.value)}
                className={inputClass}
              />
              <span className="mt-1 block text-[11px] text-slate-400">Leave empty to open immediately.</span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Closes</span>
              <input
                type="datetime-local"
                value={closesAt}
                onChange={(event) => setClosesAt(event.target.value)}
                className={inputClass}
              />
              <span className="mt-1 block text-[11px] text-slate-400">Submission is blocked after this time.</span>
            </label>
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3.5">
            <input
              type="checkbox"
              checked={allowResubmission}
              onChange={(event) => setAllowResubmission(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
            />
            <span>
              <span className="block text-sm font-medium text-slate-800">Allow replacement submissions</span>
              <span className="block text-xs text-slate-500">
                Students may replace a returned file. A graded submission stays locked.
              </span>
            </span>
          </label>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => configMutation.mutate({ enabled: true })} loading={configMutation.isPending}>
              <Check className="h-4 w-4" />
              {data?.enabled ? 'Save portal settings' : 'Enable public portal'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => configMutation.mutate({ enabled: true, rotateCode: true })}
              disabled={configMutation.isPending}
            >
              <RefreshCw className="h-4 w-4" />
              New access code
            </Button>
            {data?.enabled ? (
              <Button
                variant="ghost"
                onClick={() => {
                  if (window.confirm('Disable the public portal? Existing submissions stay in your workspace.')) {
                    configMutation.mutate({ enabled: false });
                  }
                }}
                disabled={configMutation.isPending}
              >
                Disable portal
              </Button>
            ) : null}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Assessment document"
          subtitle="The PDF or Word file students can download after they verify their identity."
          icon={FileText}
        />
        <CardBody className="space-y-4">
          {data?.document ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/70 p-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{data.document.fileName}</p>
                  <p className="text-xs text-slate-500">
                    {formatBytes(data.document.bytes)} · uploaded {formatDate(data.document.uploadedAt)}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <a
                  href={data.document.url}
                  target="_blank"
                  rel="noreferrer"
                  className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Open
                </a>
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (window.confirm('Remove the assessment document? Students will no longer be able to download it.')) {
                      removeMutation.mutate();
                    }
                  }}
                  loading={removeMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No document attached yet.</p>
          )}

          <form onSubmit={upload} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block flex-1">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Upload a replacement</span>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className="focus-ring block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700"
              />
            </label>
            <Button type="submit" loading={uploading} disabled={!file}>
              <UploadCloud className="h-4 w-4" />
              Upload document
            </Button>
          </form>
          <p className="text-xs text-slate-400">PDF, DOC or DOCX. Maximum 10 MB.</p>
        </CardBody>
      </Card>
        </>
      ) : null}

      {section !== 'portal' ? (
      <Card>
        <CardHeader
          title="Student submissions"
          subtitle="Download each file and record a score. Graded files cannot be replaced by the student."
          icon={UsersRound}
          action={
            <FilterTabs
              label="Submission status"
              value={status}
              onChange={(next) => {
                setStatus(next);
                setPage(1);
              }}
              tabs={[
                { key: 'all', label: 'All', count: counts.all },
                { key: 'submitted', label: 'Submitted', count: counts.submitted },
                { key: 'graded', label: 'Graded', count: counts.graded },
                { key: 'returned', label: 'Returned', count: counts.returned },
              ]}
            />
          }
        />
        <CardBody className="space-y-4">
          {submissions.isError ? (
            <Alert tone="danger">We could not load student submissions.</Alert>
          ) : submissions.isLoading ? (
            <SkeletonRows rows={4} />
          ) : !rows.length ? (
            <EmptyState
              icon={FileText}
              title={status === 'all' ? 'No submissions yet' : 'Nothing in this tab'}
              message="Share the public link and access code with your class. Files appear here as students send them."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <th className="pb-3 pr-4">Student</th>
                      <th className="pb-3 pr-4">File</th>
                      <th className="pb-3 pr-4">Version</th>
                      <th className="pb-3 pr-4">Received</th>
                      <th className="pb-3 pr-4">State</th>
                      <th className="pb-3 text-right">Score</th>
                      <th className="pb-3 text-right">Review</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2.5">
                            <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-slate-100 text-slate-500">
                              {row.student?.photoUrl ? (
                                <img src={row.student.photoUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <UsersRound className="h-4 w-4" />
                              )}
                            </span>
                            <div>
                              <p className="font-semibold text-slate-800">{row.student?.name}</p>
                              <p className="font-mono text-[11px] text-slate-500">{row.student?.studentNumber}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <a
                            href={row.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-44 items-center gap-1.5 truncate text-xs font-medium text-brand-700 hover:text-brand-900"
                          >
                            <Download className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{row.fileName}</span>
                          </a>
                          <p className="text-[11px] text-slate-400">{formatBytes(row.bytes)}</p>
                        </td>
                        <td className="py-3 pr-4 text-xs text-slate-500">#{row.revision}</td>
                        <td className="py-3 pr-4 text-xs text-slate-500">{formatDate(row.submittedAt)}</td>
                        <td className="py-3 pr-4">
                          <Badge tone={row.status === 'graded' ? 'success' : row.status === 'returned' ? 'warning' : 'brand'}>
                            {row.status}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4 text-right font-mono text-xs text-slate-700">
                          {row.score === null || row.score === undefined ? '—' : `${row.score} / ${maxScore}`}
                        </td>
                        <td className="py-3 text-right">
                          <Button size="sm" variant="secondary" onClick={() => openReview(row)}>
                            Review
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={submissions.data.pagination.page}
                pages={submissions.data.pagination.pages}
                total={submissions.data.pagination.total}
                limit={25}
                onPage={setPage}
              />
            </>
          )}
        </CardBody>
      </Card>
      ) : null}

      <Modal
        open={Boolean(review)}
        onClose={() => setReview(null)}
        title={`Review ${review?.student?.name || 'submission'}`}
        subtitle={review?.fileName}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReview(null)}>
              Cancel
            </Button>
            <Button onClick={submitReview} loading={reviewMutation.isPending}>
              Save review
            </Button>
          </>
        }
      >
        <form onSubmit={submitReview} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              ['graded', 'Grade'],
              ['returned', 'Return for changes'],
              ['submitted', 'Reset to submitted'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setReviewForm((current) => ({ ...current, status: value }))}
                className={`focus-ring rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  reviewForm.status === value
                    ? 'border-brand-300 bg-brand-50 text-brand-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {reviewForm.status !== 'submitted' ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Score out of {maxScore}</span>
              <input
                type="number"
                min="0"
                max={maxScore}
                step="0.01"
                value={reviewForm.score}
                onChange={(event) => setReviewForm((current) => ({ ...current, score: event.target.value }))}
                className={inputClass}
              />
            </label>
          ) : null}
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              Feedback {reviewForm.status === 'returned' ? '(required)' : '(optional)'}
            </span>
            <textarea
              rows={4}
              value={reviewForm.feedback}
              onChange={(event) => setReviewForm((current) => ({ ...current, feedback: event.target.value }))}
              maxLength={2000}
              className="focus-ring w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-800"
              placeholder="Tell the student what was strong or what to change."
            />
          </label>
          <a
            href={review?.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-xs font-semibold text-brand-700 hover:text-brand-900"
          >
            <Download className="h-3.5 w-3.5" />
            Open submitted file
          </a>
        </form>
      </Modal>
    </div>
  );
}
