import mongoose from 'mongoose';
import '../src/config/env.js';
import { SystemSetting } from '../src/models/SystemSetting.js';
import { Student } from '../src/models/Student.js';
import { Program } from '../src/models/AcademicStructure.js';
import { Result } from '../src/models/Records.js';
import { CourseOffering } from '../src/models/Offering.js';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // 1. Update System Setting idleMinutes to 2880 (2 days)
  await SystemSetting.updateMany({}, {
    $set: {
      'security.idleMinutes': 2880,
    },
  });
  console.log('✓ SystemSetting security.idleMinutes set to 2880 (2 days)');

  // 2. Pre-load all programs, offerings and results in memory
  const programs = await Program.find({}).lean();
  const progMap = new Map(programs.map((p) => [String(p._id), p]));

  const offerings = await CourseOffering.find({}).select('_id level program').lean();
  const offLevelMap = new Map(offerings.map((o) => [String(o._id), o.level]));

  const allResults = await Result.find({}).select('student offering').lean();
  const studentStagesMap = new Map();
  for (const r of allResults) {
    const sId = String(r.student);
    const lvl = offLevelMap.get(String(r.offering));
    if (lvl) {
      if (!studentStagesMap.has(sId)) studentStagesMap.set(sId, new Set());
      studentStagesMap.get(sId).add(lvl);
    }
  }

  // 3. Update all students
  const students = await Student.find({}).lean();
  console.log(`Processing ${students.length} students...`);

  const bulkOps = [];
  for (const s of students) {
    const prog = progMap.get(String(s.program));
    let totalStages = 4;
    if (prog) {
      if (prog.qualificationType === 'degree') totalStages = prog.durationYears || 4;
      else if (prog.qualificationType === 'diploma') totalStages = prog.levels?.length ? Math.max(...prog.levels) : 4;
      else if (prog.shortTerm?.duration) totalStages = prog.shortTerm.duration;
    }

    const stageSet = studentStagesMap.get(String(s._id)) || new Set([1]);
    const stages = [...stageSet].sort((a, b) => a - b);
    const maxStage = stages.length > 0 ? Math.max(...stages) : 1;

    // "for example if that student is year 1 submitted make that student year 2 like that"
    // If student has stage 1 submitted, current level is 2.
    // If all stages are completed (e.g. 4 years submitted), level is 4 (or totalStages).
    const studentLevel = Math.min(totalStages, maxStage > 1 ? maxStage : 2);

    bulkOps.push({
      updateOne: {
        filter: { _id: s._id },
        update: {
          $set: {
            level: studentLevel,
            admissionDate: s.admissionDate || new Date('2019-01-10'),
            studentStatus: s.studentStatus === 'graduated' ? 'graduated' : 'active',
            enrollmentStatus: s.enrollmentStatus === 'completed' ? 'completed' : 'active',
          },
        },
      },
    });
  }

  if (bulkOps.length > 0) {
    const res = await Student.bulkWrite(bulkOps);
    console.log(`✓ Bulk updated ${res.modifiedCount} student records.`);
  }

  const sample = await Student.findOne().populate('program').lean();
  console.log('Sample updated student:', {
    studentId: sample.studentId,
    fullName: sample.fullName,
    level: sample.level,
    studentStatus: sample.studentStatus,
    admissionDate: sample.admissionDate,
    program: sample.program?.code,
  });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
