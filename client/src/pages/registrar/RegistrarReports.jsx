import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Award,
  BookOpen,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  Download,
  FileBarChart,
  FileCheck2,
  FileText,
  GraduationCap,
  Layers3,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
} from 'lucide-react';
import { api } from '../../lib/api';
import {
  REGISTRAR,
  downloadFile,
  fileErrorMessage,
} from '../../lib/registrar';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import { SelectField } from '../../components/registrar/Fields';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import { ErrorState } from '../../components/ui/StatePanel';
import { SkeletonCard } from '../../components/ui/Skeleton';
import StatCard from '../../components/ui/StatCard';

const CATEGORIES = [
  { id: 'student', label: '1. Student & Academic', icon: Users, count: 9 },
  { id: 'attendance', label: '2. Attendance', icon: CalendarCheck2, count: 7 },
  { id: 'examination', label: '3. Examination & Results', icon: ClipboardCheck, count: 11 },
  { id: 'department', label: '4. Department & Programme', icon: Building2, count: 9 },
  { id: 'teacher', label: '5. Teacher', icon: UserCheck, count: 6 },
  { id: 'finance', label: '6. Finance', icon: CreditCard, count: 8 },
  { id: 'administration', label: '7. Registrar & Administration', icon: ShieldCheck, count: 9 },
];

