import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, BookOpen, GraduationCap, Layers3, Plus, ScrollText, UserRoundCheck, Users } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  REGISTRAR,
  displayDate,
  humanStatus,
  levelLabel,
  qualificationLabel,
  toneForStatus,
} from '../../lib/registrar';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { ErrorState } from '../../components/ui/StatePanel';
import { SkeletonCard } from '../../components/ui/Skeleton';

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-700">{value || '—'}</dd>
    </div>
  );
}

export default function RegistrarProgram() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedTeachers, setSelectedTeachers] = useState([]);

  const query = useQuery({
    queryKey: ['registrar', 'program', id],
    queryFn: async () => (await api.get(`${REGISTRAR}/academic-structure/programs/${id}`)).data,
  });

  const structureOptions = useQuery({
    queryKey: ['registrar', 'structure'],
    queryFn: async () => (await api.get(`${REGISTRAR}/academic-structure`)).data,
  });

  const assignTeachers = useMutation({
    mutationFn: async (teacherIds) =>
      (await api.patch(`${REGISTRAR}/academic-structure/programs/${id}`, { teachers: teacherIds })).data,
    onSuccess: () => {
      toast.success('Programme teachers updated.');
      setAssignOpen(false);
      queryClient.invalidateQueries({ queryKey: ['registrar', 'program', id] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'structure'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'The teachers could not be saved.')),
  });

  if (query.isLoading) {
    return <div className="grid gap-4"><SkeletonCard /><SkeletonCard /></div>;
  }

  if (query.isError || !query.data?.program) {
    return (
      <ErrorState
        title="Programme unavailable"
        message={errorMessage(query.error, 'This programme could not be loaded.')}
        onRetry={() => query.refetch()}
      />
    );
  }

  const { program, assignments, batches, courses, plans, studentCount } = query.data;
  const allTeachers = structureOptions.data?.teachers || [];

  const openAssignModal = () => {
    setSelectedTeachers((program.teachers || []).map((t) => t.id || String(t._id ?? t)));
    setAssignOpen(true);
  };

  const toggleTeacher = (tId) => {
    setSelectedTeachers((current) =>
      current.includes(tId) ? current.filter((i) => i !== tId) : [...current, tId],
    );
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            to="/registrar/academic-structure"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to academic structure
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <h1 className="font-serif text-3xl text-slate-900">{program.name}</h1>
            <Badge tone="brand">{qualificationLabel(program.qualificationType)}</Badge>
            <Badge tone={program.active ? 'success' : 'neutral'}>{program.active ? 'Active' : 'Inactive'}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">{program.code} · {program.department?.name || 'Department not set'}</p>
        </div>
        <Button onClick={openAssignModal} className="gap-2">
          <UserRoundCheck className="h-4 w-4" /> Assign teachers
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Active students</p>
          <p className="mt-1.5 font-serif text-2xl text-slate-900">{studentCount}</p>
          <p className="mt-1 text-xs text-slate-500">{program.capacity ? `Capacity ${program.capacity}` : 'No capacity limit set'}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Assigned teachers</p>
          <p className="mt-1.5 font-serif text-2xl text-slate-900">{(program.teachers || []).length}</p>
          <p className="mt-1 text-xs text-slate-500">Authorized for workspace</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Batches</p>
          <p className="mt-1.5 font-serif text-2xl text-slate-900">{batches.length}</p>
          <p className="mt-1 text-xs text-slate-500">Active intakes</p>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Curriculum plans</p>
          <p className="mt-1.5 font-serif text-2xl text-slate-900">{plans.length}</p>
          <p className="mt-1 text-xs text-slate-500">Published / draft</p>
        </div>
      </div>

      <Card>
        <CardHeader title="Programme details" icon={GraduationCap} />
        <CardBody>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Department" value={program.department ? `${program.department.code} · ${program.department.name}` : '—'} />
            <Detail label="Qualification" value={qualificationLabel(program.qualificationType)} />
            <Detail label="Streams" value={(program.categories || ['regular', 'extension']).map(humanStatus).join(', ')} />
            <Detail
              label="Duration / levels"
              value={
                program.qualificationType === 'degree'
                  ? `${program.durationYears || '—'} years`
                  : program.qualificationType === 'diploma'
                    ? `Levels ${(program.levels || []).join(', ')}`
                    : `${program.shortTerm?.duration || '—'} ${program.shortTerm?.unit || ''}`
              }
            />
            <Detail label="Student capacity" value={program.capacity || 'Unlimited'} />
            <Detail label="Status" value={program.active ? 'Active' : 'Inactive'} />
            <Detail label="Created" value={displayDate(program.createdAt)} />
            <Detail label="Updated" value={displayDate(program.updatedAt)} />
          </dl>
          {program.description ? <p className="mt-4 text-sm leading-relaxed text-slate-600">{program.description}</p> : null}
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Assigned teachers"
            subtitle="Teachers listed here can see this programme, its classes and registered students in their workspace."
            icon={UserRoundCheck}
            action={
              <Button size="sm" variant="secondary" onClick={openAssignModal}>
                <Plus className="h-3.5 w-3.5" /> Assign
              </Button>
            }
          />
          <CardBody className="space-y-3">
            {!(program.teachers || []).length ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-800">
                No teacher is assigned to this programme yet. Click Assign teachers to grant access.
              </div>
            ) : (
              (program.teachers || []).map((teacher) => (
                <div key={teacher.id || teacher.email} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{teacher.name}</p>
                    <p className="text-xs text-slate-500">{teacher.email}</p>
                  </div>
                  <Badge tone="success">Active assignment</Badge>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Batches"
            subtitle="Current intake groups for this programme."
            icon={Layers3}
          />
          <CardBody className="space-y-2">
            {!batches.length ? (
              <p className="text-sm text-slate-500">No batch has been created for this programme yet.</p>
            ) : (
              batches.map((batch) => (
                <Link
                  key={batch.id}
                  to={`/registrar/batches/${batch.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 p-3 transition hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{batch.code}</p>
                    <p className="text-xs text-slate-500">{batch.name} · {humanStatus(batch.category || 'regular')}</p>
                  </div>
                  <Badge tone={toneForStatus(batch.status)}>{humanStatus(batch.status)}</Badge>
                </Link>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <Modal
        open={assignOpen}
        title={`Assign teachers to ${program.name}`}
        subtitle="Selected teachers retrieve this programme, its classes and students automatically."
        size="md"
        onClose={() => setAssignOpen(false)}
        dismissible
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button
              onClick={() => assignTeachers.mutate(selectedTeachers)}
              loading={assignTeachers.isPending}
              className="gap-2"
            >
              <UserRoundCheck className="h-4 w-4" /> Save assignments
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Select every teacher who should have access to this programme in their workspace.
          </p>
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-slate-100 p-2">
            {allTeachers.map((teacher) => (
              <label key={teacher.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={selectedTeachers.includes(teacher.id)}
                  onChange={() => toggleTeacher(teacher.id)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600"
                />
                <span className="min-w-0 flex-1 truncate">
                  {teacher.name} <span className="text-xs text-slate-400">{teacher.email}</span>
                </span>
              </label>
            ))}
            {!allTeachers.length ? <p className="px-2 py-3 text-sm text-slate-500">No active teacher accounts found.</p> : null}
          </div>
          <p className="text-xs text-slate-500">{selectedTeachers.length} teacher{selectedTeachers.length === 1 ? '' : 's'} selected.</p>
        </div>
      </Modal>
    </div>
  );
}
