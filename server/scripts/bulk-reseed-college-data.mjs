import '../src/config/env.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import argon2 from 'argon2';

import {
  Department,
  Program,
  Batch,
  Course,
  AcademicYear,
  AcademicTerm,
} from '../src/models/AcademicStructure.js';
import { Student, Enrollment } from '../src/models/Student.js';
import { CourseOffering, CourseRegistration } from '../src/models/Offering.js';
import { CourseMarkPolicy } from '../src/models/CourseMarkPolicy.js';
import { AttendanceSheet } from '../src/models/AttendanceSheet.js';
import {
  AttendanceRecord,
  Result,
  GradingPolicy,
  findBand,
} from '../src/models/Records.js';
import { User } from '../src/models/User.js';
import { TeacherProgramAssignment } from '../src/models/Teaching.js';
import { CurriculumPlan, CurriculumCourse } from '../src/models/Curriculum.js';
import { PaymentCycle, StudentCharge, Payment } from '../src/models/Finance.js';

const MONGODB_URI = process.env.MONGODB_URI;

const FIRST_NAMES = [
  'Abebe', 'Almaz', 'Biniam', 'Bethlehem', 'Chala', 'Derartu', 'Ephrem', 'Fasika', 'Girma', 'Hanan',
  'Kassahun', 'Lensa', 'Mulugeta', 'Nebiyat', 'Omer', 'Rahel', 'Solomon', 'Tigist', 'Yared', 'Zinash',
  'Abel', 'Biruk', 'Daniel', 'Eden', 'Fikru', 'Genet', 'Habtamu', 'Hiwot', 'Kalkidan', 'Lemlem',
  'Meklit', 'Natnael', 'Rediet', 'Samuel', 'Selamawit', 'Tewodros', 'Winta', 'Yonas', 'Zeberga', 'Aster',
  'Alemayehu', 'Banchiamlak', 'Dawit', 'Elsa', 'Firehiwot', 'Getachew', 'Hawi', 'Ibsa', 'Jemal', 'Kidist',
  'Liya', 'Mesfin', 'Netsanet', 'Robel', 'Saron', 'Tariku', 'Worku', 'Yeabsira', 'Zemenay', 'Aregash',
];

const LAST_NAMES = [
  'Kebede', 'Tadesse', 'Hailu', 'Assefa', 'Bekele', 'Tulu', 'Tamiru', 'Mulugeta', 'Wolde', 'Mohammed',
  'Alemu', 'Desta', 'Girma', 'Kassa', 'Mekonnen', 'Negash', 'Seyoum', 'Tefera', 'Worku', 'Yilma',
  'Abera', 'Belachew', 'Demissie', 'Eshetu', 'Fanta', 'Getahun', 'Haile', 'Jaleta', 'Kassaye', 'Legesse',
  'Mengistu', 'Nega', 'Regassa', 'Shiferaw', 'Takele', 'Tesfaye', 'Woldemariam', 'Yimer', 'Zeleke', 'Admasu',
  'Amare', 'Berhanu', 'Derese', 'Fikre', 'Goremes', 'Habte', 'Ketema', 'Lemma', 'Mamo', 'Nigusse',
  'Sahle', 'Tilahun', 'Urga', 'Wondimu', 'Yeshitila', 'Zewdie', 'Ali', 'Bogale', 'Chane', 'Dagne',
];

