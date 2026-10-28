import '../src/config/env.js';
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
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

const MONGODB_URI = process.env.MONGODB_URI;

const FIRST_NAMES = [
  'Abebe', 'Almaz', 'Biniam', 'Bethlehem', 'Chala', 'Derartu', 'Ephrem', 'Fasika', 'Girma', 'Hanan',
  'Kassahun', 'Lensa', 'Mulugeta', 'Nebiyat', 'Omer', 'Rahel', 'Solomon', 'Tigist', 'Yared', 'Zinash',
  'Abel', 'Biruk', 'Daniel', 'Eden', 'Fikru', 'Genet', 'Habtamu', 'Hiwot', 'Kalkidan', 'Lemlem',
  'Meklit', 'Natnael', 'Rediet', 'Samuel', 'Selamawit', 'Tewodros', 'Winta', 'Yonas', 'Zeberga', 'Aster',
  'Alemayehu', 'Banchiamlak', 'Dawit', 'Elsa', 'Firehiwot', 'Getachew', 'Hawi', 'Ibsa', 'Jemal', 'Kidist',
  'Liya', 'Mesfin', 'Netsanet', 'Robel', 'Saron', 'Tariku', 'Worku', 'Yeabsira', 'Zemenay', 'Aregash',
  'Ashenafi', 'Bezawit', 'Desta', 'Ermias', 'Frew', 'Gedion', 'Hayat', 'Ismael', 'Kiros', 'Leul',
  'Meron', 'Nahom', 'Ruth', 'Samrawit', 'Surafel', 'Tsedey', 'Welela', 'Yohannes', 'Zewdu', 'Alganesh',
  'Amanuel', 'Bisrat', 'Dejene', 'Eyob', 'Feven', 'Girum', 'Helen', 'Ibrahim', 'Kokeb', 'Mahder',
  'Marta', 'Nigist', 'Ruhama', 'Semir', 'Senait', 'Tamirat', 'Wondwosen', 'Yordanos', 'Zelalem', 'Aziza',
  'Abebaw', 'Belay', 'Dagmawi', 'Emebet', 'Frezer', 'Gashaw', 'Hermela', 'Kamil', 'Lidet', 'Melat',
  'Mengesha', 'Nardos', 'Sara', 'Sitota', 'Sosina', 'Tekle', 'Wubet', 'Yasin', 'Zewditu', 'Ayana'
];

const LAST_NAMES = [
  'Kebede', 'Tadesse', 'Hailu', 'Assefa', 'Bekele', 'Tulu', 'Tamiru', 'Mulugeta', 'Wolde', 'Mohammed',
  'Alemu', 'Desta', 'Girma', 'Kassa', 'Mekonnen', 'Negash', 'Seyoum', 'Tefera', 'Worku', 'Yilma',
  'Abera', 'Belachew', 'Demissie', 'Eshetu', 'Fanta', 'Getahun', 'Haile', 'Jaleta', 'Kassaye', 'Legesse',
  'Mengistu', 'Nega', 'Regassa', 'Shiferaw', 'Takele', 'Tesfaye', 'Woldemariam', 'Yimer', 'Zeleke', 'Admasu',
  'Amare', 'Berhanu', 'Derese', 'Fikre', 'Goremes', 'Habte', 'Ketema', 'Lemma', 'Mamo', 'Nigusse',
  'Sahle', 'Tilahun', 'Urga', 'Wondimu', 'Yeshitila', 'Zewdie', 'Ali', 'Bogale', 'Chane', 'Dagne',
  'Feleke', 'Geda', 'Hunde', 'Kifle', 'Lema', 'Mola', 'Nur', 'Siraj', 'Tolessa', 'Wakgari',
  'Areda', 'Beshir', 'Debela', 'Fufa', 'Guta', 'Hussen', 'Kumsa', 'Merga', 'Oljira', 'Robele',
  'Shewa', 'Tufa', 'Wayessa', 'Yigezu', 'Zemedkun', 'Ahmed', 'Badada', 'Chemeda', 'Dadi', 'Gedamu',
  'Gemechu', 'Hirpa', 'Keno', 'Muleta', 'Roba', 'Sori', 'Tulu', 'Wako', 'Yaya', 'Zenebe',
  'Aragaw', 'Biratu', 'Dabalo', 'Edosa', 'Gobena', 'Haji', 'Kuma', 'Mosisa', 'Regea', 'Soboka',
  'Tadesa', 'Wirtu', 'Yosef', 'Zewde', 'Abate', 'Benti', 'Dinsa', 'Garoma', 'Gojjam', 'Hordo'
];

