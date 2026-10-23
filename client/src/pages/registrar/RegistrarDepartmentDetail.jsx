import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, BookOpen, Building2, UserPlus, Users } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { REGISTRAR } from '../../lib/registrar';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { FormGrid, SelectField } from '../../components/registrar/Fields';
import { EmptyState } from '../../components/ui/StatePanel';
import { SkeletonCard } from '../../components/ui/Skeleton';

export default function RegistrarDepartmentDetail() {
  const { deptId } = useParams();
  const queryClient = useQueryClient();
  const [assignModal, setAssignModal] = useState(null);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [form, setForm] = useState({ teacher: '', course: '' });

  const dept = useQuery({
    queryKey: ['registrar', 'department-detail', deptId],
    queryFn: async () => (await api.get(`${REGISTRAR}/academic-structure`)).data,
  });

  const departments = dept.data?.departments || [];
  const allPrograms = dept.data?.programs || [];
  const allTeachers = dept.data?.teachers || [];
  const allCourses = dept.data?.courses || [];

  const department = departments.find((d) => d.id === deptId);
  const programs = allPrograms.filter((p) => p.department?.id === deptId);

  if (dept.isLoading) return <div className="p-6"><SkeletonCard lines={8} /></div>;
  if (!department) {
    return (
      <div className="p-6">
        <Link to={`${REGISTRAR}/academic-structure`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <EmptyState title="Department not found" message="That department does not exist or has been removed." />
      </div>
    );
  }

  const set = (field, value) => setForm((c) => ({ ...c, [field]: value }));

  const saveAssignment = async () => {
    if (!form.teacher) { toast.error('Choose a teacher.'); return; }
    try {
      await api.post(`${REGISTRAR}/academic-structure/programs/${selectedProgram.id}/assignments`, {
        teacher: form.teacher,
        course: form.course || null,
      });
      toast.success('Teacher assigned.');
      setAssignModal(null);
      setForm({ teacher: '', course: '' });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'department-detail', deptId] });
    } catch (err) {
      toast.error(errorMessage(err, 'Could not assign teacher.'));
    }
  };

  return (
    <div className="space-y-6">
      <Link to={`${REGISTRAR}/academic-structure`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600">
        <ArrowLeft className="h-4 w-4" /> Back to academic structure
      </Link>

      <RegistrarPageHeader
        title={department.name}
        subtitle={`${department.code} · ${department.programCount ?? 0} programmes · ${department.courseCount ?? 0} courses`}
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardBody className="text-center"><p className="text-2xl font-bold text-slate-900">{department.programCount ?? 0}</p><p className="text-xs text-slate-500">Programmes</p></CardBody></Card>
        <Card><CardBody className="text-center"><p className="text-2xl font-bold text-slate-900">{department.courseCount ?? 0}</p><p className="text-xs text-slate-500">Courses</p></CardBody></Card>
        <Card><CardBody className="text-center"><p className="text-2xl font-bold text-slate-900">{programs.reduce((s, p) => s + (p.teachers?.length || 0), 0)}</p><p className="text-xs text-slate-500">Assigned Teachers</p></CardBody></Card>
        <Card><CardBody className="text-center"><p className="text-2xl font-bold text-slate-900">{programs.filter(p => !p.teachers?.length).length}</p><p className="text-xs text-slate-500">Need Assignment</p></CardBody></Card>
      </div>

      {/* Programmes */}
      <Card>
        <CardHeader title="Programmes" icon={Building2} />
        <CardBody>
          {programs.length === 0 ? (
            <EmptyState icon={GraduationCap} title="No programmes yet" message="Create a programme for this department to get started." />
          ) : (
            <div className="space-y-4">
              {programs.map((prog) => {
                const progCourses = allCourses.filter((c) => c.department?.id === deptId).slice(0, 5);
                const teacherCount = prog.teachers?.length || 0;
                return (
                  <div key={prog.id} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{prog.code} · {prog.name}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {prog.qualificationType} · {prog.durationYears ? `${prog.durationYears} years` : '—'}
                          {' · '}{progCourses.length} courses shown
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={teacherCount > 0 ? 'success' : 'warning'}>
                          {teacherCount} teacher{teacherCount !== 1 ? 's' : ''}
                        </Badge>
                        <Link
                          to={`${REGISTRAR}/academic-structure/programs/${prog.id}`}
                          className="focus-ring inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                        >
                          Details <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>

                    {/* Courses */}
                    {progCourses.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {progCourses.map((course) => (
                          <span key={course.id} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                            {course.code}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Assign teacher button */}
                    {teacherCount === 0 && (
                      <div className="mt-3">
                        <Button size="sm" variant="secondary" onClick={() => { setSelectedProgram(prog); setAssignModal(true); }}>
                          <UserPlus className="h-3.5 w-3.5" /> Assign teacher
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Assign Teacher Modal */}
      <Modal
        open={assignModal}
        onClose={() => setAssignModal(false)}
        title={`Assign teacher to ${selectedProgram?.code || ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAssignModal(false)}>Cancel</Button>
            <Button onClick={saveAssignment}>Assign</Button>
          </>
        }
      >
        <FormGrid>
          <SelectField label="Teacher" value={form.teacher} onChange={(e) => set('teacher', e.target.value)} required>
            <option value="">Choose a teacher</option>
            {allTeachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name || t.email}</option>
            ))}
          </SelectField>
          <SelectField label="Course (optional)" value={form.course} onChange={(e) => set('course', e.target.value)}>
            <option value="">All courses in programme</option>
            {allCourses.filter((c) => c.department?.id === deptId).map((c) => (
              <option key={c.id} value={c.id}>{c.code} · {c.title}</option>
            ))}
          </SelectField>
        </FormGrid>
      </Modal>
    </div>
  );
}
