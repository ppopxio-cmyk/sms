import { getPolicy, requirePolicy, updatePolicy as updatePolicyService, previewMarks, history } from '../services/gradingPolicy.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/AppError.js';

export const viewPolicy = asyncHandler(async (req, res) => {
  // Reading the policy must not fail when there is not one yet: an unconfigured
  // college is a normal state the Registrar has to be able to open and fill in.
  const policy = await getPolicy();
  if (!policy?.bands?.length) {
    return res.json({ unconfigured: true, bands: [] });
  }
  return res.json({
    unconfigured: false,
    version: policy.version,
    bands: policy.bands,
    repeatPolicy: policy.repeatPolicy,
    rounding: policy.rounding,
    effectiveFrom: policy.effectiveFrom,
    updatedAt: policy.updatedAt,
  });
});

export const updatePolicy = asyncHandler(async (req, res) => {
  const { bands, repeatPolicy, rounding, effectiveFrom, reason } = req.body;
  if (!Array.isArray(bands) || !bands.length) {
    throw new AppError(400, 'INVALID_BANDS', 'Grade bands are required and must be an array.');
  }
  const result = await updatePolicyService({ bands, repeatPolicy, rounding, effectiveFrom, reason, req });
  res.json({
    policy: result.policy,
    changed: result.changed,
    message: result.changed ? 'Grading policy updated successfully.' : 'No changes detected.',
  });
});

export const previewPolicy = asyncHandler(async (req, res) => {
  const { marks } = req.body;
  if (!Array.isArray(marks) || !marks.length) {
    throw new AppError(400, 'MARKS_REQUIRED', 'Enter at least one mark to preview.');
  }
  const policy = await requirePolicy();
  const results = previewMarks(policy, marks);
  res.json({ results });
});

export const policyHistory = asyncHandler(async (req, res) => {
  const entries = await history();
  res.json({ entries });
});