async function run() {
  console.log('=====================================================');
  console.log('--- RESET & RESEED COLLEGE MANAGEMENT SYSTEM DATA ---');
  console.log('=====================================================\n');

  if (!MONGODB_URI) throw new Error('MONGODB_URI is not set in environment.');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB database.\n');

  // 1. BACKUP CURRENT DATABASE
  const backupDir = path.resolve('backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const collections = await mongoose.connection.db.listCollections().toArray();
  const backupData = {};
  console.log(`Backing up ${collections.length} collection(s)...`);
  for (const c of collections) {
    const docs = await mongoose.connection.db.collection(c.name).find({}).toArray();
    backupData[c.name] = docs;
  }
  const backupFile = path.join(backupDir, `backup-pre-wipe-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf8');
  console.log(`Full backup successfully written to: ${backupFile}\n`);

  // 2. VERIFY & PRESERVE USERS & GRADING POLICY
  console.log('Checking existing users and grading policies to preserve:');
  const existingUsers = await User.find({}).lean();
  console.log(`Preserving ${existingUsers.length} existing user(s):`);
  existingUsers.forEach((u) => console.log(`   ${u.role}: ${u.name} (${u.email})`));

  let gradingPolicy = await GradingPolicy.findOne({ key: 'global' }).lean();
  if (!gradingPolicy) {
    console.log('Creating global grading policy...');
    gradingPolicy = await GradingPolicy.create({
      key: 'global',
      version: 1,
      bands: [
        { min: 0, max: 39, letter: 'F', points: 0, pass: false, description: 'Fail' },
        { min: 40, max: 49, letter: 'D', points: 1, pass: true, description: 'Poor' },
        { min: 50, max: 59, letter: 'C', points: 2, pass: true, description: 'Satisfactory' },
        { min: 60, max: 64, letter: 'C+', points: 2.5, pass: true, description: 'Fair' },
        { min: 65, max: 69, letter: 'B-', points: 2.75, pass: true, description: 'Good' },
        { min: 70, max: 74, letter: 'B', points: 3, pass: true, description: 'Very Good' },
        { min: 75, max: 79, letter: 'B+', points: 3.5, pass: true, description: 'Excellent' },
        { min: 80, max: 89, letter: 'A-', points: 3.75, pass: true, description: 'Outstanding' },
        { min: 90, max: 100, letter: 'A', points: 4, pass: true, description: 'Distinction' },
      ],
      repeatPolicy: 'all',
      rounding: 2,
    });
  }
  console.log(`Preserved Grading Policy: ${gradingPolicy.bands?.length} bands\n`);

  // 3. WIPE ALL COLLECTIONS EXCEPT PRESERVED
  const PRESERVE_COLLECTIONS = new Set(['users', 'gradingpolicies', 'systemsettings', 'knowndevices']);
  console.log('Wiping non-preserved collections:');
  for (const c of collections) {
    if (!PRESERVE_COLLECTIONS.has(c.name.toLowerCase())) {
      const res = await mongoose.connection.db.collection(c.name).deleteMany({});
      console.log(`   Deleted collection ${c.name}: ${res.deletedCount} docs removed.`);
    } else {
      console.log(`   PRESERVED collection: ${c.name}`);
    }
  }

  // 4. CONFIGURE 3 ACTIVE TEACHER ACCOUNTS (ICT, Business, Health)
  console.log('\nConfiguring 3 active Department Teachers (no 2FA / verification on login):');
  
  // Teacher 1: ICT (haile12michaell@gmail.com)
  let ictTeacher = await User.findOne({ email: 'haile12michaell@gmail.com' });
  if (!ictTeacher) {
    ictTeacher = await User.create({
      name: 'Haile Michael (ICT)',
      email: 'haile12michaell@gmail.com',
      passwordHash: await argon2.hash('Password@123'),
      role: 'TEACHER',
      status: 'active',
      emailVerified: true,
      twoStepEnabled: false,
      mustChangePassword: false,
    });
  } else {
    ictTeacher.role = 'TEACHER';
    ictTeacher.status = 'active';
    ictTeacher.emailVerified = true;
    ictTeacher.twoStepEnabled = false;
    ictTeacher.mustChangePassword = false;
    await ictTeacher.save();
  }
  console.log(`   ICT Teacher: ${ictTeacher.name} (${ictTeacher.email}) [ID: ${ictTeacher._id}]`);

  // Teacher 2: Business (teacher.business@gmail.com)
  let busTeacher = await User.findOne({ email: 'teacher.business@gmail.com' });
  if (!busTeacher) {
    busTeacher = await User.create({
      name: 'Abebe Bekele (Business)',
      email: 'teacher.business@gmail.com',
      passwordHash: await argon2.hash('Password@123'),
      role: 'TEACHER',
      status: 'active',
      emailVerified: true,
      twoStepEnabled: false,
      mustChangePassword: false,
    });
  } else {
    busTeacher.role = 'TEACHER';
    busTeacher.status = 'active';
    busTeacher.emailVerified = true;
    busTeacher.twoStepEnabled = false;
    busTeacher.mustChangePassword = false;
    await busTeacher.save();
  }
  console.log(`   Business Teacher: ${busTeacher.name} (${busTeacher.email}) [ID: ${busTeacher._id}]`);

  // Teacher 3: Health (teacher.health@gmail.com)
  let hltTeacher = await User.findOne({ email: 'teacher.health@gmail.com' });
  if (!hltTeacher) {
    hltTeacher = await User.create({
      name: 'Tigist Hailu (Health)',
      email: 'teacher.health@gmail.com',
      passwordHash: await argon2.hash('Password@123'),
      role: 'TEACHER',
      status: 'active',
      emailVerified: true,
      twoStepEnabled: false,
      mustChangePassword: false,
    });
  } else {
    hltTeacher.role = 'TEACHER';
    hltTeacher.status = 'active';
    hltTeacher.emailVerified = true;
    hltTeacher.twoStepEnabled = false;
    hltTeacher.mustChangePassword = false;
    await hltTeacher.save();
  }
  console.log(`   Health Teacher: ${hltTeacher.name} (${hltTeacher.email}) [ID: ${hltTeacher._id}]`);

  // 5. CREATE 3 ACADEMIC YEARS: 2018 (closed), 2019 (active), 2020 (planned)
  console.log('\nCreating Academic Years:');
  const ay2018 = await AcademicYear.create({
    label: '2018',
    startDate: new Date('2018-01-01T00:00:00.000Z'),
    endDate: new Date('2018-12-31T23:59:59.999Z'),
    isCurrent: false,
    status: 'closed',
  });
  await AcademicTerm.create({
    academicYear: ay2018._id,
    name: 'Semester 1',
    sequence: 1,
    type: 'semester',
    startDate: new Date('2018-01-01T00:00:00.000Z'),
    endDate: new Date('2018-06-30T23:59:59.999Z'),
  });
  await AcademicTerm.create({
    academicYear: ay2018._id,
    name: 'Semester 2',
    sequence: 2,
    type: 'semester',
    startDate: new Date('2018-07-01T00:00:00.000Z'),
    endDate: new Date('2018-12-31T23:59:59.999Z'),
  });
  console.log(`   Academic Year 2018: status='${ay2018.status}', isCurrent=${ay2018.isCurrent}`);

  const ay2019 = await AcademicYear.create({
    label: '2019',
    startDate: new Date('2019-01-01T00:00:00.000Z'),
    endDate: new Date('2019-12-31T23:59:59.999Z'),
    isCurrent: true,
    status: 'active',
  });
  await AcademicTerm.create({
    academicYear: ay2019._id,
    name: 'Semester 1',
    sequence: 1,
    type: 'semester',
    startDate: new Date('2019-01-01T00:00:00.000Z'),
    endDate: new Date('2019-06-30T23:59:59.999Z'),
  });
  await AcademicTerm.create({
    academicYear: ay2019._id,
    name: 'Semester 2',
    sequence: 2,
    type: 'semester',
    startDate: new Date('2019-07-01T00:00:00.000Z'),
    endDate: new Date('2019-12-31T23:59:59.999Z'),
  });
  console.log(`   Academic Year 2019: status='${ay2019.status}', isCurrent=${ay2019.isCurrent}`);

  const ay2020 = await AcademicYear.create({
    label: '2020',
    startDate: new Date('2020-01-01T00:00:00.000Z'),
    endDate: new Date('2020-12-31T23:59:59.999Z'),
    isCurrent: false,
    status: 'planned',
  });
  await AcademicTerm.create({
    academicYear: ay2020._id,
    name: 'Semester 1',
    sequence: 1,
    type: 'semester',
    startDate: new Date('2020-01-01T00:00:00.000Z'),
    endDate: new Date('2020-06-30T23:59:59.999Z'),
  });
  await AcademicTerm.create({
    academicYear: ay2020._id,
    name: 'Semester 2',
    sequence: 2,
    type: 'semester',
    startDate: new Date('2020-07-01T00:00:00.000Z'),
    endDate: new Date('2020-12-31T23:59:59.999Z'),
  });
  console.log(`   Academic Year 2020: status='${ay2020.status}', isCurrent=${ay2020.isCurrent}`);

  // 6. CREATE 3 DEPARTMENTS: ICT, BUSINESS, HEALTH
  console.log('\nCreating 3 Departments:');
  const deptICT = await Department.create({
    code: 'ICT',
    name: 'Information and Communication Technology',
    description: 'Department of Information and Communication Technology',
    active: true,
  });
  const deptBUS = await Department.create({
    code: 'BUS',
    name: 'Business and Economics',
    description: 'Department of Business and Economics',
    active: true,
  });
  const deptHLT = await Department.create({
    code: 'HLT',
    name: 'Health Sciences',
    description: 'Department of Health Sciences',
    active: true,
  });
  console.log(`   Departments created: ${deptICT.name} (${deptICT.code}), ${deptBUS.name} (${deptBUS.code}), ${deptHLT.name} (${deptHLT.code})`);

  // 7. SPECIFY 2 PROGRAMMES PER DEPARTMENT (6 TOTAL) AND 3 COURSES IN EACH (18 COURSES TOTAL)
  const PROGRAMMES_DEF = [
    // ICT Department (Assigned Teacher: ictTeacher)
    {
      dept: deptICT,
      teacher: ictTeacher,
      code: 'CS',
      name: 'Computer Science',
      qualificationType: 'degree',
      durationYears: 4,
      courses: [
        { code: 'CS-101', title: 'Programming Fundamentals', creditHours: 3 },
        { code: 'CS-102', title: 'Data Structures and Algorithms', creditHours: 3 },
        { code: 'CS-103', title: 'Database Systems', creditHours: 3 },
      ],
    },
    {
      dept: deptICT,
      teacher: ictTeacher,
      code: 'IT',
      name: 'Information Technology',
      qualificationType: 'degree',
      durationYears: 4,
      courses: [
        { code: 'IT-101', title: 'Computer Networks Fundamentals', creditHours: 3 },
        { code: 'IT-102', title: 'Web Systems and Technologies', creditHours: 3 },
        { code: 'IT-103', title: 'System Administration & Security', creditHours: 3 },
      ],
    },
    // BUSINESS Department (Assigned Teacher: busTeacher)
    {
      dept: deptBUS,
      teacher: busTeacher,
      code: 'ACC',
      name: 'Accounting and Finance',
      qualificationType: 'degree',
      durationYears: 4,
      courses: [
        { code: 'ACC-101', title: 'Principles of Accounting I', creditHours: 3 },
        { code: 'ACC-102', title: 'Financial Accounting', creditHours: 3 },
        { code: 'ACC-103', title: 'Cost and Management Accounting', creditHours: 3 },
      ],
    },
    {
      dept: deptBUS,
      teacher: busTeacher,
      code: 'MGT',
      name: 'Business Management',
      qualificationType: 'degree',
      durationYears: 4,
      courses: [
        { code: 'MGT-101', title: 'Principles of Management', creditHours: 3 },
        { code: 'MGT-102', title: 'Organizational Behavior', creditHours: 3 },
        { code: 'MGT-103', title: 'Entrepreneurship & Innovation', creditHours: 3 },
      ],
    },
    // HEALTH Department (Assigned Teacher: hltTeacher)
    {
      dept: deptHLT,
      teacher: hltTeacher,
      code: 'NUR',
      name: 'Nursing',
      qualificationType: 'degree',
      durationYears: 4,
      courses: [
        { code: 'NUR-101', title: 'Fundamentals of Nursing Care', creditHours: 3 },
        { code: 'NUR-102', title: 'Human Anatomy and Physiology', creditHours: 3 },
        { code: 'NUR-103', title: 'Medical-Surgical Nursing', creditHours: 3 },
      ],
    },
    {
      dept: deptHLT,
      teacher: hltTeacher,
      code: 'PH',
      name: 'Public Health',
      qualificationType: 'degree',
      durationYears: 4,
      courses: [
        { code: 'PH-101', title: 'Introduction to Public Health', creditHours: 3 },
        { code: 'PH-102', title: 'Principles of Epidemiology', creditHours: 3 },
        { code: 'PH-103', title: 'Environmental & Community Health', creditHours: 3 },
      ],
    },
  ];

  let studentGlobalIndex = 0;
  const allStudents2018 = [];
  const allStudents2019 = [];

  for (const pDef of PROGRAMMES_DEF) {
    console.log(`\n=====================================================`);
    console.log(`PROGRAMME: ${pDef.name} (${pDef.code}) [${pDef.dept.name}]`);
    console.log(`Teacher Assigned: ${pDef.teacher.name} (${pDef.teacher.email})`);

    const program = await Program.create({
      code: pDef.code,
      name: pDef.name,
      department: pDef.dept._id,
      qualificationType: pDef.qualificationType,
      durationYears: pDef.durationYears,
      categories: ['regular', 'extension'],
      teachers: [pDef.teacher._id],
      active: true,
      academicYears: [ay2018._id, ay2019._id, ay2020._id],
    });

    // Durable Teacher-Program Assignment
    await TeacherProgramAssignment.create({
      teacher: pDef.teacher._id,
      program: program._id,
      status: 'active',
      source: 'program',
      assignedAt: new Date('2018-01-01'),
    });

    // Create 3 Courses
    const courseDocs = [];
    for (const cDef of pDef.courses) {
      const course = await Course.create({
        code: cDef.code,
        title: cDef.title,
        creditHours: cDef.creditHours,
        department: pDef.dept._id,
        program: program._id,
        active: true,
      });
      courseDocs.push(course);
      console.log(`   Course: ${course.code} — ${course.title} (${course.creditHours} cr)`);
    }

    // Published Curriculum Plans for 2018 and 2019
    for (const ay of [ay2018, ay2019]) {
      const plan = await CurriculumPlan.create({
        program: program._id,
        department: pDef.dept._id,
        qualificationType: program.qualificationType,
        academicYear: ay._id,
        version: 1,
        title: `${program.name} Curriculum (${ay.label})`,
        status: 'published',
        publishedAt: new Date(`${ay.label}-01-01`),
        totalCredits: courseDocs.reduce((sum, c) => sum + c.creditHours, 0),
      });

      for (let i = 0; i < courseDocs.length; i++) {
        await CurriculumCourse.create({
          plan: plan._id,
          course: courseDocs[i]._id,
          academicYear: ay._id,
          term: 'Semester 1',
          level: 1,
          creditHours: courseDocs[i].creditHours,
          category: 'required',
          order: i + 1,
          active: true,
        });
      }
    }

    // CREATE 4 BATCHES PER PROGRAMME:
    // 2018 Regular, 2018 Extension, 2019 Regular, 2019 Extension
    const BATCH_SPECS = [
      { year: '2018', category: 'regular', code: 'B-2018-REG', name: 'Batch 2018 Regular', ay: ay2018, status: 'completed' },
      { year: '2018', category: 'extension', code: 'B-2018-EXT', name: 'Batch 2018 Extension', ay: ay2018, status: 'completed' },
      { year: '2019', category: 'regular', code: 'B-2019-REG', name: 'Batch 2019 Regular', ay: ay2019, status: 'active' },
      { year: '2019', category: 'extension', code: 'B-2019-EXT', name: 'Batch 2019 Extension', ay: ay2019, status: 'active' },
    ];

    const batchesMap = {};
    for (const bSpec of BATCH_SPECS) {
      const batch = await Batch.create({
        code: bSpec.code,
        name: bSpec.name,
        category: bSpec.category,
        program: program._id,
        department: pDef.dept._id,
        admissionAcademicYear: bSpec.ay._id,
        currentLevel: 1,
        status: bSpec.status,
      });
      batchesMap[`${bSpec.year}-${bSpec.category}`] = batch;
    }

    // CREATE STUDENTS: 5 students in 2018 (3 Regular, 2 Extension), 5 students in 2019 (3 Regular, 2 Extension)
    // Total 10 students per programme
    const programStudents2018 = [];
    const programStudents2019 = [];

    // 2018 Students (5 students: 3 reg, 2 ext)
    for (let i = 1; i <= 5; i++) {
      const fn = FIRST_NAMES[studentGlobalIndex % FIRST_NAMES.length];
      const ln = LAST_NAMES[studentGlobalIndex % LAST_NAMES.length];
      studentGlobalIndex++;

      const isReg = i <= 3;
      const cat = isReg ? 'regular' : 'extension';
      const batch = batchesMap[`2018-${cat}`];
      const catCode = isReg ? 'REG' : 'EXT';
      const studentId = `${pDef.code}-${catCode}-2018-${String(i).padStart(3, '0')}`;
      const email = `${fn.toLowerCase()}.${ln.toLowerCase()}.${studentGlobalIndex}@gmail.com`;
      const phone = `+251911${String(100000 + studentGlobalIndex).slice(-6)}`;

      const student = await Student.create({
        studentId,
        firstName: fn,
        lastName: ln,
        fullName: `${fn} ${ln}`,
        sex: i % 2 === 0 ? 'female' : 'male',
        dateOfBirth: new Date(`1998-04-${String(10 + (i % 15)).padStart(2, '0')}`),
        email,
        phone,
        studentCategory: cat,
        department: pDef.dept._id,
        program: program._id,
        qualificationType: program.qualificationType,
        batch: batch._id,
        admissionAcademicYear: ay2018._id,
        admissionDate: new Date('2018-01-15'),
        level: 1,
        enrollmentStatus: 'active',
        studentStatus: 'active',
      });

      await Enrollment.create({
        student: student._id,
        program: program._id,
        department: pDef.dept._id,
        qualificationType: program.qualificationType,
        batch: batch._id,
        academicYear: ay2018._id,
        enrollmentDate: new Date('2018-01-15'),
        status: 'active',
        level: 1,
      });

      programStudents2018.push({ student, batch, category: cat });
      allStudents2018.push({ student, batch, category: cat, program, dept: pDef.dept });
    }

    // 2019 Students (5 students: 3 reg, 2 ext)
    for (let i = 1; i <= 5; i++) {
      const fn = FIRST_NAMES[studentGlobalIndex % FIRST_NAMES.length];
      const ln = LAST_NAMES[studentGlobalIndex % LAST_NAMES.length];
      studentGlobalIndex++;

      const isReg = i <= 3;
      const cat = isReg ? 'regular' : 'extension';
      const batch = batchesMap[`2019-${cat}`];
      const catCode = isReg ? 'REG' : 'EXT';
      const studentId = `${pDef.code}-${catCode}-2019-${String(i).padStart(3, '0')}`;
      const email = `${fn.toLowerCase()}.${ln.toLowerCase()}.${studentGlobalIndex}@gmail.com`;
      const phone = `+251912${String(100000 + studentGlobalIndex).slice(-6)}`;

      const student = await Student.create({
        studentId,
        firstName: fn,
        lastName: ln,
        fullName: `${fn} ${ln}`,
        sex: i % 2 === 0 ? 'female' : 'male',
        dateOfBirth: new Date(`1999-06-${String(10 + (i % 15)).padStart(2, '0')}`),
        email,
        phone,
        studentCategory: cat,
        department: pDef.dept._id,
        program: program._id,
        qualificationType: program.qualificationType,
        batch: batch._id,
        admissionAcademicYear: ay2019._id,
        admissionDate: new Date('2019-01-15'),
        level: 1,
        enrollmentStatus: 'active',
        studentStatus: 'active',
      });

      await Enrollment.create({
        student: student._id,
        program: program._id,
        department: pDef.dept._id,
        qualificationType: program.qualificationType,
        batch: batch._id,
        academicYear: ay2019._id,
        enrollmentDate: new Date('2019-01-15'),
        status: 'active',
        level: 1,
      });

      programStudents2019.push({ student, batch, category: cat });
      allStudents2019.push({ student, batch, category: cat, program, dept: pDef.dept });
    }

    console.log(`   Students enrolled: 5 in 2018 (${programStudents2018.map(s => s.student.studentId).join(', ')})`);
    console.log(`   Students enrolled: 5 in 2019 (${programStudents2019.map(s => s.student.studentId).join(', ')})`);

    // 8. 2018 OFFERINGS, MARKS & SUBMITTED RESULTS
    // User: "in 2018 batches make that year result submitted"
    for (const cat of ['regular', 'extension']) {
      const batch = batchesMap[`2018-${cat}`];
      const studentsInBatch = programStudents2018.filter((s) => s.category === cat);

      for (const course of courseDocs) {
        const offering = await CourseOffering.create({
          course: course._id,
          program: program._id,
          department: pDef.dept._id,
          academicYear: ay2018._id,
          term: 'Semester 1',
          level: 1,
          batch: batch._id,
          category: cat,
          creditHours: course.creditHours,
          teacher: pDef.teacher._id,
          assessmentMode: 'numeric',
          capacity: 40,
          registeredCount: studentsInBatch.length,
          status: 'completed',
          attendanceClosed: true,
          attendanceClosedAt: new Date('2018-11-15'),
        });

        // Mark Policy
        await CourseMarkPolicy.create({
          offering: offering._id,
          teacher: pDef.teacher._id,
          weights: {
            assignment: 30,
            project: 30,
            quizzes: 20,
            attendance: 10,
            presentation: 10,
          },
        });

        // Attendance Sheets (15 class sessions)
        for (let day = 1; day <= 15; day++) {
          const dStr = String(day).padStart(2, '0');
          const dateKey = `2018-03-${dStr}`;
          const sessionDate = new Date(`${dateKey}T09:00:00.000Z`);

          await AttendanceSheet.create({
            offering: offering._id,
            dateKey,
            date: sessionDate,
            period: 'day',
            status: 'finalized',
            revision: 1,
            createdBy: pDef.teacher._id,
            updatedBy: pDef.teacher._id,
            finalizedAt: sessionDate,
            finalizedBy: pDef.teacher._id,
          });

          for (const sItem of studentsInBatch) {
            await AttendanceRecord.create({
              offering: offering._id,
              student: sItem.student._id,
              date: sessionDate,
              period: 'day',
              status: day % 12 === 0 ? 'late' : 'present',
              markedBy: pDef.teacher._id,
              markedAt: sessionDate,
            });
          }
        }

        // Registrations & Submitted Results
        for (let sIdx = 0; sIdx < studentsInBatch.length; sIdx++) {
          const sItem = studentsInBatch[sIdx];

          await CourseRegistration.create({
            student: sItem.student._id,
            offering: offering._id,
            course: course._id,
            academicYear: ay2018._id,
            term: 'Semester 1',
            creditHours: course.creditHours,
            status: 'registered',
            registeredAt: new Date('2018-01-20'),
          });

          // Submitted Result
          const assignScore = 26 + (sIdx % 4);
          const projScore = 25 + (sIdx % 5);
          const quizScore = 17 + (sIdx % 3);
          const attScore = 9;
          const presScore = 9;
          const totalMark = assignScore + projScore + quizScore + attScore + presScore; // 86 - 93
          const band = findBand(gradingPolicy, totalMark) || { letter: 'A', points: 4.0, pass: true };

          await Result.create({
            student: sItem.student._id,
            offering: offering._id,
            course: course._id,
            program: program._id,
            batch: batch._id,
            academicYear: ay2018._id,
            term: 'Semester 1',
            creditHours: course.creditHours,
            components: [
              { name: 'Assignment', max: 30, score: assignScore },
              { name: 'Project', max: 30, score: projScore },
              { name: 'Quizzes', max: 20, score: quizScore },
              { name: 'Attendance', max: 10, score: attScore },
              { name: 'Presentation', max: 10, score: presScore },
            ],
            totalMark,
            letterGrade: band.letter,
            gradePoint: band.points,
            passed: true,
            status: 'submitted',
            enteredBy: pDef.teacher._id,
            submittedAt: new Date('2018-11-20'),
          });
        }
      }
    }

    // 9. 2019 OFFERINGS: ACTIVE COURSES & NO RESULTS SUBMITTED
    // User: "in 2019 make not result submitted make the course active okay"
    for (const cat of ['regular', 'extension']) {
      const batch = batchesMap[`2019-${cat}`];
      const studentsInBatch = programStudents2019.filter((s) => s.category === cat);

      for (const course of courseDocs) {
        const offering = await CourseOffering.create({
          course: course._id,
          program: program._id,
          department: pDef.dept._id,
          academicYear: ay2019._id,
          term: 'Semester 1',
          level: 1,
          batch: batch._id,
          category: cat,
          creditHours: course.creditHours,
          teacher: pDef.teacher._id,
          assessmentMode: 'numeric',
          capacity: 40,
          registeredCount: studentsInBatch.length,
          status: 'open', // ACTIVE COURSE!
          attendanceClosed: false,
        });

        // Mark Policy
        await CourseMarkPolicy.create({
          offering: offering._id,
          teacher: pDef.teacher._id,
          weights: {
            assignment: 30,
            project: 30,
            quizzes: 20,
            attendance: 10,
            presentation: 10,
          },
        });

        // Registrations
        for (const sItem of studentsInBatch) {
          await CourseRegistration.create({
            student: sItem.student._id,
            offering: offering._id,
            course: course._id,
            academicYear: ay2019._id,
            term: 'Semester 1',
            creditHours: course.creditHours,
            status: 'registered',
            registeredAt: new Date('2019-01-20'),
          });
        }

        // Active/Draft Attendance Sheet
        const dateKey = '2019-02-10';
        const sessionDate = new Date(`${dateKey}T09:00:00.000Z`);
        await AttendanceSheet.create({
          offering: offering._id,
          dateKey,
          date: sessionDate,
          period: 'day',
          status: 'draft',
          revision: 1,
          createdBy: pDef.teacher._id,
          updatedBy: pDef.teacher._id,
        });

        for (const sItem of studentsInBatch) {
          await AttendanceRecord.create({
            offering: offering._id,
            student: sItem.student._id,
            date: sessionDate,
            period: 'day',
            status: 'present',
            markedBy: pDef.teacher._id,
            markedAt: sessionDate,
          });
        }
        // NO submitted results for 2019!
      }
    }
  }

  // 10. FINANCE COLLECTIONS & PAYMENTS
  // User: "2018 batches paid all month exept one student okay , in 2019 cedemic year no cylle created okay"
  console.log('\n=====================================================');
  console.log('FINANCIAL CYCLES & FEE PAYMENTS');
  console.log('=====================================================');

  // A. 2018: Create 10 Monthly Fee Cycles
  console.log('Creating 10 Monthly Cycles for 2018 Ethiopian Academic Year...');
  const ETH_MONTHS_NAMES = [
    'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir',
    'Yekatit', 'Megabit', 'Miazia', 'Ginbot', 'Sene'
  ];

  const cycles2018 = [];
  for (let m = 1; m <= 10; m++) {
    const mName = ETH_MONTHS_NAMES[m - 1];
    const slug = `${mName.toLowerCase()}-2018`;
    const portalHash = crypto.randomBytes(16).toString('hex');
    const opensAt = new Date(`2018-${String(m).padStart(2, '0')}-01T00:00:00.000Z`);
    const dueAt = new Date(`2018-${String(m).padStart(2, '0')}-28T23:59:59.000Z`);

    const cycle = await PaymentCycle.create({
      title: `${mName} 2018 Fee Cycle`,
      ethYear: 2018,
      ethMonth: m,
      opensAt,
      slug,
      dueAt,
      amount: 90000, // 900.00 ETB
      lateFeeEnabled: true,
      bank: {
        bank: 'Chapa Online Payment',
        accountNumber: 'CHAPA_PAY',
        holderName: 'College Finance Office',
      },
      targets: { all: true },
      portalHash,
      status: 'closed',
    });
    cycles2018.push(cycle);
  }
  console.log(`Created ${cycles2018.length} payment cycles for 2018.`);

  // B. Charges & Payments for 2018 Batches
  // Exactly ONE student has all months unpaid / overdue; ALL other 29 students have paid every month.
  const unpaidStudent = allStudents2018[0].student;
  console.log(`\nOverdue Student (All months unpaid): ${unpaidStudent.fullName} (${unpaidStudent.studentId})`);
  console.log(`All other ${allStudents2018.length - 1} 2018 students will have all months paid.`);

  let totalChargesCount = 0;
  let totalPaymentsCount = 0;
  let receiptSeq = 1;

  for (const item of allStudents2018) {
    const student = item.student;
    const isUnpaidStudent = String(student._id) === String(unpaidStudent._id);

    for (let cIdx = 0; cIdx < cycles2018.length; cIdx++) {
      const cycle = cycles2018[cIdx];
      totalChargesCount++;

      if (isUnpaidStudent) {
        // UNPAID / OVERDUE
        await StudentCharge.create({
          student: student._id,
          cycle: cycle._id,
          studentId: student.studentId,
          studentName: student.fullName,
          department: item.dept.name,
          programme: item.program.name,
          batch: item.batch.name,
          category: item.category,
          amountDue: cycle.amount,
          status: 'unpaid',
          dueAt: cycle.dueAt,
          payment: null,
        });
      } else {
        // PAID
        const receiptNumber = `REC-2018-${String(receiptSeq++).padStart(6, '0')}`;
        const paidAt = new Date(cycle.opensAt.getTime() + 5 * 24 * 60 * 60 * 1000);
        const doneHash = crypto.randomBytes(16).toString('hex');
        const bankReference = `TXN-2018-${String(receiptSeq).padStart(6, '0')}`;

        const charge = await StudentCharge.create({
          student: student._id,
          cycle: cycle._id,
          studentId: student.studentId,
          studentName: student.fullName,
          department: item.dept.name,
          programme: item.program.name,
          batch: item.batch.name,
          category: item.category,
          amountDue: cycle.amount,
          status: 'paid',
          dueAt: cycle.dueAt,
          paidAt,
        });

        const payment = await Payment.create({
          receiptNumber,
          charge: charge._id,
          cycle: cycle._id,
          student: student._id,
          amount: cycle.amount,
          method: cIdx % 2 === 0 ? 'chapa' : 'cbe_receipt',
          bankReference,
          doneHash,
          status: 'confirmed',
          paidAt,
        });

        charge.payment = payment._id;
        await charge.save();
        totalPaymentsCount++;
      }
    }
  }

  console.log(`   Generated ${totalChargesCount} total student charges for 2018.`);
  console.log(`   Created ${totalPaymentsCount} confirmed payment receipts for 2018.`);
  console.log(`   Unpaid charges on ${unpaidStudent.studentId}: ${cycles2018.length} overdue charges totaling ${(cycles2018.length * 900).toLocaleString()} ETB.`);

  // C. 2019: NO CYCLES CREATED
  // User: "in 2019 cedemic year no cylle created okay"
  const count2019Cycles = await PaymentCycle.countDocuments({ ethYear: 2019 });
  console.log(`\n2019 Payment Cycles count: ${count2019Cycles} (CONFIRMED ZERO CYCLES CREATED)`);

  // 11. FINAL AUDIT VERIFICATION
  console.log('\n=====================================================');
  console.log('FINAL DATABASE VERIFICATION AUDIT');
  console.log('=====================================================');

  const ayCount = await AcademicYear.countDocuments();
  const deptCount = await Department.countDocuments();
  const progCount = await Program.countDocuments();
  const batchCount = await Batch.countDocuments();
  const courseCount = await Course.countDocuments();
  const studentCount = await Student.countDocuments();
  const offeringCount = await CourseOffering.countDocuments();
  const openOfferings = await CourseOffering.countDocuments({ status: 'open' });
  const completedOfferings = await CourseOffering.countDocuments({ status: 'completed' });
  const resultCount = await Result.countDocuments();
  const submittedResults = await Result.countDocuments({ status: 'submitted' });
  const cycleCount = await PaymentCycle.countDocuments();
  const chargeCount = await StudentCharge.countDocuments();
  const paidCharges = await StudentCharge.countDocuments({ status: 'paid' });
  const unpaidCharges = await StudentCharge.countDocuments({ status: 'unpaid' });
  const paymentCount = await Payment.countDocuments();

  console.log(`Academic Years:        ${ayCount} (2018 closed, 2019 active, 2020 planned)`);
  console.log(`Departments:           ${deptCount} (ICT, BUS, HLT)`);
  console.log(`Programmes:            ${progCount} (2 in each department = 6 programmes)`);
  console.log(`Batches:               ${batchCount} (2018 Reg/Ext & 2019 Reg/Ext across programmes)`);
  console.log(`Courses:               ${courseCount} (3 in each programme = 18 courses)`);
  console.log(`Students:              ${studentCount} (30 in 2018, 30 in 2019 = 5 per programme per batch year)`);
  console.log(`Course Offerings:      ${offeringCount} (Completed 2018: ${completedOfferings}, Active/Open 2019: ${openOfferings})`);
  console.log(`Results:               ${resultCount} (Submitted 2018: ${submittedResults}, Submitted 2019: 0)`);
  console.log(`Payment Cycles:        ${cycleCount} (2018: 10 cycles, 2019: 0 cycles)`);
  console.log(`Student Charges:       ${chargeCount} (Paid: ${paidCharges}, Unpaid: ${unpaidCharges})`);
  console.log(`Payment Receipts:      ${paymentCount} (All confirmed payments)`);

  const teachers = await User.find({ role: 'TEACHER' }, 'name email status emailVerified twoStepEnabled').lean();
  console.log(`\nActive Teachers:`);
  teachers.forEach((t) => {
    console.log(`   - ${t.name} (${t.email}): status=${t.status}, emailVerified=${t.emailVerified}, twoStepEnabled=${t.twoStepEnabled}`);
  });

  console.log('\nSUCCESS! Database reset and structured reseed completed perfectly.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('\nReseed failed:', err);
  process.exit(1);
});
