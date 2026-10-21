import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, FileBarChart, GraduationCap, Info, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { classMeta, classTitle, displayDate, termLabel, todayKey } from '../../lib/teacher';
import ClassSelect from '../../components/teacher/ClassSelect';
import EthiopianDateField from '../../components/teacher/EthiopianDateField';
import TeacherPageHeader from '../../components/teacher/TeacherPageHeader';
import Alert from '../../components/ui/Alert';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import ExportMenu from '../../components/ui/ExportMenu';
import FilterTabs from '../../components/ui/FilterTabs';
import { EmptyState, ErrorState } from '../../components/ui/StatePanel';
import { SkeletonRows } from '../../components/ui/Skeleton';

const REPORT_TABS = [
  { key: 'grades', label: 'Grade sheet' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'roster', label: 'Roster' },
];

const REPORTS = {
  grades: { path: '/teacher/reports/grade-sheet', exportPath: '/teacher/reports/grade-sheet/export', filename: 'teacher-grades' },
  attendance: { path: '/teacher/reports/attendance', exportPath: '/teacher/reports/attendance/export', filename: 'teacher-attendance' },
  roster: { path: '/teacher/reports/roster', exportPath: '/teacher/reports/roster/export', filename: 'teacher-roster' },
};

export default function TeacherReports() {
  const [params, setParams] = useSearchParams();
  const [assignmentId, setAssignmentId] = useState(params.get('assignmentId') || '');
  const [report, setReport] = useState('grades');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const options = useQuery({
    queryKey: ['teacher', 'reports', 'options', assignmentId],
    queryFn: async () =>
      (await api.get('/teacher/reports/options', { params: { assignmentId: assignmentId || undefined } })).data,
  });

  const selectedId = options.data?.selected?.id || '';
  const selected = options.data?.selected ?? null;
  const reportParams = {
    assignmentId: selectedId,
    ...(report === 'attendance' ? { from: from || undefined, to: to || undefined } : {}),
  };
  const active = REPORTS[report];

  const data = useQuery({
    queryKey: ['teacher', 'reports', report, selectedId, from, to],
    queryFn: async () => (await api.get(active.path, { params: reportParams })).data,
    enabled: Boolean(selectedId),
    retry: false,
  });

  const summary = data.data?.summary ?? [];
  const columns = data.data?.columns ?? [];
  const rows = data.data?.rows ?? [];

  return (
    <div className="space-y-6">
      <TeacherPageHeader
        eyebrow="Teaching"
        title="Reports"
        subtitle="Grade sheets, attendance summaries and class rosters from your own classes, ready to export."
      />

      {options.isError ? (
        <Card>
          <ErrorState message="We could not load your report options." onRetry={options.refetch} />
        </Card>
      ) : !options.isLoading && !options.data?.assignments?.length ? (
        <Card>
          <EmptyState
            icon={FileBarChart}
            title="No classes to report on"
            message="Reports become available when the registrar assigns you a class."
          />
        </Card>
      ) : (
        <>
          <Card>
            <CardBody className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[1.3fr_auto] lg:items-end">
                <ClassSelect
                  assignments={options.data?.assignments ?? []}
                  value={selectedId}
                  onChange={(value) => {
                    setAssignmentId(value);
                    if (value) setParams({ assignmentId: value });
                    else setParams({});
                  }}
                  label="Class"
                />
                {selected ? (
                  <div className="rounded-xl bg-slate-50 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-800">{classTitle(selected)}</p>
                    <p className="mt-1 text-xs text-slate-500">{classMeta(selected)}</p>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                <FilterTabs
                  label="Report"
                  value={report}
                  onChange={setReport}
                  tabs={REPORT_TABS}
                />
                {report === 'attendance' ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <EthiopianDateField label="From (optional)" value={from} allowEmpty max={to || todayKey()} onChange={setFrom} />
                    <EthiopianDateField label="To (optional)" value={to} allowEmpty max={todayKey()} onChange={setTo} />
                  </div>
                ) : null}
              </div>
            </CardBody>
          </Card>

          {!selectedId ? (
            <Alert tone="info" title="Choose a class">
              Pick one of your classes above to build a grade sheet, attendance summary or roster.
            </Alert>
          ) : data.isError ? (
            <Card>
              <ErrorState
                message={data.error?.response?.data?.message || 'We could not build this report.'}
                onRetry={data.refetch}
              />
            </Card>
          ) : data.isLoading ? (
            <Card>
              <CardBody>
                <SkeletonRows rows={8} />
              </CardBody>
            </Card>
          ) : data.data?.configured === false ? (
            <Alert tone="warning" title="Competency configuration required">
              {data.data.message}
            </Alert>
          ) : report === 'attendance' && !(data.data?.sessions?.length > 0) ? (
            <Card>
              <EmptyState
                icon={CalendarDays}
                title="No finalized attendance in this range"
                message="Only finalized attendance sheets are counted. Finalize a sheet, or widen the date range."
              />
            </Card>
          ) : report === 'grades' && !(data.data?.assessments?.length > 0) ? (
            <Card>
              <EmptyState
                icon={GraduationCap}
                title="No published assessments"
                message="Publish an assessment and enter its marks, then its grade sheet will appear here."
              />
            </Card>
          ) : !rows.length ? (
            <Card>
              <EmptyState
                icon={report === 'attendance' ? CalendarDays : report === 'roster' ? Users : GraduationCap}
                title={report === 'attendance' ? 'No finalized attendance in this range' : 'This report is empty'}
                message={
                  report === 'attendance'
                    ? 'Only finalized attendance sheets are counted. Finalize a sheet, or widen the date range.'
                    : 'The registrar has not registered any students in this class.'
                }
              />
            </Card>
          ) : (
            <Card>
              <CardHeader
                title={data.data.title}
                subtitle={data.data.subtitle || (selected ? classTitle(selected) : '')}
                icon={FileBarChart}
                action={
                  <ExportMenu
                    basePath={active.exportPath}
                    params={reportParams}
                    filenamePrefix={active.filename}
                    disabled={data.data?.configured === false}
                  />
                }
              />
              <CardBody className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {summary.map((item) => {
                    const value =
                      ['From', 'To'].includes(item.label) && /^\d{4}-\d{2}-\d{2}$/.test(String(item.value))
                        ? displayDate(String(item.value))
                        : item.value;
                    return (
                      <span key={item.label} className="inline-flex items-baseline gap-2 rounded-full bg-slate-100 px-3 py-1.5">
                        <span className="text-[11px] font-medium text-slate-500">{item.label}</span>
                        <span className="text-sm font-bold text-slate-800">{value}</span>
                      </span>
                    );
                  })}
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-100">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-slate-50/80">
                      <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        {columns.map((column) => (
                          <th
                            key={column.key}
                            style={{ minWidth: `${Math.max(7, column.width ?? 10)}ch` }}
                            className={`whitespace-nowrap px-3 py-3 ${column.align === 'center' ? 'text-center' : ''}`}
                          >
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white/60">
                      {rows.map((row, index) => (
                        <tr key={row.studentNumber || row.number || index} className="hover:bg-slate-50/60">
                          {columns.map((column) => {
                            const value = row[column.key];
                            return (
                              <td
                                key={column.key}
                                className={`whitespace-nowrap px-3 py-2.5 text-slate-600 ${
                                  column.align === 'center' ? 'text-center font-mono text-xs' : ''
                                } ${column.key === 'name' ? 'font-medium text-slate-800' : ''}`}
                              >
                                {column.key === 'rate' ? `${value ?? 0}%` : value === '' || value === null || value === undefined ? '—' : value}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {data.data.note ? (
                  <p className="flex items-start gap-2 rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-relaxed text-slate-500">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    {data.data.note}
                  </p>
                ) : null}
              </CardBody>
            </Card>
          )}

          {report === 'attendance' && (from || to) ? (
            <p className="text-xs text-slate-500">
              {from ? `From ${displayDate(from)}` : 'From the first finalized session'} · {to ? `to ${displayDate(to)}` : 'to the latest finalized session'}
              {selected?.term ? ` · ${termLabel(selected.term)}` : ''}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
