import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileBarChart,
  Download,
  Printer,
  Calendar,
  TrendingUp,
  Wallet,
  FileText,
  FileSpreadsheet,
  CircleDollarSign,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { downloadExport } from '../../lib/download';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody } from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/ui/Button';
import { SkeletonPage } from '../../components/ui/Skeleton';
import { ETH_MONTHS } from '../../lib/ethiopianDate';

const money = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FinanceReports() {
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [exporting, setExporting] = useState('');

  // Real academic years that have payment cycles on record
  const { data: yearsData, isLoading: yearsLoading } = useQuery({
    queryKey: ['finance', 'reportYears'],
    queryFn: async () => {
      const res = await api.get('/finance/reports/years');
      return res.data?.years || [];
    },
  });

  useEffect(() => {
    if (!selectedYear && yearsData?.length) {
      setSelectedYear(String(yearsData[0].ethYear));
    }
  }, [yearsData, selectedYear]);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['finance', 'reports', selectedYear],
    queryFn: async () => {
      const res = await api.get('/finance/reports', { params: { ethYear: selectedYear } });
      return res.data;
    },
    enabled: Boolean(selectedYear),
  });

  if (yearsLoading) {
    return <SkeletonPage cards={3} />;
  }

  if (!yearsData?.length) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Finance Reports"
          subtitle="Yearly reports per Ethiopian academic year of billing."
          icon={FileBarChart}
        />
        <Card>
          <CardBody className="p-10 text-center">
            <FileBarChart className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-700">No payment cycles exist yet.</p>
            <p className="text-xs text-slate-400">Reports become available once monthly payment cycles are created.</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  const totals = data?.totals || {};
  const monthRows = data?.monthRows || [];
  const programmeRows = data?.programmeRows || [];
  const methodRows = data?.methodRows || [];

  const handleExport = async (format, overrideMonth = null) => {
    const monthToExport = overrideMonth !== null ? overrideMonth : selectedMonth;
    setExporting(format);
    try {
      const monthParam = monthToExport ? `&ethMonth=${monthToExport}` : '';
      const monthLabel = monthToExport ? `-${ETH_MONTHS[Number(monthToExport) - 1] || 'Month'}` : '';
      await downloadExport(
        `/finance/reports/export?ethYear=${selectedYear}${monthParam}&format=${format}`,
        `Finance-Report${monthLabel}-${selectedYear}EC.${format}`,
      );
      toast.success(`${format.toUpperCase()} report downloaded.`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not generate the export.'));
    } finally {
      setExporting('');
    }
  };

  const exportBar = (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={selectedYear}
        onChange={(e) => setSelectedYear(e.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm"
      >
        {yearsData.map((y) => (
          <option key={y.ethYear} value={y.ethYear}>
            {y.ethYear} EC Academic Year
          </option>
        ))}
      </select>

      <Button size="sm" onClick={() => window.print()}>
        <Printer className="h-4 w-4" />
        <span>Print Official Report</span>
      </Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Finance Report ${selectedYear} EC`}
        subtitle="Official yearly 12-month Ethiopian calendar fee collection report for executive review and college records."
        icon={FileBarChart}
        actions={exportBar}
      />

      {/* Export toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Period:</span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-transparent text-xs font-semibold text-slate-800 outline-none cursor-pointer"
          >
            <option value="">Full Academic Year (12 Months)</option>
            {ETH_MONTHS.slice(0, 12).map((m, idx) => (
              <option key={idx + 1} value={idx + 1}>
                {idx + 1}. {m}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 shadow-sm">
          <span className="flex items-center gap-1 bg-slate-50 px-2.5 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <Download className="h-3.5 w-3.5" /> Export {selectedMonth ? ETH_MONTHS[Number(selectedMonth) - 1] : 'Yearly'}
          </span>
          <button
            type="button"
            onClick={() => handleExport('pdf')}
            className="border-l border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-rose-600 hover:bg-rose-50"
          >
            PDF
          </button>
          <button
            type="button"
            onClick={() => handleExport('docx')}
            className="border-l border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-sky-600 hover:bg-sky-50"
          >
            Word
          </button>
          <button
            type="button"
            onClick={() => handleExport('xlsx')}
            className="border-l border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-emerald-600 hover:bg-emerald-50"
          >
            Excel
          </button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching || Boolean(exporting)}
        >
          <span>Refresh</span>
        </Button>
        {exporting && (
          <span className="flex items-center gap-2 text-xs font-semibold text-brand-700">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
            Generating {exporting.toUpperCase()}…
          </span>
        )}
      </div>

      {isLoading || !data ? (
        <SkeletonPage cards={2} />
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={TrendingUp}
              label="Total Collected (Year)"
              value={`${money(totals.paid)} ETB`}
              hint={`${totals.payments || 0} payments across ${totals.cycles || 0} cycles`}
              tone="emerald"
            />
            <StatCard
              icon={Wallet}
              label="Total Billed"
              value={`${money(totals.billed)} ETB`}
              hint={`${totals.charges || 0} monthly charges`}
              tone="indigo"
            />
            <StatCard
              icon={CircleDollarSign}
              label="Outstanding"
              value={`${money(totals.outstanding)} ETB`}
              hint="Unpaid & partially paid charges"
              tone="rose"
            />
            <StatCard
              icon={Calendar}
              label="Academic Year"
              value={`${data.ethYear} EC`}
              hint="Ethiopian calendar"
              tone="slate"
            />
          </div>

          {/* Per-month table */}
          <Card>
            <CardBody className="p-0">
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Monthly Collection — {selectedYear} EC</h3>
                  <p className="text-xs text-slate-400">Payments received per Ethiopian month.</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      <th className="py-3 pl-6 pr-4">Month</th>
                      <th className="py-3 px-4">Charges</th>
                      <th className="py-3 px-4">Payments</th>
                      <th className="py-3 px-4">Paid ETB</th>
                      <th className="py-3 pr-6 text-right">Export Month</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {monthRows.map((r) => (
                      <tr key={r.month} className="transition hover:bg-slate-50/70">
                        <td className="py-3 pl-6 pr-4 text-xs font-semibold text-slate-700">
                          {r.month}. {ETH_MONTHS[Number(r.month) - 1] || '—'}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-500">{r.charges}</td>
                        <td className="py-3 px-4 text-xs text-slate-500">{r.paidCount}</td>
                        <td className="py-3 px-4 font-mono text-xs font-bold text-slate-900">{money(r.paid)}</td>
                        <td className="py-3 pr-6 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleExport('xlsx', r.month)}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
                              title={`Export ${ETH_MONTHS[Number(r.month) - 1]} to Excel`}
                            >
                              Excel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleExport('pdf', r.month)}
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"
                              title={`Export ${ETH_MONTHS[Number(r.month) - 1]} to PDF`}
                            >
                              PDF
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>

          {/* Per-programme + per-method */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardBody className="p-0">
                <div className="border-b border-slate-100 px-6 py-4">
                  <h3 className="text-sm font-bold text-slate-900">Collection by Programme</h3>
                  <p className="text-xs text-slate-400">Outstanding balances grouped per study programme.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[460px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        <th className="py-3 pl-6 pr-4">Programme</th>
                        <th className="py-3 px-3">Charges</th>
                        <th className="py-3 px-3">Billed</th>
                        <th className="py-3 px-3">Paid</th>
                        <th className="py-3 pr-6">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {programmeRows.map((r) => (
                        <tr key={r.programme} className="transition hover:bg-slate-50/70">
                          <td className="py-3 pl-6 pr-4 text-xs font-semibold text-slate-700">{r.programme}</td>
                          <td className="py-3 px-3 text-xs text-slate-500">{r.charges}</td>
                          <td className="py-3 px-3 font-mono text-xs text-slate-600">{money(r.billed)}</td>
                          <td className="py-3 px-3 font-mono text-xs text-emerald-600">{money(r.paid)}</td>
                          <td className="py-3 pr-6 font-mono text-xs font-bold text-rose-600">{money(r.outstanding)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="p-0">
                <div className="border-b border-slate-100 px-6 py-4">
                  <h3 className="text-sm font-bold text-slate-900">Payments by Method</h3>
                  <p className="text-xs text-slate-400">Confirmed money received per settlement channel.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[320px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        <th className="py-3 pl-6 pr-4">Method</th>
                        <th className="py-3 pr-6 text-right">Amount (ETB)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {methodRows.map((r) => (
                        <tr key={r.method} className="transition hover:bg-slate-50/70">
                          <td className="py-3 pl-6 pr-4 text-xs font-semibold text-slate-700">{r.method}</td>
                          <td className="py-3 pr-6 text-right font-mono text-xs font-bold text-slate-900">{money(r.amount)}</td>
                        </tr>
                      ))}
                      {!methodRows.length && (
                        <tr>
                          <td colSpan={2} className="py-6 pl-6 text-xs text-slate-400">
                            No payments recorded in this year.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
