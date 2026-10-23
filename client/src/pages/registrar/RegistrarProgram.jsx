import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Users, UserPlus } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { REGISTRAR, humanStatus, levelLabel, toneForStatus } from '../../lib/registrar';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { FormGrid, SelectField } from '../../components/registrar/Fields';
import { EmptyState } from '../../components/ui/StatePanel';
import { SkeletonCard } from '../../components/ui/Skeleton';

export default function RegistrarProgram() {
  const { programId } = useParams();
  const queryClient = useQueryClient();
  const [assignModal, setAssignModal] = useState(null);

  const program = useQuery({
    queryKey: ['registrar', 'program-detail', programId],
    queryFn: async () => (await api.get(`${REGISTRAR}/academic-structure/programs/${programId}`)).data,
  });

  const courses = (program.data?.program?.courses || []).sort((a, b) => a.code.localeCompare(b.code));
  const allTeachers = (program.data?.allTeachers || []) || [];
  const existingAssignments = (program.data?.assignments || []).sort((a, b) =>
    (a.teacher?.name || '').localeCompare(b.teacher?.name || '')
  );

  const saveAssignment = useMutation({
    mutationFn: async (data) => (await api.post(`${REGISTRAR}/academic-structure/programs/${programId}/assignments`, data)).data,
    onSuccess: () => {
      toast.success('Teacher assigned to course.');
      queryClient.invalidateQueries({ queryKey: ['registrar', 'program-detail', programId] });
      setAssignModal(null);
    },
    onError: (err) => toast.error(errorMessage(err, 'Assignment could not be saved.')),
  });

  if (program.isLoading) return <div className="p-6"><SkeletonCard lines={8} /></div>;
  if (program.isError) return <div className="p-6"><EmptyState message={program.error?.response?.data?.message || 'Failed to load programme'} /></div>;
  if (!program.data?.program) return null;

  const prog = program.data.program;

  return (
    <div className="space-y-6">
      <Link to={`${REGISTRAR}/academic-structure`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> Back to academic structure
      </Link>

      <RegistrarPageHeader
        title={prog.name}
        subtitle={`${prog.code} · ${levelLabel(prog.level, prog.qualificationType)}`}
        actions={
          <Button onClick={() => setAssignModal({ course: null })} className="gap-2">
            <UserPlus className="h-4 w-4" /> Assign teacher
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardBody className="text-center"><p className="text-2xl font-bold text-slate-900">{prog.studentCount ?? 0}</p><p className="text-xs text-slate-500">Active Students</p></CardBody></Card>
        <Card><CardBody className="text-center"><p className="text-2xl font-bold text-slate-900">{courses.length}</p><p className="text-xs text-slate-500">Courses</p></CardBody></Card>
        <Card><CardBody className="text-center"><p className="text-2xl font-bold text-slate-900">{prog.batches?.length ?? 0}</p><p className="text-xs text-slate-500">Batches</p></CardBody></Card>
        <Card><CardBody className="text-center"><p className="text-2xl font-bold text-slate-900">{prog.plans?.length ?? 0}</p><p className="text-xs text-slate-500">Curriculum Plans</p></CardBody></Card>
      </div>

      <Card>
        <CardHeader title="Assigned Teachers & Courses" icon={Users} />
        <CardBody>
          {existingAssignments.length === 0 ? (
            <EmptyState icon={UserPlus} title="No teachers assigned" message="Assign a teacher to this programme to link them with its courses." />
          ) : (
            <div className="space-y-3">
              {existingAssignments.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-bold">{a.teacher?.name?.slice(0, 2)?.toUpperCase() || 'T'}</div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{a.teacher?.name || a.teacher?.email || 'Unknown teacher'}</p>
                      <p className="text-xs text-slate-500">{a.courseCode || 'Programme-only assignment'}</p>
                    </div>
                  </div>
                  <Badge tone={toneForStatus(a.status)}>{humanStatus(a.status)}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <AssignTeacherModal
        open={Boolean(assignModal)}
        onClose={() => setAssignModal(null)}
        teachers={allTeachers}
        courses={courses}
        onSubmit={(data) => saveAssignment.mutate(data)}
      />
    </div>
  );
}

function AssignTeacherModal({ open, onClose, teachers, courses, onSubmit }) {
  const [form, setForm] = useState({ teacher: '', course: '' });

  const save = useMutation({
    mutationFn: async (data) => onSubmit(data),
    onSuccess: () => toast.success('Teacher assigned.'),
    onError: (err) => toast.error(errorMessage(err, 'Could not assign teacher.')),
  });

  const set = (field, value) => setForm((c) => ({ ...c, [field]: value }));

  return (
    <Modal open={open} title="Assign teacher to course" onClose={onClose} footer={
      <>
        <Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
        <Button onClick={() => save.mutate(form)} loading={save.isPending}>Save</Button>
      </>
    }>
      <FormGrid>
        <SelectField label="Teacher" value={form.teacher} onChange={(e) => set('teacher', e.target.value)} required>
          <option value="">Choose a teacher</option>
          {teachers.map((t) => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
        </SelectField>
        <SelectField label="Course (optional)" value={form.course} onChange={(e) => set('course', e.target.value)}>
          <option value="">All courses in programme</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title}</option>)}
        </SelectField>
      </FormGrid>
    </Modal>
  );
}