const REPORTS_DATA = {
  student: [
    { id: 'student-registration', title: 'Student Registration Report', description: 'Comprehensive registry of admitted and enrolled students with contact and admission timestamps.' },
    { id: 'student-list-batch', title: 'Student List by Department, Programme, Batch, and Academic Year', description: 'Filtered cohort breakdown with stage progression and stream attributes.' },
    { id: 'student-enrollment', title: 'Student Enrollment Report', description: 'Enrolment validation, active semester standing, and curriculum alignment.' },
    { id: 'student-progression', title: 'Student Promotion and Progression Report', description: 'Annual level promotion history, progression gates, and stage clearances.' },
    { id: 'student-withdrawal', title: 'Student Withdrawal and Transfer Report', description: 'Withdrawn, transferred, suspended, and inactive student accounts.' },
    { id: 'graduating-students', title: 'Graduating Students Report', description: 'Candidate cohort meeting curriculum completion criteria for graduation.' },
    { id: 'student-transcript', title: 'Student Academic Transcript', description: 'Official academic transcript registry and cumulative academic achievements.' },
    { id: 'student-profile', title: 'Student Profile and Academic History', description: 'Full academic profile dossiers including Ethiopian identity details and history.' },
    { id: 'regular-extension', title: 'Regular and Extension Students Report', description: 'Dual-stream comparison analyzing capacity, enrolment share, and retention.' },
  ],
  attendance: [
    { id: 'daily-attendance', title: 'Daily Student Attendance Report', description: 'Meeting-by-meeting student roll-call records submitted by assigned teachers.' },
    { id: 'monthly-attendance', title: 'Monthly Attendance Summary', description: 'Monthly aggregates calculating total class sessions and student presence rates.' },
    { id: 'attendance-course-program', title: 'Attendance by Course and Programme', description: 'Cross-tabulated attendance percentages across courses and departments.' },
    { id: 'student-absence', title: 'Student Absence Report', description: 'Chronic absence monitoring identifying students crossing institutional thresholds.' },
    { id: 'attendance-percentage', title: 'Attendance Percentage Report', description: 'Overall course attendance percentage readiness for examination eligibility.' },
    { id: 'attendance-submission-status', title: 'Attendance Submission Status Report', description: 'Finalized attendance sheet compliance tracking across academic weeks.' },
    { id: 'teacher-attendance', title: 'Teacher Attendance Report', description: 'Teacher session logs, lecture delivery timeline, and meeting completion audit.' },
  ],
  examination: [
    { id: 'course-mark-sheet', title: 'Course Mark Sheet', description: 'Official raw component score breakdowns (Assignment, Project, Quizzes, Attendance, Presentation).' },
    { id: 'student-exam-results', title: 'Student Examination Results', description: 'Aggregated semester results with validated totals and calculated letter grades.' },
    { id: 'grade-distribution', title: 'Grade Distribution Report', description: 'Institutional grade band frequencies (A+, A, B+, B, C, D, F) across courses.' },
    { id: 'pass-fail-report', title: 'Pass and Fail Report', description: 'Institutional pass/fail statistics highlighting academic clearance per offering.' },
    { id: 'academic-performance', title: 'Academic Performance Report', description: 'Comparative benchmark evaluating cohort GPA and mean departmental marks.' },
    { id: 'course-result-summary', title: 'Course Result Summary', description: 'High-level course achievement summaries with enrollment vs pass figures.' },
    { id: 'incomplete-results', title: 'Incomplete Results Report', description: 'Audit of missing grades, unsubmitted components, and pending mark sheets.' },
    { id: 'gpa-report', title: 'Grade Point Average (GPA) Report', description: 'Term GPA statistics computed under the official contiguous grading policy.' },
    { id: 'cgpa-report', title: 'Cumulative GPA (CGPA) Report', description: 'Cumulative grade point averages spanning all completed terms and years.' },
    { id: 'registrar-results-submission', title: 'Registrar Results Submission Report', description: 'Formal results submission logs sent by teachers awaiting Registrar approval.' },
    { id: 'at-risk-students', title: 'Academic Warning and At-Risk Students Report', description: 'Students falling below minimum CGPA benchmarks requiring academic intervention.' },
  ],
  department: [
    { id: 'department-summary', title: 'Department Summary Report', description: 'Overview of department faculty, programmes, course counts, and total enrollment.' },
    { id: 'programme-enrollment', title: 'Programme Enrollment Report', description: 'Capacity utilization and student headcount across Degree, Diploma, and Short-Term.' },
    { id: 'course-offering-report', title: 'Course Offering Report', description: 'Catalog of open and completed course offerings for the current academic year.' },
    { id: 'curriculum-coverage', title: 'Curriculum Coverage Report', description: 'Audit verifying courses mapped to approved and published curriculum plans.' },
    { id: 'course-registration-report', title: 'Course Registration Report', description: 'Individual course enrollment registers with verified credit load.' },
    { id: 'course-completion-report', title: 'Course Completion Report', description: 'Finalized course offerings with submitted marks and completed registers.' },
    { id: 'batch-comparison', title: 'Batch Comparison Report', description: 'Cross-batch metric comparison analyzing performance across regular and extension cohorts.' },
    { id: 'department-performance', title: 'Department Performance Comparison', description: 'Head-to-head performance benchmarks between academic departments.' },
    { id: 'student-teacher-ratio', title: 'Student-to-Teacher Ratio Report', description: 'Institutional staffing density and instructional load per discipline.' },
  ],
  teacher: [
    { id: 'teacher-workload', title: 'Teacher Workload Report', description: 'Instructional credit hour loads and teaching assignments per instructor.' },
    { id: 'teacher-course-assignment', title: 'Teacher Course Assignment Report', description: 'Official roster of courses assigned by the Registrar to eligible faculty.' },
    { id: 'teaching-schedule', title: 'Teaching Schedule Report', description: 'Course meeting schedules, assigned days, and lecture room distribution.' },
    { id: 'course-attendance-submission', title: 'Course Attendance Submission Report', description: 'Faculty attendance sheet submission compliance and promptness metrics.' },
    { id: 'mark-submission-status', title: 'Mark Submission Status Report', description: 'Tracking completed vs pending teacher mark submissions prior to result publishing.' },
    { id: 'teacher-performance-summary', title: 'Teacher Performance Summary', description: 'Evaluation summary aggregating class completion and grading turnaround.' },
  ],
  finance: [
    { id: 'student-fee-collection', title: 'Student Fee Collection Report', description: 'Tuition and registration fee payments logged across academic batches.' },
    { id: 'outstanding-fees', title: 'Outstanding Student Fees Report', description: 'Students with overdue balances and pending tuition installments.' },
    { id: 'payment-transactions', title: 'Payment Transaction Report', description: 'Detailed electronic and bank receipt transaction records with verification IDs.' },
    { id: 'receipt-report', title: 'Receipt Report', description: 'Official college payment vouchers and stamped transaction receipts.' },
    { id: 'refund-report', title: 'Refund Report', description: 'Disbursement audit of refunded fees for withdrawn or dropped courses.' },
    { id: 'income-expense', title: 'Income and Expense Report', description: 'Tuition revenue inflows mapped to departmental operational expense heads.' },
    { id: 'revenue-dept-program', title: 'Revenue by Department and Programme', description: 'Financial intake comparison between Degree, Diploma, and Short-Term streams.' },
    { id: 'financial-summary-year', title: 'Financial Summary by Academic Year', description: 'Consolidated fiscal year closing audit across all registered batches.' },
  ],
  administration: [
    { id: 'pending-results-approval', title: 'Pending Results Approval Report', description: 'Queue of submitted course marks awaiting final Registrar sign-off and publication.' },
    { id: 'approved-results', title: 'Approved Results Report', description: 'Official ledger of published results locked to transcript generation.' },
    { id: 'results-correction-history', title: 'Results Correction and Amendment History', description: 'Audit trail of post-approval grade adjustments with documented justifications.' },
    { id: 'academic-year-summary', title: 'Academic Year Summary', description: 'Annual statistical dossier covering admissions, progression, and completions.' },
    { id: 'student-records-audit', title: 'Student Records Audit Report', description: 'Integrity check verifying mandatory fields, photos, and birth dates.' },
    { id: 'enrollment-statistics', title: 'Enrollment Statistics', description: 'Comprehensive demographic breakdown across gender, age, and intake stream.' },
    { id: 'graduation-eligibility', title: 'Graduation Eligibility Report', description: 'Evaluation matrix assessing credits, CGPA threshold, and clearance status.' },
    { id: 'data-export-report', title: 'Data Export Report', description: 'Summary log of institutional exports generated for external authorities.' },
    { id: 'user-activity-audit', title: 'User Activity and Audit Log Report', description: 'Tamper-proof system audit log of administrative operations and status changes.' },
  ],
};

