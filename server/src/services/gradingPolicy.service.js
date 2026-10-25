import { GradingPolicy } from '../models/Records.js';
import { AuditLog } from '../models/AuditLog.js';
import { audit } from './audit.service.js';
import { AppError } from '../utils/AppError.js';

// This module owns the Registrar-facing grading policy. The read side of grading lives
// in grading.service.js, which every result, transcript and CGPA calculation already
// goes through, so there is exactly one authority for how a mark becomes a grade.

export async function getPolicy() {
  return GradingPolicy.findOne({ key: 'global' }).lean();
}

// The policy is deliberately not created with guessed bands. Until a Registrar enters
// the college's approved values, the policy simply does not exist and every consumer
// has to say so rather than silently grading against invented defaults.
export async function requirePolicy() {
  const policy = await getPolicy();
  if (!policy?.bands?.length) {
    throw new AppError(
      409,
      'GRADING_POLICY_MISSING',
      'The grading policy has not been configured yet. A Registrar must enter the college’s approved grade bands first.',
    );
  }
  return policy;
}

// The bands are contiguous, cover 0 to 100 and never overlap. They are entered the way
// the college publishes them: 0–30, 31–40, 41–50. A shared boundary such as 0–30 and
// 30–40 is therefore rejected rather than silently double-counting mark 30.
export function validateBands(bands) {
  if (!Array.isArray(bands) || !bands.length) {
    throw new AppError(400, 'BANDS_EMPTY', 'At least one grade band is required.');
  }
  const sorted = [...bands].sort((a, b) => a.min - b.min);
  for (const band of sorted) {
    if (!Number.isInteger(band.min) || !Number.isInteger(band.max)) {
      throw new AppError(400, 'BAND_INTEGER', 'Grade band boundaries must be whole numbers.');
    }
    if (band.max < band.min) {
      throw new AppError(400, 'BAND_RANGE', 'A grade band maximum cannot be below its minimum.');
    }
  }
  if (sorted[0].min !== 0) throw new AppError(400, 'BANDS_START', 'The first grade band must start at 0.');
  if (sorted[sorted.length - 1].max !== 100) {
    throw new AppError(400, 'BANDS_END', 'The last grade band must end at 100.');
  }
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].min !== sorted[index - 1].max + 1) {
      throw new AppError(
        400,
        'BANDS_CONTIGUOUS',
        'Grade bands must be contiguous: the next band must start one mark after the previous band ends (for example 0–30, then 31–40).',
      );
    }
  }
  return sorted;
}

export function previewMarks(policy, marks) {
  const results = [];
  const bands = [...(policy.bands || [])].sort((a, b) => a.min - b.min);
  for (const mark of marks) {
    const value = Number(mark);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      results.push({ mark, error: 'A mark must be a number between 0 and 100.' });
      continue;
    }
    const index = bands.findIndex((entry, position) =>
      value >= entry.min && (bands[position + 1] ? value < bands[position + 1].min : value <= entry.max),
    );
    const band = bands[index];
    results.push({
      mark: value,
      letter: band?.letter ?? null,
      points: band?.points ?? null,
      pass: band?.pass ?? null,
      description: band?.description ?? '',
    });
  }
  return results;
}

const sameBands = (a, b) =>
  Array.isArray(a) &&
  Array.isArray(b) &&
  a.length === b.length &&
  a.every(
    (band, index) =>
      band.min === b[index].min &&
      band.max === b[index].max &&
      band.letter === b[index].letter &&
      Number(band.points) === Number(b[index].points) &&
      Boolean(band.pass) === Boolean(b[index].pass) &&
      String(band.description || '') === String(b[index].description || ''),
  );

export async function updatePolicy({ bands, repeatPolicy, rounding, effectiveFrom, reason, req }) {
  const normalized = validateBands(bands);
  const existing = await getPolicy();

  if (
    existing &&
    sameBands(existing.bands, normalized) &&
    existing.repeatPolicy === repeatPolicy &&
    existing.rounding === rounding
  ) {
    return { policy: existing, changed: false };
  }

  // Every save is a new version. Results already graded keep the version they were
  // graded under, so a later change never silently rewrites an approved result.
  const version = (existing?.version ?? 0) + 1;

  const policy = await GradingPolicy.findOneAndUpdate(
    { key: 'global' },
    {
      $set: {
        bands: normalized,
        repeatPolicy,
        rounding,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
        updatedBy: req.user.id,
      },
      $inc: { version },
    },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).lean();

  audit({
    req,
    action: 'registrar.grading_policy.update',
    targetType: 'GradingPolicy',
    targetId: policy._id,
    meta: {
      reason: reason || 'Grading policy updated',
      bands: normalized.length,
      version: policy.version,
      repeatPolicy,
      rounding,
    },
  });

  return { policy, changed: true };
}

export async function history() {
  return AuditLog.find({ action: 'registrar.grading_policy.update' })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
}
