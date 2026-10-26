import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, BookOpen, Calendar, GraduationCap, Layers, Users, UserPlus } from 'lucide-react';
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
  const { id, programId = id } = useParams();
  const queryClient = useQueryClient();
  const [assignModal, setAssignModal] = useState(null);
  const [activeTab, setActiveTab] = useState('teachers'); // 'teachers' | 'courses' | 'batches' | 'plans'

  const program = useQuery({
    queryKey: ['registrar', 'program-detail', programId],
    queryFn: async () => (await api.get(`${REGISTRAR}/academic-structure/programs/${programId}`)).data,
  });

  const prog = program.data?.program;
  const courses = (prog?.courses || program.data?.courses || []).sort((a, b) => (a.code || '').localeCompare(b.code || ''));
  const batches = prog?.batches || program.data?.batches || [];
  const plans = prog?.plans || program.data?.plans || [];
  const allTeachers = program.data?.allTeachers || [];
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
  if (!prog) return null;

  return (
    <div className="space-y-6">
      <Link to={`${REGISTRAR}/academic-structure`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> Back to academic structure
      </Link>

      <RegistrarPageHeader
        title={prog.name}
        subtitle={`${prog.code} · ${levelLabel(prog.level, prog.qualificationType)} · Department: ${prog.department?.name || '—'}`}
        actions={
          <Button onClick={() => setAssignModal({ course: null })} className="gap-2">
            <UserPlus className="h-4 w-4" /> Assign teacher
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-slate-900">{prog.studentCount ?? program.data?.studentCount ?? 0}</p>
            <p className="text-xs text-slate-500">Active Students</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-slate-900">{courses.length}</p>
            <p className="text-xs text-slate-500">Courses</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-slate-900">{batches.length}</p>
            <p className="text-xs text-slate-500">Batches</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-slate-900">{plans.length}</p>
            <p className="text-xs text-slate-500">Curriculum Plans</p>
          </CardBody>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('teachers')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
            activeTab === 'teachers' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Users className="h-4 w-4" /> Teachers ({existingAssignments.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('courses')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
            activeTab === 'courses' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <BookOpen className="h-4 w-4" /> Courses ({courses.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('batches')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
            activeTab === 'batches' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <GraduationCap className="h-4 w-4" /> Batches ({batches.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('plans')}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
            activeTab === 'plans' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Layers className="h-4 w-4" /> Curriculum Plans ({plans.length})
        </button>
      </div>

      {activeTab === 'teachers' && (
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
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-bold">
                        {a.teacher?.name?.slice(0, 2)?.toUpperCase() || 'T'}
                      </div>
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
      )}

      {activeTab === 'courses' && (
        <Card>
          <CardHeader title="Programme Courses" subtitle="Catalogue of courses associated with this programme and department." icon={BookOpen} />
          <CardBody className="overflow-x-auto p-0">
            {courses.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No courses found" message="No courses linked to this programme yet." />
              </div>
            ) : (
              <table className="w-full min-w-max border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Course Title</th>
                    <th className="px-4 py-3 text-center">Credit Hours</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {courses.map((c) => (
                    <tr key={c.id || c.code} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-mono font-bold text-slate-900">{c.code}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{c.title || c.name}</td>
                      <td className="px-4 py-2.5 text-center font-semibold">{c.creditHours || 3}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge tone={c.active !== false ? 'success' : 'neutral'}>
                          {c.active !== false ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      )}

      {activeTab === 'batches' && (
        <Card>
          <CardHeader title="Enrolled Batches" subtitle="Batches pursuing this programme." icon={GraduationCap} />
          <CardBody className="overflow-x-auto p-0">
            {batches.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No batches found" message="No student batches registered for this programme." />
              </div>
            ) : (
              <table className="w-full min-w-max border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Batch Code</th>
                    <th className="px-4 py-3">Batch Name</th>
                    <th className="px-4 py-3 text-center">Stream</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batches.map((b) => (
                    <tr key={b.id || b.code} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-mono font-bold text-brand-700">{b.code}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{b.name}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge tone={b.category === 'extension' ? 'warning' : 'neutral'}>
                          {b.category === 'extension' ? 'Extension' : 'Regular'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge tone={b.status === 'active' ? 'success' : 'neutral'}>
                          {b.status || 'planned'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      )}

      {activeTab === 'plans' && (
        <Card>
          <CardHeader title="Curriculum Plans" subtitle="Curriculum versions structured for this programme." icon={Layers} />
          <CardBody className="overflow-x-auto p-0">
            {plans.length === 0 ? (
              <div className="p-6">
                <EmptyState title="No curriculum plans" message="No curriculum plans created for this programme yet." />
              </div>
            ) : (
              <table className="w-full min-w-max border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3 text-center">Version</th>
                    <th className="px-4 py-3 text-center">Total Credits</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {plans.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{p.title}</td>
                      <td className="px-4 py-2.5 text-center font-mono">v{p.version || 1}</td>
                      <td className="px-4 py-2.5 text-center font-semibold">{p.totalCredits || '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge tone={p.status === 'published' ? 'success' : 'warning'}>
                          {p.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      )}

      <AssignTeacherModal
        open={Boolean(assignModal)}
        onClose={() => setAssignModal(null)}
        teachers={allTeachers}
        courses={courses}
        programCategories={prog.categories || ['regular']}
        onSubmit={(data) => saveAssignment.mutate(data)}
      />
    </div>
  );
}

function AssignTeacherModal({ open, onClose, teachers, courses, programCategories = ['regular'], onSubmit }) {
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
          {teachers.map((t) => {
            const reg = t.workload?.regular ?? 0;
            const ext = t.workload?.extension ?? 0;
            const isRegularFull = programCategories.includes('regular') && reg >= 2;
            const isExtensionFull = programCategories.includes('extension') && ext >= 1;
            const isFull = isRegularFull || isExtensionFull;

            return (
              <option key={t.id} value={t.id} disabled={isFull}>
                {t.name || t.email} ({reg}/2 Regular · {ext}/1 Extension){isFull ? ' - Limit reached' : ''}
              </option>
            );
          })}
        </SelectField>
        <SelectField label="Course (optional)" value={form.course} onChange={(e) => set('course', e.target.value)}>
          <option value="">All courses in programme</option>
          {courses.map((c) => <option key={c.id || c.code} value={c.id}>{c.code} · {c.title || c.name}</option>)}
        </SelectField>
      </FormGrid>
    </Modal>
  );
}
