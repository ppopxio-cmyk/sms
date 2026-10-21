import { asyncHandler } from '../utils/asyncHandler.js';
import { audit } from '../services/audit.service.js';
import {
  createMaterial,
  deleteMaterial,
  listMaterials,
  updateMaterial,
} from '../services/teacherMaterial.service.js';

export const list = asyncHandler(async (req, res) => {
  res.json(await listMaterials(req.user.id, req.valid.query));
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
