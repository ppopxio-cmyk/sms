import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { REGISTRAR, cleanPayload, dateInput, humanStatus, levelLabel, phoneError } from '../../lib/registrar';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Field from '../ui/Field';
import { FormGrid, SelectField } from './Fields';

const EMPTY = {
  firstName: '',
  middleName: '',
  lastName: '',
  sex: 'unspecified',
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

function fromStudent(student) {
  if (!student) return { ...EMPTY, address: { ...EMPTY.address } };
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
  const [form, setForm] = useState(() => fromStudent(student));
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(fromStudent(student));
      setError('');
    }
  }, [open, student]);

  const programs = useMemo(
    () => (options?.programs || []).filter((program) => !form.department || program.department === form.department),
    [options?.programs, form.department],
  );
  const selectedProgram = (options?.programs || []).find((program) => program.id === form.program);
  const categories = selectedProgram?.categories?.length ? selectedProgram.categories : ['regular', 'extension'];
  const batches = useMemo(
    () => (options?.batches || []).filter((batch) =>
      (!form.program || batch.program === form.program)
      && (batch.category || 'regular') === form.studentCategory
      && (['planned', 'active'].includes(batch.status) || batch.id === form.batch),
    ),
    [options?.batches, form.program, form.studentCategory, form.batch],
  );
  const levels = selectedProgram?.qualificationType === 'diploma'
    ? selectedProgram.levels?.length ? selectedProgram.levels : [1, 2, 3, 4]
    : selectedProgram?.qualificationType === 'short-term'
      ? [1]
      : Array.from({ length: Math.max(1, Math.min(10, selectedProgram?.durationYears || form.level || 1)) }, (_, index) => index + 1);

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const chooseDepartment = (department) => {
    setForm((current) => ({ ...current, department, program: '', batch: '', level: 1 }));
  };

  const chooseProgram = (programId) => {
    const next = (options?.programs || []).find((program) => program.id === programId);
    const nextCategories = next?.categories?.length ? next.categories : ['regular', 'extension'];
    setForm((current) => ({
      ...current,
      program: programId,
      studentCategory: nextCategories.includes(current.studentCategory) ? current.studentCategory : nextCategories[0],
      batch: '',
      level: 1,
    }));
  };

  const chooseCategory = (category) => {
    setForm((current) => ({ ...current, studentCategory: category, batch: '' }));
  };

  const chooseBatch = (batchId) => {
    const batch = (options?.batches || []).find((row) => row.id === batchId);
    setForm((current) => ({
      ...current,
      batch: batchId,
      admissionAcademicYear: batch?.admissionAcademicYear || current.admissionAcademicYear,
    }));
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.firstName.trim() || !form.lastName.trim() || !form.department || !form.program) {
        throw new Error('First name, last name, department and programme are required.');
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
      return editing
        ? (await api.patch(`${REGISTRAR}/students/${student.id}`, payload)).data
        : (await api.post(`${REGISTRAR}/students`, payload)).data;
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

        <FormGrid>
          <Field label="First name" value={form.firstName} onChange={(event) => set('firstName', event.target.value)} required />
          <Field label="Middle name" value={form.middleName} onChange={(event) => set('middleName', event.target.value)} />
          <Field label="Last name" value={form.lastName} onChange={(event) => set('lastName', event.target.value)} required />
          <SelectField label="Sex" value={form.sex} onChange={(event) => set('sex', event.target.value)}>
            <option value="unspecified">Not specified</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </SelectField>
          <Field label="Date of birth" type="date" value={form.dateOfBirth} onChange={(event) => set('dateOfBirth', event.target.value)} />
          <Field label="Phone" value={form.phone} onChange={(event) => set('phone', event.target.value)} placeholder="+251 912 345 678" required />
          <Field className="sm:col-span-2" label="Email" type="email" value={form.email} onChange={(event) => set('email', event.target.value)} placeholder="Optional" />
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
              hint="Leave automatic to use the newest planned or active intake for this stream."
            >
              <option value="">Automatic intake</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>{batch.code} · {batch.name}</option>
              ))}
            </SelectField>
            <SelectField label="Level / year" value={form.level} onChange={(event) => set('level', Number(event.target.value))} disabled={!form.program}>
              {levels.map((level) => (
                <option key={level} value={level}>{levelLabel(level, selectedProgram?.qualificationType)}</option>
              ))}
            </SelectField>
            <SelectField label="Admission academic year" value={form.admissionAcademicYear} onChange={(event) => set('admissionAcademicYear', event.target.value)}>
              <option value="">Use the batch year</option>
              {(options?.academicYears || []).map((year) => (
                <option key={year.id} value={year.id}>{year.label}{year.isCurrent ? ' · current' : ''}</option>
              ))}
            </SelectField>
            <Field label="Admission date" type="date" value={form.admissionDate} onChange={(event) => set('admissionDate', event.target.value)} hint="Defaults to today." />
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
