import { useState, useMemo, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CalendarDays,
  RefreshCw,
  Download,
  TrendingUp,
  DollarSign,
  Layers,
  PieChart as PieIcon,
  BarChart3,
  Clock,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { api } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/ui/Button';

const COLORS = ['#0284c7', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'];

const RANGE_OPTIONS = [
  { value: '3', label: '3 mo' },
  { value: '6', label: '6 mo' },
  { value: '9', label: '9 mo' },
  { value: '12', label: '1 yr' },
];

function downloadSvgAsPng(svgEl, filename) {
  if (!svgEl) return;

  const bounds = svgEl.getBoundingClientRect();
  const width = Math.ceil(bounds.width || svgEl.clientWidth || 0);
  const height = Math.ceil(bounds.height || svgEl.clientHeight || 0);

  if (!width || !height) return;

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.scale(scale, scale);

  // Work on a clone so exporting does not modify the on-screen chart.
  const svgClone = svgEl.cloneNode(true);
  svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svgClone.setAttribute('width', String(width));
  svgClone.setAttribute('height', String(height));

  // Explicit dimensions help the browser rasterize the SVG reliably.
  const svgMarkup = new XMLSerializer().serializeToString(svgClone);

  const img = new Image();
  img.onload = () => {
    try {
      ctx.drawImage(img, 0, 0, width, height);

      const link = document.createElement('a');
      link.download = `${filename || 'chart'}.png`;
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Unable to export chart as PNG:', error);
    }
  };
  img.onerror = () => {
    console.error('Unable to render chart SVG for PNG export.');
  };
  img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgMarkup)))}`;
}

function CaptureChart({ children, filename }) {
  const ref = useRef(null);
  const download = useCallback(() => {
    const svg = ref.current?.querySelector('svg');
    if (svg) downloadSvgAsPng(svg, filename);
  }, [filename]);
  return (
    <div ref={ref}>
      {children}
      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="outline" onClick={download}>
          <Download className="h-3 w-3" />
          <span>Save PNG</span>
        </Button>
      </div>
    </div>
  );
}

export default function FinanceAnalytics() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['finance', 'dashboard'],
    queryFn: async () => {
      const res = await api.get('/finance/dashboard');
      return res.data;
    },
  });

  const [rangeMonths, setRangeMonths] = useState('12');

  const trendData = useMemo(() => {
    const list = data?.monthlyTrend || [];
    const months = Number(rangeMonths) || 12;
    return list.slice(-months);
  }, [data, rangeMonths]);

  const overview = data?.overview || {};
  const statusSplit = data?.statusSplit || {};
  const programmeBreakdown = data?.programmeBreakdown || [];
  const paymentMethodBreakdown = data?.paymentMethodBreakdown || [];
  const departmentBreakdown = data?.departmentBreakdown || [];
  const cycleStatusCounts = data?.cycleStatusCounts || {};
  const topDebtors = data?.topDebtors || [];

  const pieData = [
    { name: 'Paid', value: statusSplit.paid || 0, color: '#10b981' },
    { name: 'Unpaid', value: statusSplit.unpaid || 0, color: '#64748b' },
    { name: 'Overdue (Holds)', value: statusSplit.overdue || 0, color: '#f43f5e' },
    { name: 'Waived', value: statusSplit.waived || 0, color: '#8b5cf6' },
  ].filter((d) => d.value > 0);

  // Use the map index for the color. Referencing methodPieData here would
  // access the variable before its initialization and crash the page.
  const methodPieData = paymentMethodBreakdown.map((method, index) => ({
    name: method.method || 'other',
    value: Number(method.totalSantim || 0),
    color: COLORS[index % COLORS.length],
  }));

  const cycleStatusPie = Object.entries(cycleStatusCounts).map(([k, v], i) => ({
    name: k || 'unknown',
    value: v,
    color: COLORS[i % COLORS.length],
  }));

  const collectedVsBilled = trendData.map((t) => ({
    label: t.monthName || t.title,
    billed: Number(t.billedSantim || 0),
    collected: Number(t.collectedSantim || 0),
  }));

  const debtorsBar = topDebtors.map((d) => ({
    name: (d.studentName || '').slice(0, 12),
    studentId: d.studentId,
    outstandingEtb: Number(d.outstandingEtb),
  }));

  const deptBar = departmentBreakdown.map((d) => ({
    name: (d.department || '').slice(0, 14),
    billed: Number(d.totalBilledEtb || 0),
    collected: Number(d.collectedEtb || 0),
    percent: d.percent,
  }));

  const holdTrend = trendData.map((t) => ({
    label: t.monthName || t.title,
    collected: Number(t.collectedSantim || 0),
  }));

  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm text-slate-500">
        Loading analytics...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance Analytics"
        subtitle="10 live charts with finance data. Filter by time range and download any chart as PNG."
        icon={BarChart3}
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
            <Link to="/accountant/dashboard">
              <Button size="sm" variant="ghost">
                Back to Dashboard
              </Button>
            </Link>
          </div>
        }
      />

      {/* Top KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={DollarSign}
          label="Total Collected"
          value={`${overview.totalCollectedEtb || '0.00'} ETB`}
          hint={`${overview.percentPaid || 0}% of billed fees settled`}
          tone="emerald"
        />
        <StatCard
          icon={Clock}
          label="Outstanding"
          value={`${overview.totalOutstandingEtb || '0.00'} ETB`}
          hint="Unpaid active charges"
          tone="amber"
        />
        <StatCard
          icon={AlertCircle}
          label="Active Holds"
          value={overview.overdueCount || 0}
          hint="Students blocked for overdue fees"
          tone="rose"
        />
        <StatCard
          icon={Layers}
          label="Total Billed"
          value={`${overview.totalBilledEtb || '0.00'} ETB`}
          hint="All cycle charges"
          tone="slate"
        />
      </div>

      {/* Time Range Filter */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Time Range:</span>
        <div className="flex gap-1">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRangeMonths(opt.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                rangeMonths === opt.value
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400 ml-2">
          Showing {trendData.length} of {data?.monthlyTrend?.length || 0} cycles
        </span>
      </div>

      {/* Row 1: 4 charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* 1. Collected vs Billed Over Time */}
        <Card>
          <CardHeader title="Collected vs Billed Over Time" icon={TrendingUp} />
          <CardBody>
            <CaptureChart filename="collected-vs-billed">
              {collectedVsBilled.length === 0 ? (
                <p className="py-12 text-center text-xs text-slate-400">No trend data yet.</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={collectedVsBilled} margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" stroke="#64748b" fontSize={10} tickLine={false} angle={-15} textAnchor="end" interval={0} />
                      <YAxis stroke="#64748b" fontSize={10} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => [`${Number(v).toLocaleString()} ETB`, 'Amount']} labelStyle={{ fontWeight: 'bold' }} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="billed" fill="#94a3b8" radius={[4, 4, 0, 0]} name="Billed" />
                      <Bar dataKey="collected" fill="#10b981" radius={[4, 4, 0, 0]} name="Collected" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CaptureChart>
          </CardBody>
        </Card>

        {/* 2. Status Distribution Donut */}
        <Card>
          <CardHeader title="Fee Charge Status" icon={PieIcon} />
          <CardBody>
            <CaptureChart filename="status-distribution">
              {pieData.length === 0 ? (
                <p className="py-12 text-center text-xs text-slate-400">No data.</p>
              ) : (
                <div className="flex h-72 items-center justify-center gap-6">
                  <div className="h-52 w-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3}>
                          {pieData.map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => [v, 'Students']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 text-xs">
                    {pieData.map((d) => (
                      <div key={d.name} className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ background: d.color }} />
                        <span className="text-slate-600">{d.name}:</span>
                        <span className="font-mono font-bold text-slate-800">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CaptureChart>
          </CardBody>
        </Card>

        {/* 3. Programme Breakdown Horizontal Bar */}
        <Card>
          <CardHeader title="Collection Rate by Programme" icon={BarChart3} />
          <CardBody>
            <CaptureChart filename="programme-breakdown">
              {programmeBreakdown.length === 0 ? (
                <p className="py-12 text-center text-xs text-slate-400">No programme data.</p>
              ) : (
                <div className="space-y-4 py-4">
                  {programmeBreakdown.map((p, idx) => (
                    <div key={p.programme}>
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-800 truncate max-w-[200px]">{p.programme}</span>
                        <span className="font-mono text-slate-500">
                          {p.collectedEtb} / {p.totalBilledEtb} ETB ({p.percent}%)
                        </span>
                      </div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, p.percent)}%`, background: COLORS[idx % COLORS.length] }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CaptureChart>
          </CardBody>
        </Card>

        {/* 4. Payment Method Breakdown */}
        <Card>
          <CardHeader title="Payment Method Split" icon={PieIcon} />
          <CardBody>
            <CaptureChart filename="payment-methods">
              {methodPieData.length === 0 ? (
                <p className="py-12 text-center text-xs text-slate-400">No payment data yet.</p>
              ) : (
                <div className="flex h-72 items-center justify-center gap-6">
                  <div className="h-52 w-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={methodPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2}>
                          {methodPieData.map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => [`${Number(v).toLocaleString()} ETB`, 'Amount']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 text-xs">
                    {methodPieData.map((d) => (
                      <div key={d.name} className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ background: d.color }} />
                        <span className="font-mono text-slate-700">{d.name}</span>
                        <span className="text-slate-400">{((d.value / 100).toFixed(0))} ETB</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CaptureChart>
          </CardBody>
        </Card>
      </div>

      {/* Row 2: 4 more charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* 5. Collection Trend Area */}
        <Card>
          <CardHeader title="Collection Trend (Area)" icon={TrendingUp} />
          <CardBody>
            <CaptureChart filename="collection-trend">
              {holdTrend.length === 0 ? (
                <p className="py-12 text-center text-xs text-slate-400">No trend data yet.</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={holdTrend} margin={{ top: 10, right: 10, left: 10, bottom: 30 }}>
                      <defs>
                        <linearGradient id="colorCol" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" stroke="#64748b" fontSize={10} tickLine={false} angle={-20} textAnchor="end" interval={0} />
                      <YAxis stroke="#64748b" fontSize={10} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => [`${Number(v).toLocaleString()} ETB`, 'Collected']} labelStyle={{ fontWeight: 'bold' }} />
                      <Area type="monotone" dataKey="collected" stroke="#10b981" fillOpacity={1} fill="url(#colorCol)" name="Collected" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CaptureChart>
          </CardBody>
        </Card>

        {/* 6. Top Debtors */}
        <Card>
          <CardHeader title="Top Outstanding Students" icon={AlertCircle} />
          <CardBody>
            <CaptureChart filename="top-debtors">
              {debtorsBar.length === 0 ? (
                <p className="py-12 text-center text-xs text-slate-400">No outstanding students.</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={debtorsBar} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e2e8f0" />
                      <XAxis type="number" stroke="#64748b" fontSize={10} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} width={80} />
                      <Tooltip formatter={(v) => [`${Number(v).toLocaleString()} ETB`, 'Outstanding']} />
                      <Bar dataKey="outstandingEtb" fill="#f43f5e" radius={[0, 4, 4, 0]} name="Outstanding" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CaptureChart>
          </CardBody>
        </Card>

        {/* 7. Department Collection */}
        <Card>
          <CardHeader title="Collection by Department" icon={Layers} />
          <CardBody>
            <CaptureChart filename="department-collection">
              {deptBar.length === 0 ? (
                <p className="py-12 text-center text-xs text-slate-400">No department data.</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deptBar} margin={{ top: 10, right: 20, left: 10, bottom: 50 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} angle={-25} textAnchor="end" interval={0} />
                      <YAxis stroke="#64748b" fontSize={10} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => [`${Number(v).toLocaleString()} ETB`, 'Amount']} labelStyle={{ fontWeight: 'bold' }} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar dataKey="billed" fill="#94a3b8" radius={[4, 4, 0, 0]} name="Billed" />
                      <Bar dataKey="collected" fill="#0284c7" radius={[4, 4, 0, 0]} name="Collected" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CaptureChart>
          </CardBody>
        </Card>

        {/* 8. Cycle Status Pie */}
        <Card>
          <CardHeader title="Cycle Status Overview" icon={CalendarDays} />
          <CardBody>
            <CaptureChart filename="cycle-status">
              {cycleStatusPie.length === 0 ? (
                <p className="py-12 text-center text-xs text-slate-400">No cycles created yet.</p>
              ) : (
                <div className="flex h-72 items-center justify-center gap-6">
                  <div className="h-52 w-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={cycleStatusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3}>
                          {cycleStatusPie.map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v) => [v, 'Cycles']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 text-xs">
                    {cycleStatusPie.map((d) => (
                      <div key={d.name} className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full" style={{ background: d.color }} />
                        <span className="font-semibold text-slate-700 capitalize">{d.name}:</span>
                        <span className="font-mono font-bold text-slate-800">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CaptureChart>
          </CardBody>
        </Card>
      </div>

      {/* Row 3: Additional insight charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* 9. Programme collection rate scatter */}
        <Card>
          <CardHeader title="Collection Rate vs Volume (Programmes)" icon={BarChart3} />
          <CardBody>
            <CaptureChart filename="programme-scatter">
              {programmeBreakdown.length === 0 ? (
                <p className="py-12 text-center text-xs text-slate-400">No programme data.</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={programmeBreakdown.map((p, i) => ({
                      ...p,
                      label: p.programme,
                      pct: p.percent,
                      total: Number(p.totalBilledEtb),
                    }))} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" stroke="#64748b" fontSize={10} tickLine={false} angle={-20} textAnchor="end" interval={0} />
                      <YAxis yAxisId="left" stroke="#64748b" fontSize={10} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <YAxis yAxisId="right" orientation="right" stroke="#64748b" fontSize={10} tickLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                      <Tooltip formatter={(v, n) => [n === 'rate' ? `${v}%` : `${Number(v).toLocaleString()} ETB`, n]} />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      <Bar yAxisId="left" dataKey="total" fill="#94a3b8" radius={[4, 4, 0, 0]} name="Total Billed" />
                      <Bar yAxisId="right" dataKey="pct" fill="#10b981" radius={[4, 4, 0, 0]} name="Collection Rate %" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CaptureChart>
          </CardBody>
        </Card>

        {/* 10. Trend line */}
        <Card>
          <CardHeader title="Monthly Collection Trajectory" icon={TrendingUp} />
          <CardBody>
            <CaptureChart filename="collection-trajectory">
              {trendData.length === 0 ? (
                <p className="py-12 text-center text-xs text-slate-400">No trend data yet.</p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData.map((t) => ({ label: t.monthName || t.title, collected: Number(t.collectedSantim || 0) }))} margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="label" stroke="#64748b" fontSize={10} tickLine={false} angle={-20} textAnchor="end" interval={0} />
                      <YAxis stroke="#64748b" fontSize={10} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v) => [`${Number(v).toLocaleString()} ETB`, 'Collected']} labelStyle={{ fontWeight: 'bold' }} />
                      <Line type="monotone" dataKey="collected" stroke="#0284c7" strokeWidth={2} dot={{ fill: '#0284c7', r: 4 }} name="Collected" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CaptureChart>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
