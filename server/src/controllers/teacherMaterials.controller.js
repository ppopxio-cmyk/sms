import { asyncHandler } from '../utils/asyncHandler.js';
import { audit } from '../services/audit.service.js';
import { CurriculumPlan, CurriculumCourse } from '../models/Curriculum.js';
import { activeProgramIdsForTeacher } from '../services/teacherAccess.service.js';
import { ownFilter } from '../services/registrar.helpers.js';
import {
  createMaterial,
  deleteMaterial,
  listCourseResources,
  listMaterials,
  updateMaterial,
} from '../services/teacherMaterial.service.js';

export const list = asyncHandler(async (req, res) => {
  res.json(await listMaterials(req.user.id, req.valid.query));
});

export const sharedResources = asyncHandler(async (req, res) => {
  res.json(await listCourseResources(req.user.id, req.valid.query));
});

export const teacherCurriculum = asyncHandler(async (req, res) => {
  const teacherId = req.user.id;
  const programIds = await activeProgramIdsForTeacher(teacherId);
  const targetIds = req.query.program
    ? programIds.filter((id) => String(id) === String(req.query.program))
    : programIds;

  if (!targetIds.length) {
    return res.json({ plans: [] });
  }

  const plans = await CurriculumPlan.find(ownFilter({
    program: { $in: targetIds },
    status: 'published',
  }))
    .populate('program', 'code name qualificationType durationYears levels')
    .populate('academicYear', 'label isCurrent')
    .sort({ createdAt: -1 })
    .lean();

  const planIds = plans.map((p) => p._id);
  const courses = await CurriculumCourse.find(ownFilter({
    plan: { $in: planIds },
    active: true,
  }))
    .populate('course', 'code title creditHours')
    .sort({ level: 1, term: 1, order: 1 })
    .lean();

  const coursesByPlan = new Map();
  for (const c of courses) {
    const key = String(c.plan);
    if (!coursesByPlan.has(key)) coursesByPlan.set(key, []);
    coursesByPlan.get(key).push({
      id: String(c._id),
      code: c.course?.code || '',
      title: c.course?.title || '',
      creditHours: c.creditHours || c.course?.creditHours || 3,
      level: c.level,
      term: c.term,
      category: c.category,
    });
  }

  const result = plans.map((p) => ({
    id: String(p._id),
    title: p.title,
    program: p.program ? {
      id: String(p.program._id),
      code: p.program.code,
      name: p.program.name,
      qualificationType: p.program.qualificationType,
    } : null,
    academicYear: p.academicYear ? {
      id: String(p.academicYear._id),
      label: p.academicYear.label,
    } : null,
    totalCredits: p.totalCredits,
    courses: coursesByPlan.get(String(p._id)) || [],
  }));

  res.json({ plans: result });
});

export const create = asyncHandler(async (req, res) => {
  const data = await createMaterial(req.user.id, req.body);
  audit({
    req,
    action: 'teacher.material_created',
    targetType: 'material',
    targetId: data.id,
    meta: { assignmentId: data.assignmentId, kind: data.kind, visibility: data.visibility },
  });
  res.status(201).json(data);
});

export const update = asyncHandler(async (req, res) => {
  const data = await updateMaterial(req.user.id, req.valid.params.materialId, req.body);
  audit({
    req,
    action: 'teacher.material_updated',
    targetType: 'material',
    targetId: data.id,
    meta: { assignmentId: data.assignmentId, kind: data.kind, visibility: data.visibility },
  });
  res.json(data);
});

export const remove = asyncHandler(async (req, res) => {
  const data = await deleteMaterial(req.user.id, req.valid.params.materialId);
  audit({
    req,
    action: 'teacher.material_deleted',
    targetType: 'material',
    targetId: data.id,
  });
  res.json(data);
});
