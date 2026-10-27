import '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { Department, Program, Batch, Course, AcademicYear } from '../src/models/AcademicStructure.js';
import { Student, Enrollment } from '../src/models/Student.js';
import { CourseOffering, CourseRegistration } from '../src/models/Offering.js';
import { CourseMarkPolicy } from '../src/models/CourseMarkPolicy.js';
import { Result, GradingPolicy, findBand } from '../src/models/Records.js';
import { User } from '../src/models/User.js';
import { TeacherProgramAssignment } from '../src/models/Teaching.js';
import { ownFilter } from '../src/services/registrar.helpers.js';

async function main() {
  console.log('Connecting to database...');
  await connectDB();
  console.log('Connected to database.');

  // 1. Department CIT
  let dept = await Department.findOne({ code: 'CIT' });
  if (!dept) {
    dept = await Department.findOne({ code: /CIT/i });
  }
  if (!dept) {
    dept = await Department.create({
      code: 'CIT',
      name: 'Department of Computing and Information Technology',
      active: true,
    });
    console.log('Created Department: CIT');
  } else {
    dept.name = 'Department of Computing and Information Technology';
    dept.active = true;
    await dept.save();
    console.log(`Found Department: ${dept.code} - ${dept.name}`);
  }

  // Academic Year
  let academicYear = await AcademicYear.findOne({ isCurrent: true });
  if (!academicYear) {
    academicYear = (await AcademicYear.findOne()) || (await AcademicYear.create({
      label: '2026/27',
      code: 'AY-2026-2027',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-06-30'),
      isCurrent: true,
      status: 'active',
    }));
  }

  // 2. Program CS · Computer Science
  let program = await Program.findOne(ownFilter({ code: { $in: ['CS', 'cs'] } }));
  if (!program) {
    program = await Program.findOne({ name: /computer science/i });
  }
  if (!program) {
    program = await Program.create({
      code: 'CS',
      name: 'Computer Science',
      department: dept._id,
      qualificationType: 'degree',
      durationYears: 4,
      active: true,
    });
    console.log('Created Program: CS');
  } else {
    program.department = dept._id;
    program.durationYears = 4;
    program.qualificationType = 'degree';
    program.active = true;
    await program.save();
    console.log(`Found Program: ${program.code} - ${program.name}`);
  }

  // 3. Batches: REG-2019 and EXT-2019
  let regBatch = await Batch.findOne({ code: 'REG-2019', program: program._id });
  if (!regBatch) {
    regBatch = await Batch.create({
      code: 'REG-2019',
      name: 'Computer Science Batch 2019 Regular',
      program: program._id,
      admissionAcademicYear: academicYear._id,
      category: 'regular',
      currentLevel: 1,
      status: 'active',
    });
    console.log('Created Batch: REG-2019 (regular)');
  } else {
    regBatch.status = 'active';
    await regBatch.save();
    console.log(`Found Batch: ${regBatch.code}`);
  }

  // 4. Teacher
  let teacher = await User.findOne(ownFilter({ role: { $in: ['TEACHER', 'teacher'] }, status: 'active', deletedAt: null }));
  if (!teacher) {
    teacher = await User.create({
      name: 'Dawit Mengistu',
      email: 'teacher.cs@gmail.com',
      role: 'TEACHER',
      status: 'active',
      emailVerified: true,
      passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummy$dummypasswordhash123',
    });
    console.log('Created Teacher:', teacher.email);
  } else {
    console.log(`Found Teacher: ${teacher.name} (${teacher.email})`);
  }

  await TeacherProgramAssignment.findOneAndUpdate(
    { teacher: teacher._id, program: program._id },
    { $set: { status: 'active', source: 'program', assignedAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await Program.updateOne(
    { _id: program._id },
    { $addToSet: { teachers: teacher._id }, $set: { active: true } },
  );

  // 5. 10 Students in REG-2019
  const studentSeeds = [
    { first: 'Abebe', last: 'Kebede', sex: 'male', dob: '2001-03-12', phone: '+251911000016', baseScore: 94 },
    { first: 'Almaz', last: 'Tadesse', sex: 'female', dob: '2001-07-25', phone: '+251911000017', baseScore: 92 },
    { first: 'Biniam', last: 'Hailu', sex: 'male', dob: '2000-11-04', phone: '+251911000018', baseScore: 88 },
    { first: 'Bethlehem', last: 'Assefa', sex: 'female', dob: '2001-01-19', phone: '+251911000019', baseScore: 86 },
    { first: 'Chala', last: 'Bekele', sex: 'male', dob: '2001-09-30', phone: '+251911000020', baseScore: 84 },
    { first: 'Derartu', last: 'Tulu', sex: 'female', dob: '2000-08-15', phone: '+251911000506', baseScore: 82 },
    { first: 'Ephrem', last: 'Tamiru', sex: 'male', dob: '2001-04-22', phone: '+251911000507', baseScore: 80 },
    { first: 'Fasika', last: 'Mulugeta', sex: 'female', dob: '2001-12-08', phone: '+251911000508', baseScore: 78 },
    { first: 'Girma', last: 'Wolde', sex: 'male', dob: '2000-06-17', phone: '+251911000509', baseScore: 90 },
    { first: 'Hanan', last: 'Mohammed', sex: 'female', dob: '2001-10-03', phone: '+251911000510', baseScore: 89 },
  ];

  const students = [];
  const admissionDate = new Date('2019-09-15');

  for (let i = 0; i < studentSeeds.length; i++) {
    const s = studentSeeds[i];
    const num = String(i + 1).padStart(3, '0');
    const studentId = `CS-REG-2019-${num}`;
    const email = `${s.first.toLowerCase()}.${s.last.toLowerCase()}${num}@gmail.com`;

    const studentDoc = await Student.findOneAndUpdate(
      { studentId },
      {
        $set: {
          studentId,
          firstName: s.first,
          lastName: s.last,
          fullName: `${s.first} ${s.last}`,
          sex: s.sex,
          dateOfBirth: new Date(s.dob),
          email,
          phone: s.phone,
          studentCategory: 'regular',
          department: dept._id,
          program: program._id,
          qualificationType: 'degree',
          batch: regBatch._id,
          admissionAcademicYear: academicYear._id,
          admissionDate,
          level: 1,
          enrollmentStatus: 'active',
          studentStatus: 'active',
        },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );

    // Create Enrollment record
    await Enrollment.findOneAndUpdate(
      { student: studentDoc._id, batch: regBatch._id },
      {
        $set: {
          student: studentDoc._id,
          program: program._id,
          department: dept._id,
          batch: regBatch._id,
          academicYear: academicYear._id,
          status: 'active',
          category: 'regular',
          level: 1,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    students.push({ doc: studentDoc, seed: s });
  }
  console.log(`Upserted ${students.length} students in CS batch REG-2019.`);

  // 6. Courses for All 4 Years
  const coursesPlan = [
    // Year 1
    { code: 'CS-101', title: 'Computer Science Fundamentals I', level: 1, creditHours: 3, term: 'Semester 1' },
    { code: 'CS-102', title: 'Discrete Mathematics and Graph Theory', level: 1, creditHours: 3, term: 'Semester 1' },
    { code: 'CS-103', title: 'Digital Logic and Computer Systems', level: 1, creditHours: 3, term: 'Semester 2' },
    // Year 2
    { code: 'CS-201', title: 'Data Structures and Algorithm Analysis', level: 2, creditHours: 4, term: 'Semester 1' },
    { code: 'CS-202', title: 'Object-Oriented Programming with Java', level: 2, creditHours: 3, term: 'Semester 1' },
    { code: 'CS-203', title: 'Computer Organization and Architecture', level: 2, creditHours: 3, term: 'Semester 2' },
    // Year 3
    { code: 'CS-301', title: 'Database Management Systems & SQL', level: 3, creditHours: 4, term: 'Semester 1' },
    { code: 'CS-302', title: 'Operating Systems and Systems Programming', level: 3, creditHours: 4, term: 'Semester 1' },
    { code: 'CS-303', title: 'Software Engineering Principles', level: 3, creditHours: 3, term: 'Semester 2' },
    // Year 4
    { code: 'CS-401', title: 'Computer Networks and Cyber Security', level: 4, creditHours: 4, term: 'Semester 1' },
    { code: 'CS-402', title: 'Artificial Intelligence and Neural Systems', level: 4, creditHours: 3, term: 'Semester 1' },
    { code: 'CS-403', title: 'Senior Capstone Project', level: 4, creditHours: 4, term: 'Semester 2' },
  ];

  // Grading Policy lookup
  const gradingPolicy = await GradingPolicy.findOne({ key: 'global' }).lean();

  function calculateGrade(rawMark) {
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
    return { letter: 'F', points: 0.0, pass: false };
  }

  const defaultWeights = {
    assignment: 20,
    project: 20,
    assessments: 20,
    quizzes: 30,
    presentation: 15,
    attendance: 10,
    bonus: 5,
  };

  console.log('\nCreating Courses, Offerings, Policies, and Submitting Marks for all 4 Years:');

  for (const cInfo of coursesPlan) {
    // 1. Course
    const courseDoc = await Course.findOneAndUpdate(
      { code: cInfo.code },
      {
        $set: {
          code: cInfo.code,
          title: cInfo.title,
          department: dept._id,
          creditHours: cInfo.creditHours,
          active: true,
          createdBy: teacher._id,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    // 2. Offering
    const offeringDoc = await CourseOffering.findOneAndUpdate(
      {
        course: courseDoc._id,
        program: program._id,
        batch: regBatch._id,
      },
      {
        $set: {
          course: courseDoc._id,
          program: program._id,
          department: dept._id,
          academicYear: academicYear._id,
          term: cInfo.term,
          level: cInfo.level,
          creditHours: cInfo.creditHours,
          teacher: teacher._id,
          batch: regBatch._id,
          category: 'regular',
          capacity: 60,
          registeredCount: students.length,
          status: 'open',
          createdBy: teacher._id,
          updatedBy: teacher._id,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    // 3. Mark Policy
    await CourseMarkPolicy.findOneAndUpdate(
      { offering: offeringDoc._id },
      {
        $set: {
          teacher: teacher._id,
          weights: defaultWeights,
          updatedBy: teacher._id,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    // 4. Enroll all students & submit marks
    for (const { doc: studentDoc, seed } of students) {
      await CourseRegistration.findOneAndUpdate(
        { student: studentDoc._id, offering: offeringDoc._id },
        {
          $set: {
            course: courseDoc._id,
            academicYear: academicYear._id,
            term: cInfo.term,
            status: 'registered',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      // Distribute marks based on student's baseScore with slight course-specific variation
      const variance = (cInfo.level * 2 + cInfo.creditHours) % 5 - 2; // -2 to +2
      const rawTotal = Math.min(100, Math.max(50, seed.baseScore + variance));

      const ratio = rawTotal / 100;
      const assignmentScore = Math.round(20 * ratio * 10) / 10;
      const projectScore = Math.round(20 * ratio * 10) / 10;
      const quizzesScore = Math.round(30 * ratio * 10) / 10;
      const presentationScore = Math.round(15 * ratio * 10) / 10;
      const attendanceScore = Math.round(10 * ratio * 10) / 10;
      const bonusScore = Math.round(5 * ratio * 10) / 10;

      const components = [
        { name: 'Assignment', max: 20, score: assignmentScore },
        { name: 'Project', max: 20, score: projectScore },
        { name: 'Quizzes', max: 30, score: quizzesScore },
        { name: 'Presentation', max: 15, score: presentationScore },
        { name: 'Attendance', max: 10, score: attendanceScore },
        { name: 'Bonus', max: 5, score: bonusScore },
      ];

      const computedTotal = Math.min(100, Math.round(assignmentScore + projectScore + quizzesScore + presentationScore + attendanceScore + bonusScore));
      const grade = calculateGrade(computedTotal);

      await Result.findOneAndUpdate(
        { student: studentDoc._id, offering: offeringDoc._id },
        {
          $set: {
            course: courseDoc._id,
            academicYear: academicYear._id,
            term: cInfo.term,
            creditHours: cInfo.creditHours,
            components,
            totalMark: computedTotal,
            letterGrade: grade.letter,
            gradePoint: grade.points,
            passed: grade.pass,
            status: 'submitted', // submitted to registrar
            submittedAt: new Date(),
            enteredBy: teacher._id,
            gradingPolicyVersion: gradingPolicy?.version || 1,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }

    console.log(` - [Year ${cInfo.level}] ${cInfo.code} (${cInfo.title}): 10 student marks submitted.`);
  }

  console.log('\nBulk seeding complete! All 4 years of CS courses and marks have been submitted.');
  await disconnectDB();
  console.log('Database disconnected.');
}

main().catch((err) => {
  console.error('Fatal error during seeding:', err);
  process.exit(1);
});
