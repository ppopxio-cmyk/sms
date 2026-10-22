import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { connectDB, disconnectDB } from '../src/config/db.js';
import {
  AcademicTerm,
  AcademicYear,
  Course,
  Department,
  Program,
} from '../src/models/AcademicStructure.js';
import { CertificateTemplate } from '../src/models/Documents.js';
import { GradingPolicy } from '../src/models/Records.js';
import { detectImage, uploadImage } from '../src/services/imagekit.service.js';
import { ownFilter } from '../src/services/registrar.helpers.js';

const inputPath = path.resolve(process.argv[2] || './academic-setup.json');
const baseDir = path.dirname(inputPath);
const MAX_ASSET_BYTES = 10 * 1024 * 1024;

function fail(message) {
  throw new Error(message);
}

function text(value, label, { max = 200, required = true } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (required) fail(`${label} is required.`);
    return '';
  }
  const result = String(value).trim();
  if (result.length > max) fail(`${label} must be at most ${max} characters.`);
  return result;
}

function integer(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER, required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(`${label} is required.`);
    return null;
  }
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) {
    fail(`${label} must be a whole number between ${min} and ${max}.`);
  }
  return result;
}

function number(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER, required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(`${label} is required.`);
    return null;
  }
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max) {
    fail(`${label} must be a number between ${min} and ${max}.`);
  }
  return result;
}

function date(value, label) {
  const result = new Date(value);
  if (!value || Number.isNaN(result.getTime())) fail(`${label} must be a valid date.`);
  return result;
}

function oneOf(value, allowed, label) {
  const result = String(value || '');
  if (!allowed.includes(result)) fail(`${label} must be one of: ${allowed.join(', ')}.`);
  return result;
}

function url(value, label) {
  const result = text(value, label, { max: 300 });
  try {
    const parsed = new URL(result);
    if (!['http:', 'https:'].includes(parsed.protocol)) fail(`${label} must start with http:// or https://.`);
  } catch {
    fail(`${label} must be a valid URL.`);
  }
  return result.replace(/\/+$/, '');
}

function readAsset(relativePath, label) {
  const filePath = path.resolve(baseDir, relativePath);
  if (!fs.existsSync(filePath)) fail(`${label} image was not found: ${relativePath}`);
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size > MAX_ASSET_BYTES) {
    fail(`${label} must be a file smaller than ${MAX_ASSET_BYTES / (1024 * 1024)} MB.`);
  }
  const buffer = fs.readFileSync(filePath);
  const info = detectImage(buffer);
  if (info.contentType === 'image/webp') {
    fail(`${label} must be PNG or JPEG. WebP is not supported by the certificate renderer.`);
  }
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  return {
    buffer,
    info,
    hash,
    fileName: `${label}-${hash.slice(0, 12)}.${info.extension}`,
  };
}

async function asset(assetInput, existing, kind, version) {
  const image = readAsset(assetInput, kind);
  if (existing?.filePath?.endsWith(`/${image.fileName}`)) {
    return { ...existing, contentType: image.info.contentType };
  }
  const uploaded = await uploadImage(image.buffer, {
    fileName: image.fileName,
    folder: `sms/registrar/certificates/v${version}`,
    contentType: image.info.contentType,
  });
  return {
    fileId: uploaded.fileId,
    filePath: uploaded.filePath,
    url: uploaded.url,
    contentType: uploaded.contentType,
    uploadedAt: uploaded.uploadedAt,
  };
}

function validateAssetShape(value, label) {
  if (!value || typeof value !== 'object') fail(`${label} must be an object.`);
}

