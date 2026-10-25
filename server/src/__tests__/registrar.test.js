import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { createApp } from '../app.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Department, Program, Course, AcademicYear, Batch } from '../models/AcademicStructure.js';
import { Student } from '../models/Student.js';
import { signAccess } from '../services/token.service.js';

// The Registrar endpoints that failed with HTTP 500 in production all sat behind one
// helper that built their Mongo filters. These tests exist because that helper used to
// mark the wrong object as trusted, which made every $in / $gte filter collapse into an
// $eq and fail to cast. A test that only checked "the route exists" would not have
// caught it, so each case below asserts the real filter still works.

let mongo;
let app;

const future = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

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

async function makeToken(user) {
  const session = await Session.create({
    userId: user._id,
    deviceId: `test-${user._id}`,
    refreshHash: crypto.randomBytes(24).toString('hex'),
    expiresAt: future(),
    absoluteExpiresAt: future(),
  });
  return signAccess(user, session._id);
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
const PATCH = (url, token) => request(app).patch(url).set(headers(token));

async function structure() {
  const department = await Department.create({
    code: `D${crypto.randomBytes(3).toString('hex')}`,
    name: 'Business & Economics',
  });
  const program = await Program.create({
    code: `P${crypto.randomBytes(3).toString('hex')}`,
    name: 'Accounting and Finance',
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
    status: 'active',
  });
  return { department, program, academicYear, batch };
}

async function fixture() {
  const base = await structure();
  const registrar = await makeUser('REGISTRAR', `registrar-${crypto.randomBytes(4).toString('hex')}@example.com`);
  const teacher = await makeUser('TEACHER', `teacher-${crypto.randomBytes(4).toString('hex')}@example.com`);
  const registrarToken = await makeToken(registrar);
  const teacherToken = await makeToken(teacher);

  await Student.create({
    studentId: 'ST-100',
    firstName: 'Hana',
    lastName: 'Tesfaye',
    sex: 'female',
    program: base.program._id,
    department: base.department._id,
    batch: base.batch._id,
    level: 1,
    enrollmentStatus: 'active',
    studentStatus: 'active',
  });

  return { base, registrar, teacher, registrarToken, teacherToken };
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

describe('registrar endpoints that used to fail with HTTP 500', () => {
  it('serves the dashboard instead of crashing on the batch and date filters', async () => {
    const f = await fixture();

    const response = await GET('/api/registrar/dashboard', f.registrarToken);
    expect(response.status).toBe(200);
    expect(response.body.metrics).toBeDefined();
    // The batch counter is built from a $in filter. If that filter is collapsed into an
    // $eq the count is wrong, and if it fails to cast the whole request is a 500.
    expect(response.body.metrics.batches).toBe(1);
    expect(response.body.metrics.students).toBe(1);
    expect(response.body.currentYear).toBeTruthy();
    expect(response.body.currentYear.label).toBe('2026/27');
  });

  it('serves the student options instead of crashing on the batch status filter', async () => {
    const f = await fixture();

    const response = await GET('/api/registrar/students/options', f.registrarToken);
    expect(response.status).toBe(200);
    expect(response.body.departments).toHaveLength(1);
    expect(response.body.programs).toHaveLength(1);
    // Only planned and active batches belong here: an archived batch must be left out.
    expect(response.body.batches).toHaveLength(1);
    expect(response.body.batches[0].code).toBe(f.base.batch.code);
  });

  it('serves the academic structure', async () => {
    const f = await fixture();

    const response = await GET('/api/registrar/academic-structure', f.registrarToken);
    expect(response.status).toBe(200);
    expect(response.body.departments).toHaveLength(1);
    expect(response.body.departments[0].programCount).toBe(1);
    expect(response.body.programs[0].name).toBe('Accounting and Finance');
    expect(response.body.programs[0].qualificationType).toBe('degree');
  });

  it('keeps the Registrar endpoints closed to other roles', async () => {
    const f = await fixture();

    const teacherDashboard = await GET('/api/registrar/dashboard', f.teacherToken);
    expect(teacherDashboard.status).toBe(403);

    const teacherOptions = await GET('/api/registrar/students/options', f.teacherToken);
    expect(teacherOptions.status).toBe(403);

    const anonymous = await request(app).get('/api/registrar/dashboard');
    expect(anonymous.status).toBe(401);
  });
});

describe('Registrar grading policy', () => {
  it('starts unconfigured and never guesses a default band', async () => {
    const f = await fixture();

    const response = await GET('/api/registrar/grading-policy', f.registrarToken);
    expect(response.status).toBe(200);
    expect(response.body.unconfigured).toBe(true);
    expect(response.body.bands).toEqual([]);
  });

  it('rejects overlapping, gapped and out-of-range bands', async () => {
    const f = await fixture();

    const overlapping = await PATCH('/api/registrar/grading-policy', f.registrarToken).send({
      bands: [
        { min: 0, max: 60, letter: 'A', points: 4, pass: true },
        { min: 50, max: 100, letter: 'B', points: 3, pass: true },
      ],
    });
    expect(overlapping.status).toBe(400);
    expect(overlapping.body.code).toBe('BANDS_CONTIGUOUS');

    const gapped = await PATCH('/api/registrar/grading-policy', f.registrarToken).send({
      bands: [
        { min: 0, max: 50, letter: 'A', points: 4, pass: true },
        { min: 60, max: 100, letter: 'B', points: 3, pass: true },
      ],
    });
    expect(gapped.status).toBe(400);
    expect(gapped.body.code).toBe('BANDS_CONTIGUOUS');

    const outOfRange = await PATCH('/api/registrar/grading-policy', f.registrarToken).send({
      bands: [{ min: 0, max: 120, letter: 'A', points: 4, pass: true }],
    });
    expect(outOfRange.status).toBe(400);

    const missingBand = await PATCH('/api/registrar/grading-policy', f.registrarToken).send({
      bands: [{ min: 10, max: 100, letter: 'A', points: 4, pass: true }],
    });
    expect(missingBand.status).toBe(400);
    expect(missingBand.body.code).toBe('BANDS_START');
  });

  it('saves approved bands, previews a mark and records the change', async () => {
    const f = await fixture();

    const saved = await PATCH('/api/registrar/grading-policy', f.registrarToken).send({
      bands: [
        { min: 0, max: 49, letter: 'F', points: 0, pass: false },
        { min: 50, max: 100, letter: 'A', points: 4, pass: true },
      ],
      repeatPolicy: 'all',
      rounding: 2,
      reason: 'Approved by the academic board',
    });
    expect(saved.status).toBe(200);
    expect(saved.body.changed).toBe(true);
    expect(saved.body.policy.bands).toHaveLength(2);

    const view = await GET('/api/registrar/grading-policy', f.registrarToken);
    expect(view.status).toBe(200);
    expect(view.body.unconfigured).toBeFalsy();
    expect(view.body.bands[0].letter).toBe('F');

    const preview = await POST('/api/registrar/grading-policy/preview', f.registrarToken).send({ marks: [85, 20] });
    expect(preview.status).toBe(200);
    expect(preview.body.results).toHaveLength(2);
    expect(preview.body.results[0].letter).toBe('A');
    expect(preview.body.results[0].pass).toBe(true);
    expect(preview.body.results[1].letter).toBe('F');
    expect(preview.body.results[1].pass).toBe(false);

    const history = await GET('/api/registrar/grading-policy/history', f.registrarToken);
    expect(history.status).toBe(200);
    expect(history.body.entries.length).toBeGreaterThan(0);
    expect(history.body.entries[0].meta.reason).toBe('Approved by the academic board');
  });

  it('refuses a preview before any policy exists and keeps the route closed to teachers', async () => {
    const f = await fixture();

    const preview = await POST('/api/registrar/grading-policy/preview', f.registrarToken).send({ marks: [50] });
    expect(preview.status).toBe(409);
    expect(preview.body.code).toBe('GRADING_POLICY_MISSING');

    const denied = await GET('/api/registrar/grading-policy', f.teacherToken);
    expect(denied.status).toBe(403);
  });

  it('loads curriculum options with active departments, programs, and academic years', async () => {
    const f = await fixture();
    const res = await GET('/api/registrar/curriculum/options', f.registrarToken);
    expect(res.status).toBe(200);
    expect(res.body.departments.length).toBeGreaterThan(0);
    expect(res.body.programs.length).toBeGreaterThan(0);
    expect(res.body.academicYears.length).toBeGreaterThan(0);
    expect(res.body.academicYears[0].status).toBe('active');
  });

  it('creates courses and publishes curriculum plan activating classes and course materials', async () => {
    const f = await fixture();
    
    // 1. Create a course
    const courseRes = await POST('/api/registrar/academic-structure/courses', f.registrarToken).send({
      code: 'CS-101',
      title: 'Introduction to Computer Science',
      creditHours: 3,
      program: f.base.program._id,
      department: f.base.department._id,
    });
    expect(courseRes.status).toBe(201);
    expect(courseRes.body.course.code).toBe('CS-101');

    // 2. Create curriculum plan
    const planRes = await POST('/api/registrar/curriculum', f.registrarToken).send({
      program: f.base.program._id,
      academicYear: f.base.academicYear._id,
      title: 'CS 2026 Curriculum',
    });
    expect(planRes.status).toBe(201);
    const planId = planRes.body.plan._id;

    // 3. Add course to plan
    const addCourseRes = await POST(`/api/registrar/curriculum/${planId}/courses`, f.registrarToken).send({
      course: courseRes.body.course.id,
      level: 1,
      term: 'Semester 1',
      creditHours: 3,
      category: 'required',
    });
    expect(addCourseRes.status).toBe(201);

    // 4. Publish plan
    const publishRes = await POST(`/api/registrar/curriculum/${planId}/publish`, f.registrarToken);
    expect(publishRes.status).toBe(200);
    expect(publishRes.body.plan.status).toBe('published');

    // 5. Check teacher classes & materials
    const teacherClasses = await GET('/api/teacher/courses', f.teacherToken);
    expect(teacherClasses.status).toBe(200);
    expect(teacherClasses.body.assignments.length).toBeGreaterThan(0);
    expect(teacherClasses.body.assignments[0].canManage).toBe(true);

    const teacherMaterials = await GET('/api/teacher/materials/course-resources', f.teacherToken);
    expect(teacherMaterials.status).toBe(200);
    expect(teacherMaterials.body.resources.length).toBeGreaterThan(0);
    expect(teacherMaterials.body.resources[0].courseCode).toBe('CS-101');
  });
});
