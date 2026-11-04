import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Camera,
  Download,
  GraduationCap,
  MapPin,
  Pencil,
  Trash2,
  UserRound,
  FileText,
  IdCard,
  Eye,
  ShieldCheck,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  REGISTRAR,
  displayDate,
  humanStatus,
  levelLabel,
  qualificationLabel,
  toJpegFile,
  toneForStatus,
  downloadFile,
  fileErrorMessage,
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
import CodeInput from '../../components/ui/CodeInput';
import Modal from '../../components/ui/Modal';

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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteCode, setDeleteCode] = useState('');
  const [shake, setShake] = useState(0);
  const [viewingDoc, setViewingDoc] = useState(null); // { type: 'image' | 'pdf', url: string, title: string }

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
      const jpeg = await toJpegFile(file);
      const buffer = await jpeg.arrayBuffer();
      return (await api.post(`${REGISTRAR}/students/${studentId}/photo`, buffer, {
        headers: { 'Content-Type': 'image/jpeg' },
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

  const requestDelete = useMutation({
    mutationFn: async () => (await api.post(`${REGISTRAR}/students/${studentId}/delete-code`)).data,
    onSuccess: (data) => {
      setDeleteCode('');
      setDeleteOpen(true);
      toast.success(data?.message || 'A confirmation code was emailed to your Registrar account.');
    },
    onError: (err) => toast.error(errorMessage(err, 'The confirmation code could not be sent.')),
  });

  const destroy = useMutation({
    mutationFn: async () => (
      await api.request({
        url: `${REGISTRAR}/students/${studentId}`,
        method: 'delete',
        data: { code: deleteCode },
      })
    ).data,
    onSuccess: () => {
      toast.success('The student record was permanently deleted.');
      queryClient.invalidateQueries({ queryKey: ['registrar', 'students'] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'dashboard'] });
      navigate('/registrar/students');
    },
    onError: (err) => {
      setShake((value) => value + 1);
      toast.error(errorMessage(err, 'The student record could not be deleted.'));
    },
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
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await downloadFile(`${REGISTRAR}/students/${studentId}/export?format=pdf`, `${record?.studentId || 'student'}-record.pdf`);
                  toast.success('Student profile exported as PDF.');
                } catch (err) {
                  toast.error(await fileErrorMessage(err, 'Could not export profile PDF.'));
                }
              }}
              disabled={!record}
              className="gap-2"
            >
              <Download className="h-4 w-4" /> Export PDF
            </Button>
            <Button onClick={() => setEditing(true)} disabled={!record} className="gap-2">
              <Pencil className="h-4 w-4" /> Edit record
            </Button>
            <Button
              variant="ghost"
              onClick={() => requestDelete.mutate()}
              loading={requestDelete.isPending}
              disabled={!record}
              className="gap-2 text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="h-4 w-4" /> Delete record
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
                  <DetailRow label="Delivery stream" value={humanStatus(record.studentCategory || 'regular')} />
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
                    {[record.address.woreda, record.address.city].filter(Boolean).join(', ')}
                  </p>
                ) : null}
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="Enrollment history"
                subtitle="Every academic year recorded for this student. New admissions create the active enrollment automatically."
                icon={CalendarDays}
              />
              <RegistrarTable
                columns={enrollmentColumns}
                rows={enrollments}
                rowKey={(row) => row.id}
                emptyTitle="No enrollments"
                emptyMessage="An admission with an academic year creates the first enrollment automatically."
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

          {student.data?.application && (
            <Card>
              <CardHeader
                title="Attached Admission Documents & Identity Cards"
                subtitle={`Original admission application #${student.data.application.applicationNumber} records.`}
                icon={IdCard}
              />
              <CardBody className="space-y-4">
                {/* 12th Grade Certificate */}
                {student.data.application.certificateDocument?.url ? (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shrink-0">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900 text-xs">
                            {student.data.application.certificateDocument.fileName || '12th Grade Result Certificate'}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {student.data.application.certificateDocument.fileSize
                              ? `${(student.data.application.certificateDocument.fileSize / 1024 / 1024).toFixed(2)} MB • `
                              : ''}
                            Official Entrance Exam / Educational Certificate
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const isPdf =
                              student.data.application.certificateDocument?.fileType?.includes('pdf') ||
                              student.data.application.certificateDocument?.fileName?.toLowerCase().endsWith('.pdf');
                            setViewingDoc({
                              type: isPdf ? 'pdf' : 'image',
                              url: student.data.application.certificateDocument.url,
                              title: `${record.fullName} — 12th Grade Certificate`,
                            });
                          }}
                          className="gap-1 text-xs"
                        >
                          <Eye className="h-3.5 w-3.5" /> View Certificate
                        </Button>
                        <a
                          href={student.data.application.certificateDocument.url}
                          download={student.data.application.certificateDocument.fileName || 'certificate'}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition"
                        >
                          <Download className="h-3.5 w-3.5" /> Download
                        </a>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Identity Cards Grid */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Applicant ID Front */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                    <span className="font-semibold text-slate-700 block mb-1">Applicant National ID (Front)</span>
                    {student.data.application.nationalIdFront?.url ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setViewingDoc({
                            type: 'image',
                            url: student.data.application.nationalIdFront.url,
                            title: `${record.fullName} — National ID Front`,
                          })
                        }
                        className="w-full gap-1 text-[11px] mt-1"
                      >
                        <Eye className="h-3 w-3" /> View Front
                      </Button>
                    ) : (
                      <span className="text-slate-400 italic text-[11px]">Not provided</span>
                    )}
                  </div>

                  {/* Applicant ID Back */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                    <span className="font-semibold text-slate-700 block mb-1">Applicant National ID (Back)</span>
                    {student.data.application.nationalIdBack?.url ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setViewingDoc({
                            type: 'image',
                            url: student.data.application.nationalIdBack.url,
                            title: `${record.fullName} — National ID Back`,
                          })
                        }
                        className="w-full gap-1 text-[11px] mt-1"
                      >
                        <Eye className="h-3 w-3" /> View Back
                      </Button>
                    ) : (
                      <span className="text-slate-400 italic text-[11px]">Not provided</span>
                    )}
                  </div>

                  {/* Emergency Contact ID Front */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                    <span className="font-semibold text-slate-700 block mb-1 truncate">
                      Emergency Contact ID (Front)
                      {student.data.application.emergencyContact?.name ? ` — ${student.data.application.emergencyContact.name}` : ''}
                    </span>
                    {student.data.application.emergencyContact?.nationalIdFront?.url ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setViewingDoc({
                            type: 'image',
                            url: student.data.application.emergencyContact.nationalIdFront.url,
                            title: `Emergency Contact (${student.data.application.emergencyContact?.name}) — ID Front`,
                          })
                        }
                        className="w-full gap-1 text-[11px] mt-1"
                      >
                        <Eye className="h-3 w-3" /> View Contact Front
                      </Button>
                    ) : (
                      <span className="text-slate-400 italic text-[11px]">Not provided</span>
                    )}
                  </div>

                  {/* Emergency Contact ID Back */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                    <span className="font-semibold text-slate-700 block mb-1 truncate">Emergency Contact ID (Back)</span>
                    {student.data.application.emergencyContact?.nationalIdBack?.url ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setViewingDoc({
                            type: 'image',
                            url: student.data.application.emergencyContact.nationalIdBack.url,
                            title: `Emergency Contact (${student.data.application.emergencyContact?.name}) — ID Back`,
                          })
                        }
                        className="w-full gap-1 text-[11px] mt-1"
                      >
                        <Eye className="h-3 w-3" /> View Contact Back
                      </Button>
                    ) : (
                      <span className="text-slate-400 italic text-[11px]">Not provided</span>
                    )}
                  </div>
                </div>

                {/* Emergency Contact Info details */}
                {student.data.application.emergencyContact?.name ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-xs flex flex-wrap items-center gap-4 text-slate-700">
                    <span className="font-bold text-slate-900 flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-brand-600" />
                      Emergency Contact:
                    </span>
                    <span><strong>Name:</strong> {student.data.application.emergencyContact.name}</span>
                    <span><strong>Relationship:</strong> {student.data.application.emergencyContact.relationship || '—'}</span>
                    <span><strong>Phone:</strong> {student.data.application.emergencyContact.phone || '—'}</span>
                  </div>
                ) : null}
              </CardBody>
            </Card>
          )}
        </>
      ) : null}

      {viewingDoc && (
        <Modal
          open={Boolean(viewingDoc)}
          onClose={() => setViewingDoc(null)}
          title={viewingDoc.title}
          size="lg"
        >
          <div className="flex flex-col items-center justify-center p-2">
            {viewingDoc.type === 'pdf' ? (
              <iframe
                src={viewingDoc.url}
                title={viewingDoc.title}
                className="h-[70vh] w-full rounded-xl border border-slate-200"
              />
            ) : (
              <img
                src={viewingDoc.url}
                alt={viewingDoc.title}
                className="max-h-[75vh] w-auto max-w-full rounded-2xl object-contain shadow-md"
              />
            )}
          </div>
        </Modal>
      )}

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
      <Modal
        open={deleteOpen}
        title="Delete this student permanently?"
        subtitle={`${record?.fullName || 'The student'} · ${record?.studentId || ''}`}
        onClose={destroy.isPending ? undefined : () => setDeleteOpen(false)}
        dismissible={!destroy.isPending}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={destroy.isPending}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => destroy.mutate()}
              loading={destroy.isPending}
              disabled={deleteCode.length !== 6}
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-600">
            A 6-digit code was emailed to your Registrar account. Enter it to confirm. The record, photo,
            enrollment history, course registrations, attendance, results, certificates and transcripts will be removed.
          </p>
          <CodeInput value={deleteCode} onChange={setDeleteCode} disabled={destroy.isPending} shake={shake} />
          <p className="text-xs text-slate-500">This cannot be undone or recovered from the Registrar workspace.</p>
        </div>
      </Modal>
    </div>
  );
}
