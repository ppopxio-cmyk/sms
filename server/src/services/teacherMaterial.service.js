import { Material } from '../models/Material.js';
import { CourseResource } from '../models/CourseResource.js';
import { CourseOffering } from '../models/Offering.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegex } from '../utils/text.js';
import {
  ASSIGNMENT_POPULATE,
  READ_STATUSES,
  assignmentForTeacher,
  assignmentForTeacherRead,
  assignmentIdsForTeacher,
  materialForTeacher,
} from './teacherScope.service.js';
import { ownFilter, searchFilter } from './registrar.helpers.js';
import { activeProgramIdsForTeacher } from './teacherAccess.service.js';
import { signedImageUrl } from './imagekit.service.js';

function materialDto(row) {
  const assignment = row.offering && typeof row.offering === 'object' ? row.offering : null;
  return {
    id: String(row._id),
    assignmentId: String(assignment?._id ?? row.offering),
    courseCode: assignment?.course?.code ?? '',
    courseTitle: assignment?.course?.title ?? '',
    academicYear: assignment?.academicYear?.label ?? '',
    term: assignment?.term ?? '',
    level: assignment?.level ?? null,
    kind: row.kind,
    title: row.title,
    description: row.description ?? '',
    content: row.content ?? '',
    url: row.url ?? '',
    visibility: row.visibility,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function validHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export async function listMaterials(teacherId, query) {
  const assignmentIds = await assignmentIdsForTeacher(teacherId);
  const match = { offering: { $in: assignmentIds }, deletedAt: null };
  if (query.assignmentId) match.offering = { $in: assignmentIds.filter((id) => String(id) === query.assignmentId) };
  if (query.kind !== 'all') match.kind = query.kind;
  if (query.visibility !== 'all') match.visibility = query.visibility;
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    match.$or = [{ title: rx }, { description: rx }];
  }

  const filter = ownFilter(match);
  const [total, rows] = await Promise.all([
    Material.countDocuments(filter),
    Material.find(filter)
      .populate({ path: 'offering', populate: ASSIGNMENT_POPULATE })
      .sort({ updatedAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
  ]);

  return {
    materials: rows.filter((row) => row.offering).map(materialDto),
    pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) },
  };
}

function courseResourceDto(row) {
  return {
    id: String(row._id),
    program: row.program
      ? { id: String(row.program._id), code: row.program.code, name: row.program.name }
      : null,
    department: row.department
      ? { id: String(row.department._id), code: row.department.code, name: row.department.name }
      : null,
    courseName: row.courseName,
    courseCode: row.courseCode,
    fileName: row.fileName,
    contentType: row.contentType,
    bytes: row.bytes,
    url: signedImageUrl(row.filePath, { expiresIn: 21600 }),
    createdAt: row.createdAt,
  };
}

export async function listCourseResources(teacherId, query = {}) {
  const programIds = await activeProgramIdsForTeacher(teacherId);
  const filters = [{ deletedAt: null }];

  if (query.assignmentId) {
    const assignment = await assignmentForTeacherRead(teacherId, query.assignmentId);
    const code = String(assignment.course?.code || '').trim().toUpperCase();
    filters.push({ program: assignment.program, ...(code ? { courseCode: code } : {}) });
  } else if (programIds.length) {
    filters.push({ program: { $in: programIds } });
  } else {
    const match = { teacher: teacherId, status: { $in: READ_STATUSES } };
    const assignments = await CourseOffering.find(ownFilter(match))
      .select('program course')
      .populate('course', 'code')
      .lean();
    const pairs = new Map();
    for (const row of assignments) {
      const code = String(row.course?.code || '').trim().toUpperCase();
      if (row.program && code) pairs.set(`${row.program}:${code}`, { program: row.program, courseCode: code });
    }
    if (!pairs.size) return { resources: [] };
    filters.push({ $or: [...pairs.values()] });
  }

  const search = searchFilter(query.search, ['courseName', 'courseCode', 'fileName']);
  if (search) filters.push(search);

  const rows = await CourseResource.find(ownFilter({ $and: filters }))
    .populate('program', 'code name')
    .populate('department', 'code name')
    .sort({ updatedAt: -1 })
    .limit(300)
    .lean();

  return { resources: rows.map(courseResourceDto) };
}

export async function createMaterial(teacherId, payload) {
  await assignmentForTeacher(teacherId, payload.assignmentId, { write: true });
  const created = await Material.create({
    offering: payload.assignmentId,
    kind: payload.kind,
    title: payload.title,
    description: payload.description,
    content: payload.kind === 'note' ? payload.content : '',
    url: payload.kind === 'link' ? payload.url : '',
    visibility: payload.visibility,
    createdBy: teacherId,
  });
  const populated = await Material.findById(created._id)
    .populate({ path: 'offering', populate: ASSIGNMENT_POPULATE })
    .lean();
  return materialDto(populated);
}

export async function updateMaterial(teacherId, materialId, payload) {
  const { material } = await materialForTeacher(teacherId, materialId, { write: true });

  const kind = payload.kind ?? material.kind;
  const content = payload.content ?? material.content ?? '';
  const url = payload.url ?? material.url ?? '';
  if (kind === 'note' && !content.trim()) {
    throw new AppError(400, 'MATERIAL_CONTENT_REQUIRED', 'Write the note before saving it.');
  }
  if (kind === 'link' && !validHttpUrl(url)) {
    throw new AppError(400, 'MATERIAL_URL_REQUIRED', 'Use a complete http or https link.');
  }

  const updated = await Material.findOneAndUpdate(
    { _id: material._id, deletedAt: null },
    {
      $set: {
        ...payload,
        content: kind === 'note' ? content : '',
        url: kind === 'link' ? url : '',
        updatedBy: teacherId,
      },
    },
    { new: true, runValidators: true },
  )
    .populate({ path: 'offering', populate: ASSIGNMENT_POPULATE })
    .lean();

  if (!updated) throw new AppError(404, 'MATERIAL_NOT_FOUND', 'That material was not found.');
  return materialDto(updated);
}

export async function deleteMaterial(teacherId, materialId) {
  const { material } = await materialForTeacher(teacherId, materialId, { write: true });
  await Material.updateOne(
    { _id: material._id, deletedAt: null },
    { $set: { deletedAt: new Date(), updatedBy: teacherId } },
  );
  return { id: String(material._id) };
}
