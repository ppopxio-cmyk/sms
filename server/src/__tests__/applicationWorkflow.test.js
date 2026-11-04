import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { createApp } from '../app.js';
import { User } from '../models/User.js';
import { Session } from '../models/Session.js';
import { Department, Program, AcademicYear, Batch } from '../models/AcademicStructure.js';
import { RegistrationPortal } from '../models/RegistrationPortal.js';
import { StudentApplication } from '../models/StudentApplication.js';
import { signAccess } from '../services/token.service.js';

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

const publicHeaders = {
  Origin: 'http://localhost:5173',
  'X-Requested-With': 'sms-web',
};

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

describe('Student Application Workflow & Rejection Preservation', () => {
  async function setupFixture() {
    const department = await Department.create({
      code: `D${crypto.randomBytes(3).toString('hex')}`,
      name: 'Computer Science',
    });
    const program = await Program.create({
      code: `P${crypto.randomBytes(3).toString('hex')}`,
      name: 'Software Engineering',
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
    const portal = await RegistrationPortal.create({
      title: 'Fall 2026 Admissions',
      portalId: 'fall-2026',
      department: department._id,
      program: program._id,
      batch: batch._id,
      opensAt: new Date(Date.now() - 3600000),
      closesAt: new Date(Date.now() + 86400000 * 30),
      tutorialVideoUrl: 'https://youtube.com/watch?v=example',
      status: 'open',
    });
    const registrar = await makeUser('REGISTRAR', `registrar-${crypto.randomBytes(4).toString('hex')}@gmail.com`);
    const token = await makeToken(registrar);

    return { department, program, academicYear, batch, portal, registrar, token };
  }

  it('preserves exact Ethiopian birth date and assigns COL-YYYY-NNNNNN reference format', async () => {
    const { portal } = await setupFixture();

    const applicationPayload = {
      firstName: 'Abebe',
      middleName: 'Kebede',
      lastName: 'Tadesse',
      gender: 'male',
      email: 'abebe.kebede.admissions@gmail.com',
      phone: '0911223344',
      qualificationType: 'degree',
      birthDateCalendar: 'ETHIOPIAN',
      birthYear: 1996,
      birthMonth: 7,
      birthDay: 14,
      address: {
        region: 'Oromia',
        city: 'Adama',
        woreda: '01',
      },
      previousEducation: {
        schoolName: 'Adama Secondary',
        completionYear: '2015',
        gradeOrGpa: '3.8',
      },
    };

    const res = await request(app)
      .post(`/api/public/registration-portals/${portal.portalId}/apply`)
      .set(publicHeaders)
      .send(applicationPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.application.applicationNumber).toMatch(/^COL-\d{4}-\d{6}$/);

    const saved = await StudentApplication.findOne({ applicationNumber: res.body.application.applicationNumber });
    expect(saved).toBeTruthy();
    expect(saved.birthDateCalendar).toBe('ETHIOPIAN');
    expect(saved.birthDateEthiopian.year).toBe(1996);
    expect(saved.birthDateEthiopian.month).toBe(7);
    expect(saved.birthDateEthiopian.day).toBe(14);
    expect(saved.birthYear).toBe(1996);
    expect(saved.birthMonth).toBe(7);
    expect(saved.birthDay).toBe(14);
  });

  it('rejects an application with reason, updates status to rejected, and DOES NOT delete the record', async () => {
    const { portal, token } = await setupFixture();

    const appDoc = await StudentApplication.create({
      portal: portal._id,
      applicationNumber: 'COL-2026-000123',
      firstName: 'Almaz',
      lastName: 'Desta',
      fullName: 'Almaz Desta',
      email: 'almaz.desta@gmail.com',
      phone: '+251912345678',
      qualificationType: 'degree',
      status: 'pending',
    });

    const rejectionReason = 'Official grade 12 transcript document is unreadable and missing seal.';
    const res = await request(app)
      .post(`/api/registrar/applications/${appDoc._id}/reject`)
      .set(headers(token))
      .send({ reason: rejectionReason });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.application.status).toBe('rejected');
    expect(res.body.application.rejectionReason).toBe(rejectionReason);

    // Verify record is preserved in the database
    const dbRecord = await StudentApplication.findById(appDoc._id);
    expect(dbRecord).toBeTruthy();
    expect(dbRecord.status).toBe('rejected');
    expect(dbRecord.rejectionReason).toBe(rejectionReason);
    expect(dbRecord.reviewedBy).toBeTruthy();
    expect(dbRecord.reviewedAt).toBeTruthy();
  });

  it('guards against approving a rejected application (CANNOT_APPROVE_REJECTED)', async () => {
    const { portal, token } = await setupFixture();

    const appDoc = await StudentApplication.create({
      portal: portal._id,
      applicationNumber: 'COL-2026-000456',
      firstName: 'Dawit',
      lastName: 'Mulugeta',
      fullName: 'Dawit Mulugeta',
      email: 'dawit.mulugeta@gmail.com',
      phone: '+251912345679',
      qualificationType: 'degree',
      status: 'rejected',
      rejectionReason: 'Previous rejection reason',
      reviewedAt: new Date(),
    });

    const res = await request(app)
      .post(`/api/registrar/applications/${appDoc._id}/approve`)
      .set(headers(token))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/cannot approve a rejected application/i);

    // Status remains rejected
    const dbRecord = await StudentApplication.findById(appDoc._id);
    expect(dbRecord.status).toBe('rejected');
  });

  it('serves public tracking endpoint securely without sensitive leakages', async () => {
    const { portal } = await setupFixture();

    const trackingNum = 'COL-2026-000789';
    await StudentApplication.create({
      portal: portal._id,
      applicationNumber: trackingNum,
      firstName: 'Tigist',
      lastName: 'Bekele',
      fullName: 'Tigist Bekele',
      email: 'tigist.bekele@gmail.com',
      phone: '+251912345680',
      qualificationType: 'degree',
      status: 'rejected',
      rejectionReason: 'Missing certified copy of national exam results',
      ip: '192.168.1.50',
      userAgent: 'Mozilla/5.0 TestBrowser',
    });

    const res = await request(app).get(`/api/public/registration-portals/track/${trackingNum}`);

    expect(res.status).toBe(200);
    expect(res.body.tracking).toBeDefined();
    expect(res.body.tracking.trackingReference).toBe(trackingNum);
    expect(res.body.tracking.status).toBe('REJECTED');
    expect(res.body.tracking.rejectionReason).toBe('Missing certified copy of national exam results');
    // Ensure internal sensitive details are NOT exposed
    expect(res.body.tracking.ip).toBeUndefined();
    expect(res.body.tracking.userAgent).toBeUndefined();
    expect(res.body.tracking._id).toBeUndefined();
  });
});