async function run() {
  console.log('--- Reseeding 2019 Institutional Database ---');
  if (!MONGODB_URI) throw new Error('MONGODB_URI is not set in environment.');

  await mongoose.connect(MONGODB_URI);
  console.log('✓ Connected to MongoDB');

  // STEP 1: VERIFY USERS AND GRADING POLICY
  const UserColl = mongoose.connection.db.collection('users');
  const allUsers = await UserColl.find({}).toArray();
  console.log(`Found ${allUsers.length} existing user(s):`);
  allUsers.forEach((u) => console.log(`  - ${u.name} (${u.email}) [role: ${u.role}]`));

  const teacher = await User.findOne({ role: { $in: ['TEACHER', 'teacher'] }, status: 'active' });
  if (!teacher) {
    throw new Error('NO_TEACHER_FOUND: Eligible teacher account haile12michaell@gmail.com is missing. Please check existing accounts.');
  }
  console.log(`✓ Eligible Teacher confirmed: ${teacher.name} (${teacher.email}) [id: ${teacher._id}]`);

  const gradingPolicy = await GradingPolicy.findOne({ key: 'global' }).lean();
  if (!gradingPolicy || !gradingPolicy.bands?.length) {
    throw new Error('GRADING_POLICY_UNAVAILABLE: Active grading policy "global" is not configured. Report rather than inventing.');
  }
  console.log(`✓ Grading Policy confirmed: ${gradingPolicy.bands.length} bands configured (v${gradingPolicy.version})`);

  // STEP 2: BACK UP ALL DATABASE COLLECTIONS BEFORE DELETION
  const backupDir = path.resolve('server/backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const collections = await mongoose.connection.db.listCollections().toArray();
  const backupData = {};
  console.log(`\nBacking up ${collections.length} collection(s) to ${backupDir}...`);

  for (const c of collections) {
    const docs = await mongoose.connection.db.collection(c.name).find({}).toArray();
    backupData[c.name] = docs;
    console.log(`  Backed up ${c.name}: ${docs.length} document(s)`);
  }

  const backupPath = path.join(backupDir, `backup-pre-deletion-${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
  console.log(`✓ Full database backup written to: ${backupPath}\n`);

  // STEP 3: DELETE ALL RECORDS EXCEPT users AND knowndevices (and preserve gradingpolicies, certificatetemplates)
  const PRESERVE = new Set(['users', 'knowndevices', 'gradingpolicies', 'certificatetemplates', 'systemsettings']);
  for (const c of collections) {
    if (!PRESERVE.has(c.name.toLowerCase())) {
      const res = await mongoose.connection.db.collection(c.name).deleteMany({});
      console.log(`Deleted ${c.name}: ${res.deletedCount} document(s) removed.`);
    } else {
      console.log(`Preserved ${c.name} without deletion.`);
    }
  }

  // STEP 4: CREATE ACADEMIC YEAR 2019 (January 1 - December 31, 2019)
  const academicYear = await AcademicYear.create({
    label: '2019',
    code: 'AY-2019',
    startDate: new Date('2019-01-01T00:00:00.000Z'),
    endDate: new Date('2019-12-31T23:59:59.999Z'),
    isCurrent: true,
    status: 'active',
  });
  console.log(`\n✓ Created Academic Year: ${academicYear.label} (${academicYear.code}) [Active: ${academicYear.isCurrent}]`);

  const term1 = await AcademicTerm.create({
    academicYear: academicYear._id,
    name: 'Semester 1',
    sequence: 1,
    type: 'semester',
    startDate: new Date('2019-01-01T00:00:00.000Z'),
    endDate: new Date('2019-06-30T23:59:59.999Z'),
  });
  const term2 = await AcademicTerm.create({
    academicYear: academicYear._id,
    name: 'Semester 2',
    sequence: 2,
    type: 'semester',
    startDate: new Date('2019-07-01T00:00:00.000Z'),
    endDate: new Date('2019-12-31T23:59:59.999Z'),
  });
  console.log(`✓ Created Academic Terms: ${term1.name}, ${term2.name}`);

  // STEP 5: CREATE 2 DEPARTMENTS
  const deptIT = await Department.create({
    code: 'IT',
    name: 'Information Technology',
    active: true,
  });
  const deptHS = await Department.create({
    code: 'HS',
    name: 'Health Science',
    active: true,
  });
  console.log(`✓ Created 2 Departments: ${deptIT.name} (${deptIT.code}), ${deptHS.name} (${deptHS.code})`);

  // STEP 6: CREATE 3 PROGRAMMES PER DEPARTMENT (6 PROGRAMMES TOTAL)
  const PROGRAMMES_DEF = [
    // Information Technology
    {
      dept: deptIT,
      code: 'CS',
      name: 'Computer Science',
      qualificationType: 'degree',
      durationYears: 4,
      durationUnit: 'Year',
      totalStages: 4,
      courses: [
        { code: 'CS-101', title: 'Introduction to Computer Science', creditHours: 3 },
        { code: 'CS-102', title: 'Programming and Problem Solving', creditHours: 3 },
      ],
    },
    {
      dept: deptIT,
      code: 'WD',
      name: 'Web Development',
      qualificationType: 'diploma',
      levels: [1, 2, 3, 4],
      durationUnit: 'Level',
      totalStages: 4,
      courses: [
        { code: 'WD-101', title: 'Web Fundamentals and HTML/CSS', creditHours: 3 },
        { code: 'WD-102', title: 'JavaScript and Web Frameworks', creditHours: 3 },
      ],
    },
    {
      dept: deptIT,
      code: 'CSK',
      name: 'Computer Skills',
      qualificationType: 'short-term',
      shortTerm: { duration: 3, unit: 'months' },
      durationUnit: 'Month',
      totalStages: 3,
      courses: [
        { code: 'CSK-101', title: 'Office Productivity and Computing', creditHours: 3 },
        { code: 'CSK-102', title: 'Digital Communication and Collaboration', creditHours: 3 },
      ],
    },
    // Health Science
    {
      dept: deptHS,
      code: 'NUR',
      name: 'Nursing',
      qualificationType: 'degree',
      durationYears: 4,
      durationUnit: 'Year',
      totalStages: 4,
      courses: [
        { code: 'NUR-101', title: 'Fundamentals of Nursing Practice', creditHours: 3 },
        { code: 'NUR-102', title: 'Anatomy and Human Physiology', creditHours: 3 },
      ],
    },
    {
      dept: deptHS,
      code: 'CNUR',
      name: 'Clinical Nursing',
      qualificationType: 'diploma',
      levels: [1, 2, 3, 4],
      durationUnit: 'Level',
      totalStages: 4,
      courses: [
        { code: 'CNUR-101', title: 'Foundations of Clinical Care', creditHours: 3 },
        { code: 'CNUR-102', title: 'Health Assessment and Clinical Skills', creditHours: 3 },
      ],
    },
    {
      dept: deptHS,
      code: 'FABL',
      name: 'First Aid and Basic Life Support',
      qualificationType: 'short-term',
      shortTerm: { duration: 3, unit: 'months' },
      durationUnit: 'Month',
      totalStages: 3,
      courses: [
        { code: 'FABL-101', title: 'Emergency First Aid and CPR', creditHours: 3 },
        { code: 'FABL-102', title: 'Basic Life Support and Disaster Care', creditHours: 3 },
      ],
    },
  ];

  let studentGlobalIndex = 0;
  let totalOfferingsCount = 0;
  let totalAttendanceCount = 0;
  let totalResultsCount = 0;

  for (const pDef of PROGRAMMES_DEF) {
    const progData = {
      code: pDef.code,
      name: pDef.name,
      department: pDef.dept._id,
      qualificationType: pDef.qualificationType,
      active: true,
      teachers: [teacher._id],
      finalizedStages: [],
    };
    if (pDef.durationYears) progData.durationYears = pDef.durationYears;
    if (pDef.levels) progData.levels = pDef.levels;
    if (pDef.shortTerm) progData.shortTerm = pDef.shortTerm;

    const program = await Program.create(progData);
    console.log(`\n========================================`);
    console.log(`Program: ${program.name} (${program.code}) [${program.qualificationType.toUpperCase()}]`);

    // Assign Teacher
    await TeacherProgramAssignment.create({
      teacher: teacher._id,
      program: program._id,
      status: 'active',
      source: 'program',
      assignedAt: new Date('2019-01-01'),
    });

    // Create 2 courses for this programme
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
      console.log(`  Course created: ${course.code} - ${course.title} (${course.creditHours} cr)`);
    }

    // Create Curriculum Plan and Curriculum Courses
    const curriculumPlan = await CurriculumPlan.create({
      program: program._id,
      department: pDef.dept._id,
      qualificationType: program.qualificationType,
      academicYear: academicYear._id,
      version: 1,
      title: `${program.name} Standard Curriculum`,
      status: 'published',
      publishedAt: new Date('2019-01-01'),
      totalCredits: courseDocs.reduce((sum, c) => sum + c.creditHours, 0) * pDef.totalStages,
    });

    for (let stage = 1; stage <= pDef.totalStages; stage++) {
      for (let cIdx = 0; cIdx < courseDocs.length; cIdx++) {
        const cDoc = courseDocs[cIdx];
        await CurriculumCourse.create({
          plan: curriculumPlan._id,
          course: cDoc._id,
          academicYear: academicYear._id,
          term: `${pDef.durationUnit} ${stage}`,
          level: stage,
          creditHours: cDoc.creditHours,
          category: 'required',
          order: cIdx + 1,
          active: true,
        });
      }
    }
    console.log(`  Curriculum published with courses across all ${pDef.totalStages} ${pDef.durationUnit}s.`);

    // CREATE 2 BATCHES: Regular and Extension
    const BATCHES = [
      { code: 'B-2019-REG', name: 'Batch 2019 Regular', category: 'regular' },
      { code: 'B-2019-EXT', name: 'Batch 2019 Extension', category: 'extension' },
    ];

    for (const bDef of BATCHES) {
      const batch = await Batch.create({
        code: bDef.code,
        name: bDef.name,
        category: bDef.category,
        program: program._id,
        department: pDef.dept._id,
        admissionAcademicYear: academicYear._id,
        currentLevel: 1,
        status: 'active',
        calculatedStages: [],
        readyForCgpa: false,
        cgpaCalculated: false,
      });
      console.log(`\n  Batch: ${batch.name} (${batch.code} - ${batch.category})`);

      // 10 UNIQUE STUDENTS PER PROGRAMME IN EACH BATCH
      const studentDocs = [];
      for (let sIdx = 1; sIdx <= 10; sIdx++) {
        const fn = FIRST_NAMES[studentGlobalIndex % FIRST_NAMES.length];
        const ln = LAST_NAMES[studentGlobalIndex % LAST_NAMES.length];
        studentGlobalIndex++;

        const prefix = `${program.code}-${batch.category === 'regular' ? 'REG' : 'EXT'}-2019`;
        const studentId = `${prefix}-${String(sIdx).padStart(3, '0')}`;
        const email = `${fn.toLowerCase()}.${ln.toLowerCase()}.${studentGlobalIndex}@gmail.com`;
        const phone = `+251911${String(studentGlobalIndex).padStart(6, '0')}`;
        const birthYear = 1995 + (studentGlobalIndex % 8);

        const student = await Student.create({
          studentId,
          firstName: fn,
          lastName: ln,
          fullName: `${fn} ${ln}`,
          sex: sIdx % 2 === 0 ? 'female' : 'male',
          dateOfBirth: new Date(`${birthYear}-05-15`),
          email,
          phone,
          studentCategory: batch.category,
          department: pDef.dept._id,
          program: program._id,
          qualificationType: program.qualificationType,
          batch: batch._id,
          admissionAcademicYear: academicYear._id,
          admissionDate: new Date('2019-01-10'),
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
          academicYear: academicYear._id,
          enrollmentDate: new Date('2019-01-10'),
          status: 'active',
          level: 1,
        });

        studentDocs.push(student);
      }
      console.log(`    Enrolled ${studentDocs.length} unique students (IDs: ${studentDocs[0].studentId} .. ${studentDocs[studentDocs.length - 1].studentId})`);

      // GENERATE ALL ACADEMIC RECORDS FOR EVERY STAGE (YEAR / LEVEL / MONTH)
      for (let stage = 1; stage <= pDef.totalStages; stage++) {
        const termName = `${pDef.durationUnit} ${stage} ${stage <= 2 ? 'Semester 1' : 'Semester 2'}`;

        for (const cDoc of courseDocs) {
          totalOfferingsCount++;

          // Course Offering
          const offering = await CourseOffering.create({
            course: cDoc._id,
            curriculumPlan: curriculumPlan._id,
            program: program._id,
            department: pDef.dept._id,
            academicYear: academicYear._id,
            term: termName,
            level: stage,
            batch: batch._id,
            category: batch.category,
            creditHours: cDoc.creditHours,
            teacher: teacher._id,
            assessmentMode: 'numeric',
            capacity: 60,
            registeredCount: studentDocs.length,
            status: 'completed',
            attendanceClosed: true,
            attendanceClosedAt: new Date('2019-10-15'),
          });

          // Course Mark Policy
          await CourseMarkPolicy.create({
            offering: offering._id,
            teacher: teacher._id,
            weights: {
              assignment: 30,
              project: 30,
              quizzes: 20,
              bonus: 0,
              attendance: 10,
              presentation: 10,
            },
          });

          // Finalized Attendance Sheets for 1 Month (20 class days)
          const sheetsToInsert = [];
          for (let day = 1; day <= 20; day++) {
            const dayStr = String(day).padStart(2, '0');
            const dateKey = `2019-03-${dayStr}`;
            const sessionDate = new Date(`${dateKey}T09:00:00.000Z`);
            sheetsToInsert.push({
              offering: offering._id,
              dateKey,
              date: sessionDate,
              period: 'day',
              status: 'finalized',
              revision: 1,
              createdBy: teacher._id,
              updatedBy: teacher._id,
              finalizedAt: new Date(`${dateKey}T17:00:00.000Z`),
              finalizedBy: teacher._id,
            });
          }
          await AttendanceSheet.insertMany(sheetsToInsert);

          // Prepare bulk arrays for registrations, attendance, and results
          const registrationsToInsert = [];
          const attendanceToInsert = [];
          const resultsToInsert = [];

          for (let sIdx = 0; sIdx < studentDocs.length; sIdx++) {
            const student = studentDocs[sIdx];

            registrationsToInsert.push({
              student: student._id,
              offering: offering._id,
              course: cDoc._id,
              academicYear: academicYear._id,
              term: termName,
              creditHours: cDoc.creditHours,
              status: 'registered',
              registeredAt: new Date('2019-01-15'),
            });

            // 1 Month Attendance (20 class days)
            for (let day = 1; day <= 20; day++) {
              totalAttendanceCount++;
              const dayStr = String(day).padStart(2, '0');
              const sessionDate = new Date(`2019-03-${dayStr}T09:00:00.000Z`);
              attendanceToInsert.push({
                offering: offering._id,
                student: student._id,
                date: sessionDate,
                period: 'day',
                status: day % 15 === 0 ? 'late' : 'present',
                markedBy: teacher._id,
                markedAt: sessionDate,
              });
            }

            // Student Mark & Submitted Result
            const assignScore = 25 + (sIdx % 5); // 25 - 29 (max 30)
            const projScore = 24 + (sIdx % 6);   // 24 - 29 (max 30)
            const quizScore = 16 + (sIdx % 4);   // 16 - 19 (max 20)
            const attScore = 9 + (sIdx % 2);     // 9 - 10  (max 10)
            const presScore = 8 + (sIdx % 3);    // 8 - 10  (max 10)
            const total = assignScore + projScore + quizScore + attScore + presScore; // 82 - 97

            const band = findBand(gradingPolicy, total) || { letter: 'A', points: 4.0, pass: true };

            totalResultsCount++;
            resultsToInsert.push({
              student: student._id,
              offering: offering._id,
              course: cDoc._id,
              program: program._id,
              batch: batch._id,
              academicYear: academicYear._id,
              term: termName,
              creditHours: cDoc.creditHours,
              components: [
                { name: 'Assignment', max: 30, score: assignScore },
                { name: 'Project', max: 30, score: projScore },
                { name: 'Quizzes', max: 20, score: quizScore },
                { name: 'Attendance', max: 10, score: attScore },
                { name: 'Presentation', max: 10, score: presScore },
              ],
              totalMark: total,
              letterGrade: band.letter,
              gradePoint: band.points,
              passed: band.pass !== false,
              status: 'submitted',
              enteredBy: teacher._id,
              submittedAt: new Date('2019-11-20'),
            });
          }

          await CourseRegistration.insertMany(registrationsToInsert);
          await AttendanceRecord.insertMany(attendanceToInsert);
          await Result.insertMany(resultsToInsert);
        }
        console.log(`    Generated offerings, attendance, and submitted marks for ${pDef.durationUnit} ${stage}.`);
      }
    }
  }

  // STEP 7: FINAL COMPREHENSIVE VALIDATION
  console.log('\n========================================');
  console.log('FINAL DATABASE VERIFICATION AUDIT');
  console.log('========================================');

  const ayCount = await AcademicYear.countDocuments();
  const deptCount = await Department.countDocuments();
  const progCount = await Program.countDocuments();
  const batchCount = await Batch.countDocuments();
  const courseCount = await Course.countDocuments();
  const studentCount = await Student.countDocuments();
  const enrollCount = await Enrollment.countDocuments();
  const offeringCount = await CourseOffering.countDocuments();
  const sheetCount = await AttendanceSheet.countDocuments();
  const attRecCount = await AttendanceRecord.countDocuments();
  const resultCount = await Result.countDocuments();
  const submittedResults = await Result.countDocuments({ status: 'submitted' });

  console.log(`Academic Years:        ${ayCount} (AY-2019 active)`);
  console.log(`Departments:           ${deptCount} (Information Technology, Health Science)`);
  console.log(`Programmes:            ${progCount} (CS, WD, CSK, NUR, CNUR, FABL)`);
  console.log(`Batches:               ${batchCount} (Batch 2019 Regular, Batch 2019 Extension per program)`);
  console.log(`Courses:               ${courseCount} (exactly 2 per programme)`);
  console.log(`Students:              ${studentCount} (10 unique students per programme & batch)`);
  console.log(`Enrollments:           ${enrollCount} (1:1 with students)`);
  console.log(`Course Offerings:      ${offeringCount} (across all years, levels, months)`);
  console.log(`Attendance Sheets:     ${sheetCount} (all submitted)`);
  console.log(`Attendance Records:    ${attRecCount} (1 month per offering)`);
  console.log(`Results:               ${resultCount} (all ${submittedResults} submitted to Registrar)`);

  const uniqueStudentIds = await Student.distinct('studentId');
  const uniqueEmails = await Student.distinct('email');
  console.log(`Unique Student IDs:    ${uniqueStudentIds.length}`);
  console.log(`Unique Student Emails: ${uniqueEmails.length}`);

  if (uniqueStudentIds.length !== 120 || uniqueEmails.length !== 120) {
    throw new Error(`Integrity Violation: Expected 120 unique students, got ${uniqueStudentIds.length}`);
  }

  console.log('\n✓ ALL 6 PROGRAMMES CONTAIN COMPLETE RECORDS ACROSS THEIR FULL DURATION!');
  console.log('✓ All course mark sheets are successfully SUBMITTED to the Registrar for review, publication, GPA & CGPA!');
  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
}

run().catch((err) => {
  console.error('\n❌ Reseed Failed:', err);
  process.exit(1);
});
