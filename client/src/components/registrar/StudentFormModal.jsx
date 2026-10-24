import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { REGISTRAR, cleanPayload, dateInput, humanStatus, levelLabel, normalizePhoneInput, phoneError, toJpegFile } from '../../lib/registrar';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Field from '../ui/Field';
import { FormGrid, SelectField } from './Fields';

const MAX_PHOTO = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const EMPTY = {
  firstName: '',
  middleName: '',
  lastName: '',
  sex: '',
  dateOfBirth: '',
  email: '',
  phone: '',
  department: '',
  program: '',
  batch: '',
  admissionAcademicYear: '',
  level: 1,
  studentCategory: 'regular',
  admissionDate: '',
  completionDate: '',
  address: { city: '', woreda: '' },
};

const todayInput = () => {
  // Addis Ababa is UTC+3, so we adjust the local time to get the correct date
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  const addisTime = new Date(utc + 3 * 3600_000);
  return addisTime.toISOString().slice(0, 10);
};

const phoneBody = (value) => {
  const normalized = normalizePhoneInput(value);
  return normalized.startsWith('+251') ? normalized.slice(4).trimStart() : normalized;
};

function fromStudent(student, options) {
  if (!student) {
    const currentYear = (options?.academicYears || []).find((year) => year.isCurrent);
    return {
      ...EMPTY,
      admissionAcademicYear: currentYear?.id || '',
      admissionDate: todayInput(),
      address: { ...EMPTY.address },
    };
  }
  return {
    ...EMPTY,
    ...student,
    department: student.department?.id || student.department || '',
    program: student.program?.id || student.program || '',
    batch: student.batch?.id || student.batch || '',
    admissionAcademicYear: student.admissionAcademicYear?.id || student.admissionAcademicYear || '',
    studentCategory: student.studentCategory || 'regular',
    dateOfBirth: dateInput(student.dateOfBirth),
    admissionDate: dateInput(student.admissionDate),
    completionDate: dateInput(student.completionDate),
    address: { city: student.address?.city || '', woreda: student.address?.woreda || '' },
  };
}

