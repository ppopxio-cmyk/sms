import { connectDB, disconnectDB } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { AcademicYear, Department, Program, Batch } from '../src/models/AcademicStructure.js';
import { Course } from '../src/models/AcademicStructure.js';
import { CourseOffering } from '../src/models/Offering.js';
import { CourseRegistration } from '../src/models/Offering.js';
import { Student, Enrollment } from '../src/models/Student.js';
import { AttendanceRecord, Result, GradingPolicy } from '../src/models/Records.js';
import { CourseMarkPolicy } from '../src/models/CourseMarkPolicy.js';
import { requireGradingPolicy, gradeFor } from '../src/services/grading.service.js';

async function seedExtension() {
  await connectDB();
  console.log('Connected to DB');

  // Clean any previous partial extension students
  const oldExtStudents = await Student.find({ studentCategory: 'extension' }).select('_id').lean();
  const oldExtIds = oldExtStudents.map((s) => s._id);
  if (oldExtIds.length) {
    await Enrollment.deleteMany({ student: { $in: oldExtIds } });
    await CourseRegistration.deleteMany({ student: { $in: oldExtIds } });
    await Result.deleteMany({ student: { $in: oldExtIds } });
    await AttendanceRecord.deleteMany({ student: { $in: oldExtIds } });
    await Student.deleteMany({ _id: { $in: oldExtIds } });
    console.log(`Cleaned up ${oldExtIds.length} previous partial extension students.`);
  }

  const ay2019 = await AcademicYear.findOne({ code: 'AY-2019' }).lean();
  if (!ay2019) throw new Error('Academic year 2019 not found');

  const teacher = await User.findOne({ role: 'TEACHER' }).lean();
  if (!teacher) throw new Error('Teacher not found');

  const extBatches = await Batch.find({ code: 'EXT-2019' }).populate('program').populate('department').lean();
  console.log('Found extension batches:', extBatches.length);

  const policy = await requireGradingPolicy();

  const allRegistrations = [];
  const allResults = [];
  const allAttendance = [];

  const firstNames = ['Dawit', 'Sara', 'Yared', 'Bethlehem', 'Ermias', 'Hanna', 'Kassahun', 'Lydia', 'Tadesse', 'Rahel'];
  const lastNames = ['Gebre', 'Alemu', 'Desta', 'Kebede', 'Mengistu', 'Worku', 'Tekle', 'Bekele', 'Haile', 'Tadesse'];

  let studentSeq = 0;
  for (const eb of extBatches) {
    const prog = eb.program;
    const dept = eb.department;
    console.log(`Processing Extension for Program: ${prog.code} (${prog.name})`);

    const offerings = await CourseOffering.find({ program: prog._id, batch: eb._id }).populate('course').lean();

    // Create 10 students
    const createdStudents = [];
    for (let i = 0; i < 10; i++) {
      const studentId = `EXT-${prog.code}-${String(i + 1).padStart(3, '0')}`;
      const fn = firstNames[i];
      const ln = lastNames[i];
      const sex = i % 2 === 0 ? 'male' : 'female';
      const cleanCode = studentId.toLowerCase().replace(/[^a-z0-9]/g, '');
      const student = await Student.create({
        studentId,
        firstName: fn,
        middleName: 'G.',
        lastName: ln,
        fullName: `${fn} G. ${ln}`,
        sex,
        dateOfBirth: new Date(1999, i, 10),
        email: `${cleanCode}2019@gmail.com`,
        phone: `+25192${String(1000000 + studentSeq).slice(1)}`,
        department: dept._id,
        program: prog._id,
        batch: eb._id,
        level: 1,
        studentCategory: 'extension',
        studentStatus: 'active',
        admissionDate: new Date('2019-09-01'),
        admissionAcademicYear: ay2019._id,
      });

      await Enrollment.create({
        student: student._id,
        program: prog._id,
        department: dept._id,
        batch: eb._id,
        qualificationType: prog.qualificationType,
        academicYear: ay2019._id,
        enrollmentDate: new Date('2019-09-01'),
        status: 'active',
        level: 1,
      });

      createdStudents.push(student);
      studentSeq++;
    }

    // Register students to course offerings & create marks & attendance
    for (const off of offerings) {
      await CourseMarkPolicy.findOneAndUpdate(
        { offering: off._id },
        {
          offering: off._id,
          teacher: teacher._id,
          weights: {
            assignment: 30,
            project: 20,
            quizzes: 20,
            bonus: 0,
            attendance: 10,
            presentation: 20,
          },
          updatedBy: teacher._id,
        },
        { upsert: true }
      );

      await CourseOffering.updateOne({ _id: off._id }, { $set: { teacher: teacher._id, status: 'open' } });

      for (const st of createdStudents) {
        allRegistrations.push({
          student: st._id,
          offering: off._id,
          course: off.course._id,
          academicYear: ay2019._id,
          term: 'Semester 1',
          creditHours: off.course.creditHours || 3,
          status: 'registered',
          registeredAt: new Date('2019-09-05'),
        });

        const aScore = 24 + (allResults.length % 6);
        const pScore = 16 + (allResults.length % 4);
        const qScore = 15 + (allResults.length % 5);
        const attScore = 9;
        const presScore = 16 + (allResults.length % 4);
        const totalMark = aScore + pScore + qScore + attScore + presScore;

        const band = gradeFor(policy, totalMark);

        allResults.push({
          student: st._id,
          offering: off._id,
          course: off.course._id,
          academicYear: ay2019._id,
          term: 'Semester 1',
          creditHours: off.course.creditHours || 3,
          components: [
            { name: 'Assignment', max: 30, score: aScore },
            { name: 'Project', max: 20, score: pScore },
            { name: 'Quizzes', max: 20, score: qScore },
            { name: 'Attendance', max: 10, score: attScore },
            { name: 'Presentation', max: 20, score: presScore },
          ],
          totalMark,
          letterGrade: band.letter,
          gradePoint: band.points,
          passed: band.pass,
          status: 'submitted',
          includeInGpa: true,
          gradingPolicyVersion: policy.version,
          enteredBy: teacher._id,
          submittedAt: new Date('2019-10-02'),
        });
      }

      // 20 attendance records per student
      const startDate = new Date('2019-09-02');
      let classCount = 0;
      for (let day = 0; day < 30 && classCount < 20; day++) {
        const d = new Date(startDate);
        d.setDate(d.getDate() + day);
        if (d.getDay() === 0 || d.getDay() === 6) continue;
        classCount++;

        for (const st of createdStudents) {
          allAttendance.push({
            offering: off._id,
            student: st._id,
            date: d,
            period: 'day',
            status: 'present',
            markedBy: teacher._id,
          });
        }
      }
    }
  }

  console.log(`Inserting ${allRegistrations.length} registrations...`);
  await CourseRegistration.insertMany(allRegistrations);

  console.log(`Inserting ${allResults.length} results...`);
  await Result.insertMany(allResults);

  console.log(`Inserting ${allAttendance.length} attendance records...`);
  await AttendanceRecord.insertMany(allAttendance);

  console.log(`\nExtension seeding complete!`);
  console.log(`Students: ${studentSeq}`);
  console.log(`Registrations: ${allRegistrations.length}`);
  console.log(`Results: ${allResults.length}`);
  console.log(`Attendance Records: ${allAttendance.length}`);

  await disconnectDB();
}

seedExtension().catch((err) => {
  console.error('Extension seed error:', err);
  process.exit(1);
});
