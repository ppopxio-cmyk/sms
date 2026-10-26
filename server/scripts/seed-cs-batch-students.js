import '../src/config/env.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { Department, Program, Batch, Course, AcademicYear } from '../src/models/AcademicStructure.js';
import { Student } from '../src/models/Student.js';
import { CourseOffering, CourseRegistration } from '../src/models/Offering.js';
import { CourseMarkPolicy } from '../src/models/CourseMarkPolicy.js';
import { Result, GradingPolicy, findBand } from '../src/models/Records.js';
import { User } from '../src/models/User.js';
import { TeacherProgramAssignment } from '../src/models/Teaching.js';

import { ownFilter } from '../src/services/registrar.helpers.js';

async function main() {
  console.log('Connecting to database...');
  await connectDB();
  console.log('Connected.');

  // 1. Department & Academic Year
  let dept = await Department.findOne({ code: 'IT' });
  if (!dept) {
    dept = await Department.findOne() || await Department.create({
      code: 'IT',
      name: 'Information Technology',
      active: true,
    });
  }

  let academicYear = await AcademicYear.findOne({ isCurrent: true });
  if (!academicYear) {
    academicYear = await AcademicYear.findOne() || await AcademicYear.create({
      label: '2026/27',
      code: 'AY-2026-2027',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2027-06-30'),
      isCurrent: true,
      status: 'active',
    });
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
    console.log('Created Program: CS - Computer Science');
  } else {
    program.active = true;
    await program.save();
    console.log(`Found Program: ${program.code} - ${program.name}`);
  }

  // 3. Batch REG-2019
  let batch = await Batch.findOne({ code: 'REG-2019', program: program._id });
  if (!batch) {
    batch = await Batch.findOne({ code: 'REG-2019' });
    if (batch && String(batch.program) !== String(program._id)) {
      // Create specifically for CS if not linked
      batch = null;
    }
  }
  if (!batch) {
    batch = await Batch.create({
      code: 'REG-2019',
      name: 'Batch 2019 Regular',
      program: program._id,
      admissionAcademicYear: academicYear._id,
      category: 'regular',
      currentLevel: 1,
      status: 'active',
    });
    console.log('Created Batch: REG-2019 (regular) for CS');
  } else {
    batch.status = 'active';
    batch.currentLevel = 1;
    await batch.save();
    console.log(`Found Batch: ${batch.code} (${batch.category})`);
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

  // Assign teacher to program CS
  await TeacherProgramAssignment.findOneAndUpdate(
    { teacher: teacher._id, program: program._id },
    { $set: { status: 'active', source: 'program', assignedAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await Program.updateOne(
    { _id: program._id },
    { $addToSet: { teachers: teacher._id }, $set: { active: true } },
  );

  // 5. Course CS-001 · Hotel Management System Full Project Plan
  let course = await Course.findOne({ code: 'CS-001' });
  if (!course) {
    course = await Course.create({
      code: 'CS-001',
      title: 'Hotel Management System Full Project Plan',
      department: dept._id,
      creditHours: 3,
      active: true,
      createdBy: teacher._id,
    });
    console.log('Created Course: CS-001 · Hotel Management System Full Project Plan');
  } else {
    course.title = 'Hotel Management System Full Project Plan';
    course.active = true;
    await course.save();
    console.log(`Found Course: ${course.code} · ${course.title}`);
  }

  // 6. CourseOffering
  let offering = await CourseOffering.findOne({
    course: course._id,
    program: program._id,
    batch: batch._id,
  });
  if (!offering) {
    offering = await CourseOffering.create({
      course: course._id,
      program: program._id,
      department: dept._id,
      academicYear: academicYear._id,
      term: 'Semester 1',
      level: 1,
      creditHours: 3,
      teacher: teacher._id,
      batch: batch._id,
      category: 'regular',
      capacity: 60,
      registeredCount: 10,
      status: 'open',
      createdBy: teacher._id,
      updatedBy: teacher._id,
    });
    console.log('Created CourseOffering for CS-001');
  } else {
    offering.teacher = teacher._id;
    offering.status = 'open';
    offering.batch = batch._id;
    offering.category = 'regular';
    offering.level = 1;
    offering.registeredCount = 10;
    await offering.save();
    console.log('Updated existing CourseOffering for CS-001');
  }

  // 7. CourseMarkPolicy
  const policyWeights = {
    assignment: 20,
    project: 20,
    assessments: 20,
    quizzes: 30,
    presentation: 15,
    attendance: 10,
    bonus: 5,
  };

  const markPolicy = await CourseMarkPolicy.findOneAndUpdate(
    { offering: offering._id },
    {
      $set: {
        teacher: teacher._id,
        weights: policyWeights,
        updatedBy: teacher._id,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  console.log('Saved CourseMarkPolicy:', markPolicy.weights);

  // 8. 10 Students in batch REG-2019, programme CS Year 1
  const studentData = [
    { first: 'Abebe', last: 'Kebede', sex: 'male', phone: '+251911000001', marks: { assignment: 20, project: 19, quizzes: 29, presentation: 14, attendance: 10, bonus: 4 } },
    { first: 'Almaz', last: 'Tadesse', sex: 'female', phone: '+251911000002', marks: { assignment: 19, project: 19, quizzes: 27, presentation: 14, attendance: 10, bonus: 3 } },
    { first: 'Biniam', last: 'Hailu', sex: 'male', phone: '+251911000003', marks: { assignment: 18, project: 18, quizzes: 26, presentation: 13, attendance: 9, bonus: 3 } },
    { first: 'Bethlehem', last: 'Assefa', sex: 'female', phone: '+251911000004', marks: { assignment: 17, project: 17, quizzes: 25, presentation: 12, attendance: 9, bonus: 2 } },
    { first: 'Chala', last: 'Bekele', sex: 'male', phone: '+251911000005', marks: { assignment: 16, project: 16, quizzes: 23, presentation: 12, attendance: 8, bonus: 2 } },
    { first: 'Derartu', last: 'Tulu', sex: 'female', phone: '+251911000006', marks: { assignment: 15, project: 15, quizzes: 22, presentation: 11, attendance: 8, bonus: 2 } },
    { first: 'Ephrem', last: 'Tamiru', sex: 'male', phone: '+251911000007', marks: { assignment: 14, project: 14, quizzes: 20, presentation: 10, attendance: 7, bonus: 2 } },
    { first: 'Fasika', last: 'Mulugeta', sex: 'female', phone: '+251911000008', marks: { assignment: 13, project: 13, quizzes: 18, presentation: 9, attendance: 7, bonus: 2 } },
    { first: 'Girma', last: 'Wolde', sex: 'male', phone: '+251911000009', marks: { assignment: 18, project: 18, quizzes: 26, presentation: 13, attendance: 10, bonus: 3 } },
    { first: 'Hanan', last: 'Mohammed', sex: 'female', phone: '+251911000010', marks: { assignment: 18, project: 17, quizzes: 25, presentation: 13, attendance: 9, bonus: 3 } },
  ];

  const students = [];
  for (let i = 0; i < studentData.length; i++) {
    const item = studentData[i];
    const num = String(i + 1).padStart(3, '0');
    const sId = `CS-REG-2019-${num}`;
    const email = `${item.first.toLowerCase()}.${item.last.toLowerCase()}${num}@gmail.com`;

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
          phone: item.phone,
          studentCategory: 'regular',
          department: dept._id,
          program: program._id,
          qualificationType: 'degree',
          batch: batch._id,
          admissionAcademicYear: academicYear._id,
          level: 1,
          enrollmentStatus: 'active',
          studentStatus: 'active',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    students.push({ student: studentDoc, marks: item.marks });

    // Register student to offering
    await CourseRegistration.findOneAndUpdate(
      { student: studentDoc._id, offering: offering._id },
      {
        $set: {
          course: course._id,
          academicYear: academicYear._id,
          term: 'Semester 1',
          status: 'registered',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }
  console.log(`Successfully registered ${students.length} students to CS-001.`);

  // 9. Grading Policy letter/point lookup
  const gradingPolicy = await GradingPolicy.findOne({ key: 'global' }).lean();

  function calculateGrade(rawMark) {
    if (gradingPolicy?.bands?.length) {
      const band = findBand(gradingPolicy, rawMark);
      if (band) return { letter: band.letter, points: band.points, pass: band.pass };
    }
    // Fallback standard grading policy requested by user:
    // ≥ 90%: A+ (4.00), 85-89%: A (4.00), 80-84%: A- (3.75), 75-79%: B+ (3.50), 70-74%: B (3.00), 65-69%: B- (2.75), 60-64%: C+ (2.50), 50-59%: C (2.00)
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

  // 10. Results: Insert marks for all students, calculate total, and submit to registrar
  console.log('\nInserting marks and calculating totals:');
  for (const { student, marks } of students) {
    const components = [
      { name: 'Assignment', max: 20, score: marks.assignment },
      { name: 'Project', max: 20, score: marks.project },
      { name: 'Quizzes', max: 30, score: marks.quizzes },
      { name: 'Presentation', max: 15, score: marks.presentation },
      { name: 'Attendance', max: 10, score: marks.attendance },
      { name: 'Bonus', max: 5, score: marks.bonus },
    ];

    const totalMark = components.reduce((sum, c) => sum + Number(c.score || 0), 0);
    const { letter, points, pass } = calculateGrade(totalMark);

    const result = await Result.findOneAndUpdate(
      { student: student._id, offering: offering._id },
      {
        $set: {
          course: course._id,
          academicYear: academicYear._id,
          term: 'Semester 1',
          creditHours: 3,
          components,
          totalMark,
          letterGrade: letter,
          gradePoint: points,
          passed: pass,
          status: 'submitted', // Submitted to registrar
          submittedAt: new Date(),
          enteredBy: teacher._id,
          gradingPolicyVersion: gradingPolicy?.version || 1,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    console.log(
      ` - ${student.studentId} (${student.fullName}): Total = ${totalMark}/100, Grade = ${letter} (${points.toFixed(2)} pts), Status = submitted`
    );
  }

  console.log('\nAll 10 student marks calculated and successfully submitted to the registrar!');
  await disconnectDB();
  console.log('Database disconnected.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
