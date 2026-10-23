import { Program } from '../models/AcademicStructure.js';
import { TeacherProgramAssignment } from '../models/Teaching.js';
import { notifyUser } from './notification.service.js';
import { ownFilter } from './registrar.helpers.js';
import { AppError } from '../utils/AppError.js';

const idOf = (value) => String(value?._id ?? value ?? '');

export async function activeProgramIdsForTeacher(teacherId) {
  const rows = await TeacherProgramAssignment.find(
    ownFilter({ teacher: teacherId, status: 'active' }),
  )
    .select('program')
    .lean();

  let ids = rows.map((row) => idOf(row.program)).filter(Boolean);

  // Existing databases were written before the assignment model existed. Keep those
  // teachers working until the one-time backfill has run.
  if (!ids.length) {
    const legacy = await Program.find(
      ownFilter({ teachers: teacherId, active: { $ne: false } }),
    )
      .select('_id')
      .lean();
    ids = legacy.map((row) => idOf(row._id));
  }

  return [...new Set(ids)];
}

export async function activeProgramsForTeacher(teacherId) {
  const ids = await activeProgramIdsForTeacher(teacherId);
  if (!ids.length) return [];
  return Program.find(ownFilter({ _id: { $in: ids }, active: { $ne: false } }))
    .select('code name qualificationType department')
    .populate('department', 'code name')
    .sort({ code: 1 })
    .lean();
}

export async function assertProgramRead(teacherId, programId) {
  const ids = await activeProgramIdsForTeacher(teacherId);
  if (!ids.some((id) => String(id) === String(programId))) {
    throw new AppError(404, 'PROGRAM_NOT_FOUND', 'That programme was not found in your workspace.');
  }
}

export function canManageOffering(teacherId, offering) {
  const owner = offering?.teacher?._id ?? offering?.teacher;
  return Boolean(owner) && String(owner) === String(teacherId);
}

export async function teacherOfferingFilter(teacherId, { write = false } = {}) {
  const programIds = write ? [] : await activeProgramIdsForTeacher(teacherId);
  const branches = [{ teacher: teacherId }];
  if (programIds.length) branches.push({ program: { $in: programIds } });
  return ownFilter({ $or: branches });
}

export async function syncProgramTeachers({
  program,
  programId,
  teacherIds = [],
  actorId = null,
  source = 'program',
} = {}) {
  const target = await (program
    ? Promise.resolve(program)
    : Program.findById(programId).lean());
  if (!target) throw new AppError(404, 'PROGRAM_NOT_FOUND', 'That programme was not found.');

  const desired = [...new Set(teacherIds.map(String).filter(Boolean))];
  const current = await TeacherProgramAssignment.find(
    ownFilter({ program: target._id, status: 'active' }),
  )
    .select('teacher')
    .lean();
  const before = new Set(current.map((row) => String(row.teacher)));
  const wanted = new Set(desired);

  const added = desired.filter((id) => !before.has(id));
  const removed = [...before].filter((id) => !wanted.has(id));

  await Promise.all(
    desired.map((teacher) =>
      TeacherProgramAssignment.findOneAndUpdate(
        { teacher, program: target._id },
        {
          $set: {
            status: 'active',
            source,
            assignedBy: actorId,
            assignedAt: new Date(),
            revokedBy: null,
            revokedAt: null,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      ),
    ),
  );

  if (removed.length) {
    await TeacherProgramAssignment.updateMany(
      { program: target._id, teacher: { $in: removed }, status: 'active' },
      { $set: { status: 'revoked', revokedBy: actorId, revokedAt: new Date() } },
    );
  }

  await Program.updateOne(
    { _id: target._id },
    { $set: { teachers: desired, updatedBy: actorId } },
  );

  if (added.length) {
    await Promise.all(
      added.map((teacherId) =>
        notifyUser(teacherId, {
          type: 'program_assigned',
          title: `You were assigned to ${target.code}`,
          body: `${target.name} is now in your programme workspace. Classes and students in this programme are visible to you.`,
          actorId,
          actorName: 'Registrar',
          meta: { programId: String(target._id), program: target.code, source },
        }),
      ),
    );
  }

  return { added, removed, program: target };
}

export async function backfillTeacherProgramAssignments({ actorId = null } = {}) {
  const programs = await Program.find({ teachers: { $exists: true, $ne: [] } })
    .select('_id teachers code name')
    .lean();

  const result = { programs: 0, assigned: 0, revoked: 0 };
  for (const program of programs) {
    const { added, removed } = await syncProgramTeachers({
      program,
      teacherIds: program.teachers,
      actorId,
      source: 'backfill',
    });
    result.programs += 1;
    result.assigned += added.length;
    result.revoked += removed.length;
  }
  return result;
}
