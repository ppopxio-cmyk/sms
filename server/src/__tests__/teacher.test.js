import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { createApp } from '../app.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Department, Program, Course, AcademicYear, Batch } from '../models/AcademicStructure.js';
import { CurriculumPlan, CurriculumCourse } from '../models/Curriculum.js';
import { CourseOffering, CourseRegistration } from '../models/Offering.js';
import { Student } from '../models/Student.js';
import { Assessment } from '../models/Assessment.js';
import { Result } from '../models/Records.js';
import { Material } from '../models/Material.js';
import { AttendanceSheet } from '../models/AttendanceSheet.js';
import { AttendanceRecord } from '../models/Records.js';
import { signAccess } from '../services/token.service.js';
import { dayKey } from '../services/teacherScope.service.js';

let mongo;
let app;

const future = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const past = (days = 1) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

async function makeUser(role, email) {
  return User.create({
    name: `${role} Test`,
    email,
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$test$test',
    role,
    status: 'active',
    emailVerified: true,
  });
}

async function makeSession(user) {
  return Session.create({
    userId: user._id,
    deviceId: `test-${user._id}`,
    refreshHash: crypto.randomBytes(24).toString('hex'),
    expiresAt: future(),
    absoluteExpiresAt: future(),
  });
}

async function makeToken(user) {
  const session = await makeSession(user);
  return signAccess(user, session._id);
}

async function structure() {
  const department = await Department.create({ code: `D${crypto.randomBytes(3).toString('hex')}`, name: 'Computing' });
  const program = await Program.create({
    code: `P${crypto.randomBytes(3).toString('hex')}`,
    name: 'Computer Science',
    department: department._id,
    qualificationType: 'degree',
    durationYears: 4,
  });
  const academicYear = await AcademicYear.create({
    label: '2026/27',
    startDate: new Date('2026-09-01'),
    endDate: new Date('2027-06-30'),
    status: 'active',
    isCurrent: true,
  });
  const batch = await Batch.create({
    code: `B${crypto.randomBytes(2).toString('hex')}`,
    name: 'Batch 2026',
    program: program._id,
    department: department._id,
    admissionAcademicYear: academicYear._id,
    currentLevel: 1,
  });
  return { department, program, academicYear, batch };
}

async function makeOffering({ teacher, base, code, title, status = 'open' }) {
  const course = await Course.create({
    code,
    title,
    department: base.department._id,
    creditHours: 3,
  });
  const plan = await CurriculumPlan.create({
    program: base.program._id,
    department: base.department._id,
    qualificationType: 'degree',
    academicYear: base.academicYear._id,
    version: 1,
    status: 'draft',
  });
  const curriculumCourse = await CurriculumCourse.create({
    plan: plan._id,
    course: course._id,
    academicYear: base.academicYear._id,
    term: 'Semester I',
    level: 1,
    creditHours: 3,
  });
  const offering = await CourseOffering.create({
    course: course._id,
    curriculumPlan: plan._id,
    curriculumCourse: curriculumCourse._id,
    program: base.program._id,
    department: base.department._id,
    academicYear: base.academicYear._id,
    term: 'Semester I',
    level: 1,
    creditHours: 3,
    teacher: teacher._id,
    status,
    assessmentMode: 'numeric',
  });
  return { course, plan, curriculumCourse, offering };
}

async function makeStudent(base, number, firstName, lastName) {
  return Student.create({
    studentId: number,
    firstName,
    lastName,
    sex: 'female',
    program: base.program._id,
    department: base.department._id,
    batch: base.batch._id,
    level: 1,
    enrollmentStatus: 'active',
    studentStatus: 'active',
  });
}

async function register({ offering, student, course, base, status = 'registered' }) {
  return CourseRegistration.create({
    student: student._id,
    offering: offering._id,
    course: course._id,
    academicYear: base.academicYear._id,
    term: 'Semester I',
    creditHours: 3,
    status,
  });
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Origin: 'http://localhost:5173',
    'X-Requested-With': 'sms-web',
  };
}

const GET = (url, token) => request(app).get(url).set(headers(token));
const POST = (url, token) => request(app).post(url).set(headers(token));
const PUT = (url, token) => request(app).put(url).set(headers(token));
const PATCH = (url, token) => request(app).patch(url).set(headers(token));
const DELETE = (url, token) => request(app).delete(url).set(headers(token));

