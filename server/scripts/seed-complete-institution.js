import '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import {
  Department,
  Program,
  Batch,
  Course,
  AcademicYear,
} from '../src/models/AcademicStructure.js';
import { Student } from '../src/models/Student.js';
import { CourseOffering, CourseRegistration } from '../src/models/Offering.js';
import { CourseMarkPolicy } from '../src/models/CourseMarkPolicy.js';
import { AttendanceSheet } from '../src/models/AttendanceSheet.js';
import {
  AttendanceRecord,
  Result,
  GradingPolicy,
  findBand,
} from '../src/models/Records.js';
import { CertificateTemplate } from '../src/models/Documents.js';
import { User } from '../src/models/User.js';
import { TeacherProgramAssignment } from '../src/models/Teaching.js';
import { ownFilter } from '../src/services/registrar.helpers.js';

const DEPARTMENTS_DATA = [
  {
    code: 'BE',
    name: 'Department of Business and Economics',
    programs: [
      { code: 'AF', name: 'Accounting and Finance' },
      { code: 'MGMT', name: 'Management' },
      { code: 'MKTG', name: 'Marketing Management' },
    ],
  },
  {
    code: 'CIT',
    name: 'Department of Computing and Information Technology',
    programs: [
      { code: 'CS', name: 'Computer Science' },
      { code: 'IT', name: 'Information Technology' },
      { code: 'SE', name: 'Software Engineering' },
    ],
  },
  {
    code: 'ENG',
    name: 'Department of Engineering',
    programs: [
      { code: 'CE', name: 'Civil Engineering' },
      { code: 'EE', name: 'Electrical Engineering' },
      { code: 'ME', name: 'Mechanical Engineering' },
    ],
  },
  {
    code: 'HS',
    name: 'Department of Health Sciences',
    programs: [
      { code: 'NUR', name: 'Nursing' },
      { code: 'MLS', name: 'Medical Laboratory Science' },
      { code: 'PH', name: 'Public Health' },
    ],
  },
  {
    code: 'AGR',
    name: 'Department of Agriculture and Natural Resources',
    programs: [
      { code: 'PLS', name: 'Plant Sciences' },
      { code: 'ANS', name: 'Animal Sciences' },
      { code: 'HORT', name: 'Horticulture' },
    ],
  },
  {
    code: 'NS',
    name: 'Department of Natural Sciences',
    programs: [
      { code: 'MATH', name: 'Mathematics' },
      { code: 'BIO', name: 'Biology' },
      { code: 'CHEM', name: 'Chemistry' },
    ],
  },
  {
    code: 'SS',
    name: 'Department of Social Sciences',
    programs: [
      { code: 'SOC', name: 'Sociology' },
      { code: 'PSY', name: 'Psychology' },
      { code: 'PSIR', name: 'Political Science and International Relations' },
    ],
  },
  {
    code: 'EDU',
    name: 'Department of Education',
    programs: [
      { code: 'EDPM', name: 'Educational Planning and Management' },
      { code: 'SNIE', name: 'Special Needs and Inclusive Education' },
      { code: 'TE', name: 'Teacher Education' },
    ],
  },
  {
    code: 'HT',
    name: 'Department of Hospitality and Tourism',
    programs: [
      { code: 'HM', name: 'Hotel Management' },
      { code: 'TM', name: 'Tourism Management' },
      { code: 'HSPM', name: 'Hospitality Management' },
    ],
  },
  {
    code: 'LAW',
    name: 'Department of Law',
    programs: [
      { code: 'LLB', name: 'Law' },
      { code: 'GS', name: 'Governance Studies' },
      { code: 'HRS', name: 'Human Rights Studies' },
    ],
  },
];

const STUDENT_TEMPLATES = [
  { first: 'Abebe', last: 'Kebede', sex: 'male', phone: '+251911100001', marks: { assignment: 20, project: 20, quizzes: 29, presentation: 15, attendance: 10, bonus: 4 } }, // 98 (A+, 4.00)
  { first: 'Almaz', last: 'Tadesse', sex: 'female', phone: '+251911100002', marks: { assignment: 19, project: 19, quizzes: 28, presentation: 14, attendance: 10, bonus: 3 } }, // 93 (A+, 4.00)
  { first: 'Biniam', last: 'Hailu', sex: 'male', phone: '+251911100003', marks: { assignment: 18, project: 18, quizzes: 26, presentation: 14, attendance: 10, bonus: 2 } }, // 88 (A, 4.00)
  { first: 'Bethlehem', last: 'Assefa', sex: 'female', phone: '+251911100004', marks: { assignment: 17, project: 17, quizzes: 25, presentation: 13, attendance: 10, bonus: 1 } }, // 83 (A-, 3.75)
  { first: 'Chala', last: 'Bekele', sex: 'male', phone: '+251911100005', marks: { assignment: 16, project: 16, quizzes: 24, presentation: 12, attendance: 10, bonus: 0 } }, // 78 (B+, 3.50)
];

