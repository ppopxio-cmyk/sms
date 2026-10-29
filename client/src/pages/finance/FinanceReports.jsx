import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileBarChart,
  Download,
  Printer,
  Calendar,
  Building2,
  TrendingUp,
  RefreshCw,
  Table,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/ui/Button';
import { SkeletonPage } from '../../components/ui/Skeleton';
import { ETH_MONTHS, formatEthiopian } from '../../lib/ethiopianDate';

const ETH_MONTHS_NAMES = [
  { en: 'Meskerem', am: 'መስከረም', num: 1 },
  { en: 'Tikimt', am: 'ጥቅምት', num: 2 },
  { en: 'Hidar', am: 'ኅዳር', num: 3 },
  { en: 'Tahsas', am: 'ታኅሣሥ', num: 4 },
  { en: 'Tir', am: 'ጥር', num: 5 },
  { en: 'Yekatit', am: 'የካቲት', num: 6 },
  { en: 'Megabit', am: 'መጋቢት', num: 7 },
  { en: 'Miazia', am: 'ሚያዝያ', num: 8 },
  { en: 'Ginbot', am: 'ግንቦት', num: 9 },
  { en: 'Sene', am: 'ሰኔ', num: 10 },
  { en: 'Hamle', am: 'ሐምሌ', num: 11 },
  { en: 'Nehase', am: 'ነሐሴ', num: 12 },
  { en: 'Pagume', am: 'ጳጉሜ', num: 13 },
];

