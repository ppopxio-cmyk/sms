import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Camera,
  GraduationCap,
  MapPin,
  Pencil,
  Trash2,
  UserRound,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  REGISTRAR,
  displayDate,
  humanStatus,
  levelLabel,
  qualificationLabel,
  toneForStatus,
} from '../../lib/registrar';
import RegistrarPageHeader from '../../components/registrar/RegistrarPageHeader';
import RegistrarTable from '../../components/registrar/RegistrarTable';
import StudentFormModal from '../../components/registrar/StudentFormModal';
import ConfirmDialog from '../../components/registrar/ConfirmDialog';
import Card, { CardBody, CardHeader } from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/StatePanel';
import { SkeletonCard } from '../../components/ui/Skeleton';

const MAX_PHOTO = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

function DetailRow({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-700">{value || '—'}</dd>
    </div>
  );
}

export default function RegistrarStudent() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInput = useRef(null);
  const [editing, setEditing] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);

  const student = useQuery({
    queryKey: ['registrar', 'student', studentId],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/${studentId}`)).data,
  });

  const options = useQuery({
    queryKey: ['registrar', 'students', 'options'],
    queryFn: async () => (await api.get(`${REGISTRAR}/students/options`)).data,
    staleTime: 5 * 60_000,
  });

  const upload = useMutation({
    mutationFn: async (file) => {
      if (!ACCEPTED.includes(file.type)) throw new Error('Choose a JPEG, PNG or WebP image.');
      if (file.size > MAX_PHOTO) throw new Error('The photo must be smaller than 5 MB.');
      const buffer = await file.arrayBuffer();
      return (await api.post(`${REGISTRAR}/students/${studentId}/photo`, buffer, {
        headers: { 'Content-Type': file.type },
      })).data;
    },
    onSuccess: () => {
      toast.success('Student photo updated.');
      queryClient.invalidateQueries({ queryKey: ['registrar', 'student', studentId] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'students'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'The photo could not be uploaded.')),
  });

  const remove = useMutation({
    mutationFn: async () => (await api.delete(`${REGISTRAR}/students/${studentId}/photo`)).data,
    onSuccess: () => {
      toast.success('Student photo removed.');
      setRemoveOpen(false);
      queryClient.invalidateQueries({ queryKey: ['registrar', 'student', studentId] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'students'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'The photo could not be removed.')),
  });

  const record = student.data?.student;
  const summary = student.data?.summary ?? {};
  const enrollments = student.data?.enrollments ?? [];
  const certificates = student.data?.certificates ?? [];

  const enrollmentColumns = useMemo(
    () => [
      {
        key: 'year',
        label: 'Academic year',
        render: (row) => row.academicYear?.label || '—',
      },
      { key: 'level', label: 'Level', render: (row) => levelLabel(row.level, record?.qualificationType) },
      { key: 'batch', label: 'Batch', render: (row) => row.batch?.code || '—' },
      {
        key: 'status',
        label: 'Status',
        render: (row) => <Badge tone={toneForStatus(row.status)}>{humanStatus(row.status)}</Badge>,
      },
      { key: 'date', label: 'Enrollment date', render: (row) => displayDate(row.enrollmentDate) },
    ],
    [record?.qualificationType],
  );

  if (student.error) {
    return (
      <div className="space-y-5">
        <Button variant="secondary" onClick={() => navigate('/registrar/students')}>
          <ArrowLeft className="h-4 w-4" /> Back to students
        </Button>
        <Card>
          <ErrorState
            message={student.error?.response?.data?.message || 'That student record could not be loaded.'}
            onRetry={student.refetch}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RegistrarPageHeader
        eyebrow="Student record"
        title={record?.fullName || 'Loading student…'}
        subtitle={record ? `${record.studentId} · ${record.program?.name || 'Programme not set'} · ${qualificationLabel(record.qualificationType)}` : 'Loading the official record.'}
        actions={
          <>
            <Button variant="secondary" onClick={() => navigate('/registrar/students')}>
              <ArrowLeft className="h-4 w-4" /> Students
            </Button>
            <Button onClick={() => setEditing(true)} disabled={!record} className="gap-2">
              <Pencil className="h-4 w-4" /> Edit record
            </Button>
          </>
        }
      />

      {student.isLoading ? (
        <div className="grid gap-5 lg:grid-cols-3">
          <SkeletonCard lines={6} />
          <div className="lg:col-span-2"><SkeletonCard lines={8} /></div>
        </div>
      ) : record ? (
        <>
          <div className="grid gap-5 lg:grid-cols-3">
            <Card>
              <CardBody className="flex flex-col items-center text-center">
                {record.photo?.url ? (
                  <img src={record.photo.url} alt={`${record.fullName} portrait`} className="h-44 w-36 rounded-3xl object-cover shadow-lg ring-1 ring-slate-100" />
                ) : (
                  <div className="flex h-44 w-36 flex-col items-center justify-center rounded-3xl bg-slate-100 text-slate-400">
                    <UserRound className="h-12 w-12" />
                    <span className="mt-2 text-[11px] font-semibold uppercase tracking-wider">No photo</span>
                  </div>
                )}
                <p className="mt-4 text-lg font-bold text-slate-900">{record.fullName}</p>
                <p className="text-xs text-slate-500">{record.studentId}</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <Badge tone={toneForStatus(record.studentStatus)}>{humanStatus(record.studentStatus)}</Badge>
                  <Badge tone={toneForStatus(record.enrollmentStatus)}>{humanStatus(record.enrollmentStatus)}</Badge>
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) upload.mutate(file);
                    event.target.value = '';
                  }}
                />
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button size="sm" variant="secondary" loading={upload.isPending} onClick={() => fileInput.current?.click()}>
                    <Camera className="h-3.5 w-3.5" /> {record.photo ? 'Replace photo' : 'Upload photo'}
                  </Button>
                  {record.photo ? (
                    <Button size="sm" variant="ghost" onClick={() => setRemoveOpen(true)}>
                      <Trash2 className="h-3.5 w-3.5 text-rose-500" /> Remove
                    </Button>
                  ) : null}
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                  JPEG, PNG or WebP · at most 5 MB. The certificate photo must be at least 472 × 472 px when the template requires a photo.
                </p>
              </CardBody>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader title="Academic and contact details" icon={BookOpen} />
              <CardBody>
                <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <DetailRow label="Department" value={record.department ? `${record.department.code} · ${record.department.name}` : null} />
                  <DetailRow label="Programme" value={record.program ? `${record.program.code} · ${record.program.name}` : null} />
                  <DetailRow label="Qualification" value={qualificationLabel(record.qualificationType)} />
                  <DetailRow label="Level / year" value={levelLabel(record.level, record.qualificationType)} />
                  <DetailRow label="Batch" value={record.batch ? `${record.batch.code} · ${record.batch.name}` : null} />
                  <DetailRow label="Admission year" value={record.admissionAcademicYear?.label} />
                  <DetailRow label="Admission date" value={displayDate(record.admissionDate)} />
                  <DetailRow label="Completion date" value={displayDate(record.completionDate)} />
                  <DetailRow label="Sex" value={humanStatus(record.sex)} />
                  <DetailRow label="Date of birth" value={displayDate(record.dateOfBirth)} />
                  <DetailRow label="Email" value={record.email} />
                  <DetailRow label="Phone" value={record.phone} />
                </dl>
                <div className="mt-5 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-lg font-bold text-slate-900">{summary.activeRegistrations ?? 0}</p>
                    <p className="text-[11px] text-slate-500">Active courses</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-lg font-bold text-slate-900">{summary.publishedResults ?? 0}</p>
                    <p className="text-[11px] text-slate-500">Published results</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-lg font-bold text-slate-900">{summary.enrollments ?? 0}</p>
                    <p className="text-[11px] text-slate-500">Enrollments</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3 text-center">
                    <p className="text-lg font-bold text-slate-900">{summary.certificates ?? 0}</p>
                    <p className="text-[11px] text-slate-500">Certificates</p>
                  </div>
                </div>
                {record.address && Object.values(record.address).some(Boolean) ? (
                  <p className="mt-4 flex items-start gap-2 text-xs text-slate-500">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {[record.address.line, record.address.woreda, record.address.city, record.address.region].filter(Boolean).join(', ')}
                  </p>
                ) : null}
                {record.notes ? <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900">{record.notes}</p> : null}
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Enrollment history"
                subtitle="Every academic year recorded for this student."
                icon={CalendarDays}
                action={<Link to="/registrar/enrollments" className="text-xs font-semibold text-brand-700 hover:underline">Manage</Link>}
              />
              <RegistrarTable
                columns={enrollmentColumns}
                rows={enrollments}
                rowKey={(row) => row.id}
                emptyTitle="No enrollments"
                emptyMessage="Create an enrollment for this student from the enrollments page."
              />
            </Card>

            <Card>
              <CardHeader
                title="Official documents"
                subtitle="Certificate history is preserved even after a reissue."
                icon={GraduationCap}
                action={<Link to="/registrar/certificates" className="text-xs font-semibold text-brand-700 hover:underline">Certificates</Link>}
              />
              <CardBody className="space-y-3">
                {!certificates.length ? (
                  <p className="text-sm text-slate-500">No certificate has been issued for this student.</p>
                ) : (
                  certificates.map((row) => (
                    <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 p-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{row.certificateNumber}</p>
                        <p className="text-xs text-slate-500">Issued {displayDate(row.issuedAt)} · CGPA {row.cgpa ?? '—'}</p>
                      </div>
                      <Badge tone={toneForStatus(row.status)}>{humanStatus(row.status)}</Badge>
                    </div>
                  ))
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link to={`/registrar/transcripts?student=${record.id}`} className="focus-ring inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Transcripts
                  </Link>
                  <Link to={`/registrar/graduation-eligibility?student=${record.id}`} className="focus-ring inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Graduation eligibility
                  </Link>
                  <Link to={`/registrar/gpa-cgpa?student=${record.id}`} className="focus-ring inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    GPA / CGPA
                  </Link>
                </div>
              </CardBody>
            </Card>
          </div>
        </>
      ) : null}

      <StudentFormModal
        open={editing}
        student={record}
        options={options.data}
        onClose={() => setEditing(false)}
        onSaved={() => student.refetch()}
      />
      <ConfirmDialog
        open={removeOpen}
        title="Remove student photo?"
        message="The ImageKit file and its MongoDB reference will be removed. A certificate that requires a photo will be blocked until a new one is uploaded."
        confirmLabel="Remove photo"
        tone="danger"
        loading={remove.isPending}
        onClose={() => setRemoveOpen(false)}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