async function setupGradingPolicy(policy) {
  if (!policy || typeof policy !== 'object') fail('gradingPolicy is required.');
  const bands = Array.isArray(policy.bands) ? policy.bands : fail('gradingPolicy.bands must be an array.');
  if (!bands.length) fail('gradingPolicy.bands must contain at least one band.');
  const normalized = bands.map((band, index) => {
    validateAssetShape(band, `gradingPolicy.bands[${index}]`);
    const min = integer(band.min, `gradingPolicy.bands[${index}].min`, { min: 0, max: 100 });
    const max = integer(band.max, `gradingPolicy.bands[${index}].max`, { min: 0, max: 100 });
    if (max < min) fail(`gradingPolicy.bands[${index}] has a maximum below its minimum.`);
    return {
      min,
      max,
      letter: text(band.letter, `gradingPolicy.bands[${index}].letter`, { max: 10 }),
      points: number(band.points, `gradingPolicy.bands[${index}].points`, { min: 0, max: 4 }),
      pass: Boolean(band.pass),
    };
  }).sort((a, b) => a.min - b.min);
  if (normalized[0].min !== 0) fail('The first grade band must start at 0.');
  if (normalized[normalized.length - 1].max !== 100) fail('The last grade band must end at 100.');
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index].min !== normalized[index - 1].max + 1) {
      fail('Grade bands must be contiguous: the next band must start one mark after the previous band ends.');
    }
  }
  const version = integer(policy.version, 'gradingPolicy.version', { min: 1 });
  const repeatPolicy = oneOf(policy.repeatPolicy, ['all', 'best', 'latest'], 'gradingPolicy.repeatPolicy');
  const rounding = integer(policy.rounding, 'gradingPolicy.rounding', { min: 0, max: 4 });
  const existing = await GradingPolicy.findOne({ key: 'global' }).lean();
  if (existing) {
    if (version < existing.version) {
      fail(`gradingPolicy.version cannot decrease from ${existing.version} to ${version}.`);
    }
    const changed = JSON.stringify(existing.bands || []) !== JSON.stringify(normalized);
    if (changed && version <= existing.version) {
      fail('The grade bands changed. Increase gradingPolicy.version before applying a new policy.');
    }
  }
  await GradingPolicy.findOneAndUpdate(
    { key: 'global' },
    {
      $set: {
        version,
        bands: normalized,
        repeatPolicy,
        rounding,
        effectiveFrom: policy.effectiveFrom
          ? date(policy.effectiveFrom, 'gradingPolicy.effectiveFrom')
          : existing?.effectiveFrom || new Date(),
      },
    },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return { version, bands: normalized.length };
}

