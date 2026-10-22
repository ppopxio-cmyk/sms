import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Layers3, UsersRound } from 'lucide-react';
import { api } from '../../lib/api';
import {
  REGISTRAR,
  displayDate,
  humanStatus,
  levelLabel,
  toneForStatus,
} from '../../lib/registrar';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import ExportMenu from '../../components/ui/ExportMenu';
import { ErrorState } from '../../components/ui/StatePanel';
import { SkeletonCard } from '../../components/ui/Skeleton';

function Metric({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1.5 font-serif text-2xl text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-700">{value || '—'}</dd>
    </div>
  );
}

export default function RegistrarBatch() {
  const { batchId } = useParams();
  const query = useQuery({
    queryKey: ['registrar', 'batch', batchId],
    queryFn: async () => (await api.get(`${REGISTRAR}/batches/${batchId}`)).data,
  });

  if (query.isLoading) {
    return <div className="grid gap-4"><SkeletonCard /><SkeletonCard /></div>;
  }
  if (query.isError || !query.data?.batch) {
    return <ErrorState title="Batch unavailable" description="This batch could not be loaded or does not exist." onRetry={() => query.refetch()} />;
  }

  const { batch, students, counts, total, truncated } = query.data;
  const columns = [
    {
      key: 'student',
      label: 'Student',
      render: (row) => (
        <Link to={`/registrar/students/${row.id}`} className="group block">
          <p className="text-sm font-semibold text-slate-900 group-hover:text-brand-700">{row.fullName}</p>
          <p className="text-xs text-slate-500">{row.studentId}</p>
        </Link>
      ),
    },
    { key: 'sex', label: 'Sex', render: (row) => humanStatus(row.sex) },
    { key: 'level', label: 'Level', render: (row) => levelLabel(row.level) },
    { key: 'category', label: 'Stream', render: (row) => humanStatus(row.studentCategory) },
    { key: 'status', label: 'Status', render: (row) => <Badge tone={toneForStatus(row.studentStatus)}>{humanStatus(row.studentStatus)}</Badge> },
    { key: 'phone', label: 'Phone', render: (row) => row.phone || '—' },
    { key: 'admission', label: 'Admitted', render: (row) => displayDate(row.admissionDate) },
  ];

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link to="/registrar/batches" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-700">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to batches
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <h1 className="font-serif text-3xl text-slate-900">{batch.code}</h1>
            <Badge tone={toneForStatus(batch.status)}>{humanStatus(batch.status)}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">{batch.name}</p>
        </div>
        <ExportMenu
          basePath={`${REGISTRAR}/batches/${batchId}/export`}
          formats={['docx', 'pdf']}
          filenamePrefix={`batch-${batch.code}`}
          disabled={!total}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Students" value={total} hint="All records in this batch" />
        <Metric label="Active" value={counts.active || 0} hint="Currently enrolled" />
        <Metric label="Graduated" value={counts.graduated || 0} hint="Completed their programme" />
        <Metric label="Stream" value={batch.category === 'extension' ? 'Extension' : 'Regular'} hint={batch.admissionAcademicYear?.label || 'Admission year'} />
      </div>

      <Card>
        <CardHeader title="Batch details" subtitle="Programme, intake and progression." />
        <CardBody>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Department" value={batch.department ? `${batch.department.code} · ${batch.department.name}` : '—'} />
            <Detail label="Programme" value={batch.program ? `${batch.program.code} · ${batch.program.name}` : '—'} />
            <Detail label="Admission year" value={batch.admissionAcademicYear?.label} />
            <Detail label="Current level" value={levelLabel(batch.currentLevel)} />
            <Detail label="Duration" value={batch.durationYears ? `${batch.durationYears} year${batch.durationYears === 1 ? '' : 's'}` : '—'} />
            <Detail label="Expected completion" value={batch.expectedCompletionYear || '—'} />
            <Detail label="Created" value={displayDate(batch.createdAt)} />
            <Detail label="Updated" value={displayDate(batch.updatedAt)} />
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Students"
          subtitle={truncated ? `Showing ${students.length} of ${total} students. Export the full register for every record.` : `${total} student${total === 1 ? '' : 's'} in this batch.`}
          right={<span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><UsersRound className="h-4 w-4" /> {total}</span>}
        />
        <RegistrarTable columns={columns} rows={students} empty="No students are assigned to this batch yet." />
      </Card>

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5"><Layers3 className="h-4 w-4" /> {batch.code}</span>
        <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> {batch.admissionAcademicYear?.label || 'Academic year not set'}</span>
      </div>
    </div>
  );
}
