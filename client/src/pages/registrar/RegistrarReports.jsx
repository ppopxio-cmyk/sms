import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  BarChart,
  PieChart,
  Line,
  Bar,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend,
} from 'recharts';
import {
  FileBarChart,
  Calendar,
  Users,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Download,
  Printer,
  RotateCcw,
  Building2,
  GraduationCap,
  ClipboardCheck,
  CalendarCheck2,
  Clock,
  Layers,
  ArrowRight,
  ShieldCheck,
  FileSpreadsheet,
  Filter,
  Eye,
  Award,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  REGISTRAR,
  downloadFile,
  fileErrorMessage,
  formatEthiopian,
} from '../../lib/registrar';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import { SelectField } from '../../components/registrar/Fields';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import StatCard from '../../components/ui/StatCard';
import { SkeletonCard, SkeletonPage } from '../../components/ui/Skeleton';

const MONTH_OPTIONS = [
  { value: '', label: 'All Months (Full Year)' },
  { value: '1', label: 'January' },
  { value: '2', label: 'February' },
  { value: '3', label: 'March' },
  { value: '4', label: 'April' },
  { value: '5', label: 'May' },
  { value: '6', label: 'June' },
  { value: '7', label: 'July' },
  { value: '8', label: 'August' },
  { value: '9', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

const REPORT_TYPES = [
  { value: 'yearly', label: 'Yearly Academic Performance Report' },
  { value: 'monthly', label: 'Monthly Academic Performance Report' },
  { value: 'departments', label: 'Department & Programme Comparison' },
  { value: 'courses', label: 'Course-by-Course Telemetry' },
  { value: 'workflow', label: 'Registrar Result Workflow Audit' },
];

const GRADE_COLORS = {
  'A+': '#10b981',
  A: '#059669',
  'A-': '#34d399',
  'B+': '#3b82f6',
  B: '#2563eb',
  'B-': '#60a5fa',
  'C+': '#f59e0b',
  C: '#d97706',
  'C-': '#fbbf24',
  D: '#ea580c',
  F: '#ef4444',
  Pass: '#10b981',
};

const DEFAULT_GRADE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444', '#64748b'];

export default function RegistrarReports() {
  // Draft filter states
  const [draftAcademicYear, setDraftAcademicYear] = useState('');
  const [draftReportType, setDraftReportType] = useState('yearly');
  const [draftMonth, setDraftMonth] = useState('');
  const [draftBatch, setDraftBatch] = useState('');
  const [draftStudyMode, setDraftStudyMode] = useState('all');
  const [draftDepartment, setDraftDepartment] = useState('');
  const [draftProgram, setDraftProgram] = useState('');
  const [draftQualification, setDraftQualification] = useState('all');
  const [draftLevel, setDraftLevel] = useState('');

  // Applied filter states
  const [appliedFilters, setAppliedFilters] = useState({
    academicYear: '',
    reportType: 'yearly',
    month: '',
    batch: '',
    studyMode: 'all',
    department: '',
    program: '',
    qualification: 'all',
    level: '',
  });

  const [exportingFormat, setExportingFormat] = useState(null); // 'pdf' | 'xlsx' | null

  // 1. Fetch metadata options (academic years, departments, programmes, batches)
  const optionsQuery = useQuery({
    queryKey: ['registrar', 'students', 'options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/options`)).data,
    staleTime: 5 * 60_000,
  });

  const academicYears = optionsQuery.data?.academicYears || [];
  const departments = optionsQuery.data?.departments || [];
  const allPrograms = optionsQuery.data?.programs || [];
  const rawBatches = optionsQuery.data?.batches || [];

  // Deduplicate batches by code / name
  const uniqueBatches = useMemo(() => {
    const seen = new Set();
    const list = [];
    for (const b of rawBatches) {
      const codeKey = (b.code || b.name || '').trim().toLowerCase();
      if (!seen.has(codeKey)) {
        seen.add(codeKey);
        list.push(b);
      }
    }
    return list;
  }, [rawBatches]);

  // Filter programmes by draft department
  const filteredPrograms = useMemo(() => {
    if (!draftDepartment) return allPrograms;
    return allPrograms.filter((p) => p.department === draftDepartment);
  }, [allPrograms, draftDepartment]);

  // 2. Fetch Academic Analytics from database using applied filters
  const analyticsQuery = useQuery({
    queryKey: ['registrar', 'academic-analytics', appliedFilters],
    queryFn: async () => {
      const params = {
        ...(appliedFilters.academicYear ? { academicYear: appliedFilters.academicYear } : {}),
        reportType: appliedFilters.reportType || 'yearly',
        ...(appliedFilters.month ? { month: appliedFilters.month } : {}),
        ...(appliedFilters.batch ? { batch: appliedFilters.batch } : {}),
        ...(appliedFilters.studyMode !== 'all' ? { studyMode: appliedFilters.studyMode } : {}),
        ...(appliedFilters.department ? { department: appliedFilters.department } : {}),
        ...(appliedFilters.program ? { program: appliedFilters.program } : {}),
        ...(appliedFilters.qualification !== 'all' ? { qualification: appliedFilters.qualification } : {}),
        ...(appliedFilters.level ? { level: appliedFilters.level } : {}),
      };
      return (await api.get(`${REGISTRAR}/reports/academic-analytics`, { params })).data;
    },
    staleTime: 60_000,
  });

  const data = analyticsQuery.data;
  const summary = data?.summary || {};
  const scope = data?.scope || {};
  const monthlyTrend = data?.monthlyTrend || [];
  const departmentComparison = data?.departmentComparison || [];
  const programComparison = data?.programComparison || [];
  const studyModeComparison = data?.studyModeComparison || [];
  const gradeDistribution = data?.gradeDistribution || [];
  const courseTable = data?.courseTable || [];
  const resultWorkflow = data?.resultWorkflow || { counts: {}, items: [] };

  // Handle Apply Filters / Generate Report
  const handleGenerateReport = () => {
    setAppliedFilters({
      academicYear: draftAcademicYear,
      reportType: draftReportType,
      month: draftMonth,
      batch: draftBatch,
      studyMode: draftStudyMode,
      department: draftDepartment,
      program: draftProgram,
      qualification: draftQualification,
      level: draftLevel,
    });
    toast.success('Academic performance report generated.');
  };

  // Handle Reset Filters
  const handleResetFilters = () => {
    setDraftAcademicYear('');
    setDraftReportType('yearly');
    setDraftMonth('');
    setDraftBatch('');
    setDraftStudyMode('all');
    setDraftDepartment('');
    setDraftProgram('');
    setDraftQualification('all');
    setDraftLevel('');

    setAppliedFilters({
      academicYear: '',
      reportType: 'yearly',
      month: '',
      batch: '',
      studyMode: 'all',
      department: '',
      program: '',
      qualification: 'all',
      level: '',
    });
    toast.success('Report filters reset.');
  };

  // Handle Export (PDF or Excel)
  const handleExport = async (format) => {
    setExportingFormat(format);
    const params = {
      ...(appliedFilters.academicYear ? { academicYear: appliedFilters.academicYear } : {}),
      reportType: appliedFilters.reportType || 'yearly',
      ...(appliedFilters.month ? { month: appliedFilters.month } : {}),
      ...(appliedFilters.batch ? { batch: appliedFilters.batch } : {}),
      ...(appliedFilters.studyMode !== 'all' ? { studyMode: appliedFilters.studyMode } : {}),
      ...(appliedFilters.department ? { department: appliedFilters.department } : {}),
      ...(appliedFilters.program ? { program: appliedFilters.program } : {}),
      ...(appliedFilters.qualification !== 'all' ? { qualification: appliedFilters.qualification } : {}),
      ...(appliedFilters.level ? { level: appliedFilters.level } : {}),
      format,
    };

    try {
      await downloadFile(
        `${REGISTRAR}/reports/academic-export`,
        `Academic_Report_${appliedFilters.reportType}_${appliedFilters.month || 'FullYear'}.${format}`,
        { params },
      );
      toast.success(`Academic report exported successfully as ${format.toUpperCase()}.`);
    } catch (err) {
      toast.error(await fileErrorMessage(err, `Failed to export ${format.toUpperCase()} report.`));
    } finally {
      setExportingFormat(null);
    }
  };

  // Handle Browser Print
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 print:m-0 print:p-0 print:space-y-4">
      {/* Page Header */}
      <div className="print:hidden">
        <RegistrarPageHeader
          eyebrow="Office of the Registrar"
          title="Academic Reports"
          subtitle="Analyze college-wide academic performance by month and academic year. Inspect real-time attendance telemetry, examination results, grade distributions, department benchmarks, and result submission workflows."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleExport('xlsx')}
                loading={exportingFormat === 'xlsx'}
                className="gap-1.5 text-xs text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-200"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Export Excel
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleExport('pdf')}
                loading={exportingFormat === 'pdf'}
                className="gap-1.5 text-xs text-rose-800 bg-rose-50 hover:bg-rose-100 border-rose-200"
              >
                <Download className="h-4 w-4 text-rose-600" /> Export PDF
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePrint}
                className="gap-1.5 text-xs"
              >
                <Printer className="h-4 w-4 text-slate-600" /> Print
              </Button>
            </div>
          }
        />
      </div>

      {/* Print-only Header */}
      <div className="hidden print:block border-b border-slate-300 pb-4 mb-4 text-center">
        <h1 className="text-2xl font-black text-slate-900 uppercase tracking-wider">
          COLLEGE OF HIGHER EDUCATION
        </h1>
        <p className="text-xs uppercase font-bold text-slate-600 mt-0.5">
          Office of the Registrar · Official Academic Telemetry & Performance Report
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Period: {scope.reportingPeriod || 'Full Year'} · Scope: {scope.departmentName || 'All Departments'} · {scope.programName || 'All Programmes'} · Generated: {new Date().toLocaleDateString()}
        </p>
      </div>

      {/* COMPREHENSIVE FILTER DASHBOARD CONTROLS */}
      <Card className="print:hidden">
        <CardHeader
          title="Report Parameters & Scope Filters"
          subtitle="Select the academic year, calendar month, study mode, and department/programme scope to evaluate real database records."
          icon={Filter}
        />
        <CardBody className="p-4 sm:p-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {/* Academic Year */}
            <SelectField
              label="Academic Year"
              value={draftAcademicYear}
              onChange={(e) => setDraftAcademicYear(e.target.value)}
            >
              <option value="">Active / Latest Year</option>
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.label}
                </option>
              ))}
            </SelectField>

            {/* Report Type */}
            <SelectField
              label="Report Type"
              value={draftReportType}
              onChange={(e) => setDraftReportType(e.target.value)}
            >
              {REPORT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </SelectField>

            {/* Month Filter */}
            <SelectField
              label="Calendar Month"
              value={draftMonth}
              onChange={(e) => {
                setDraftMonth(e.target.value);
                if (e.target.value && draftReportType === 'yearly') {
                  setDraftReportType('monthly');
                }
              }}
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </SelectField>

            {/* Department Filter */}
            <SelectField
              label="Department"
              value={draftDepartment}
              onChange={(e) => {
                setDraftDepartment(e.target.value);
                setDraftProgram('');
              }}
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </SelectField>

            {/* Programme Filter */}
            <SelectField
              label="Programme"
              value={draftProgram}
              onChange={(e) => setDraftProgram(e.target.value)}
            >
              <option value="">All Programmes</option>
              {filteredPrograms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </SelectField>

            {/* Study Mode (Regular vs Extension) */}
            <SelectField
              label="Study Mode"
              value={draftStudyMode}
              onChange={(e) => setDraftStudyMode(e.target.value)}
            >
              <option value="all">All Study Modes</option>
              <option value="regular">Regular Stream</option>
              <option value="extension">Extension Stream</option>
            </SelectField>

            {/* Batch Filter */}
            <SelectField
              label="Batch"
              value={draftBatch}
              onChange={(e) => setDraftBatch(e.target.value)}
            >
              <option value="">All Batches</option>
              {uniqueBatches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </SelectField>

            {/* Qualification Level */}
            <SelectField
              label="Qualification"
              value={draftQualification}
              onChange={(e) => setDraftQualification(e.target.value)}
            >
              <option value="all">All Qualifications</option>
              <option value="degree">Degree (4 Years)</option>
              <option value="diploma">Diploma (4 Levels)</option>
              <option value="short-term">Short-Term (3 Months)</option>
            </SelectField>

            {/* Stage / Year / Level */}
            <SelectField
              label="Year / Level / Month"
              value={draftLevel}
              onChange={(e) => setDraftLevel(e.target.value)}
            >
              <option value="">All Levels / Stages</option>
              <option value="1">Year 1 / Level 1 / Month 1</option>
              <option value="2">Year 2 / Level 2 / Month 2</option>
              <option value="3">Year 3 / Level 3 / Month 3</option>
              <option value="4">Year 4 / Level 4</option>
            </SelectField>

            {/* Generate & Reset Buttons */}
            <div className="flex items-end gap-2">
              <Button
                variant="primary"
                onClick={handleGenerateReport}
                className="flex-1 h-10 gap-1.5 font-bold shadow-sm"
              >
                <TrendingUp className="h-4 w-4" /> Generate
              </Button>
              <Button
                variant="secondary"
                onClick={handleResetFilters}
                className="h-10 px-3 text-slate-600 hover:text-slate-900"
                title="Reset Filters"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Active Scope Pill Display */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
            <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
              Active Scope:
            </span>
            <Badge tone="brand">
              <Calendar className="h-3 w-3 inline mr-1" />
              {scope.reportingPeriod || 'Academic Year 2019'}
            </Badge>
            <Badge tone="neutral">
              <Building2 className="h-3 w-3 inline mr-1" />
              {scope.departmentName || 'All Departments'}
            </Badge>
            <Badge tone="neutral">
              <GraduationCap className="h-3 w-3 inline mr-1" />
              {scope.programName || 'All Programmes'}
            </Badge>
            <Badge tone={scope.studyMode?.includes('REGULAR') ? 'neutral' : 'warning'}>
              {scope.studyMode || 'All Modes'}
            </Badge>
          </div>
        </CardBody>
      </Card>

      {/* LOADING STATE */}
      {analyticsQuery.isLoading ? (
        <SkeletonPage cards={4} />
      ) : analyticsQuery.isError ? (
        <Card>
          <CardBody className="py-12 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
            <h3 className="mt-3 text-base font-bold text-slate-900">
              Failed to Generate Academic Report
            </h3>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              {analyticsQuery.error?.message || 'An error occurred while analyzing database records.'}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => analyticsQuery.refetch()}
              className="mt-4 gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Retry Calculation
            </Button>
          </CardBody>
        </Card>
      ) : (
        <>
          {/* 7 EXECUTIVE SUMMARY KPI CARDS (Calculated dynamically from real database) */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {/* 1. Distinct Enrolled Students */}
            <StatCard
              label="Enrolled Students"
              value={summary.totalEnrolledStudents ?? 0}
              icon={Users}
              tone="indigo"
              hint="Distinct count across cohort"
            />

            {/* 2. Total Courses Offered */}
            <StatCard
              label="Courses Offered"
              value={summary.totalCoursesOffered ?? 0}
              icon={BookOpen}
              tone="sky"
              hint="Approved course offerings"
            />

            {/* 3. Attendance Rate */}
            <StatCard
              label="Attendance Rate"
              value={`${summary.attendanceRate ?? 0}%`}
              icon={CalendarCheck2}
              tone={summary.attendanceRate >= 85 ? 'emerald' : 'amber'}
              hint={`${summary.presentAttendance ?? 0} sessions attended`}
            />

            {/* 4. Average Academic Performance */}
            <StatCard
              label="Average Score"
              value={`${summary.averageAcademicPerformance ?? 0}`}
              icon={TrendingUp}
              tone="emerald"
              hint="Mean mark out of 100"
            />

            {/* 5. Pass Rate */}
            <StatCard
              label="Pass Rate"
              value={`${summary.passRate ?? 0}%`}
              icon={Award}
              tone={summary.passRate >= 75 ? 'emerald' : 'rose'}
              hint="Finalized course results"
            />

            {/* 6. Completed Courses */}
            <StatCard
              label="Completed Courses"
              value={summary.completedCourses ?? 0}
              icon={CheckCircle2}
              tone="purple"
              hint={`${summary.totalCoursesOffered - summary.completedCourses} ongoing`}
            />

            {/* 7. Results Submission Progress */}
            <StatCard
              label="Results Submission"
              value={`${summary.resultsSubmissionProgress ?? 0}%`}
              icon={ClipboardCheck}
              tone={summary.resultsSubmissionProgress >= 80 ? 'emerald' : 'amber'}
              hint={`${summary.publishedResults ?? 0} published`}
            />
          </section>

          {/* CHARTS ROW 1: Monthly Telemetry Curve & Department Benchmarks */}
          <div className="grid gap-4 lg:grid-cols-12">
            {/* Monthly Telemetry Line Chart */}
            <div className="lg:col-span-7">
              <Card className="h-full">
                <CardHeader
                  title="Monthly Academic Trends (Attendance & Marks)"
                  subtitle="Chronological curve based on actual session dates and assessment submission timestamps across the calendar."
                  icon={TrendingUp}
                />
                <CardBody className="p-4">
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={monthlyTrend} margin={{ top: 15, right: 15, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="rate" domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="count" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <ChartTooltip
                          contentStyle={{
                            borderRadius: 12,
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                        <Bar yAxisId="count" dataKey="activeStudents" name="Active Students" fill="#e0e7ff" radius={[4, 4, 0, 0]} barSize={22} />
                        <Line yAxisId="rate" type="monotone" dataKey="attendanceRate" name="Attendance Rate (%)" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} />
                        <Line yAxisId="rate" type="monotone" dataKey="averageScore" name="Average Mark (100)" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 3 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </CardBody>
              </Card>
            </div>

            {/* Department Benchmark Comparison Bar Chart */}
            <div className="lg:col-span-5">
              <Card className="h-full">
                <CardHeader
                  title="Department Performance Benchmarks"
                  subtitle="Head-to-head comparison between Information Technology & Health Science."
                  icon={Building2}
                />
                <CardBody className="p-4">
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={departmentComparison} margin={{ top: 15, right: 15, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="code" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <ChartTooltip
                          contentStyle={{
                            borderRadius: 12,
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                        <Bar dataKey="attendanceRate" name="Attendance %" fill="#0d9488" radius={[4, 4, 0, 0]} barSize={20} />
                        <Bar dataKey="averageMark" name="Average Mark" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={20} />
                        <Bar dataKey="passRate" name="Pass Rate %" fill="#10b981" radius={[4, 4, 0, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>

          {/* CHARTS ROW 2: Grade Distribution & Study Mode Comparison */}
          <div className="grid gap-4 lg:grid-cols-12">
            {/* Grade Distribution Doughnut Chart */}
            <div className="lg:col-span-5">
              <Card className="h-full">
                <CardHeader
                  title="Official Grade Distribution"
                  subtitle="Letter grade breakdown derived from the active institutional grading policy."
                  icon={Award}
                />
                <CardBody className="p-4">
                  <div className="h-60 w-full flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={gradeDistribution}
                          dataKey="count"
                          nameKey="letter"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={3}
                        >
                          {gradeDistribution.map((entry, idx) => (
                            <Cell
                              key={entry.letter || idx}
                              fill={GRADE_COLORS[entry.letter] || DEFAULT_GRADE_COLORS[idx % DEFAULT_GRADE_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <ChartTooltip
                          contentStyle={{
                            borderRadius: 12,
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Grade distribution badges */}
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2 border-t border-slate-100">
                    {gradeDistribution.map((g, idx) => (
                      <div
                        key={g.letter || idx}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1 text-xs"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: GRADE_COLORS[g.letter] || DEFAULT_GRADE_COLORS[idx % DEFAULT_GRADE_COLORS.length] }}
                        />
                        <span className="font-bold text-slate-800">{g.letter}:</span>
                        <span className="font-semibold text-slate-600">{g.count} ({g.percentage}%)</span>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            </div>

            {/* Regular vs Extension Study Stream Comparison */}
            <div className="lg:col-span-7">
              <Card className="h-full">
                <CardHeader
                  title="Regular vs Extension Stream Comparative Analysis"
                  subtitle="Head-to-head metrics evaluating student capacity, presence, and performance across study modes."
                  icon={Layers}
                />
                <CardBody className="p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {studyModeComparison.map((m) => (
                      <div
                        key={m.mode}
                        className={`rounded-2xl border p-4 ${
                          m.mode === 'regular'
                            ? 'border-indigo-100 bg-indigo-50/50'
                            : 'border-amber-100 bg-amber-50/50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-bold text-slate-900">{m.label}</h4>
                          <Badge tone={m.mode === 'regular' ? 'brand' : 'warning'}>
                            {m.enrolledStudents} Students
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div className="rounded-xl bg-white p-2.5 shadow-xs">
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Courses Offered</span>
                            <span className="text-base font-bold text-slate-800">{m.coursesOffered}</span>
                          </div>
                          <div className="rounded-xl bg-white p-2.5 shadow-xs">
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Attendance</span>
                            <span className="text-base font-bold text-emerald-700">{m.attendanceRate}%</span>
                          </div>
                          <div className="rounded-xl bg-white p-2.5 shadow-xs">
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Average Mark</span>
                            <span className="text-base font-bold text-indigo-700">{m.averageMark} / 100</span>
                          </div>
                          <div className="rounded-xl bg-white p-2.5 shadow-xs">
                            <span className="text-slate-400 block text-[10px] uppercase font-bold">Pass Rate</span>
                            <span className="text-base font-bold text-teal-700">{m.passRate}%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Highlights notice */}
                  <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-600 flex items-start gap-2">
                    <ShieldCheck className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
                    <p>
                      Metrics are derived by aggregating distinct student registrations and finalized mark sheets in both regular and extension cohorts.
                    </p>
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>

          {/* PROGRAMME COMPARISON TABLE */}
          <Card>
            <CardHeader
              title="Programme Academic Performance Summary"
              subtitle="Aggregated enrolment counts, presence percentage, mean marks, and pass rate per programme."
              icon={GraduationCap}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Programme</th>
                    <th className="px-3 py-3">Department</th>
                    <th className="px-3 py-3">Qualification</th>
                    <th className="px-3 py-3 text-center">Enrolled</th>
                    <th className="px-3 py-3 text-center">Courses</th>
                    <th className="px-3 py-3 text-right">Attendance %</th>
                    <th className="px-3 py-3 text-right">Average Mark</th>
                    <th className="px-3 py-3 text-right">Pass Rate %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {programComparison.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900">{p.name}</p>
                        <p className="text-[11px] font-mono text-brand-700">{p.code}</p>
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-700">{p.departmentName}</td>
                      <td className="px-3 py-3">
                        <Badge tone="neutral" className="uppercase text-[10px]">
                          {p.qualification}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-center font-bold text-slate-800">
                        {p.enrolledStudents}
                      </td>
                      <td className="px-3 py-3 text-center text-slate-600">
                        {p.coursesOffered}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-emerald-700">
                        {p.attendanceRate}%
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-indigo-700">
                        {p.averageMark}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 font-bold ${
                            p.passRate >= 80
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {p.passRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* COURSE-BY-COURSE ANALYTICAL TELEMETRY TABLE (STRICTLY NO STUDENT NAMES/IDs!) */}
          <Card>
            <CardHeader
              title="Course-by-Course Academic Telemetry"
              subtitle="Analytical performance records grouped by offering and cohort. Individual student identities remain confidential in compliance with data privacy protocols."
              icon={BookOpen}
            />
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px] sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3">Course Code & Title</th>
                    <th className="px-3 py-3">Programme</th>
                    <th className="px-3 py-3 text-center">Year/Level</th>
                    <th className="px-3 py-3 text-center">Batch / Stream</th>
                    <th className="px-3 py-3">Assigned Faculty</th>
                    <th className="px-3 py-3 text-center">Enrolled</th>
                    <th className="px-3 py-3 text-right">Attendance</th>
                    <th className="px-3 py-3 text-right">Avg Mark</th>
                    <th className="px-3 py-3 text-right">Pass Rate</th>
                    <th className="px-3 py-3 text-center">Marks Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {courseTable.map((c) => (
                    <tr key={c.offeringId} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3">
                        <p className="font-mono font-bold text-brand-700">{c.courseCode}</p>
                        <p className="text-slate-800 font-medium">{c.courseTitle}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{c.programName}</td>
                      <td className="px-3 py-3 text-center font-medium text-slate-600">
                        Year {c.level}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Badge tone={c.studyMode === 'REGULAR' ? 'neutral' : 'warning'}>
                          {c.batchCode}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-slate-600">{c.teacherName}</td>
                      <td className="px-3 py-3 text-center font-bold text-slate-900">
                        {c.enrolledCount}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-emerald-700">
                        {c.attendanceRate}%
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-indigo-700">
                        {c.averageMark}
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-slate-800">
                        {c.passRate}%
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            c.submissionStatus === 'Published'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : c.submissionStatus === 'Approved'
                                ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                : c.submissionStatus === 'Submitted'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {c.submissionStatus === 'Published' && <CheckCircle2 className="h-3 w-3" />}
                          {c.submissionStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* REGISTRAR RESULT WORKFLOW MONITORING SECTION */}
          <Card>
            <CardHeader
              title="Registrar Result Workflow & Approval Ledger"
              subtitle="Monitor examination mark sheet submissions, pending approvals, and published offerings awaiting registrar action."
              icon={ClipboardCheck}
              action={
                <Link to="/registrar/results">
                  <Button size="sm" variant="secondary" className="gap-1.5 text-xs text-brand-700">
                    Open Results Desk <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              }
            />
            <CardBody className="p-4 space-y-4">
              {/* Workflow Pipeline Pills */}
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6 text-xs">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Draft (In Progress)</span>
                  <span className="text-lg font-bold text-slate-700">{resultWorkflow.counts.draft ?? 0}</span>
                </div>
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-center">
                  <span className="text-[10px] font-bold uppercase text-indigo-500 block">Submitted to Registrar</span>
                  <span className="text-lg font-bold text-indigo-700">{resultWorkflow.counts.submitted ?? 0}</span>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-center">
                  <span className="text-[10px] font-bold uppercase text-amber-500 block">Under Review</span>
                  <span className="text-lg font-bold text-amber-700">{resultWorkflow.counts.under_review ?? 0}</span>
                </div>
                <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-3 text-center">
                  <span className="text-[10px] font-bold uppercase text-sky-500 block">Approved</span>
                  <span className="text-lg font-bold text-sky-700">{resultWorkflow.counts.approved ?? 0}</span>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-center">
                  <span className="text-[10px] font-bold uppercase text-emerald-500 block">Published</span>
                  <span className="text-lg font-bold text-emerald-700">{resultWorkflow.counts.published ?? 0}</span>
                </div>
                <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3 text-center">
                  <span className="text-[10px] font-bold uppercase text-rose-500 block">Rejected / Revision</span>
                  <span className="text-lg font-bold text-rose-700">{resultWorkflow.counts.rejected ?? 0}</span>
                </div>
              </div>

              {/* Outstanding Workflow Queue */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="px-4 py-2.5">Course Code & Title</th>
                      <th className="px-3 py-2.5">Programme</th>
                      <th className="px-3 py-2.5">Batch</th>
                      <th className="px-3 py-2.5">Faculty</th>
                      <th className="px-3 py-2.5 text-center">Students</th>
                      <th className="px-3 py-2.5">Workflow Status</th>
                      <th className="px-3 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {resultWorkflow.items.slice(0, 15).map((w) => (
                      <tr key={w.offeringId} className="hover:bg-slate-50 transition">
                        <td className="px-4 py-2.5">
                          <span className="font-mono font-bold text-brand-700 mr-1.5">{w.courseCode}</span>
                          <span className="text-slate-800">{w.courseTitle}</span>
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">{w.programName}</td>
                        <td className="px-3 py-2.5 text-slate-600">{w.batchCode}</td>
                        <td className="px-3 py-2.5 text-slate-600">{w.teacherName}</td>
                        <td className="px-3 py-2.5 text-center font-bold text-slate-800">{w.enrolledCount}</td>
                        <td className="px-3 py-2.5">
                          <span className="text-xs font-semibold text-slate-700">
                            {w.outstandingAction}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Link to="/registrar/results">
                            <Button size="sm" variant="ghost" className="text-xs text-brand-700 hover:bg-brand-50">
                              Manage <ArrowRight className="h-3 w-3" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