async function setupAcademicYears(years) {
  if (!Array.isArray(years) || !years.length) fail('academicYears must contain at least one academic year.');
  const labels = new Set();
  let currentCount = 0;
  const prepared = years.map((year, index) => {
    const label = text(year.label, `academicYears[${index}].label`, { max: 40 });
    if (labels.has(label)) fail(`academicYears contains a duplicate label: ${label}`);
    labels.add(label);
    const isCurrent = Boolean(year.isCurrent);
    if (isCurrent) currentCount += 1;
    const startDate = date(year.startDate, `academicYears[${index}].startDate`);
    const endDate = date(year.endDate, `academicYears[${index}].endDate`);
    if (endDate <= startDate) fail(`academicYears[${index}] must end after it starts.`);
    const status = oneOf(year.status || (isCurrent ? 'active' : 'planned'), ['planned', 'active', 'closed'], `academicYears[${index}].status`);
    const terms = Array.isArray(year.terms) ? year.terms.map((term, termIndex) => {
      const termStart = date(term.startDate, `academicYears[${index}].terms[${termIndex}].startDate`);
      const termEnd = date(term.endDate, `academicYears[${index}].terms[${termIndex}].endDate`);
      if (termEnd <= termStart) fail(`academicYears[${index}].terms[${termIndex}] must end after it starts.`);
      if (termStart < startDate || termEnd > endDate) {
        fail(`academicYears[${index}].terms[${termIndex}] must fall inside the academic year.`);
      }
      return {
        name: text(term.name, `academicYears[${index}].terms[${termIndex}].name`, { max: 60 }),
        sequence: integer(term.sequence, `academicYears[${index}].terms[${termIndex}].sequence`, { min: 1, max: 20 }),
        type: oneOf(term.type || 'semester', ['semester', 'term', 'session'], `academicYears[${index}].terms[${termIndex}].type`),
        startDate: termStart,
        endDate: termEnd,
      };
    }) : [];
    return { label, startDate, endDate, isCurrent, status, terms };
  });
  if (currentCount > 1) fail('Only one academic year may be marked isCurrent.');

  for (const year of prepared) {
    if (year.isCurrent) {
      await AcademicYear.updateMany(ownFilter({ label: { $ne: year.label } }), { $set: { isCurrent: false } });
    }
    const saved = await AcademicYear.findOneAndUpdate(
      { label: year.label },
      {
        $set: {
          startDate: year.startDate,
          endDate: year.endDate,
          isCurrent: year.isCurrent,
          status: year.status,
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    for (const term of year.terms) {
      await AcademicTerm.findOneAndUpdate(
        { academicYear: saved._id, sequence: term.sequence },
        { $set: { ...term, academicYear: saved._id } },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
      );
    }
  }
  return {
    years: prepared.length,
    terms: prepared.reduce((total, year) => total + year.terms.length, 0),
  };
}

async function setupDepartments(departments) {
  if (!Array.isArray(departments) || !departments.length) fail('departments must contain at least one department.');
  const codes = new Set();
  let count = 0;
  for (const [index, department] of departments.entries()) {
    const code = text(department.code, `departments[${index}].code`, { max: 20 }).toUpperCase();
    if (codes.has(code)) fail(`departments contains a duplicate code: ${code}`);
    codes.add(code);
    await Department.findOneAndUpdate(
      { code },
      {
        $set: {
          code,
          name: text(department.name, `departments[${index}].name`, { max: 120 }),
          description: text(department.description, `departments[${index}].description`, { max: 1000, required: false }),
          active: department.active !== false,
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    count += 1;
  }
  return count;
}

async function setupProgrammes(programmes, departmentByCode) {
  if (!Array.isArray(programmes) || !programmes.length) fail('programmes must contain at least one programme.');
  const codes = new Set();
  let count = 0;
  for (const [index, programme] of programmes.entries()) {
    const code = text(programme.code, `programmes[${index}].code`, { max: 20 }).toUpperCase();
    if (codes.has(code)) fail(`programmes contains a duplicate code: ${code}`);
    codes.add(code);
    const departmentCode = text(programme.department, `programmes[${index}].department`, { max: 20 }).toUpperCase();
    const department = departmentByCode.get(departmentCode);
    if (!department) fail(`programmes[${index}] refers to an unknown department: ${departmentCode}`);
    const qualificationType = oneOf(programme.qualificationType, ['degree', 'diploma', 'short-term'], `programmes[${index}].qualificationType`);
    const data = {
      code,
      name: text(programme.name, `programmes[${index}].name`, { max: 160 }),
      department: department._id,
      qualificationType,
      description: text(programme.description, `programmes[${index}].description`, { max: 1000, required: false }),
      active: programme.active !== false,
    };
    if (qualificationType === 'degree') {
      data.durationYears = integer(programme.durationYears, `programmes[${index}].durationYears`, { min: 1, max: 10 });
      data.levels = undefined;
    } else if (qualificationType === 'diploma') {
      const levels = Array.isArray(programme.levels) ? programme.levels.map((level, levelIndex) => integer(level, `programmes[${index}].levels[${levelIndex}]`, { min: 1, max: 4 })) : null;
      if (!levels?.length) fail(`programmes[${index}].levels is required for a diploma and must list levels 1–4.`);
      if (new Set(levels).size !== levels.length) fail(`programmes[${index}].levels contains a duplicate level.`);
      data.levels = levels.sort((a, b) => a - b);
      data.durationYears = null;
    } else {
      if (!programme.shortTerm || typeof programme.shortTerm !== 'object') {
        fail(`programmes[${index}].shortTerm is required for a short-term programme.`);
      }
      data.shortTerm = {
        duration: integer(programme.shortTerm.duration, `programmes[${index}].shortTerm.duration`, { min: 1 }),
        unit: oneOf(programme.shortTerm.unit || 'weeks', ['weeks', 'months'], `programmes[${index}].shortTerm.unit`),
      };
      data.durationYears = null;
      data.levels = undefined;
    }
    if (programme.graduationPolicy !== undefined) {
      const policy = programme.graduationPolicy || {};
      validateAssetShape(policy, `programmes[${index}].graduationPolicy`);
      data.graduationPolicy = {
        requiredCredits: policy.requiredCredits === undefined || policy.requiredCredits === null
          ? null
          : number(policy.requiredCredits, `programmes[${index}].graduationPolicy.requiredCredits`, { min: 0, max: 500 }),
        minimumCgpa: policy.minimumCgpa === undefined || policy.minimumCgpa === null
          ? null
          : number(policy.minimumCgpa, `programmes[${index}].graduationPolicy.minimumCgpa`, { min: 0, max: 4 }),
        requiresPhoto: Boolean(policy.requiresPhoto),
        requiresAllRequiredCourses: policy.requiresAllRequiredCourses !== false,
      };
    }
    await Program.findOneAndUpdate(
      { code },
      { $set: data },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    count += 1;
  }
  return count;
}

async function setupCourses(courses, departmentByCode) {
  if (!Array.isArray(courses) || !courses.length) fail('courses must contain at least one course.');
  const codes = new Set();
  let count = 0;
  for (const [index, course] of courses.entries()) {
    const code = text(course.code, `courses[${index}].code`, { max: 24 }).toUpperCase();
    if (codes.has(code)) fail(`courses contains a duplicate code: ${code}`);
    codes.add(code);
    const departmentCode = text(course.department, `courses[${index}].department`, { max: 20 }).toUpperCase();
    const department = departmentByCode.get(departmentCode);
    if (!department) fail(`courses[${index}] refers to an unknown department: ${departmentCode}`);
    await Course.findOneAndUpdate(
      { code },
      {
        $set: {
          code,
          title: text(course.title, `courses[${index}].title`, { max: 160 }),
          department: department._id,
          creditHours: number(course.creditHours, `courses[${index}].creditHours`, { min: 0.5, max: 30 }),
          description: text(course.description, `courses[${index}].description`, { max: 1000, required: false }),
          active: course.active !== false,
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    count += 1;
  }
  return count;
}

async function setupTemplate(template) {
  if (!template || typeof template !== 'object') fail('certificateTemplate is required.');
  const version = integer(template.version, 'certificateTemplate.version', { min: 1 });
  const name = text(template.name, 'certificateTemplate.name', { max: 120 });
  const institutionName = text(template.institutionName, 'certificateTemplate.institutionName', { max: 160 });
  const institutionNameAmharic = text(template.institutionNameAmharic, 'certificateTemplate.institutionNameAmharic', { max: 200, required: false });
  const certificateTitle = text(template.certificateTitle, 'certificateTemplate.certificateTitle', { max: 120 });
  const certificatePrefix = text(template.certificatePrefix, 'certificateTemplate.certificatePrefix', { max: 16 }).toUpperCase();
  const signatoryName = text(template.signatoryName, 'certificateTemplate.signatoryName', { max: 120 });
  const signatoryTitle = text(template.signatoryTitle, 'certificateTemplate.signatoryTitle', { max: 120 });
  const photoPolicy = oneOf(template.photoPolicy, ['required', 'optional'], 'certificateTemplate.photoPolicy');
  const verificationBaseUrl = url(template.verificationBaseUrl, 'certificateTemplate.verificationBaseUrl');
  const themeInput = template.theme || {};
  const hex = (value, fallback, label) => {
    const result = text(value, label, { max: 20, required: false }) || fallback;
    if (!/^#[0-9a-fA-F]{6}$/.test(result)) fail(`${label} must be a six-digit hex colour.`);
    return result;
  };
  const theme = {
    primary: hex(themeInput.primary, '#123b2d', 'certificateTemplate.theme.primary'),
    accent: hex(themeInput.accent, '#b38b4d', 'certificateTemplate.theme.accent'),
    paper: hex(themeInput.paper, '#fffdf7', 'certificateTemplate.theme.paper'),
  };
  const logoPath = text(template.logo, 'certificateTemplate.logo', { max: 500, required: false });
  const sealPath = text(template.seal, 'certificateTemplate.seal', { max: 500 });
  const signaturePath = text(template.signature, 'certificateTemplate.signature', { max: 500 });
  const effectiveFrom = template.effectiveFrom
    ? date(template.effectiveFrom, 'certificateTemplate.effectiveFrom')
    : new Date();

  const existing = await CertificateTemplate.findOne({ version }).lean();
  const logo = logoPath ? await asset(logoPath, existing?.logo, 'logo', version) : existing?.logo || {};
  const seal = await asset(sealPath, existing?.seal, 'seal', version);
  const signature = await asset(signaturePath, existing?.signature, 'signature', version);

  const data = {
    name,
    version,
    active: false,
    institutionName,
    institutionNameAmharic,
    certificateTitle,
    certificatePrefix,
    signatoryName,
    signatoryTitle,
    photoPolicy,
    theme,
    logo,
    seal,
    signature,
    verificationBaseUrl,
    effectiveFrom,
  };
  const saved = await CertificateTemplate.findOneAndUpdate(
    { version },
    { $set: data },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  await CertificateTemplate.updateMany(
    ownFilter({ active: true, _id: { $ne: saved._id } }),
    { $set: { active: false } },
  );
  saved.active = true;
  await saved.save();
  return { version, name };
}

async function main() {
  if (!fs.existsSync(inputPath)) fail(`Setup file was not found: ${inputPath}`);
  const raw = fs.readFileSync(inputPath, 'utf8');
  let setup;
  try {
    setup = JSON.parse(raw);
  } catch {
    fail('The setup file is not valid JSON.');
  }
  if (!setup || typeof setup !== 'object' || Array.isArray(setup)) fail('The setup file must contain one JSON object.');

  await connectDB();
  console.log('Connected. Validating setup file…');

  const grading = await setupGradingPolicy(setup.gradingPolicy);
  const calendar = await setupAcademicYears(setup.academicYears);
  const departmentCount = await setupDepartments(setup.departments);
  const departments = await Department.find(ownFilter({ code: { $in: setup.departments.map((row) => String(row.code).toUpperCase()) } })).lean();
  const departmentByCode = new Map(departments.map((row) => [row.code, row]));
  const programmeCount = await setupProgrammes(setup.programmes, departmentByCode);
  const courseCount = await setupCourses(setup.courses, departmentByCode);
  const template = await setupTemplate(setup.certificateTemplate);

  console.log('');
  console.log('Academic setup complete.');
  console.log(`  Departments:  ${departmentCount}`);
  console.log(`  Programmes:   ${programmeCount}`);
  console.log(`  Courses:      ${courseCount}`);
  console.log(`  Academic years: ${calendar.years} (${calendar.terms} terms)`);
  console.log(`  Grading policy: version ${grading.version}, ${grading.bands} bands`);
  console.log(`  Certificate template: version ${template.version}`);
  console.log('');
  console.log('The active certificate template is the one used for new certificates. Existing');
  console.log('certificates keep their stored template version and academic snapshot.');
}

main()
  .catch((error) => {
    console.error('');
    console.error(`Academic setup failed: ${error.message}`);
    if (error.code === 11000) {
      console.error('A unique field already belongs to another record. Check codes, versions and the active template.');
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDB().catch(() => {});
  });
