import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Gift,
  Search,
  RotateCcw,
  CheckCircle2,
  RefreshCw,
  Plus,
  ShieldCheck,
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
import AccountantAcademicFilter, { SelectToViewCard } from '../../components/finance/AccountantAcademicFilter';

export default function FinanceWaivers() {
  const queryClient = useQueryClient();

  // Academic Filter (Batch -> Department -> Course)
  const [selectedBatch, setSelectedBatch] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [isFilterApplied, setIsFilterApplied] = useState(false);

  const [status, setStatus] = useState('approved');
  const [page, setPage] = useState(1);

  // Revoke state
  const [revokingWaiver, setRevokingWaiver] = useState(null);
  const [revokeReason, setRevokeReason] = useState('');

  const handleApplyFilter = () => {
    setIsFilterApplied(true);
    setPage(1);
  };

  const handleResetFilter = () => {
    setSelectedBatch('');
    setSelectedDepartment('');
    setSelectedCourse('');
    setIsFilterApplied(false);
    setPage(1);
  };

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: [
      'finance',
      'waivers',
      { status, batchId: selectedBatch, departmentId: selectedDepartment, courseId: selectedCourse, page, isFilterApplied },
    ],
    queryFn: async () => {
      const res = await api.get('/finance/waivers', {
        params: {
          status: status || undefined,
          batchId: selectedBatch || undefined,
          departmentId: selectedDepartment || undefined,
          courseId: selectedCourse || undefined,
          page,
          limit: 25,
        },
      });
      return res.data;
    },
    enabled: isFilterApplied,
  });

  const revokeMutation = useMutation({
    mutationFn: async ({ id, reason }) => {
      const res = await api.post(`/finance/waivers/${id}/revoke`, { reason });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Fee waiver revoked. Student charge restored to unpaid.');
      setRevokingWaiver(null);
      setRevokeReason('');
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fee Waivers & Scholarships"
        subtitle="Full and partial fee exemptions, scholarship approvals, and waiver revocation audit trail."
        icon={Gift}
      />

      {/* Cascading Academic Filter: Batch -> Department -> Course */}
      <AccountantAcademicFilter
        selectedBatch={selectedBatch}
        setSelectedBatch={setSelectedBatch}
        selectedDepartment={selectedDepartment}
        setSelectedDepartment={setSelectedDepartment}
        selectedCourse={selectedCourse}
        setSelectedCourse={setSelectedCourse}
        isApplied={isFilterApplied}
        onApply={handleApplyFilter}
        onReset={handleResetFilter}
      />

      {!isFilterApplied ? (
        <SelectToViewCard
          title="Select to View Fee Waivers"
          message="Please select a Batch, Department, and Course above, then click View Records to display student fee waivers."
        />
      ) : (
        <>
          {/* Filter Tabs */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex gap-2">
          {['approved', 'revoked', ''].map((st) => (
            <button
              key={st}
              onClick={() => {
                setStatus(st);
                setPage(1);
              }}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold capitalize transition ${
                status === st
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {st ? `${st} Waivers` : 'All Waivers'}
            </button>
          ))}
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

      {/* Waivers Table */}
      <Card>
        <CardBody className="p-0">
          {isLoading ? (
            <div className="p-6">
              <SkeletonRows rows={6} />
            </div>
          ) : !data?.waivers?.length ? (
            <div className="p-10">
              <EmptyState
                icon={Gift}
                title="No waivers found"
                message="Fee waivers granted from the Collections page will appear here."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 pl-6 pr-4">Student</th>
                    <th className="py-3.5 px-4">Cycle</th>
                    <th className="py-3.5 px-4">Waived Amount</th>
                    <th className="py-3.5 px-4">Scope</th>
                    <th className="py-3.5 px-4">Reason / Notes</th>
                    <th className="py-3.5 px-4">Approved By</th>
                    <th className="py-3.5 px-4">Date</th>
                    <th className="py-3.5 pr-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.waivers.map((w) => (
                    <tr key={w.id} className="transition hover:bg-slate-50/70">
                      <td className="py-3.5 pl-6 pr-4">
                        <Link
                          to={`/accountant/students/${w.student?._id || w.student}`}
                          className="font-semibold text-slate-800 hover:text-brand-600"
                        >
                          {w.student?.fullName}
                        </Link>
                        <p className="font-mono text-xs text-slate-400">
                          {w.student?.studentId}
                        </p>
                      </td>

                      <td className="py-3.5 px-4 font-medium text-slate-800 text-xs">
                        {w.cycle?.title}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold text-purple-700">
                        {w.amountEtb} ETB
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge tone={w.type === 'full' ? 'purple' : 'neutral'}>
                          {w.type === 'full' ? 'FULL (100%)' : 'PARTIAL'}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-600 max-w-[200px] truncate" title={w.reason}>
                        {w.reason}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {w.approvedBy?.name || w.approvedBy?.email || 'Accountant'}
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-500">
                        {formatEthiopian(w.approvedAt || w.createdAt)}
                      </td>

                      <td className="py-3.5 pr-6 text-right">
                        {w.status === 'approved' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-rose-600 hover:bg-rose-50"
                            onClick={() => {
                              setRevokingWaiver(w);
                              setRevokeReason('');
                            }}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>Revoke</span>
                          </Button>
                        )}
                        {w.status === 'revoked' && (
                          <Badge tone="rose">REVOKED</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
      </>
      )}

      {/* REVOKE WAIVER MODAL */}
      <Modal
        open={Boolean(revokingWaiver)}
        onClose={() => setRevokingWaiver(null)}
        title="Revoke Fee Waiver"
      >
        {revokingWaiver && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              revokeMutation.mutate({
                id: revokingWaiver.id,
                reason: revokeReason,
              });
            }}
            className="space-y-4"
          >
            <p className="text-xs text-rose-600 font-medium">
              Revoking this waiver will restore the full tuition fee charge on {revokingWaiver.student?.fullName}'s account and re-impose academic holds if past due.
            </p>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Reason for Revocation
              </label>
              <textarea
                rows={3}
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                placeholder="Reason for revoking this exemption..."
                className="mt-1 block w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" type="button" onClick={() => setRevokingWaiver(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-rose-600 text-white hover:bg-rose-700"
                disabled={revokeMutation.isPending}
              >
                {revokeMutation.isPending ? 'Revoking...' : 'Confirm Revocation'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