// 30 days in Tikimt: Oct 11, 2019 to Nov 9, 2019
const TIKIMT_DATES = [];
for (let d = 11; d <= 31; d++) {
  const dayStr = String(d).padStart(2, '0');
  TIKIMT_DATES.push({
    dateKey: `2019-10-${dayStr}`,
    date: new Date(`2019-10-${dayStr}T08:00:00.000Z`),
  });
}
for (let d = 1; d <= 9; d++) {
  const dayStr = String(d).padStart(2, '0');
  TIKIMT_DATES.push({
    dateKey: `2019-11-${dayStr}`,
    date: new Date(`2019-11-${dayStr}T08:00:00.000Z`),
  });
}

function calculateGrade(rawMark, gradingPolicy) {
  if (gradingPolicy?.bands?.length) {
    const band = findBand(gradingPolicy, rawMark);
    if (band) return { letter: band.letter, points: band.points, pass: band.pass };
  }
  if (rawMark >= 90) return { letter: 'A+', points: 4.0, pass: true };
  if (rawMark >= 85) return { letter: 'A', points: 4.0, pass: true };
  if (rawMark >= 80) return { letter: 'A-', points: 3.75, pass: true };
  if (rawMark >= 75) return { letter: 'B+', points: 3.5, pass: true };
  if (rawMark >= 70) return { letter: 'B', points: 3.0, pass: true };
  if (rawMark >= 65) return { letter: 'B-', points: 2.75, pass: true };
  if (rawMark >= 60) return { letter: 'C+', points: 2.5, pass: true };
  if (rawMark >= 50) return { letter: 'C', points: 2.0, pass: true };
  if (rawMark >= 45) return { letter: 'C-', points: 1.5, pass: true };
  if (rawMark >= 40) return { letter: 'D', points: 1.0, pass: true };
  if (rawMark >= 30) return { letter: 'Fx', points: 0.0, pass: false };
  return { letter: 'F', points: 0.0, pass: false };
}

