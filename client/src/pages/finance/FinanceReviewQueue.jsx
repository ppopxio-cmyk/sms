import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  UserCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { formatEthiopian } from '../../lib/ethiopianDate';

export default function FinanceReviewQueue() {
  const queryClient = useQueryClient();
  const [resultFilter, setResultFilter] = useState('review_required'); // 'review_required' | 'pending_verification'
  const [page, setPage] = useState(1);

  // Approve / Reject modal
  const [activeAttempt, setActiveAttempt] = useState(null);
  const [actionType, setActionType] = useState('approve'); // 'approve' | 'reject'
  const [resolutionNotes, setResolutionNotes] = useState('');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['finance', 'review-queue', { result: resultFilter, page }],
    queryFn: async () => {
      const res = await api.get('/finance/review-queue', {
        params: { result: resultFilter, page, limit: 25 },
      });
      return res.data;
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, action, notes }) => {
      const res = await api.post(`/finance/review-queue/${id}/resolve`, {
        action,
        notes,
      });
      return res.data;
    },
    onSuccess: (_, vars) => {
      toast.success(
        vars.action === 'approve'
          ? 'Payment approved and officially confirmed!'
          : 'Submission rejected.'
      );
      setActiveAttempt(null);
      setResolutionNotes('');
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="CBE Verification Review Queue"
        subtitle="Manage flagged submissions (such as parent or sponsor payments under a different name) and pending verification retries."
        icon={UserCheck}
      />

      {/* Filter Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex gap-2">
          <button
            onClick={() => {
              setResultFilter('review_required');
              setPage(1);
            }}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
              resultFilter === 'review_required'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Payer Name Review
          </button>
          <button
            onClick={() => {
              setResultFilter('pending_verification');
              setPage(1);
            }}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
              resultFilter === 'pending_verification'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Pending Upstream Retries
          </button>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Queue Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="p-6">
              <SkeletonRows rows={6} />
            </div>
          ) : !data?.attempts?.length ? (
            <div className="p-10">
              <EmptyState
                icon={CheckCircle2}
                title="Review queue is clear"
                message="No flagged submissions currently require manual accountant review."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 pl-6 pr-4">Student</th>
                    <th className="py-3.5 px-4">Cycle</th>
                    <th className="py-3.5 px-4">Payer / Receipt Reference</th>
                    <th className="py-3.5 px-4">Flag / Reason</th>
                    <th className="py-3.5 px-4">Submitted At</th>
                    <th className="py-3.5 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.attempts.map((attempt) => (
                    <tr key={attempt.id} className="transition hover:bg-slate-50/70">
                      <td className="py-3.5 pl-6 pr-4">
                        <Link
                          to={`/accountant/students/${attempt.student?._id || attempt.student}`}
                          className="font-semibold text-slate-800 hover:text-brand-600"
                        >
                          {attempt.student?.fullName || attempt.studentId}
                        </Link>
                        <p className="font-mono text-xs text-slate-400">
                          {attempt.studentId}
                        </p>
                      </td>

                      <td className="py-3.5 px-4 text-xs font-medium text-slate-800">
                        {attempt.cycle?.title}
                      </td>

                      <td className="py-3.5 px-4">
                        <p className="font-medium text-slate-800">
                          {attempt.cbeResponse?.senderName || 'Unknown Payer'}
                        </p>
                        <span className="font-mono text-[11px] text-brand-600">
                          {attempt.parsedReference}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge tone="amber">
                          {attempt.reasonCode || attempt.result}
                        </Badge>
                        <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-1">
                          {attempt.reviewNotes || 'Name token mismatch on CBE receipt'}
                        </p>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-600">
                        {formatEthiopian(attempt.createdAt, { time: true })}
                      </td>

                      <td className="py-3.5 pr-6 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            onClick={() => {
                              setActiveAttempt(attempt);
                              setActionType('approve');
                              setResolutionNotes('Verified parent/sponsor payment on CBE receipt.');
                            }}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Approve</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-rose-600 hover:bg-rose-50 hover:border-rose-300"
                            onClick={() => {
                              setActiveAttempt(attempt);
                              setActionType('reject');
                              setResolutionNotes('Receipt rejected: Cannot verify student connection.');
                            }}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            <span>Reject</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* RESOLUTION MODAL */}
      <Modal
        open={Boolean(activeAttempt)}
        onClose={() => setActiveAttempt(null)}
        title={actionType === 'approve' ? 'Approve CBE Receipt' : 'Reject Submission'}
      >
        {activeAttempt && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              resolveMutation.mutate({
                id: activeAttempt.id,
                action: actionType,
                notes: resolutionNotes,
              });
            }}
            className="space-y-4"
          >
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Student Record:</span>
                <span className="font-bold text-slate-800">{activeAttempt.student?.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payer Name on Receipt:</span>
                <span className="font-bold text-brand-700">{activeAttempt.cbeResponse?.senderName || 'Unknown'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Bank Reference:</span>
                <span className="font-mono font-medium text-slate-800">{activeAttempt.parsedReference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Receipt Link:</span>
                <a
                  href={activeAttempt.receiptUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand-600 hover:underline truncate max-w-[200px]"
                >
                  {activeAttempt.receiptUrl}
                </a>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Accountant Notes / Justification
              </label>
              <textarea
                rows={3}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-slate-200 p-2.5 text-xs"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" type="button" onClick={() => setActiveAttempt(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={resolveMutation.isPending}
                className={actionType === 'reject' ? 'bg-rose-600 text-white hover:bg-rose-700' : ''}
              >
                {resolveMutation.isPending
                  ? 'Saving...'
                  : actionType === 'approve'
                  ? 'Confirm & Clear Student Hold'
                  : 'Confirm Rejection'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
