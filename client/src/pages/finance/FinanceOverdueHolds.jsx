import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Search,
  DollarSign,
  Users,
  Send,
  RefreshCw,
  ChevronRight,
  Bell,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { formatEthiopian } from '../../lib/ethiopianDate';

export default function FinanceOverdueHolds() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Academic Filter (Batch -> Department -> Programme)
  const [selectedBatch, setSelectedBatch] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [isFilterApplied, setIsFilterApplied] = useState(false);

  // Teacher-notification dropdown
  const [notifyProgramme, setNotifyProgramme] = useState('');

  const handleApplyFilter = () => {
    setIsFilterApplied(true);
    setPage(1);
  };

  const handleResetFilter = () => {
    setSelectedBatch('');
    setSelectedDepartment('');
    setSelectedProgram('');
    setIsFilterApplied(false);
    setPage(1);
  };

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: [
      'finance',
      'overdue',
      { search, batchId: selectedBatch, departmentId: selectedDepartment, programId: selectedProgram, page, isFilterApplied },
    ],
    queryFn: async () => {
      const res = await api.get('/finance/overdue', {
        params: {
          search: search || undefined,
          batchId: selectedBatch || undefined,
          departmentId: selectedDepartment || undefined,
          programId: selectedProgram || undefined,
          page,
          limit: 25,
        },
      });
      return res.data;
    },
    enabled: isFilterApplied || Boolean(search.trim()),
  });

  const students = data?.students || [];
  const programmes = data?.programmes || [];
  const summary = data?.summary || {};
  const showResults = isFilterApplied || Boolean(search.trim());

  const notifyMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/finance/overdue/notify-teachers', {
        programme: notifyProgramme || undefined,
        batchId: selectedBatch || undefined,
        departmentId: selectedDepartment || undefined,
        programId: selectedProgram || undefined,
      });
      return res.data;
    },
    onSuccess: (res) => {
      toast.success(res?.message || `Notified assigned teachers for ${res?.students || 0} overdue student(s).`);
      queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not notify teachers.')),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overdue Monthly Fees — Teacher Alerts"
        subtitle="Students with unpaid monthly fees past the grace period. Notify the teachers assigned to a programme; document issuance (transcripts/certificates) stays blocked until cleared."
        icon={AlertTriangle}
      />

      {/* Academic Filter */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search student ID or name…"
              className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2.5 text-xs text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none"
            />
          </div>
          <p className="self-center text-[11px] text-slate-500 md:col-span-3">
            Teacher alerts are sent per programme below. Overdue students can still attend classes, sit assessments, and submit
            marks — only official documents remain blocked.
          </p>
        </div>
      </div>

      {!showResults ? (
        <EmptyState
          icon={AlertTriangle}
          title="Search or apply academic filter"
          message="Type a student ID or name in the box above to see overdue months, or select an academic batch/department."
        />
      ) : (
        <>
          {/* Summary strip */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-rose-100 bg-rose-50 p-5">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-rose-600">
                <Users className="h-4 w-4" /> Students on Overdue
              </div>
              <p className="mt-2 text-3xl font-black text-rose-700">{summary.totalStudents ?? students.length}</p>
            </div>
            <div className="rounded-3xl border border-rose-100 bg-rose-50 p-5">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-rose-600">
                <DollarSign className="h-4 w-4" /> Total Overdue ETB
              </div>
              <p className="mt-2 font-mono text-3xl font-black text-rose-700">{summary.totalOverdueEtb ?? '0.00'}</p>
            </div>
            <div className="rounded-3xl border border-rose-100 bg-rose-50 p-5">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-rose-600">
                <Calendar className="h-4 w-4" /> Overdue Months Total
              </div>
              <p className="mt-2 text-3xl font-black text-rose-700">{summary.totalOverdueCharges ?? '—'}</p>
            </div>
          </div>

          {/* Teacher alert toolbar */}
          <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-600">
              <Bell className="h-4 w-4 text-amber-500" /> Notify Teachers
            </div>
            <select
              value={notifyProgramme}
              onChange={(e) => setNotifyProgramme(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none"
            >
              <option value="">All programmes (current filter)</option>
              {programmes.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <Button
              variant="primary"
              size="sm"
              disabled={notifyMutation.isPending}
              onClick={() => notifyMutation.mutate()}
            >
              <Send className="h-4 w-4" />
              <span>{notifyMutation.isPending ? 'Notifying…' : 'Send Alerts'}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
            <p className="text-[11px] text-slate-400">
              Alerts go only to the teachers assigned to the selected programme — never to the registrar or the student.
            </p>
          </div>

          {/* Grouped students */}
          <Card>
            <CardBody className="p-0">
              {isLoading ? (
                <div className="p-6">
                  <SkeletonRows rows={6} />
                </div>
              ) : !students.length ? (
                <div className="p-10">
                  <EmptyState
                    icon={AlertTriangle}
                    title="No overdue students"
                    message="Every student in this selection is within their payment grace period."
                  />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[950px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        <th className="py-3.5 pl-6 pr-4">Student</th>
                        <th className="py-3.5 px-4">Programme</th>
                        <th className="py-3.5 px-4">Batch</th>
                        <th className="py-3.5 px-4">Overdue Months</th>
                        <th className="py-3.5 px-4">Total Due</th>
                        <th className="py-3.5 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {students.map((s) => (
                        <tr key={s.studentId} className="transition hover:bg-slate-50/70">
                          <td className="py-3.5 pl-6 pr-4">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                                {s.photoUrl ? (
                                  <img src={s.photoUrl} alt={s.fullName} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center bg-brand-50 text-xs font-bold text-brand-700">
                                    {(s.fullName || 'S')[0]}
                                  </div>
                                )}
                              </div>
                              <div>
                                <Link
                                  to={`/accountant/collections/students/${s.id || s.studentId}`}
                                  className="font-semibold text-slate-800 hover:text-brand-600"
                                >
                                  {s.fullName}
                                </Link>
                                <p className="font-mono text-xs text-slate-400">{s.studentId}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-xs font-medium text-slate-700">{s.programme || '—'}</td>
                          <td className="py-3.5 px-4 text-xs text-slate-500">{s.batch || '—'}</td>
                          <td className="py-3.5 px-4">
                            <Badge tone="rose">{s.overdueCount} month{s.overdueCount === 1 ? '' : 's'}</Badge>
                            <p className="mt-1 max-w-[260px] truncate text-[11px] text-slate-400" title={s.charges.map((c) => c.cycle).join(', ')}>
                              {s.charges.map((c) => c.cycle).join(', ')}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-rose-600">{s.totalOverdueEtb} ETB</td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1">
                              <Link
                                to={`/accountant/collections/students/${s.id || s.studentId}`}
                                className="inline-flex"
                              >
                                <Button variant="ghost" size="sm">
                                  <span>Profile</span>
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </Button>
                              </Link>
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

          {data?.pages > 1 && (
            <div className="flex items-center justify-center gap-2">
              {Array.from({ length: data.pages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                    p === page ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
