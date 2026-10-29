import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  FileCheck,
  CheckCircle2,
  CalendarDays,
  Plus,
  ArrowRight,
  ShieldCheck,
  Building2,
  UserCheck,
  Clock,
  Layers,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { api } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { SkeletonPage } from '../../components/ui/Skeleton';

const STATUS_COLORS = {
  Paid: '#10b981',
  Unpaid: '#64748b',
  Overdue: '#f43f5e',
  Waived: '#8b5cf6',
};

export default function FinanceDashboard() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['finance', 'dashboard'],
    queryFn: async () => {
      const res = await api.get('/finance/dashboard');
      return res.data;
    },
  });

  if (isLoading) {
    return <SkeletonPage cards={4} />;
  }

  const overview = data?.overview || {};
  const statusSplit = data?.statusSplit || {};
  const monthlyTrend = data?.monthlyTrend || [];
  const programmeBreakdown = data?.programmeBreakdown || [];

  const pieData = [
    { name: 'Paid', value: statusSplit.paid || 0, color: STATUS_COLORS.Paid },
    { name: 'Unpaid', value: statusSplit.unpaid || 0, color: STATUS_COLORS.Unpaid },
    { name: 'Overdue', value: statusSplit.overdue || 0, color: STATUS_COLORS.Overdue },
    { name: 'Waived', value: statusSplit.waived || 0, color: STATUS_COLORS.Waived },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance & Payments Dashboard"
        subtitle="Live college fee collections, automated CBE receipt reconciliations, and academic hold management."
        icon={DollarSign}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
            <Link to="/accountant/cycles">
              <Button size="sm">
                <Plus className="h-4 w-4" />
                <span>New Fee Cycle</span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* Top Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={CheckCircle2}
          label="Total Collected"
          value={`${overview.totalCollectedEtb || '0.00'} ETB`}
          hint={`${overview.percentPaid || 0}% of billed fees settled`}
          tone="emerald"
        />
        <StatCard
          icon={Clock}
          label="Outstanding Balance"
          value={`${overview.totalOutstandingEtb || '0.00'} ETB`}
          hint="Unpaid active student charges"
          tone="amber"
        />
        <StatCard
          icon={AlertTriangle}
          label="Active Holds"
          value={overview.overdueCount || 0}
          hint="Students blocked for overdue fees"
          tone="rose"
        />
        <StatCard
          icon={UserCheck}
          label="Review Queue"
          value={overview.reviewQueueCount || 0}
          hint="Submissions needing manual review"
          tone="indigo"
        />
      </div>

      {/* Action Shortcut Banners */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link
          to="/accountant/cycles"
          className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-brand-500 hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-brand-50 p-2.5 text-brand-600 group-hover:bg-brand-600 group-hover:text-white transition">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Monthly Fee Cycles</p>
              <p className="text-xs text-slate-400">Manage cycles, deadlines & portal links</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-brand-600 group-hover:translate-x-1 transition" />
        </Link>

        <Link
          to="/accountant/collections"
          className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-brand-500 hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">Student Collections</p>
              <p className="text-xs text-slate-400">View charges, record cash & waivers</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition" />
        </Link>

        <Link
          to="/accountant/review-queue"
          className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-brand-500 hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-violet-50 p-2.5 text-violet-600 group-hover:bg-violet-600 group-hover:text-white transition">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">CBE Review Queue</p>
              <p className="text-xs text-slate-400">
                {overview.reviewQueueCount > 0 ? (
                  <span className="font-semibold text-rose-600">
                    {overview.reviewQueueCount} submissions pending review
                  </span>
                ) : (
                  'All submissions reconciled'
                )}
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-violet-600 group-hover:translate-x-1 transition" />
        </Link>
      </div>

      {/* 13-Month Trend Chart */}
      <Card>
        <CardHeader
          title="13-Month Collection Trend"
          subtitle="Monthly fee intake across Ethiopian calendar months (Meskerem through Pagume)."
          icon={BarChart3}
        />
        <CardBody>
          {monthlyTrend.length === 0 ? (
            <div className="flex h-56 items-center justify-center text-sm text-slate-400">
              No fee collection cycles recorded yet.
            </div>
          ) : (
            <div className="h-72 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrend} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="title"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(val) => [`${Number(val).toLocaleString()} ETB`, 'Collected']}
                    labelStyle={{ fontWeight: 'bold' }}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="collectedEtb" fill="#0284c7" radius={[6, 6, 0, 0]} name="Collected (ETB)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Two Column Grid: Status Breakdown & Programme Breakdown */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Fee Status Split */}
        <Card>
          <CardHeader
            title="Charge Status Distribution"
            subtitle="Current status breakdown across all student fee charges."
            icon={Layers}
          />
          <CardBody>
            <div className="flex flex-col sm:flex-row items-center justify-around gap-6">
              <div className="h-56 w-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {pieData.map((entry, idx) => (
                        <Cell key={`cell-${idx}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full bg-emerald-500" />
                  <span className="text-xs text-slate-600">Paid:</span>
                  <span className="font-mono text-xs font-bold text-slate-800">
                    {statusSplit.paid || 0}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full bg-slate-500" />
                  <span className="text-xs text-slate-600">Unpaid:</span>
                  <span className="font-mono text-xs font-bold text-slate-800">
                    {statusSplit.unpaid || 0}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full bg-rose-500" />
                  <span className="text-xs text-slate-600">Overdue (Holds):</span>
                  <span className="font-mono text-xs font-bold text-rose-700">
                    {statusSplit.overdue || 0}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full bg-purple-500" />
                  <span className="text-xs text-slate-600">Waived:</span>
                  <span className="font-mono text-xs font-bold text-slate-800">
                    {statusSplit.waived || 0}
                  </span>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Programme Breakdown */}
        <Card>
          <CardHeader
            title="Collections by Programme"
            subtitle="Top programmes ranked by fee settlement performance."
            icon={Building2}
          />
          <CardBody>
            {programmeBreakdown.length === 0 ? (
              <p className="py-12 text-center text-xs text-slate-400">
                No programme collections recorded.
              </p>
            ) : (
              <div className="space-y-4">
                {programmeBreakdown.slice(0, 6).map((p) => (
                  <div key={p.programme} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 truncate max-w-[200px]">
                        {p.programme}
                      </span>
                      <span className="font-mono font-medium text-slate-600">
                        {p.collectedEtb} / {p.totalBilledEtb} ETB ({p.percent}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-brand-600 transition-all duration-500"
                        style={{ width: `${Math.min(100, p.percent)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
