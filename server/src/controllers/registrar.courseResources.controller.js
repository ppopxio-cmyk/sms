import path from 'node:path';
import { CourseResource } from '../models/CourseResource.js';
import { Course, Program } from '../models/AcademicStructure.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';
import { audit } from '../services/audit.service.js';
import { notifyProgramTeachers } from '../services/notification.service.js';
import { ownFilter, searchFilter } from '../services/registrar.helpers.js';
import { deleteImage, signedImageUrl, uploadDocument, validateDocument } from '../services/imagekit.service.js';
import { logger } from '../utils/logger.js';

function resourceDto(row) {
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
    creditHours: row.creditHours ?? 3,
    fileName: row.fileName,
    contentType: row.contentType,
    bytes: row.bytes,
    url: signedImageUrl(row.filePath, { expiresIn: 21600 }),
    createdAt: row.createdAt,
  };
}

export const listCourseResources = asyncHandler(async (req, res) => {
  const query = req.valid.query;
  const filter = ownFilter({
    deletedAt: null,
    ...(query.program ? { program: query.program } : {}),
    ...(searchFilter(query.search, ['courseName', 'courseCode', 'fileName']) || {}),
  });
  const rows = await CourseResource.find(filter)
    .populate('program', 'code name')
    .populate('department', 'code name')
    .sort({ updatedAt: -1 })
    .limit(300)
    .lean();
  res.json({ resources: rows.map(resourceDto) });
});

export const uploadCourseResource = asyncHandler(async (req, res) => {
  const { program: programId, courseName, courseCode, filename, creditHours } = req.valid.query;
  const program = await Program.findById(programId).lean();
  if (!program) throw new AppError(400, 'PROGRAM_INVALID', 'Choose a valid programme.');
  if (!program.active) throw new AppError(409, 'PROGRAM_INACTIVE', 'That programme is inactive.');

  const safeName = path.basename(String(filename).split(/[\\/]/).pop()).replace(/[^\w.\- ]+/g, '_').slice(0, 160);
  if (!safeName || !path.extname(safeName)) {
    throw new AppError(400, 'FILENAME_REQUIRED', 'The uploaded file needs a name and extension.');
  }
  const info = validateDocument(req.body, safeName);
  const uploaded = await uploadDocument(req.body, {
    fileName: `${courseCode.replace(/[^\w\-]+/g, '_')}-${Date.now()}-${safeName}`,
    folder: `/courses/${program.code}`,
    contentType: info.contentType,
  });

  let resource;
  try {
    resource = await CourseResource.create({
      program: program._id,
      department: program.department,
      courseName: courseName.trim(),
      courseCode: courseCode.trim().toUpperCase(),
      creditHours: Number(creditHours) || 3,
      fileName: safeName,
      filePath: uploaded.filePath,
      fileId: uploaded.fileId,
      contentType: uploaded.contentType,
      bytes: uploaded.bytes,
      uploadedBy: req.user.id,
    });

    // Ensure the course exists in the academic catalogue
    await Course.findOneAndUpdate(
      { code: courseCode.trim().toUpperCase() },
      {
        $setOnInsert: {
          code: courseCode.trim().toUpperCase(),
          createdBy: req.user.id,
        },
        $set: {
          title: courseName.trim(),
          department: program.department,
          creditHours: Number(creditHours) || 3,
          active: true,
          updatedBy: req.user.id,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch((err) => {
      logger.warn({ err: err.message }, 'Could not sync course material to course catalogue');
    });
  } catch (err) {
    await deleteImage(uploaded.fileId).catch(() => {});
    throw err;
  }

  const populated = await CourseResource.findById(resource._id)
    .populate('program', 'code name')
    .populate('department', 'code name')
    .lean();
  audit({
    req,
    action: 'registrar.course_material.upload',
    targetType: 'CourseResource',
    targetId: resource._id,
    meta: { program: program.code, courseCode: resource.courseCode, fileName: safeName, bytes: resource.bytes },
  });
  void notifyProgramTeachers(program._id, {
    type: 'course_material',
    title: `${resource.courseCode} material published`,
    body: `${safeName} is available in your materials page.`,
    actorId: req.user.id,
    actorName: req.user.name || 'Registrar',
    meta: { program: program.code, courseCode: resource.courseCode, resourceId: String(resource._id) },
  }).catch(() => {});
  res.status(201).json({ resource: resourceDto(populated) });
});

export const removeCourseResource = asyncHandler(async (req, res) => {
  const resource = await CourseResource.findOneAndUpdate(
    { _id: req.valid.params.id, deletedAt: null },
    { $set: { deletedAt: new Date() } },
    { new: true },
  ).lean();
  if (!resource) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'That course material was not found.');
  await deleteImage(resource.fileId).catch((err) => {
    logger.warn({ err: err?.message, fileId: resource.fileId }, 'Could not delete course material from ImageKit');
  });
  audit({
    req,
    action: 'registrar.course_material.delete',
    targetType: 'CourseResource',
    targetId: resource._id,
    meta: { courseCode: resource.courseCode, fileName: resource.fileName },
  });
  res.json({ id: String(resource._id) });
});
