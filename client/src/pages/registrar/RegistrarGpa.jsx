import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calculator, GraduationCap, Info } from 'lucide-react';
import { api } from '../../lib/api';
import { REGISTRAR, humanStatus, toneForStatus } from '../../lib/registrar';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import StudentPicker from '../../components/registrar/StudentPicker';
import { SelectField } from '../../components/registrar/Fields';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/StatePanel';
import { SkeletonCard } from '../../components/ui/Skeleton';
import StatCard from '../../components/ui/StatCard';

export default function RegistrarGpa() {
  const [student, setStudent] = useState(null);
  const [program, setProgram] = useState('');
  const [batch, setBatch] = useState('');

  const options = useQuery({
    queryKey: ['registrar', 'students', 'options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/options`)).data,
    staleTime: 5 * 60_000,
  });

  const detail = useQuery({
    queryKey: ['registrar', 'gpa', student?.id],
    queryFn: async () => (await api.get(`${REGISTRAR}/gpa-cgpa`, { params: { student: student.id } })).data,
    enabled: Boolean(student?.id),
  });

  const listParams = {
    ...(program ? { program } : {}),
    ...(batch ? { batch } : {}),
  };

  const list = useQuery({
    queryKey: ['registrar', 'gpa-list', listParams],
    queryFn: async () => (await api.get(`${REGISTRAR}/gpa-cgpa`, { params: listParams })).data,
    enabled: !student,
  });

  const courseColumns = [
    {
      key: 'course',
      label: 'Course',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-900">{row.course?.code || '—'}</p>
          <p className="text-xs text-slate-500">{row.course?.title || '—'}</p>
        </div>
      ),
    },
    { key: 'year', label: 'Year / term', render: (row) => `${row.academicYear?.label || '—'} · ${row.term || '—'}` },
    { key: 'credits', label: 'Credits', render: (row) => row.creditHours ?? row.course?.creditHours ?? '—' },
    { key: 'mark', label: 'Mark', render: (row) => row.totalMark ?? '—' },
    { key: 'grade', label: 'Grade', render: (row) => `${row.letterGrade || '—'}${row.gradePoint !== null && row.gradePoint !== undefined ? ` · ${row.gradePoint}` : ''}` },
    { key: 'status', label: 'Status', render: (row) => <Badge tone={toneForStatus(row.status)}>{humanStatus(row.status)}</Badge> },
  ];

  const listRows = list.data?.rows ?? [];
  const listColumns = [
    {
      key: 'student',
      label: 'Student',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-900">{row.fullName}</p>
          <p className="text-xs text-slate-500">{row.studentId} · {row.program || '—'}</p>
        </div>
      ),
    },
    { key: 'cgpa', label: 'CGPA', render: (row) => <span className="text-base font-bold tabular-nums text-slate-900">{row.cgpa ?? '—'}</span> },
    { key: 'credits', label: 'Credits counted', render: (row) => row.credits ?? 0 },
    { key: 'courses', label: 'Courses', render: (row) => row.courseCount ?? 0 },
    {
      key: 'action',
      label: '',
      className: 'text-right',
      mobileFull: true,
      render: (row) => <Button size="sm" variant="secondary" onClick={() => setStudent({ id: row.id, fullName: row.fullName, studentId: row.studentId })}>Open</Button>,
    },
  ];

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="GPA & CGPA"
        subtitle="Official values follow the configured grading policy and its repeat policy. Only published results are counted."
      />

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px_220px] sm:items-end">
          <StudentPicker value={student} onChange={setStudent} label="Find a student" hint="Leave empty to review all students by programme or batch." />
          <SelectField label="Programme" value={program} onChange={(event) => setProgram(event.target.value)} disabled={Boolean(student)}>
            <option value="">All programmes</option>
            {(options.data?.programs || []).map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}
          </SelectField>
          <SelectField label="Batch" value={batch} onChange={(event) => setBatch(event.target.value)} disabled={Boolean(student)}>
            <option value="">All batches</option>
            {(options.data?.batches || []).map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}
          </SelectField>
        </CardBody>
      </Card>

      {student ? (
        detail.isLoading ? <SkeletonCard lines={10} /> : detail.error ? (
          <Card><ErrorState message={detail.error?.response?.data?.message || 'The GPA could not be calculated.'} onRetry={detail.refetch} /></Card>
        ) : detail.data && !detail.data.configured ? (
          <ConfigNotice message={detail.data.message} />
        ) : detail.data ? (
          <div className="space-y-5">
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="CGPA" value={detail.data.cgpa ?? '—'} icon={GraduationCap} tone="indigo" hint="Cumulative grade point average" />
              <StatCard label="Credits counted" value={detail.data.credits ?? 0} icon={Calculator} tone="emerald" hint="Under the repeat policy" />
              <StatCard label="Quality points" value={detail.data.qualityPoints ?? 0} icon={Calculator} tone="amber" hint="Grade points × credits" />
              <StatCard label="Courses counted" value={detail.data.courseCount ?? 0} icon={BookIcon} tone="sky" hint="Published results only" />
            </section>
            <Card>
              <CardHeader
                title={`${detail.data.student?.fullName || 'Student'} · academic record`}
                subtitle={`${detail.data.student?.studentId || ''} · ${detail.data.student?.program || ''}. CGPA is cumulative; individual years are shown for context.`}
                icon={GraduationCap}
                action={<Button size="sm" variant="secondary" onClick={() => setStudent(null)}>Back to all students</Button>}
              />
              <RegistrarTable
                columns={courseColumns}
                rows={detail.data.courses || []}
                rowKey={(row) => row.id}
                emptyTitle="No published results"
                emptyMessage="A CGPA can only be calculated after results have been published."
              />
            </Card>
          </div>
        ) : null
      ) : list.isLoading ? (
        <SkeletonCard lines={10} />
      ) : list.error ? (
        <Card><ErrorState message={list.error?.response?.data?.message || 'GPA records could not be loaded.'} onRetry={list.refetch} /></Card>
      ) : list.data && !list.data.configured ? (
        <ConfigNotice message={list.data.message} />
      ) : (
        <Card>
          <CardHeader title="Students with published results" subtitle="Up to 500 students matching the selected programme or batch." icon={Calculator} action={<Badge tone="neutral">Policy v{list.data?.policyVersion ?? '—'}</Badge>} />
          <RegistrarTable
            columns={listColumns}
            rows={listRows}
            loading={list.isFetching}
            rowKey={(row) => row.id}
            emptyTitle="No GPA records yet"
            emptyMessage="Publish results before calculating GPA or CGPA."
          />
        </Card>
      )}
    </div>
  );
}

const BookIcon = Calculator;

function ConfigNotice({ message }) {
  return (
    <Card>
      <CardBody className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Info className="h-5 w-5" /></span>
        <div>
          <p className="text-sm font-semibold text-slate-900">Grading policy required</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{message || 'Configure the grading policy before official GPA or CGPA can be calculated.'}</p>
        </div>
      </CardBody>
    </Card>
  );
}