export default function FinanceReports() {
  const [selectedYear, setSelectedYear] = useState(2019);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['finance', 'reports', selectedYear],
    queryFn: async () => {
      const res = await api.get('/finance/dashboard');
      return res.data;
    },
  });

  const { data: cyclesData } = useQuery({
    queryKey: ['finance', 'cycles-all', selectedYear],
    queryFn: async () => {
      const res = await api.get('/finance/cycles', {
        params: { ethYear: selectedYear, limit: 100 },
      });
      return res.data?.cycles || [];
    },
  });

  if (isLoading) {
    return <SkeletonPage cards={3} />;
  }

  // Aggregate stats across the 13 Ethiopian months
  const monthlyData = ETH_MONTHS_NAMES.map((m) => {
    const cycle = (cyclesData || []).find((c) => c.ethMonth === m.num);
    const collectedEtb = cycle ? parseFloat(cycle.collectedEtb || '0') : 0;
    const outstandingEtb = cycle ? parseFloat(cycle.outstandingEtb || '0') : 0;
    const totalBilled = collectedEtb + outstandingEtb;
    const rate = totalBilled > 0 ? Math.round((collectedEtb / totalBilled) * 100) : 0;

    return {
      monthNumber: m.num,
      nameEn: m.en,
      nameAm: m.am,
      hasCycle: Boolean(cycle),
      cycleTitle: cycle?.title || '—',
      studentsCount: cycle?.totalStudents || 0,
      paidCount: cycle?.paidCount || 0,
      collectedEtb,
      outstandingEtb,
      totalBilled,
      rate,
    };
  });

  const yearTotalCollected = monthlyData.reduce((acc, m) => acc + m.collectedEtb, 0);
  const yearTotalBilled = monthlyData.reduce((acc, m) => acc + m.totalBilled, 0);
  const overallRate = yearTotalBilled > 0 ? Math.round((yearTotalCollected / yearTotalBilled) * 100) : 0;

  const handleExportCsv = () => {
    const headers = [
      'Month #',
      'Month Name (EN)',
      'Month Name (AM)',
      'Cycle Title',
      'Students Billed',
      'Students Paid',
      'Collected (ETB)',
      'Outstanding (ETB)',
      'Total Billed (ETB)',
      'Collection Rate (%)',
    ];

    const rows = monthlyData.map((m) => [
      m.monthNumber,
      m.nameEn,
      m.nameAm,
      `"${m.cycleTitle}"`,
      m.studentsCount,
      m.paidCount,
      m.collectedEtb.toFixed(2),
      m.outstandingEtb.toFixed(2),
      m.totalBilled.toFixed(2),
      `${m.rate}%`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Finance_Report_${selectedYear}_EC.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Excel/CSV export downloaded!');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Annual Academic Performance & Financial Reports (${selectedYear} EC)`}
        subtitle="Official 13-month Ethiopian calendar academic fee report for executive review, auditing, and college records."
        icon={FileBarChart}
        actions={
          <div className="flex items-center gap-2">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm"
            >
              {[2018, 2019, 2020, 2021].map((y) => (
                <option key={y} value={y}>
                  {y} EC Academic Year
                </option>
              ))}
            </select>

            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="h-4 w-4" />
              <span>Export CSV/Excel</span>
            </Button>

            <Button size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              <span>Print Official Report</span>
            </Button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={TrendingUp}
          label="Total Collected (Year)"
          value={`${yearTotalCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`}
          hint={`Across 13 Ethiopian months of ${selectedYear} EC`}
          tone="emerald"
        />
        <StatCard
          icon={Calendar}
          label="Total Billed"
          value={`${yearTotalBilled.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`}
          hint="Sum of all issued monthly fee charges"
          tone="indigo"
        />
        <StatCard
          icon={FileBarChart}
          label="Overall Settlement Rate"
          value={`${overallRate}%`}
          hint="College-wide fee collection efficiency"
          tone="violet"
        />
      </div>

      {/* 13-Month Performance Table */}
      <Card>
        <CardHeader
          title={`13 Ethiopian Months Fee Breakdown (${selectedYear} EC)`}
          subtitle="Complete monthly breakdown from Meskerem (Month 1) through Pagume (Month 13)."
          icon={Table}
        />
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="py-3.5 pl-6 pr-4">#</th>
                  <th className="py-3.5 px-4">Month Name (EN / AM)</th>
                  <th className="py-3.5 px-4">Cycle Title</th>
                  <th className="py-3.5 px-4">Students Billed</th>
                  <th className="py-3.5 px-4">Students Paid</th>
                  <th className="py-3.5 px-4">Collected (ETB)</th>
                  <th className="py-3.5 px-4">Outstanding (ETB)</th>
                  <th className="py-3.5 px-4">Collection Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthlyData.map((m) => (
                  <tr key={m.monthNumber} className="transition hover:bg-slate-50/70">
                    <td className="py-3.5 pl-6 pr-4 font-mono text-xs text-slate-400">
                      {m.monthNumber}
                    </td>

                    <td className="py-3.5 px-4 font-medium text-slate-800">
                      {m.nameEn}{' '}
                      <span className="font-normal text-slate-400 text-xs">
                        ({m.nameAm})
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      {m.cycleTitle}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-xs text-slate-700">
                      {m.studentsCount}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-xs text-emerald-700">
                      {m.paidCount}
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      {m.collectedEtb > 0
                        ? `${m.collectedEtb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`
                        : '—'}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                      {m.outstandingEtb > 0
                        ? `${m.outstandingEtb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`
                        : '—'}
                    </td>

                    <td className="py-3.5 px-4">
                      {m.hasCycle ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-slate-700">
                            {m.rate}%
                          </span>
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${m.rate}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Not Created</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/70 font-semibold text-slate-900">
                  <td colSpan={5} className="py-4 pl-6 pr-4 text-xs uppercase tracking-wider text-slate-600">
                    Total Academic Year Collections ({selectedYear} EC)
                  </td>
                  <td className="py-4 px-4 font-mono text-base font-bold text-emerald-800">
                    {yearTotalCollected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB
                  </td>
                  <td colSpan={2} className="py-4 px-4 font-mono text-sm text-slate-700">
                    {overallRate}% Overall Efficiency
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
