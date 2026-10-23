import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, BookOpen, Plus } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { REGISTRAR, cleanPayload } from '../../lib/registrar';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { FormGrid, SelectField } from '../../components/registrar/Fields';
import Field from '../../components/ui/Field';
import { EmptyState } from '../../components/ui/StatePanel';
import { SkeletonCard } from '../../components/ui/Skeleton';

export default function RegistrarCourseOffering() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    curriculumCourse: '',
    teacher: '',
    batch: '',
    category: 'regular',
    status: 'draft',
    capacity: '',
    schedule: '',
    meetingDays: [],
  });

  const options = useQuery({
    queryKey: ['registrar', 'course-offering', 'options'],
    queryFn: async () => {
      const [structure, calendar] = await Promise.all([
        api.get(`${REGISTRAR}/academic-structure`),
        api.get(`${REGISTRAR}/academic-calendar`),
      ]);
      return { structure: structure.data, calendar: calendar.data };
    },
    staleTime: 5 * 60_000,
  });

  const publishedPlans = (options.data?.structure?.plans || []).filter((p) => p.status === 'published');

  const curriculumCourses = (options.data?.structure?.courses || []).map((course) => ({
    id: course.id,
    code: course.code,
    title: course.title,
    planId: null,
  }));

  const allTeachers = options.data?.structure?.teachers || [];
  const allBatches = options.data?.structure?.batches || [];

  const createOffering = useMutation({
    mutationFn: async (data) => (await api.post(`${REGISTRAR}/offerings`, data)).data,
    onSuccess: () => {
      toast.success('Course offering created.');
      queryClient.invalidateQueries({ queryKey: ['registrar', 'course-offering', 'options'] });
      setShowModal(false);
      setForm({ curriculumCourse: '', teacher: '', batch: '', category: 'regular', status: 'draft', capacity: '', schedule: '', meetingDays: [] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not create offering.')),
  });

  const set = (field, value) => setForm((c) => ({ ...c, [field]: value }));

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        title="Course Offerings"
        subtitle="Create course offerings from published curriculum plans. Each offering links a course to a programme, batch, term and teacher."
        actions={
          <Button onClick={() => setShowModal(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New offering
          </Button>
        }
      />

      <Card>
        <CardHeader title="Published Plans" icon={BookOpen} subtitle="Select a plan to create offerings from." />
        <CardBody>
          {publishedPlans.length === 0 ? (
            <EmptyState icon={BookOpen} title="No published plans" message="Publish a curriculum plan first before creating course offerings." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {publishedPlans.map((plan) => (
                <div key={plan.id} className="rounded-xl border border-slate-100 p-4">
                  <p className="text-sm font-semibold text-slate-900">{plan.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {plan.program?.code} · {plan.academicYear?.label}
                  </p>
                  <div className="mt-3">
                    <Button size="sm" variant="secondary" onClick={() => {
                      setForm((f) => ({ ...f, curriculumCourse: '', batch: '', teacher: '' }));
                      setShowModal(true);
                    }}>
                      Create offering
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <CreateOfferingModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={(data) => createOffering.mutate(data)}
        plans={publishedPlans}
        courses={options.data?.structure?.courses || []}
        teachers={allTeachers}
        batches={allBatches}
        terms={options.data?.calendar?.terms || []}
        selectedPlanId={form.curriculumCourse ? null : null}
      />
    </div>
  );
}

function CreateOfferingModal({ open, onClose, onSubmit, plans, courses, teachers, batches, terms, selectedPlanId }) {
  const [form, setForm] = useState({
    curriculumCourse: '',
    teacher: '',
    batch: '',
    category: 'regular',
    status: 'draft',
    capacity: '',
    schedule: '',
  });

  useEffect(() => {
    if (!open) return;
    setForm({ curriculumCourse: '', teacher: '', batch: '', category: 'regular', status: 'draft', capacity: '', schedule: '' });
  }, [open]);

  const set = (field, value) => setForm((c) => ({ ...c, [field]: value }));

  const selectedCourse = courses.find((c) => c.id === form.curriculumCourse);
  const filteredBatches = batches.filter((b) => {
    if (!form.category) return true;
    return b.category === form.category;
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.curriculumCourse) throw new Error('Choose a course.');
      const payload = cleanPayload({
        curriculumCourse: form.curriculumCourse,
        teacher: form.teacher || null,
        batch: form.batch || null,
        category: form.category,
        status: form.status,
        capacity: form.capacity ? Number(form.capacity) : undefined,
        schedule: form.schedule || '',
      });
      return onSubmit(payload);
    },
    onSuccess: () => {
      onClose();
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not create offering.')),
  });

  return (
    <Modal
      open={open}
      title="New course offering"
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>Create offering</Button>
        </>
      }
    >
      <div className="grid gap-4">
        <FormGrid>
          <SelectField label="Course" value={form.curriculumCourse} onChange={(e) => set('curriculumCourse', e.target.value)} required>
            <option value="">Choose a course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.code} · {c.title}</option>
            ))}
          </SelectField>
          <SelectField label="Teacher (optional)" value={form.teacher} onChange={(e) => set('teacher', e.target.value)}>
            <option value="">Unassigned</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>{t.name || t.email}</option>
            ))}
          </SelectField>
          <SelectField label="Batch (optional)" value={form.batch} onChange={(e) => set('batch', e.target.value)}>
            <option value="">All batches</option>
            {filteredBatches.map((b) => (
              <option key={b.id} value={b.id}>{b.code} · {b.name}</option>
            ))}
          </SelectField>
          <SelectField label="Category" value={form.category} onChange={(e) => set('category', e.target.value)} required>
            <option value="regular">Regular</option>
            <option value="extension">Extension</option>
          </SelectField>
          <SelectField label="Status" value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="draft">Draft</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
          </SelectField>
          <Field label="Capacity" type="number" min="1" max="500" value={form.capacity} onChange={(e) => set('capacity', e.target.value)} hint="Max students that can register." />
          <Field label="Schedule" value={form.schedule} onChange={(e) => set('schedule', e.target.value)} placeholder="e.g. Mon 8-10am, Wed 2-4pm" />
        </FormGrid>
      </div>
    </Modal>
  );
}
