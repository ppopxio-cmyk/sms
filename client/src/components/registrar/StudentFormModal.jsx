import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '../../lib/api';
import { REGISTRAR, cleanPayload, dateInput, levelLabel, phoneError } from '../../lib/registrar';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Field from '../ui/Field';
import { FormGrid, SelectField, TextAreaField } from './Fields';

const EMPTY = {
  studentId: '',
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
  enrollmentStatus: 'pending',
  studentStatus: 'active',
  admissionDate: '',
  completionDate: '',
  notes: '',
  address: { region: '', city: '', woreda: '', line: '' },
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
    dateOfBirth: dateInput(student.dateOfBirth),
    admissionDate: dateInput(student.admissionDate),
    completionDate: dateInput(student.completionDate),
    address: { ...EMPTY.address, ...(student.address || {}) },
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
  const batches = useMemo(
    () => (options?.batches || []).filter((batch) => !form.program || batch.program === form.program),
    [options?.batches, form.program],
  );
  const selectedProgram = (options?.programs || []).find((program) => program.id === form.program);
  const levels = selectedProgram?.qualificationType === 'diploma'
    ? selectedProgram.levels?.length ? selectedProgram.levels : [1, 2, 3, 4]
    : Array.from({ length: Math.max(1, Math.min(10, selectedProgram?.durationYears || form.level || 1)) }, (_, index) => index + 1);

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const save = useMutation({
    mutationFn: async () => {
      if (!form.firstName.trim() || !form.lastName.trim() || !form.department || !form.program) {
        throw new Error('Student ID, first name, last name, department and programme are required.');
      }
      if (!editing && !form.studentId.trim()) throw new Error('Student ID is required.');
      const phoneIssue = phoneError(form.phone);
      if (phoneIssue) throw new Error(phoneIssue);
      const payload = cleanPayload({
        ...form,
        studentId: editing ? undefined : form.studentId.trim(),
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim(),
        lastName: form.lastName.trim(),
        level: Number(form.level) || 1,
        dateOfBirth: form.dateOfBirth || undefined,
        admissionDate: form.admissionDate || undefined,
        completionDate: form.completionDate || undefined,
        batch: form.batch || null,
        admissionAcademicYear: form.admissionAcademicYear || null,
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
      subtitle={editing ? 'Changes are audited. The student ID cannot be changed.' : 'The student number and programme come from the official register.'}
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
          <Field
            label="Student ID"
            value={form.studentId}
            onChange={(event) => set('studentId', event.target.value)}
            disabled={editing}
            placeholder="e.g. MC/2026/001"
            required
          />
          <SelectField label="Sex" value={form.sex} onChange={(event) => set('sex', event.target.value)}>
            <option value="unspecified">Not specified</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </SelectField>
          <Field label="First name" value={form.firstName} onChange={(event) => set('firstName', event.target.value)} required />
          <Field label="Middle name" value={form.middleName} onChange={(event) => set('middleName', event.target.value)} />
          <Field label="Last name" value={form.lastName} onChange={(event) => set('lastName', event.target.value)} required />
          <Field label="Date of birth" type="date" value={form.dateOfBirth} onChange={(event) => set('dateOfBirth', event.target.value)} />
          <Field label="Email" type="email" value={form.email} onChange={(event) => set('email', event.target.value)} placeholder="Optional" />
          <Field label="Phone" value={form.phone} onChange={(event) => set('phone', event.target.value)} placeholder="+251 912 345 678" required />
        </FormGrid>

        <div className="rounded-2xl bg-slate-50/80 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Academic placement</p>
          <FormGrid>
            <SelectField
              label="Department"
              value={form.department}
              onChange={(event) => {
                set('department', event.target.value);
                set('program', '');
                set('batch', '');
              }}
              required
            >
              <option value="">Choose a department</option>
              {(options?.departments || []).map((department) => (
                <option key={department.id} value={department.id}>{department.code} · {department.name}</option>
              ))}
            </SelectField>
            <SelectField
              label="Programme"
              value={form.program}
              onChange={(event) => {
                set('program', event.target.value);
                set('batch', '');
                set('level', 1);
              }}
              disabled={!form.department}
              required
            >
              <option value="">Choose a programme</option>
              {programs.map((program) => (
                <option key={program.id} value={program.id}>{program.code} · {program.name}</option>
              ))}
            </SelectField>
            <SelectField label="Batch" value={form.batch} onChange={(event) => set('batch', event.target.value)} disabled={!form.program}>
              <option value="">No batch yet</option>
              {batches.map((batch) => (
                <option key={batch.id} value={batch.id}>{batch.code} · {batch.name}</option>
              ))}
            </SelectField>
            <SelectField label="Admission academic year" value={form.admissionAcademicYear} onChange={(event) => set('admissionAcademicYear', event.target.value)}>
              <option value="">Not set</option>
              {(options?.academicYears || []).map((year) => (
                <option key={year.id} value={year.id}>{year.label}{year.isCurrent ? ' · current' : ''}</option>
              ))}
            </SelectField>
            <SelectField label="Level / year" value={form.level} onChange={(event) => set('level', Number(event.target.value))} disabled={!form.program}>
              {levels.map((level) => (
                <option key={level} value={level}>{levelLabel(level, selectedProgram?.qualificationType)}</option>
              ))}
            </SelectField>
            <SelectField label="Category" value={form.studentCategory} onChange={(event) => set('studentCategory', event.target.value)} required>
              <option value="regular">Regular</option>
              <option value="extension">Extension</option>
            </SelectField>
            <SelectField label="Enrollment status" value={form.enrollmentStatus} onChange={(event) => set('enrollmentStatus', event.target.value)}>
              {['pending', 'active', 'completed', 'withdrawn', 'cancelled'].map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </SelectField>
            <SelectField label="Student status" value={form.studentStatus} onChange={(event) => set('studentStatus', event.target.value)}>
              {['active', 'suspended', 'graduated', 'withdrawn', 'archived'].map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </SelectField>
            <Field label="Admission date" type="date" value={form.admissionDate} onChange={(event) => set('admissionDate', event.target.value)} />
            <Field label="Completion date" type="date" value={form.completionDate} onChange={(event) => set('completionDate', event.target.value)} hint="Required before a certificate can be issued." />
          </FormGrid>
        </div>

        <div className="rounded-2xl bg-slate-50/80 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Address</p>
          <FormGrid>
            <Field label="Region" value={form.address.region} onChange={(event) => setForm((current) => ({ ...current, address: { ...current.address, region: event.target.value } }))} />
            <Field label="City" value={form.address.city} onChange={(event) => setForm((current) => ({ ...current, address: { ...current.address, city: event.target.value } }))} />
            <Field label="Woreda" value={form.address.woreda} onChange={(event) => setForm((current) => ({ ...current, address: { ...current.address, woreda: event.target.value } }))} />
            <Field label="Address line" value={form.address.line} onChange={(event) => setForm((current) => ({ ...current, address: { ...current.address, line: event.target.value } }))} />
          </FormGrid>
        </div>

        <TextAreaField label="Notes" value={form.notes} onChange={(event) => set('notes', event.target.value)} rows={3} />
      </div>
    </Modal>
  );
}