async function fixture() {
  const base = await structure();
  const teacher = await makeUser('TEACHER', `teacher-${crypto.randomBytes(4).toString('hex')}@example.com`);
  const otherTeacher = await makeUser('TEACHER', `teacher-${crypto.randomBytes(4).toString('hex')}@example.com`);
  const admin = await makeUser('ADMIN', `admin-${crypto.randomBytes(4).toString('hex')}@example.com`);
  const teacherToken = await makeToken(teacher);
  const otherToken = await makeToken(otherTeacher);
  const adminToken = await makeToken(admin);

  const first = await makeOffering({ teacher, base, code: 'CS101', title: 'Introduction to Computing' });
  const other = await makeOffering({ teacher: otherTeacher, base, code: 'CS201', title: 'Data Structures' });

  const studentA = await makeStudent(base, 'ST-001', 'Hana', 'Tesfaye');
  const studentB = await makeStudent(base, 'ST-002', 'Dawit', 'Bekele');
  const outside = await makeStudent(base, 'ST-003', 'Mimi', 'Kebede');

  await register({ offering: first.offering, student: studentA, course: first.course, base });
  await register({ offering: first.offering, student: studentB, course: first.course, base });
  await register({ offering: other.offering, student: outside, course: other.course, base });

  return {
    base,
    teacher,
    otherTeacher,
    admin,
    teacherToken,
    otherToken,
    adminToken,
    first,
    other,
    studentA,
    studentB,
    outside,
  };
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  app = createApp();
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

describe('teacher workspace authorization', () => {
  it('keeps the teacher dashboard private to the assigned teacher role', async () => {
    const f = await fixture();

    const ok = await GET('/api/teacher/dashboard', f.teacherToken);
    expect(ok.status).toBe(200);
    expect(ok.body.summary.classes).toBe(1);
    expect(ok.body.courses[0].courseCode).toBe('CS101');
    expect(ok.body.courses[0].studentCount).toBe(2);

    const denied = await GET('/api/teacher/dashboard', f.adminToken);
    expect(denied.status).toBe(403);

    const other = await GET(`/api/teacher/courses/${f.first.offering._id}`, f.otherToken);
    expect(other.status).toBe(404);
  });

  it('does not expose a student from another teacher class', async () => {
    const f = await fixture();
    const denied = await GET(`/api/teacher/students/${f.outside._id}`, f.teacherToken);
    expect(denied.status).toBe(404);

    const allowed = await GET(`/api/teacher/students/${f.studentA._id}`, f.teacherToken);
    expect(allowed.status).toBe(200);
    expect(allowed.body.student.studentNumber).toBe('ST-001');
    expect(allowed.body.classes).toHaveLength(1);
  });

  it('filters classes by active and completed status', async () => {
    const f = await fixture();
    await CourseOffering.updateOne({ _id: f.first.offering._id }, { $set: { status: 'completed' } });

    const active = await GET('/api/teacher/courses?status=active&limit=100', f.teacherToken);
    expect(active.status).toBe(200);
    expect(active.body.assignments).toHaveLength(0);

    const completed = await GET('/api/teacher/courses?status=completed&limit=100', f.teacherToken);
    expect(completed.status).toBe(200);
    expect(completed.body.assignments).toHaveLength(1);
    expect(completed.body.assignments[0].id).toBe(String(f.first.offering._id));
  });
});

describe('attendance workflow', () => {
  it('saves a draft, finalizes it, and refuses further changes', async () => {
    const f = await fixture();
    const date = dayKey(past(1));

    const roster = await GET(`/api/teacher/courses/${f.first.offering._id}/attendance?date=${date}&period=day`, f.teacherToken);
    expect(roster.status).toBe(200);
    expect(roster.body.students).toHaveLength(2);

    const saved = await PUT(`/api/teacher/courses/${f.first.offering._id}/attendance`, f.teacherToken).send({
      date,
      period: 'day',
      records: [
        { studentId: String(f.studentA._id), status: 'present', note: '' },
        { studentId: String(f.studentB._id), status: 'absent', note: '' },
      ],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.marked).toBe(2);
    expect(saved.body.status).toBe('draft');

    const records = await AttendanceRecord.find({ offering: f.first.offering._id }).lean();
    expect(records).toHaveLength(2);
    const sheet = await AttendanceSheet.findOne({ offering: f.first.offering._id }).lean();
    expect(sheet.status).toBe('draft');

    const finalized = await POST(
      `/api/teacher/courses/${f.first.offering._id}/attendance/${sheet._id}/finalize`,
      f.teacherToken,
    ).send({ revision: sheet.revision });
    expect(finalized.status).toBe(200);
    expect(finalized.body.status).toBe('finalized');

    const locked = await PUT(`/api/teacher/courses/${f.first.offering._id}/attendance`, f.teacherToken).send({
      date,
      period: 'day',
      revision: finalized.body.revision,
      records: [{ studentId: String(f.studentA._id), status: 'late', note: '' }],
    });
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe('ATTENDANCE_FINALIZED');
  });

  it('refuses to finalize until every registered student has a status', async () => {
    const f = await fixture();
    const date = dayKey(past(2));

    const saved = await PUT(`/api/teacher/courses/${f.first.offering._id}/attendance`, f.teacherToken).send({
      date,
      period: 'day',
      records: [{ studentId: String(f.studentA._id), status: 'present', note: '' }],
    });
    expect(saved.status).toBe(200);

    const finalized = await POST(
      `/api/teacher/courses/${f.first.offering._id}/attendance/${saved.body.id}/finalize`,
      f.teacherToken,
    ).send({ revision: saved.body.revision });
    expect(finalized.status).toBe(400);
    expect(finalized.body.code).toBe('ATTENDANCE_INCOMPLETE');
  });

  it('rejects a student who is not registered in the class', async () => {
    const f = await fixture();
    const response = await PUT(`/api/teacher/courses/${f.first.offering._id}/attendance`, f.teacherToken).send({
      date: dayKey(past(1)),
      period: 'day',
      records: [{ studentId: String(f.outside._id), status: 'present', note: '' }],
    });
    expect(response.status).toBe(404);
  });
});

describe('assessment and grade workflow', () => {
  it('blocks competency courses with a configuration-required state', async () => {
    const f = await fixture();
    await CourseOffering.updateOne({ _id: f.first.offering._id }, { $set: { assessmentMode: 'competency' } });

    const created = await POST(`/api/teacher/courses/${f.first.offering._id}/assessments`, f.teacherToken).send({
      title: 'Competency check',
      type: 'practical',
      maxScore: 10,
      weight: 0,
      instructions: '',
    });
    expect(created.status).toBe(409);
    expect(created.body.code).toBe('COMPETENCY_CONFIG_REQUIRED');

    const report = await GET(`/api/teacher/reports/competency?assignmentId=${f.first.offering._id}`, f.teacherToken);
    expect(report.status).toBe(200);
    expect(report.body.configured).toBe(false);
    expect(report.body.mode).toBe('competency');
  });

  it('saves raw marks into the shared result components, then locks the assessment', async () => {
    const f = await fixture();
    const created = await POST(`/api/teacher/courses/${f.first.offering._id}/assessments`, f.teacherToken).send({
      title: 'Quiz 1',
      type: 'quiz',
      maxScore: 20,
      weight: 10,
      dueDate: null,
      instructions: '',
    });
    expect(created.status).toBe(201);
    const assessmentId = created.body.id;

    const published = await POST(`/api/teacher/assessments/${assessmentId}/publish`, f.teacherToken).send({});
    expect(published.status).toBe(200);
    expect(published.body.status).toBe('published');

    const tooHigh = await PUT(`/api/teacher/assessments/${assessmentId}/grades`, f.teacherToken).send({
      results: [{ studentId: String(f.studentA._id), score: 25, feedback: '' }],
    });
    expect(tooHigh.status).toBe(400);
    expect(tooHigh.body.code).toBe('SCORE_TOO_HIGH');

    const partial = await PUT(`/api/teacher/assessments/${assessmentId}/grades`, f.teacherToken).send({
      results: [{ studentId: String(f.studentA._id), score: 18, feedback: '' }],
    });
    expect(partial.status).toBe(200);
    expect(partial.body.entered).toBe(1);
    expect(partial.body.missing).toBe(1);

    const incomplete = await POST(`/api/teacher/assessments/${assessmentId}/submit`, f.teacherToken).send({});
    expect(incomplete.status).toBe(400);
    expect(incomplete.body.code).toBe('GRADES_INCOMPLETE');

    const complete = await PUT(`/api/teacher/assessments/${assessmentId}/grades`, f.teacherToken).send({
      results: [
        { studentId: String(f.studentA._id), score: 18, feedback: '' },
        { studentId: String(f.studentB._id), score: 15.5, feedback: '' },
      ],
    });
    expect(complete.status).toBe(200);
    expect(complete.body.entered).toBe(2);

    const submitted = await POST(`/api/teacher/assessments/${assessmentId}/submit`, f.teacherToken).send({});
    expect(submitted.status).toBe(200);
    expect(submitted.body.status).toBe('submitted');

    const stored = await Result.findOne({ offering: f.first.offering._id, student: f.studentA._id }).lean();
    expect(stored.components).toEqual([{ name: 'Quiz 1', max: 20, score: 18 }]);

    const locked = await PUT(`/api/teacher/assessments/${assessmentId}/grades`, f.teacherToken).send({
      results: [{ studentId: String(f.studentA._id), score: 19, feedback: '' }],
    });
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe('ASSESSMENT_SUBMITTED');
  });

  it('keeps a submitted assessment locked while another assessment is still draft', async () => {
    const f = await fixture();
    const first = await POST(`/api/teacher/courses/${f.first.offering._id}/assessments`, f.teacherToken).send({
      title: 'Quiz 1',
      type: 'quiz',
      maxScore: 20,
      weight: 10,
      instructions: '',
    });
    expect(first.status).toBe(201);

    const second = await POST(`/api/teacher/courses/${f.first.offering._id}/assessments`, f.teacherToken).send({
      title: 'Quiz 2',
      type: 'quiz',
      maxScore: 20,
      weight: 0,
      instructions: '',
    });
    expect(second.status).toBe(201);

    await POST(`/api/teacher/assessments/${first.body.id}/publish`, f.teacherToken).send({});
    const saved = await PUT(`/api/teacher/assessments/${first.body.id}/grades`, f.teacherToken).send({
      results: [
        { studentId: String(f.studentA._id), score: 18, feedback: '' },
        { studentId: String(f.studentB._id), score: 15, feedback: '' },
      ],
    });
    expect(saved.status).toBe(200);

    const submitted = await POST(`/api/teacher/assessments/${first.body.id}/submit`, f.teacherToken).send({});
    expect(submitted.status).toBe(200);

    const result = await Result.findOne({ offering: f.first.offering._id, student: f.studentA._id }).lean();
    expect(result.status).toBe('draft');

    const locked = await PUT(`/api/teacher/assessments/${first.body.id}/grades`, f.teacherToken).send({
      results: [{ studentId: String(f.studentA._id), score: 19, feedback: '' }],
    });
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe('ASSESSMENT_SUBMITTED');
  });

  it('keeps gradebook totals for the whole class while searching', async () => {
    const f = await fixture();
    const created = await POST(`/api/teacher/courses/${f.first.offering._id}/assessments`, f.teacherToken).send({
      title: 'Quiz 3',
      type: 'quiz',
      maxScore: 20,
      weight: 0,
      instructions: '',
    });
    expect(created.status).toBe(201);
    await POST(`/api/teacher/assessments/${created.body.id}/publish`, f.teacherToken).send({});
    await PUT(`/api/teacher/assessments/${created.body.id}/grades`, f.teacherToken).send({
      results: [{ studentId: String(f.studentA._id), score: 18, feedback: '' }],
    });

    const filtered = await GET(`/api/teacher/assessments/${created.body.id}/grades?search=Hana&limit=25`, f.teacherToken);
    expect(filtered.status).toBe(200);
    expect(filtered.body.rows).toHaveLength(1);
    expect(filtered.body.summary.total).toBe(2);
    expect(filtered.body.summary.entered).toBe(1);
    expect(filtered.body.summary.missing).toBe(1);
    expect(filtered.body.assessment.missing).toBe(1);
  });

  it('rejects attempts to mark a student outside the class', async () => {
    const f = await fixture();
    const created = await POST(`/api/teacher/courses/${f.first.offering._id}/assessments`, f.teacherToken).send({
      title: 'Assignment 1',
      type: 'assignment',
      maxScore: 10,
      weight: 0,
      instructions: '',
    });
    expect(created.status).toBe(201);

    const response = await PUT(`/api/teacher/assessments/${created.body.id}/grades`, f.teacherToken).send({
      results: [{ studentId: String(f.outside._id), score: 5, feedback: '' }],
    });
    expect(response.status).toBe(404);
  });
});

describe('materials and reports', () => {
  it('validates links and lists only the teacher materials', async () => {
    const f = await fixture();
    const invalid = await POST('/api/teacher/materials', f.teacherToken).send({
      assignmentId: String(f.first.offering._id),
      title: 'Reading',
      kind: 'link',
      url: 'javascript:alert(1)',
      description: '',
      content: '',
      visibility: 'draft',
    });
    expect(invalid.status).toBe(400);

    const created = await POST('/api/teacher/materials', f.teacherToken).send({
      assignmentId: String(f.first.offering._id),
      title: 'Reading',
      kind: 'link',
      url: 'https://example.com/reading',
      description: 'Chapter one',
      content: '',
      visibility: 'published',
    });
    expect(created.status).toBe(201);
    expect(created.body.visibility).toBe('published');

    const list = await GET('/api/teacher/materials', f.teacherToken);
    expect(list.status).toBe(200);
    expect(list.body.materials).toHaveLength(1);
    expect(list.body.materials[0].url).toBe('https://example.com/reading');

    const other = await GET('/api/teacher/materials', f.otherToken);
    expect(other.status).toBe(200);
    expect(other.body.materials).toHaveLength(0);

    const deleted = await DELETE(`/api/teacher/materials/${created.body.id}`, f.teacherToken);
    expect(deleted.status).toBe(200);
    expect(await Material.countDocuments({ _id: created.body.id, deletedAt: null })).toBe(0);
  });

  it('builds a raw grade sheet and a downloadable export', async () => {
    const f = await fixture();
    const created = await POST(`/api/teacher/courses/${f.first.offering._id}/assessments`, f.teacherToken).send({
      title: 'Midterm',
      type: 'midterm',
      maxScore: 30,
      weight: 30,
      instructions: '',
    });
    await POST(`/api/teacher/assessments/${created.body.id}/publish`, f.teacherToken).send({});
    await PUT(`/api/teacher/assessments/${created.body.id}/grades`, f.teacherToken).send({
      results: [
        { studentId: String(f.studentA._id), score: 27, feedback: '' },
        { studentId: String(f.studentB._id), score: 21, feedback: '' },
      ],
    });

    const sheet = await GET(`/api/teacher/reports/grade-sheet?assignmentId=${f.first.offering._id}`, f.teacherToken);
    expect(sheet.status).toBe(200);
    expect(sheet.body.configured).toBe(true);
    expect(sheet.body.rows).toHaveLength(2);
    expect(sheet.body.rows[0].total).toBe(27);
    expect(sheet.body.note).toContain('Raw scores only');

    const download = await GET(
      `/api/teacher/reports/grade-sheet/export?assignmentId=${f.first.offering._id}&format=xlsx`,
      f.teacherToken,
    );
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('spreadsheetml');
    expect(download.headers['content-disposition']).toContain('attachment');
  });

  it('does not return a grade sheet for a competency course', async () => {
    const f = await fixture();
    await CourseOffering.updateOne({ _id: f.first.offering._id }, { $set: { assessmentMode: 'competency' } });

    const sheet = await GET(`/api/teacher/reports/grade-sheet?assignmentId=${f.first.offering._id}`, f.teacherToken);
    expect(sheet.status).toBe(200);
    expect(sheet.body.configured).toBe(false);
    expect(sheet.body.mode).toBe('competency');

    const download = await GET(
      `/api/teacher/reports/grade-sheet/export?assignmentId=${f.first.offering._id}&format=pdf`,
      f.teacherToken,
    );
    expect(download.status).toBe(409);
    expect(download.body.code).toBe('COMPETENCY_CONFIG_REQUIRED');
  });
});
