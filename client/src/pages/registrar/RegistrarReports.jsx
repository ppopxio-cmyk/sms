import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Award,
  BookOpen,
  CalendarCheck2,
  ClipboardList,
  Download,
  FileBarChart,
  FileCheck2,
  FileText,
  GraduationCap,
  Layers3,
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
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import { ErrorState } from '../../components/ui/StatePanel';
import { SkeletonCard } from '../../components/ui/Skeleton';
import StatCard from '../../components/ui/StatCard';

const REPORT_ICONS = {
  students: Users,
  enrollments: Layers3,
  results: FileCheck2,
  graduation: GraduationCap,
  certificates: Award,
  transcripts: FileText,
  curriculum: BookOpen,
  attendance: CalendarCheck2,
};

const FORMAT_LABELS = { xlsx: 'Excel', docx: 'Word', pdf: 'PDF' };

export default function RegistrarReports() {
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
  const reports = overview.data?.reports ?? [];
  const programs = (options.data?.programs || []).filter(
    (row) => !department || row.department === department,
  );

  const exportReport = async (report, format) => {
    const key = `${report.id}:${format}`;
    setDownloading(key);
    try {
      await downloadFile(`${REGISTRAR}/reports/export`, `registrar-${report.id}.${format}`, {
        params: { ...filters, type: report.id, format },
      });
      toast.success(`${report.label} exported as ${FORMAT_LABELS[format]}.`);
    } catch (err) {
      toast.error(await fileErrorMessage(err, 'The report could not be exported.'));
    } finally {
      setDownloading('');
    }
  };

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Reports & exports"
        subtitle="Every export is scoped to the Registrar's academic data and never includes administrator accounts, sessions or security records."
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active students" value={counts.students ?? 0} icon={Users} tone="indigo" loading={overview.isLoading} hint="Active student register" />
        <StatCard label="Active enrollments" value={counts.enrollments ?? 0} icon={Layers3} tone="emerald" loading={overview.isLoading} hint="For the current records" />
        <StatCard label="Published results" value={counts.publishedResults ?? 0} icon={FileCheck2} tone="sky" loading={overview.isLoading} hint={`${counts.results ?? 0} results submitted`} />
        <StatCard label="Certificates" value={counts.certificates ?? 0} icon={Award} tone="amber" loading={overview.isLoading} hint={`${counts.transcripts ?? 0} transcripts issued`} />
      </section>

      <Card>
        <CardHeader
          title="Export scope"
          subtitle="These filters apply to the report you download. Leave a field empty for all records."
          icon={FileBarChart}
        />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField label="Academic year" value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
              <option value="">All academic years</option>
              {(options.data?.academicYears || []).map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
            </SelectField>
            <SelectField label="Department" value={department} onChange={(event) => { setDepartment(event.target.value); setProgram(''); }}>
              <option value="">All departments</option>
              {(options.data?.departments || []).map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}
            </SelectField>
            <SelectField label="Programme" value={program} onChange={(event) => setProgram(event.target.value)}>
              <option value="">All programmes</option>
              {programs.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}
            </SelectField>
            <Field
              label="Status (optional)"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              placeholder="e.g. published or active"
              hint="Enter only a status understood by the selected report."
            />
          </div>
          <p className="mt-4 rounded-xl bg-sky-50 px-3.5 py-3 text-xs leading-relaxed text-sky-800">
            Exports are capped by the server and generated from the database, not from what is on this screen. A filter that does not apply to a report is ignored by that report.
          </p>
        </CardBody>
      </Card>

      {overview.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2"><SkeletonCard lines={5} /><SkeletonCard lines={5} /></div>
      ) : overview.error ? (
        <Card><ErrorState message={overview.error?.response?.data?.message || 'Reports could not be loaded.'} onRetry={overview.refetch} /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {reports.map((report) => {
            const Icon = REPORT_ICONS[report.id] || ClipboardList;
            return (
              <Card key={report.id}>
                <CardBody className="flex h-full flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-slate-900">{report.label}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">{report.description}</p>
                    </div>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    {(report.formats || []).map((format) => (
                      <Button
                        key={format}
                        size="sm"
                        variant="secondary"
                        onClick={() => exportReport(report, format)}
                        loading={downloading === `${report.id}:${format}`}
                        disabled={Boolean(downloading)}
                      >
                        <Download className="h-3.5 w-3.5" /> {FORMAT_LABELS[format] || format.toUpperCase()}
                      </Button>
                    ))}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
