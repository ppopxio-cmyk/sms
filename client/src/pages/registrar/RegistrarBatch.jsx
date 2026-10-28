import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  BarChart2,
  BookOpen,
  Building2,
  CalendarDays,
  GraduationCap,
  Layers3,
  PieChart as PieIcon,
  Table,
  UsersRound,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
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

const GENDER_COLORS = { Female: '#ec4899', Male: '#3b82f6', Other: '#8b5cf6' };
const PROG_COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

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
  const [viewMode, setViewMode] = useState('charts'); // 'charts' | 'table'

  const query = useQuery({
    queryKey: ['registrar', 'batch', batchId],
    queryFn: async () => (await api.get(`${REGISTRAR}/batches/${batchId}`)).data,
  });

  if (query.isLoading) {
    return (
      <div className="grid gap-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }
  if (query.isError || !query.data?.batch) {
    return (
      <ErrorState
        title="Batch unavailable"
        description="This batch could not be loaded or does not exist."
        onRetry={() => query.refetch()}
      />
    );
  }

  const { batch, departments = [], programs = [], chartData = {}, students = [], total = 0, truncated } = query.data;

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
    { key: 'department', label: 'Department', render: (row) => row.department?.name || '—' },
    { key: 'program', label: 'Programme', render: (row) => row.program?.name || '—' },
    { key: 'sex', label: 'Sex', render: (row) => humanStatus(row.sex) },
    { key: 'level', label: 'Level', render: (row) => levelLabel(row.level) },
    { key: 'status', label: 'Status', render: (row) => <Badge tone={toneForStatus(row.studentStatus)}>{humanStatus(row.studentStatus)}</Badge> },
    { key: 'phone', label: 'Phone', render: (row) => row.phone || '—' },
    { key: 'admission', label: 'Admitted', render: (row) => displayDate(row.admissionDate) },
  ];

  return (
    <div className="grid gap-5">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            to="/registrar/batches"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to batches
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <h1 className="font-serif text-3xl text-slate-900">{batch.code}</h1>
            <Badge tone={toneForStatus(batch.status)}>{humanStatus(batch.status)}</Badge>
            <Badge tone={batch.category === 'extension' ? 'warning' : 'neutral'}>
              {humanStatus(batch.category || 'regular')} Stream
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">{batch.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setViewMode('charts')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === 'charts' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <BarChart2 className="h-3.5 w-3.5" /> Charts
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Table className="h-3.5 w-3.5" /> Student list
            </button>
          </div>
          <ExportMenu
            basePath={`${REGISTRAR}/batches/${batchId}/export`}
            formats={['docx', 'pdf']}
            filenamePrefix={`batch-${batch.code}`}
            disabled={!total}
          />
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Total enrolled students" value={total} hint="Active across all programmes in batch" />
        <Metric label="Departments involved" value={departments.length} hint="Academic divisions" />
        <Metric label="Programmes offered" value={programs.length} hint="Intake streams" />
        <Metric
          label="Admission academic year"
          value={batch.admissionAcademicYear?.label || '2019'}
          hint={batch.category === 'extension' ? 'Extension cohort' : 'Regular cohort'}
        />
      </div>

      {/* DEPARTMENTS & PROGRAMMES IN THIS BATCH */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Departments */}
        <Card>
          <CardHeader
            title="Departments in this batch"
            subtitle={`${departments.length} academic divisions represent this batch cohort.`}
            icon={Building2}
          />
          <CardBody className="p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {departments.map((dept) => (
                <div
                  key={dept.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3"
                >
                  <div>
                    <span className="font-mono text-xs font-bold text-brand-700">{dept.code}</span>
                    <p className="text-xs font-semibold text-slate-800">{dept.name}</p>
                  </div>
                  <Badge tone="brand">Active</Badge>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Programmes */}
        <Card>
          <CardHeader
            title="Programmes in this batch"
            subtitle={`${programs.length} active programmes offered in this cohort.`}
            icon={GraduationCap}
          />
          <CardBody className="p-4">
            <div className="grid gap-2.5">
              {programs.map((prog) => (
                <div
                  key={prog.id}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded">
                      {prog.code}
                    </span>
                    <span className="text-xs font-medium text-slate-800">{prog.name}</span>
                  </div>
                  <Badge tone={prog.qualificationType === 'degree' ? 'brand' : prog.qualificationType === 'diploma' ? 'sky' : 'neutral'}>
                    {prog.qualificationType}
                  </Badge>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* HYBRID CHARTS VIEW */}
      {viewMode === 'charts' ? (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Chart 1: Enrolment by Department (Grouped Male vs Female) */}
            <Card className="flex flex-col">
              <CardHeader
                title="Student enrolment by department"
                subtitle="Gender breakdown per academic department"
                icon={BarChart2}
              />
              <CardBody className="flex-1 p-4">
                {!chartData.deptBreakdown?.length ? (
                  <p className="py-12 text-center text-xs text-slate-400">No student distribution data.</p>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData.deptBreakdown} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="code" tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                        <Bar dataKey="female" name="Female" fill="#ec4899" radius={[4, 4, 0, 0]} isAnimationActive={true} />
                        <Bar dataKey="male" name="Male" fill="#3b82f6" radius={[4, 4, 0, 0]} isAnimationActive={true} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Chart 2: Gender Distribution Donut */}
            <Card className="flex flex-col">
              <CardHeader
                title="Cohort gender distribution"
                subtitle="Overall balance of students in batch"
                icon={PieIcon}
              />
              <CardBody className="flex-1 p-4">
                {!chartData.genderBreakdown?.length ? (
                  <p className="py-12 text-center text-xs text-slate-400">No gender data recorded.</p>
                ) : (
                  <div className="h-64 w-full flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData.genderBreakdown}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={85}
                          paddingAngle={4}
                          dataKey="count"
                          nameKey="name"
                          isAnimationActive={true}
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          labelLine={false}
                        >
                          {chartData.genderBreakdown.map((entry) => (
                            <Cell key={entry.name} fill={GENDER_COLORS[entry.name] || '#6366f1'} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Chart 3: Programme Enrolment Breakdown */}
          <Card>
            <CardHeader
              title="Students by programme"
              subtitle="Distribution across Degree, Diploma, and Short-Term programmes"
              icon={BarChart2}
            />
            <CardBody className="p-4">
              {!chartData.progBreakdown?.length ? (
                <p className="py-12 text-center text-xs text-slate-400">No programme breakdown data.</p>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData.progBreakdown} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="code" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} angle={-20} textAnchor="end" />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" name="Enrolled students" fill="#4f46e5" radius={[6, 6, 0, 0]} isAnimationActive={true}>
                        {chartData.progBreakdown.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={PROG_COLORS[index % PROG_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      ) : (
        /* TABLE VIEW */
        <Card>
          <CardHeader
            title="Students in this batch cohort"
            subtitle={
              truncated
                ? `Showing ${students.length} of ${total} students. Export the register for all records.`
                : `${total} student${total === 1 ? '' : 's'} enrolled in this cohort.`
            }
            right={
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <UsersRound className="h-4 w-4" /> {total}
              </span>
            }
          />
          <RegistrarTable columns={columns} rows={students} empty="No students are assigned to this batch yet." />
        </Card>
      )}

      {/* Batch details summary card */}
      <Card>
        <CardHeader title="Cohort specification" subtitle="Intake metadata and timeline." />
        <CardBody>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Batch code" value={batch.code} />
            <Detail label="Batch name" value={batch.name} />
            <Detail label="Admission year" value={batch.admissionAcademicYear?.label || '2019'} />
            <Detail label="Current level" value={levelLabel(batch.currentLevel)} />
            <Detail label="Duration" value={batch.durationYears ? `${batch.durationYears} Years` : 'Standard'} />
            <Detail label="Expected completion" value={batch.expectedCompletionYear || '2023'} />
            <Detail label="Created" value={displayDate(batch.createdAt)} />
            <Detail label="Updated" value={displayDate(batch.updatedAt)} />
          </dl>
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <Layers3 className="h-4 w-4" /> {batch.code}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4" /> {batch.admissionAcademicYear?.label || 'Academic year 2019'}
        </span>
      </div>
    </div>
  );
}