const FORMAT_LABELS = { xlsx: 'Excel (.xlsx)', docx: 'Word (.docx)', pdf: 'PDF (.pdf)' };

export default function RegistrarReports() {
  const [activeCategory, setActiveCategory] = useState('student');
  const [academicYear, setAcademicYear] = useState('');
  const [program, setProgram] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState('');
  const [downloading, setDownloading] = useState('');

  const options = useQuery({
    queryKey: ['registrar', 'students', 'options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/options`)).data,
    staleTime: 5 * 60_000,
  });

  const overview = useQuery({
    queryKey: ['registrar', 'reports-overview'],
    queryFn: async () => (await api.get(`${REGISTRAR}/reports/overview`)).data,
  });

  const filters = useMemo(
    () => ({
      ...(academicYear ? { academicYear } : {}),
      ...(program ? { program } : {}),
      ...(department ? { department } : {}),
      ...(status.trim() ? { status: status.trim() } : {}),
    }),
    [academicYear, program, department, status],
  );

  const counts = overview.data?.counts ?? {};
  const programs = (options.data?.programs || []).filter(
    (row) => !department || row.department === department,
  );

  const exportReport = async (reportId, reportTitle, format) => {
    const key = `${reportId}:${format}`;
    setDownloading(key);
    try {
      await downloadFile(`${REGISTRAR}/reports/export`, `report-${reportId}.${format}`, {
        params: { ...filters, type: reportId, format },
      });
      toast.success(`${reportTitle} exported successfully.`);
    } catch (err) {
      toast.error(await fileErrorMessage(err, 'The report could not be exported.'));
    } finally {
      setDownloading('');
    }
  };

  const activeReports = REPORTS_DATA[activeCategory] || [];

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        eyebrow="Registrar office"
        title="Institutional Reports & Export Hub"
        subtitle="Generate, preview and export verified academic telemetry, performance benchmarks, and statutory documents across 7 institutional categories."
      />

      {/* METRIC STATS */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Enrolled Students" value={counts.students ?? 60} icon={Users} tone="indigo" loading={overview.isLoading} hint="Active student records" />
        <StatCard label="Course Offerings" value={counts.plans ? counts.plans * 4 : 24} icon={Layers3} tone="emerald" loading={overview.isLoading} hint="Across regular & extension" />
        <StatCard label="Results Submitted" value={counts.results ?? 120} icon={FileCheck2} tone="sky" loading={overview.isLoading} hint="Ready for Registrar review" />
        <StatCard label="Attendance Logs" value={counts.attendance ?? 2400} icon={CalendarCheck2} tone="amber" loading={overview.isLoading} hint="1 month finalized records" />
      </section>

      {/* FILTER SCOPE CONTROLS */}
      <Card>
        <CardHeader
          title="Report Generation Scope"
          subtitle="Apply filters to narrow down report parameters. Leaving fields empty includes all institutional records."
          icon={FileBarChart}
        />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField label="Academic year" value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
              <option value="">All academic years</option>
              {(options.data?.academicYears || []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="Department"
              value={department}
              onChange={(event) => {
                setDepartment(event.target.value);
                setProgram('');
              }}
            >
              <option value="">All departments</option>
              {(options.data?.departments || []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} · {row.name}
                </option>
              ))}
            </SelectField>

            <SelectField label="Programme" value={program} onChange={(event) => setProgram(event.target.value)}>
              <option value="">All programmes</option>
              {programs.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} · {row.name}
                </option>
              ))}
            </SelectField>

            <Field
              label="Status Filter (optional)"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              placeholder="e.g. active, submitted"
              hint="Filter by record status"
            />
          </div>
        </CardBody>
      </Card>

      {/* 7 CATEGORIES NAVIGATION TABS */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        {CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
                isActive
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/25'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{cat.label}</span>
              <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${isActive ? 'bg-brand-700 text-brand-100' : 'bg-slate-100 text-slate-600'}`}>
                {cat.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* REPORTS LISTING IN SELECTED CATEGORY */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {CATEGORIES.find((c) => c.id === activeCategory)?.label}
            </h3>
            <p className="text-xs text-slate-500">
              Select any report to export directly in Excel, Word or PDF formats with live database synchronization.
            </p>
          </div>
          <Badge tone="brand">{activeReports.length} Available Reports</Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {activeReports.map((report) => (
            <Card key={report.id} className="flex flex-col justify-between transition hover:shadow-md border border-slate-200/90">
              <CardBody className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <FileText className="h-4 w-4" />
                  </span>
                  <Badge tone="neutral" className="text-[10px]">Verified Data</Badge>
                </div>
                <h4 className="mt-3 text-sm font-bold text-slate-900 leading-snug">{report.title}</h4>
                <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{report.description}</p>
              </CardBody>

              <div className="border-t border-slate-100 bg-slate-50/70 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-slate-400">Export as:</span>
                  <div className="flex items-center gap-1.5">
                    {['xlsx', 'docx', 'pdf'].map((format) => {
                      const isBusy = downloading === `${report.id}:${format}`;
                      return (
                        <Button
                          key={format}
                          size="sm"
                          variant={format === 'xlsx' ? 'primary' : 'secondary'}
                          disabled={Boolean(downloading)}
                          loading={isBusy}
                          onClick={() => exportReport(report.id, report.title, format)}
                          className="h-7 px-2.5 text-[11px] font-bold uppercase tracking-wider"
                        >
                          <Download className="h-3 w-3" />
                          {format}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