async function main() {
  console.log('Connecting to database...');
  await connectDB();
  console.log('Database connected.');

  // Clean up previous institutional data (preserving Users and GradingPolicy as requested)
  console.log('Clearing previous records to ensure pristine seed...');
  await Promise.all([
    Student.deleteMany({}),
    CourseOffering.deleteMany({}),
    CourseRegistration.deleteMany({}),
    AttendanceRecord.deleteMany({}),
    AttendanceSheet.deleteMany({}),
    Result.deleteMany({}),
    CourseMarkPolicy.deleteMany({}),
    Batch.deleteMany({}),
    Program.deleteMany({}),
    Course.deleteMany({}),
    Department.deleteMany({}),
    TeacherProgramAssignment.deleteMany({}),
  ]);
  console.log('Previous data cleared.');

  // 1. Academic Years
  console.log('--- Step 1: Academic Years ---');
  const year2019 = await AcademicYear.findOneAndUpdate(
    { label: '2019' },
    {
      $set: {
        label: '2019',
        startDate: new Date('2019-01-01'),
        endDate: new Date('2019-11-02'),
        isCurrent: true,
        status: 'active',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  console.log(`Academic Year 2019 (Active, Current): ${year2019._id}`);

  const year2020 = await AcademicYear.findOneAndUpdate(
    { label: '2020' },
    {
      $set: {
        label: '2020',
        startDate: new Date('2020-01-01'),
        endDate: new Date('2020-10-30'),
        isCurrent: false,
        status: 'planned',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  console.log(`Academic Year 2020 (Planned): ${year2020._id}`);

  // 2. Teacher One
  console.log('\n--- Step 2: Teacher One ---');
  let teacherOne = await User.findOne(
    ownFilter({ email: { $in: ['teacher.one@gmail.com', 'teacher@gmail.com'] } }),
  );
  if (!teacherOne) {
    teacherOne = await User.findOne({ role: 'TEACHER', status: 'active', deletedAt: null });
  }
  if (!teacherOne) {
    teacherOne = await User.create({
      name: 'Teacher One',
      email: 'teacher.one@gmail.com',
      role: 'TEACHER',
      status: 'active',
      emailVerified: true,
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$dummypasswordhash123',
    });
    console.log(`Created Teacher One: ${teacherOne.email}`);
  } else {
    teacherOne.name = 'Teacher One';
    teacherOne.status = 'active';
    await teacherOne.save();
    console.log(`Found/Updated Teacher One: ${teacherOne.name} (${teacherOne.email})`);
  }

  // 3. Certificate Template
  console.log('\n--- Step 3: Certificate Template ---');
  const certTemplate = await CertificateTemplate.findOneAndUpdate(
    { name: 'Graduation Certificate Template' },
    {
      $setOnInsert: {
        name: 'Graduation Certificate Template',
        version: 1,
        active: true,
        institutionName: 'College of Higher Education',
        institutionNameAmharic: 'የከፍተኛ ትምህርት ኮሌጅ',
        certificateTitle: 'Certificate of Graduation',
        certificatePrefix: 'CERT',
        signatoryName: 'Dr. Abebe Bekele',
        signatoryTitle: 'Dean & Academic Registrar',
        photoPolicy: 'optional',
        theme: { primary: '#123b2d', accent: '#b38b4d', paper: '#fffdf7' },
        seal: { url: '/assets/Graduation_certificate_template.jpg', filePath: 'Graduation_certificate_template.jpg' },
        signature: { url: '/assets/Graduation_certificate_template.jpg', filePath: 'Graduation_certificate_template.jpg' },
        verificationBaseUrl: 'http://localhost:5173/verify',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  console.log(`Certificate template active: ${certTemplate.name} (v${certTemplate.version})`);

  // 4. Grading Policy
  const gradingPolicy = await GradingPolicy.findOne({ key: 'global' }).lean();

  // 5. Seed Departments, Programmes, Batches, Offerings, Students, Marks, Attendance
  console.log('\n--- Step 4: Seeding 10 Departments, 30 Programmes, Batches & Students ---');
  let totalProgrammesCount = 0;
  let totalStudentsCount = 0;
  let totalOfferingsCount = 0;

  for (const deptData of DEPARTMENTS_DATA) {
    console.log(`\nProcessing Department: ${deptData.name} (${deptData.code})`);

    const deptDoc = await Department.findOneAndUpdate(
      { code: deptData.code },
      {
        $set: {
          name: deptData.name,
          active: true,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    for (const progData of deptData.programs) {
      totalProgrammesCount++;
      const progDoc = await Program.findOneAndUpdate(
        { code: progData.code },
        {
          $set: {
            name: progData.name,
            department: deptDoc._id,
            qualificationType: 'degree',
            durationYears: 4,
            categories: ['regular', 'extension'],
            active: true,
          },
          $addToSet: {
            teachers: teacherOne._id,
            academicYears: year2019._id,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      // Assign teacher to program
      await TeacherProgramAssignment.findOneAndUpdate(
        { teacher: teacherOne._id, program: progDoc._id },
        { $set: { status: 'active', source: 'program', assignedAt: new Date() } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      // Create Regular and Extension Batches
      const regBatch = await Batch.findOneAndUpdate(
        { code: 'REG-2019', program: progDoc._id, category: 'regular' },
        {
          $set: {
            name: `${progData.name} Batch 2019 Regular`,
            department: deptDoc._id,
            admissionAcademicYear: year2019._id,
            currentLevel: 1,
            durationYears: 4,
            status: 'active',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      await Batch.findOneAndUpdate(
        { code: 'EXT-2019', program: progDoc._id, category: 'extension' },
        {
          $set: {
            name: `${progData.name} Batch 2019 Extension`,
            department: deptDoc._id,
            admissionAcademicYear: year2019._id,
            currentLevel: 1,
            durationYears: 4,
            status: 'active',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      // 1st Year Course
      const courseCode = `${progData.code}-101`;
      const courseTitle = `${progData.name} Fundamentals I`;
      const courseDoc = await Course.findOneAndUpdate(
        { code: courseCode },
        {
          $set: {
            title: courseTitle,
            department: deptDoc._id,
            program: progDoc._id,
            creditHours: 3,
            active: true,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      // Course Offering for Regular Batch
      totalOfferingsCount++;
      const offering = await CourseOffering.findOneAndUpdate(
        {
          course: courseDoc._id,
          program: progDoc._id,
          batch: regBatch._id,
        },
        {
          $set: {
            department: deptDoc._id,
            academicYear: year2019._id,
            term: 'Semester 1',
            level: 1,
            creditHours: 3,
            teacher: teacherOne._id,
            category: 'regular',
            capacity: 60,
            registeredCount: 5,
            status: 'open',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      // Course Mark Policy (Assignment: 20, Project: 20, Quizzes: 30, Presentation: 15, Attendance: 10, Bonus: 5 = 100)
      const policyWeights = {
        assignment: 20,
        project: 20,
        assessments: 20,
        quizzes: 30,
        presentation: 15,
        attendance: 10,
        bonus: 5,
      };
      await CourseMarkPolicy.findOneAndUpdate(
        { offering: offering._id },
        {
          $set: {
            teacher: teacherOne._id,
            weights: policyWeights,
            updatedBy: teacherOne._id,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      // 5 Students in batch REG-2019
      const enrolledStudents = [];
      for (let sIdx = 0; sIdx < STUDENT_TEMPLATES.length; sIdx++) {
        totalStudentsCount++;
        const item = STUDENT_TEMPLATES[sIdx];
        const num = String(sIdx + 1).padStart(3, '0');
        const sId = `${progData.code}-REG-2019-${num}`;
        const email = `${progData.code.toLowerCase()}.student${sIdx + 1}@gmail.com`;
        const phone = `+251911${String(totalStudentsCount).padStart(6, '0')}`;

        const studentDoc = await Student.findOneAndUpdate(
          { studentId: sId },
          {
            $set: {
              studentId: sId,
              firstName: item.first,
              lastName: item.last,
              fullName: `${item.first} ${item.last}`,
              sex: item.sex,
              email,
              phone,
              studentCategory: 'regular',
              department: deptDoc._id,
              program: progDoc._id,
              qualificationType: 'degree',
              batch: regBatch._id,
              admissionAcademicYear: year2019._id,
              level: 1,
              enrollmentStatus: 'active',
              studentStatus: 'active',
            },
          },
          { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
        );
        enrolledStudents.push({ student: studentDoc, marks: item.marks });

        // Course Registration
        await CourseRegistration.findOneAndUpdate(
          { student: studentDoc._id, offering: offering._id },
          {
            $set: {
              course: courseDoc._id,
              academicYear: year2019._id,
              term: 'Semester 1',
              status: 'registered',
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );

        // Course Marks and Results Calculation
        const components = [
          { name: 'Assignment', max: 20, score: item.marks.assignment },
          { name: 'Project', max: 20, score: item.marks.project },
          { name: 'Quizzes', max: 30, score: item.marks.quizzes },
          { name: 'Presentation', max: 15, score: item.marks.presentation },
          { name: 'Attendance', max: 10, score: item.marks.attendance },
          { name: 'Bonus', max: 5, score: item.marks.bonus },
        ];
        const totalMark = components.reduce((sum, c) => sum + Number(c.score || 0), 0);
        const { letter, points, pass } = calculateGrade(totalMark, gradingPolicy);

        await Result.findOneAndUpdate(
          { student: studentDoc._id, offering: offering._id },
          {
            $set: {
              course: courseDoc._id,
              academicYear: year2019._id,
              term: 'Semester 1',
              creditHours: 3,
              components,
              totalMark,
              letterGrade: letter,
              gradePoint: points,
              passed: pass,
              status: 'submitted', // submitted to registrar
              submittedAt: new Date(),
              enteredBy: teacherOne._id,
              gradingPolicyVersion: gradingPolicy?.version || 1,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );
      }

      // Attendance: 30 days in Tikimt
      for (const tDay of TIKIMT_DATES) {
        await AttendanceSheet.findOneAndUpdate(
          { offering: offering._id, dateKey: tDay.dateKey, period: 'day' },
          {
            $set: {
              date: tDay.date,
              status: 'finalized',
              createdBy: teacherOne._id,
              updatedBy: teacherOne._id,
              finalizedAt: tDay.date,
              finalizedBy: teacherOne._id,
            },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        );

        for (const { student } of enrolledStudents) {
          await AttendanceRecord.findOneAndUpdate(
            { offering: offering._id, student: student._id, date: tDay.date, period: 'day' },
            {
              $set: {
                status: 'present',
                markedBy: teacherOne._id,
                markedAt: tDay.date,
              },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true },
          );
        }
      }

      console.log(`  ✓ Programme ${progData.code} · ${progData.name}: 5 students seeded, marks submitted & 30-day Tikimt attendance recorded.`);
    }
  }

  console.log('\n==========================================');
  console.log('INSTITUTION SEEDING COMPLETED SUCCESSFULLY');
  console.log(`Total Departments: ${DEPARTMENTS_DATA.length}`);
  console.log(`Total Programmes: ${totalProgrammesCount}`);
  console.log(`Total Course Offerings: ${totalOfferingsCount}`);
  console.log(`Total Students Enrolled: ${totalStudentsCount}`);
  console.log('==========================================\n');

  await disconnectDB();
  console.log('Database disconnected.');
}

main().catch((err) => {
  console.error('Fatal error during seeding:', err);
  process.exit(1);
});