export default function StudentFormModal({ open, student, options, onClose, onSaved }) {
  const editing = Boolean(student);
  const queryClient = useQueryClient();
  const photoInput = useRef(null);
  const [form, setForm] = useState(() => fromStudent(student));
  const [error, setError] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [photoError, setPhotoError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(fromStudent(student, options));
      setError('');
      setPhotoFile(null);
      setPhotoPreview('');
      setPhotoError('');
    }
  }, [open, student, options]);

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const programs = useMemo(
    () => (options?.programs || []).filter((program) => !form.department || program.department === form.department),
    [options?.programs, form.department],
  );
  const selectedProgram = (options?.programs || []).find((program) => program.id === form.program);
  const categories = selectedProgram?.categories?.length ? selectedProgram.categories : ['regular', 'extension'];
  const batches = useMemo(
    () => (options?.batches || []).filter((batch) => {
      const progId = batch.program?.id || batch.program;
      const matchesProg = !form.program || String(progId) === String(form.program);
      const batchCat = batch.category || 'regular';
      const matchesCat = !form.studentCategory || batchCat === form.studentCategory;
      return matchesProg && matchesCat;
    }),
    [options?.batches, form.program, form.studentCategory],
  );

  const academicYears = useMemo(
    () => (options?.academicYears || []).filter((year) => year.status !== 'closed'),
    [options?.academicYears],
  );

  const levelOptions = useMemo(() => {
    if (!selectedProgram) {
      return [{ value: 1, label: 'Level 1' }];
    }
    if (selectedProgram.qualificationType === 'degree') {
      const years = Number(selectedProgram.durationYears) || 4;
      return Array.from({ length: years }, (_, i) => ({
        value: i + 1,
        label: `Year ${i + 1}`,
      }));
    }
    if (selectedProgram.qualificationType === 'diploma') {
      const lvls = selectedProgram.levels?.length ? selectedProgram.levels : [1, 2, 3, 4];
      return lvls.map((lvl) => ({
        value: lvl,
        label: `Level ${lvl}`,
      }));
    }
    if (selectedProgram.qualificationType === 'short-term') {
      const dur = selectedProgram.shortTerm?.duration || 1;
      const unit = selectedProgram.shortTerm?.unit || 'weeks';
      return [{ value: 1, label: `${dur} ${unit}` }];
    }
    return [{ value: 1, label: 'Level 1' }];
  }, [selectedProgram]);

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const chooseDepartment = (department) => {
    setForm((current) => ({ ...current, department, program: '', batch: '', admissionAcademicYear: '', level: 1 }));
  };

  const chooseProgram = (programId) => {
    const next = (options?.programs || []).find((program) => program.id === programId);
    const nextCategories = next?.categories?.length ? next.categories : ['regular', 'extension'];
    setForm((current) => ({
      ...current,
      program: programId,
      studentCategory: nextCategories.includes(current.studentCategory) ? current.studentCategory : nextCategories[0],
      batch: '',
      admissionAcademicYear: '',
      level: 1,
    }));
  };

  const chooseCategory = (category) => {
    setForm((current) => ({ ...current, studentCategory: category, batch: '', admissionAcademicYear: '' }));
  };

  const chooseBatch = (batchId) => {
    const batch = (options?.batches || []).find((row) => row.id === batchId);
    setForm((current) => ({
      ...current,
      batch: batchId,
      admissionAcademicYear: batch?.admissionAcademicYear || (batchId ? current.admissionAcademicYear : ''),
    }));
  };

  const choosePhoto = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) {
      setPhotoError('Choose a JPEG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_PHOTO) {
      setPhotoError('The photo must be smaller than 5 MB.');
      return;
    }
    setPhotoError('');
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const clearPhoto = () => {
    setPhotoFile(null);
    setPhotoPreview('');
    setPhotoError('');
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.firstName.trim() || !form.lastName.trim() || !form.department || !form.program) {
        throw new Error('First name, last name, department and programme are required.');
      }
      if (!form.sex) throw new Error('Choose female or male.');
      const emailVal = form.email.trim().toLowerCase();
      if (!emailVal || !/^[^\s@]+@gmail\.com$/i.test(emailVal)) {
        throw new Error('Only Gmail addresses are accepted for student records.');
      }
      if (form.batch) {
        const batch = (options?.batches || []).find((row) => row.id === form.batch);
        if (batch && String(batch.program) !== String(form.program)) {
          throw new Error('The selected batch belongs to a different programme.');
        }
        if (batch && (batch.category || 'regular') !== form.studentCategory) {
          throw new Error('The selected batch belongs to a different delivery stream.');
        }
      }
      const phoneIssue = phoneError(form.phone);
      if (phoneIssue) throw new Error(phoneIssue);
      const payload = cleanPayload({
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim(),
        lastName: form.lastName.trim(),
        sex: form.sex,
        dateOfBirth: form.dateOfBirth || undefined,
        email: form.email.trim(),
        phone: form.phone.trim(),
        department: form.department,
        program: form.program,
        studentCategory: form.studentCategory,
        batch: form.batch || null,
        admissionAcademicYear: form.admissionAcademicYear || undefined,
        level: Number(form.level) || 1,
        admissionDate: form.admissionDate || undefined,
        completionDate: editing ? form.completionDate || undefined : undefined,
        address: form.address,
      });
      const preparedPhoto = photoFile
        ? toJpegFile(photoFile)
            .then((jpeg) => jpeg.arrayBuffer())
            .then((buffer) => ({ buffer }))
            .catch((photoError) => ({ photoError }))
        : null;
      const saved = editing
        ? (await api.patch(`${REGISTRAR}/students/${student.id}`, payload)).data
        : (await api.post(`${REGISTRAR}/students`, payload)).data;
      if (preparedPhoto) {
        const prepared = await preparedPhoto;
        if (prepared.photoError) {
          toast.error(errorMessage(prepared.photoError, 'The record was saved, but the photo could not be prepared.'));
        } else {
          try {
            await api.post(`${REGISTRAR}/students/${saved.student.id}/photo`, prepared.buffer, {
              headers: { 'Content-Type': 'image/jpeg' },
            });
          } catch (err) {
            toast.error(errorMessage(err, 'The record was saved, but the photo could not be uploaded.'));
          }
        }
      }
      return saved;
    },
    onSuccess: () => {
      toast.success(editing ? 'Student record updated.' : 'Student admitted to the register.');
      queryClient.invalidateQueries({ queryKey: ['registrar', 'students'] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'student', student?.id] });
      queryClient.invalidateQueries({ queryKey: ['registrar', 'dashboard'] });
      onSaved?.();
      onClose?.();
    },
    onError: (err) => {
      const message = errorMessage(err, 'The student record could not be saved.');
      setError(message);
      toast.error(message);
    },
  });

  return (
    <Modal
      open={open}
      title={editing ? 'Edit student record' : 'Admit a student'}
      subtitle={editing
        ? `Official student number ${student?.studentId || '—'} is permanent and cannot be edited.`
        : 'The student number is generated from the programme, batch and delivery stream.'}
      onClose={save.isPending ? undefined : onClose}
      dismissible={!save.isPending}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>{editing ? 'Save changes' : 'Admit student'}</Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error ? <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</p> : null}

        <div className="flex flex-col gap-4 rounded-2xl bg-slate-50/80 p-4 sm:flex-row sm:items-center">
          <div className="flex h-28 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-slate-100">
            {photoPreview || student?.photo?.thumbnailUrl || student?.photo?.url ? (
              <img
                src={photoPreview || student?.photo?.thumbnailUrl || student?.photo?.url}
                alt="Student portrait preview"
                className="h-full w-full object-cover"
              />
            ) : (
              <Camera className="h-8 w-8 text-slate-300" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-800">Student photo</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Stored in ImageKit as {student?.studentId ? `${student.studentId}.jpg` : 'the generated student number .jpg'}.
              JPEG, PNG or WebP up to 5 MB; the image is converted to JPEG before upload.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => photoInput.current?.click()} className="gap-1.5">
                <Camera className="h-3.5 w-3.5" /> {photoPreview || student?.photo ? 'Change photo' : 'Choose photo'}
              </Button>
              {photoPreview ? (
                <Button size="sm" variant="ghost" onClick={clearPhoto} className="gap-1.5">
                  <Trash2 className="h-3.5 w-3.5" /> Clear selection
                </Button>
              ) : null}
            </div>
            {photoError ? <p className="mt-2 text-xs font-medium text-rose-600">{photoError}</p> : null}
            <input
              ref={photoInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={choosePhoto}
            />
          </div>
        </div>

        <FormGrid>
          <Field label="First name" value={form.firstName} onChange={(event) => set('firstName', event.target.value)} required />
          <Field label="Middle name" value={form.middleName} onChange={(event) => set('middleName', event.target.value)} />
          <Field label="Last name" value={form.lastName} onChange={(event) => set('lastName', event.target.value)} required />
          <SelectField label="Sex" value={form.sex} onChange={(event) => set('sex', event.target.value)} required>
            <option value="">Select sex</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </SelectField>
          <Field label="Date of birth" type="date" value={form.dateOfBirth} onChange={(event) => set('dateOfBirth', event.target.value)} />
          <Field
            label="Phone"
            prefix="+251"
            value={phoneBody(form.phone)}
            onChange={(event) => {
              const digits = event.target.value.replace(/[^\d\s]/g, '').replace(/^0+/, '');
              set('phone', `+251${digits}`);
            }}
            placeholder="912 345 678"
            inputMode="tel"
            required
          />
          <Field className="sm:col-span-2" label="Email" type="email" value={form.email} onChange={(event) => set('email', event.target.value)} placeholder="student@example.com" required />
        </FormGrid>

        <div className="rounded-2xl bg-slate-50/80 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Academic placement</p>
          <FormGrid>
            <SelectField label="Department" value={form.department} onChange={(event) => chooseDepartment(event.target.value)} required>
              <option value="">Choose a department</option>
              {(options?.departments || []).map((department) => (
                <option key={department.id} value={department.id}>{department.code} · {department.name}</option>
              ))}
            </SelectField>
            <SelectField label="Programme" value={form.program} onChange={(event) => chooseProgram(event.target.value)} disabled={!form.department} required>
              <option value="">Choose a programme</option>
              {programs.map((program) => (
                <option key={program.id} value={program.id}>{program.code} · {program.name}</option>
              ))}
            </SelectField>
            <SelectField label="Delivery stream" value={form.studentCategory} onChange={(event) => chooseCategory(event.target.value)} disabled={!form.program} required>
              {categories.map((category) => <option key={category} value={category}>{humanStatus(category)}</option>)}
            </SelectField>
            <SelectField
              label="Batch"
              value={form.batch}
              onChange={(event) => chooseBatch(event.target.value)}
              disabled={!form.program}
              hint="Choose a batch for this programme and stream."
            >
              <option value="">Choose a batch</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>{batch.code} · {batch.name}</option>
              ))}
            </SelectField>
            <SelectField label="Level / year" value={form.level} onChange={(event) => set('level', Number(event.target.value))} disabled={!form.program}>
              {levelOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </SelectField>
            <SelectField label="Admission academic year" value={form.admissionAcademicYear} onChange={(event) => set('admissionAcademicYear', event.target.value)}>
              <option value="">Use the batch year</option>
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>{year.label}{year.isCurrent ? ' · current' : year.status ? ` · ${year.status}` : ''}</option>
              ))}
            </SelectField>
            <Field label="Admission date" type="date" value={form.admissionDate} onChange={(event) => set('admissionDate', event.target.value)} hint="Defaults to today (Ethiopian calendar)." />
            {editing ? (
              <Field label="Completion date" type="date" value={form.completionDate} onChange={(event) => set('completionDate', event.target.value)} hint="Required before a certificate can be issued." />
            ) : null}
          </FormGrid>
          {selectedProgram ? (
            <p className="mt-3 text-xs text-slate-500">
              {selectedProgram.qualificationType === 'degree'
                ? `${selectedProgram.durationYears || '—'} study year${selectedProgram.durationYears === 1 ? '' : 's'}`
                : selectedProgram.qualificationType === 'diploma'
                  ? `Levels ${(selectedProgram.levels || [1, 2, 3, 4]).join(', ')}`
                  : `${selectedProgram.shortTerm?.duration || '—'} ${selectedProgram.shortTerm?.unit || ''}`}
              {selectedProgram.capacity ? ` · capacity ${selectedProgram.capacity}` : ' · no capacity cap'}
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl bg-slate-50/80 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Address</p>
          <FormGrid>
            <Field label="City" value={form.address.city} onChange={(event) => setForm((current) => ({ ...current, address: { ...current.address, city: event.target.value } }))} />
            <Field label="Woreda" value={form.address.woreda} onChange={(event) => setForm((current) => ({ ...current, address: { ...current.address, woreda: event.target.value } }))} />
          </FormGrid>
        </div>
      </div>
    </Modal>
  );
}
