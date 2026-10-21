import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck2, CheckCircle2, Clock3, UserX } from 'lucide-react';
import { api } from '../../lib/api';
import { REGISTRAR, displayDate, humanStatus, toneForStatus } from '../../lib/registrar';
import { useDebounced } from '../../lib/useDebounced';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import { SelectField } from '../../components/registrar/Fields';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Field from '../../components/ui/Field';
import Pagination from '../../components/ui/Pagination';
import SearchInput from '../../components/ui/SearchInput';
import StatCard from '../../components/ui/StatCard';

const STATUSES = ['present', 'absent', 'late', 'excused'];

export default function RegistrarAttendance() {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const [academicYear, setAcademicYear] = useState('');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const options = useQuery({
    queryKey: ['registrar', 'students', 'options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/options`)).data,
    staleTime: 5 * 60_000,
  });
  const calendar = useQuery({
    queryKey: ['registrar', 'calendar'],
    queryFn: async () => (await api.get(`${REGISTRAR}/academic-calendar`)).data,
    staleTime: 5 * 60_000,
  });

  const filters = useMemo(() => ({
    ...(debounced.trim() ? { search: debounced.trim() } : {}),
    ...(academicYear ? { academicYear } : {}),
    ...(term ? { term } : {}),
    ...(status !== 'all' ? { status } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }), [debounced, academicYear, term, status, from, to]);

  const params = useMemo(() => ({ ...filters, page, limit }), [filters, page, limit]);

  const query = useQuery({
    queryKey: ['registrar', 'attendance', params],
    queryFn: async () => (await api.get(`${REGISTRAR}/attendance`, { params })).data,
    placeholderData: (previous) => previous,
  });

  const summary = useQuery({
    queryKey: ['registrar', 'attendance-summary', filters],
    queryFn: async () => (await api.get(`${REGISTRAR}/attendance/summary`, { params: filters })).data,
    placeholderData: (previous) => previous,
  });

  const rows = query.data?.rows ?? [];
  const pagination = query.data?.pagination ?? { page: 1, pages: 1, total: 0, limit };
  const counts = summary.data?.counts ?? {};
  const filtered = Boolean(debounced.trim() || academicYear || term || status !== 'all' || from || to);
  const terms = useMemo(
    () => Array.from(new Set((calendar.data?.terms || []).filter((row) => !academicYear || row.academicYear?.id === academicYear).map((row) => row.name))),
    [calendar.data, academicYear],
  );

  const columns = [
    {
      key: 'student',
      label: 'Student',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-900">{row.student?.fullName || '—'}</p>
          <p className="text-xs text-slate-500">{row.student?.studentId || '—'}</p>
        </div>
      ),
    },
    {
      key: 'course',
      label: 'Course',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-800">{row.course?.code || '—'}</p>
          <p className="text-xs text-slate-500">{row.course?.title || '—'}</p>
        </div>
      ),
    },
    { key: 'year', label: 'Year / term', render: (row) => `${row.academicYear || '—'} · ${row.offering?.term || '—'}` },
    { key: 'date', label: 'Date', render: (row) => displayDate(row.date) },
    { key: 'status', label: 'Attendance', render: (row) => <Badge tone={toneForStatus(row.status)}>{humanStatus(row.status)}</Badge> },
    { key: 'remarks', label: 'Remarks', render: (row) => row.remarks || '—' },
  ];

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Attendance"
        subtitle="Attendance is recorded by teaching staff and shown here read-only. The Registrar can review it for eligibility and reports but cannot alter the register."
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Present" value={counts.present ?? 0} icon={CheckCircle2} tone="emerald" loading={summary.isLoading} hint={`${summary.data?.attendanceRate ?? '—'}% attendance rate`} />
        <StatCard label="Absent" value={counts.absent ?? 0} icon={UserX} tone="rose" loading={summary.isLoading} hint="Recorded absences" />
        <StatCard label="Late" value={counts.late ?? 0} icon={Clock3} tone="amber" loading={summary.isLoading} hint="Late arrivals" />
        <StatCard label="Total records" value={summary.data?.total ?? 0} icon={CalendarCheck2} tone="sky" loading={summary.isLoading} hint="Matching the filters" />
      </section>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3">
          <SearchInput value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search student name or ID" loading={query.isFetching} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <SelectField label="Academic year" value={academicYear} onChange={(event) => { setAcademicYear(event.target.value); setTerm(''); setPage(1); }}>
              <option value="">All years</option>
              {(options.data?.academicYears || []).map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
            </SelectField>
            <SelectField label="Term" value={term} onChange={(event) => { setTerm(event.target.value); setPage(1); }}>
              <option value="">All terms</option>
              {terms.map((name) => <option key={name} value={name}>{name}</option>)}
            </SelectField>
            <SelectField label="Attendance status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="all">All statuses</option>
              {STATUSES.map((value) => <option key={value} value={value}>{humanStatus(value)}</option>)}
            </SelectField>
            <Field label="From date" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
            <Field label="To date" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} />
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Attendance register</h2>
            <p className="mt-0.5 text-xs text-slate-500">{pagination.total ?? 0} record{pagination.total === 1 ? '' : 's'}</p>
          </div>
          <Badge tone="neutral">Read-only</Badge>
        </div>
        <RegistrarTable
          columns={columns}
          rows={rows}
          loading={query.isLoading}
          error={query.error ? query.error?.response?.data?.message || 'Attendance could not be loaded.' : null}
          onRetry={query.refetch}
          rowKey={(row) => row.id}
          noResults={filtered}
          emptyTitle="No attendance records"
          emptyMessage="Attendance appears once teaching staff record a class register."
          noResultsTitle="No attendance matches"
          noResultsMessage="Try a different student, date range, term or status."
        />
        <div className="px-5 pb-4">
          <Pagination page={pagination.page} pages={pagination.pages} total={pagination.total} limit={pagination.limit} onPage={setPage} onLimit={(value) => { setLimit(value); setPage(1); }} />
        </div>
      </Card>
    </div>
  );
}
