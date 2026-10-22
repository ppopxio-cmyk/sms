import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { formatEthiopian } from '../utils/ethiopianDate.js';
import { AppError } from '../utils/AppError.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.resolve(HERE, '../assets/fonts');
const ETHIOPIC_REGULAR = path.join(FONT_DIR, 'NotoSansEthiopic-Regular.ttf');
const ETHIOPIC_BOLD = path.join(FONT_DIR, 'NotoSansEthiopic-Bold.ttf');

const PAGE = { width: 595.28, height: 841.89 };
const CERT_PAGE = { width: 841.89, height: 595.28 };
const MARGIN = 46;
const BOTTOM = PAGE.height - 54;
const ETHIOPIC = /[\u1200-\u137f]/;

// The supplied graduation certificate is a 1200x896 mock-up. The bottom 60
// pixels are the backdrop the certificate was photographed on, so the useful
// artwork is 1200x836. It is scaled to fill an A4 landscape page, cropping a
// few pixels from each side rather than showing the backdrop.
const TEMPLATE = { width: 1200, height: 896, cropHeight: 836 };
const TEMPLATE_SCALE = CERT_PAGE.height / TEMPLATE.cropHeight;
const TEMPLATE_X = (CERT_PAGE.width - TEMPLATE.width * TEMPLATE_SCALE) / 2;
const TEMPLATE_PATH = path.resolve(HERE, '../assets/certificate-template-clean.png');
// A plain patch of the same paper, used to erase the sample fields without
// introducing flat rectangles that would not match the certificate texture.
const TEMPLATE_BLANK = { x: 900, y: 300, width: 150, height: 45 };

const tplX = (value) => TEMPLATE_X + value * TEMPLATE_SCALE;
const tplY = (value) => value * TEMPLATE_SCALE;
const tplSize = (value) => value * TEMPLATE_SCALE;

let templateCache;

function templateBackground() {
  if (templateCache !== undefined) return templateCache;
  try {
    templateCache = fs.readFileSync(TEMPLATE_PATH);
  } catch {
    templateCache = null;
  }
  return templateCache;
}

const safeColor = (value, fallback) => (/^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback);

function isEthiopic(value) {
  return ETHIOPIC.test(String(value || ''));
}

function fontNameFor(value, { bold = false } = {}) {
  if (isEthiopic(value)) return bold ? 'NotoEthiopicBold' : 'NotoEthiopic';
  return bold ? 'Times-Bold' : 'Times-Roman';
}

function fontFor(doc, value, { bold = false } = {}) {
  doc.font(fontNameFor(value, { bold }));
}

function paperPatch(doc, background, x, y, width, height) {
  if (!background) return;
  const dx = tplX(x);
  const dy = tplY(y);
  const dw = tplSize(width);
  const dh = tplSize(height);
  const scaleX = dw / TEMPLATE_BLANK.width;
  const scaleY = dh / TEMPLATE_BLANK.height;
  doc.save();
  doc.rect(dx, dy, dw, dh).clip();
  doc.image(background, dx - TEMPLATE_BLANK.x * scaleX, dy - TEMPLATE_BLANK.y * scaleY, {
    width: TEMPLATE.width * scaleX,
    height: TEMPLATE.height * scaleY,
  });
  doc.restore();
}

function drawFittedText(doc, value, { x, y, width, color, bold = false, maxSize = 12, minSize = 7, align = 'left', characterSpacing = 0 } = {}) {
  const text = String(value ?? '').trim();
  if (!text) return;
  const font = fontNameFor(text, { bold });
  const box = tplSize(width);
  let size = maxSize;
  while (size > minSize) {
    doc.font(font).fontSize(size);
    const measured = doc.widthOfString(text) + characterSpacing * Math.max(0, text.length - 1);
    if (measured <= box) break;
    size -= 0.5;
  }
  doc.font(font).fontSize(size).fillColor(color);
  doc.text(text, tplX(x), tplY(y), {
    width: box,
    align,
    lineBreak: false,
    ellipsis: true,
    characterSpacing,
  });
}

function drawTemplatePhoto(doc, buffer, x, y, size) {
  const dx = tplX(x);
  const dy = tplY(y);
  const extent = tplSize(size);
  doc.save();
  doc.rect(dx, dy, extent, extent).fill('#fffdf7');
  doc.lineWidth(1).strokeColor('#b08d57').rect(dx - 1, dy - 1, extent + 2, extent + 2).stroke();
  if (buffer) {
    try {
      doc.image(buffer, dx, dy, { cover: [extent, extent], align: 'center', valign: 'center' });
    } catch {
      doc.fillColor('#6b7280').fontSize(7).font('Helvetica').text('Photo unavailable', dx, dy + extent / 2 - 4, {
        width: extent,
        align: 'center',
      });
    }
  } else {
    doc.fillColor('#6b7280').fontSize(7).font('Helvetica').text('Photo not supplied', dx, dy + extent / 2 - 4, {
      width: extent,
      align: 'center',
    });
  }
  doc.restore();
}

function drawInstitution(doc, template, { compact = false } = {}) {
  const primary = safeColor(template.theme?.primary, '#123b2d');
  if (compact) {
    doc.fillColor(primary).fontSize(9).font('Helvetica-Bold').text(template.institutionName, MARGIN, 28, {
      width: 320,
      lineBreak: false,
    });
    doc.fontSize(7).font('Helvetica').fillColor('#52645c').text('Official academic record', 380, 30, {
      width: 170,
      align: 'right',
    });
    return;
  }
  let y = 58;
  if (template._logoBuffer) {
    try {
      doc.image(template._logoBuffer, PAGE.width / 2 - 30, y, { fit: [60, 60], align: 'center' });
      y += 62;
    } catch {
      // A bad logo must not stop an otherwise complete certificate.
    }
  }
  fontFor(doc, template.institutionName, { bold: true });
  doc.fillColor(primary).fontSize(template.institutionName?.length > 48 ? 17 : 21).text(template.institutionName, MARGIN, y, {
    width: PAGE.width - MARGIN * 2,
    align: 'center',
  });
  y = doc.y + 5;
  if (template.institutionNameAmharic) {
    doc.font('NotoEthiopicBold').fillColor(primary).fontSize(15).text(template.institutionNameAmharic, MARGIN, y, {
      width: PAGE.width - MARGIN * 2,
      align: 'center',
    });
    y = doc.y + 4;
  }
  doc
    .font('Helvetica')
    .fillColor('#5d6b64')
    .fontSize(8)
    .text('OFFICE OF THE REGISTRAR', MARGIN, y, {
      width: PAGE.width - MARGIN * 2,
      align: 'center',
      characterSpacing: 1.8,
    });
}

function border(doc, primary, accent) {
  doc.save();
  doc.lineWidth(2.2).strokeColor(primary).rect(22, 22, PAGE.width - 44, PAGE.height - 44).stroke();
  doc.lineWidth(0.7).strokeColor(accent).rect(29, 29, PAGE.width - 58, PAGE.height - 58).stroke();
  doc.lineWidth(0.35).strokeColor(accent).rect(34, 34, PAGE.width - 68, PAGE.height - 68).stroke();
  doc.restore();
}

function watermark(doc, text = 'PREVIEW', page = PAGE) {
  doc.save();
  doc.rotate(-34, { origin: [page.width / 2, page.height / 2] });
  doc
    .font('Helvetica-Bold')
    .fontSize(96)
    .fillColor('#8f1d1d')
    .opacity(0.09)
    .text(text, 0, page.height / 2 - 52, { width: page.width, align: 'center' });
  doc.restore();
}

function addPageFooter(doc, template) {
  const range = doc.bufferedPageRange();
  const total = range.count;
  // The certificate itself carries its number and verification details. Only
  // the continuation pages of the academic record need the small footer.
  for (let index = 1; index < total; index += 1) {
    doc.switchToPage(range.start + index);
    const width = doc.page.width;
    const height = doc.page.height;
    const oldBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#68756e')
      .text(
        `${template.institutionName}  •  Certificate ${doc._certificateNumber || ''}  •  Page ${index + 1} of ${total}`,
        MARGIN,
        height - 38,
        { width: width - MARGIN * 2, align: 'center' },
      );
    doc.page.margins.bottom = oldBottom;
  }
}

function drawPhoto(doc, buffer, x, y) {
  const size = 113.39; // 4 cm at 72 points/inch
  doc.save();
  doc.lineWidth(1).strokeColor('#b7a887').rect(x, y, size, size).stroke();
  if (buffer) {
    try {
      doc.image(buffer, x + 3, y + 3, { cover: [size - 6, size - 6], align: 'center', valign: 'center' });
    } catch {
      doc.fillColor('#6b7280').fontSize(8).font('Helvetica').text('Photo unavailable', x, y + 52, { width: size, align: 'center' });
    }
  } else {
    doc.fillColor('#6b7280').fontSize(8).font('Helvetica').text('Photo not supplied', x, y + 52, { width: size, align: 'center' });
  }
  doc.restore();
}

function drawSeal(doc, buffer, x, y) {
  if (!buffer) {
    throw new AppError(
      409,
      'CERTIFICATE_CONFIG_MISSING',
      'The official seal is not configured. Upload it before issuing certificates.',
    );
  }
  try {
    doc.image(buffer, x, y, { fit: [92, 92], align: 'center', valign: 'center' });
  } catch {
    throw new AppError(409, 'CERTIFICATE_SEAL_INVALID', 'The configured official seal could not be read.');
  }
}

function drawSignature(doc, buffer, x, y) {
  if (!buffer) {
    throw new AppError(
      409,
      'CERTIFICATE_CONFIG_MISSING',
      'The authorised signature is not configured. Upload it before issuing certificates.',
    );
  }
  try {
    doc.image(buffer, x, y, { fit: [140, 52], align: 'center', valign: 'center' });
  } catch {
    throw new AppError(409, 'CERTIFICATE_SIGNATURE_INVALID', 'The configured signature could not be read.');
  }
}

function certificateDate(value) {
  if (!value) return 'Date not recorded';
  return formatEthiopian(value);
}

function qualificationLabel(value) {
  const text = String(value || '').trim();
  if (!text) return '—';
  return text.charAt(0).toUpperCase() + text.slice(1).replaceAll('-', ' ');
}

function graduationYear(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : String(date.getFullYear());
}

function drawTemplateCertificatePage(doc, { certificate, template, photoBuffer, sealBuffer, signatureBuffer, preview, background }) {
  doc.rect(0, 0, CERT_PAGE.width, CERT_PAGE.height).fill('#fdfcf1');
  doc.save();
  doc.rect(0, 0, CERT_PAGE.width, CERT_PAGE.height).clip();
  doc.image(background, TEMPLATE_X, 0, {
    width: TEMPLATE.width * TEMPLATE_SCALE,
    height: TEMPLATE.height * TEMPLATE_SCALE,
  });
  doc.restore();

  const snapshot = certificate.studentSnapshot || {};
  const program = certificate.programSnapshot || {};

  // The template already contains the ornate frame and the static ceremony
  // wording. Replace only the sample-specific lines with the official record.
  paperPatch(doc, background, 245, 138, 710, 70);
  drawFittedText(doc, template.institutionName || 'Institution', {
    x: 245,
    y: 144,
    width: 710,
    color: '#0f2747',
    bold: true,
    maxSize: 24,
    minSize: 12,
    align: 'center',
  });

  paperPatch(doc, background, 255, 242, 690, 60);
  drawFittedText(doc, template.certificateTitle || 'Certificate of Graduation', {
    x: 255,
    y: 250,
    width: 690,
    color: '#0f2747',
    bold: true,
    maxSize: 26,
    minSize: 14,
    align: 'center',
  });

  paperPatch(doc, background, 370, 334, 460, 60);
  drawFittedText(doc, String(snapshot.fullName || 'Student name').toUpperCase(), {
    x: 370,
    y: 340,
    width: 460,
    color: '#b08d57',
    bold: true,
    maxSize: 30,
    minSize: 14,
    align: 'center',
    characterSpacing: 1.1,
  });

  paperPatch(doc, background, 326, 458, 156, 168);
  drawTemplatePhoto(doc, photoBuffer, 340, 472, 132);

  paperPatch(doc, background, 650, 470, 310, 140);
  const detailRows = [
    [snapshot.studentId || '—', 474],
    [certificate.departmentSnapshot?.name || '—', 502],
    [program.name || '—', 530],
    [qualificationLabel(program.qualificationType), 558],
    [graduationYear(certificate.completionDate), 586],
  ];
  for (const [value, y] of detailRows) {
    drawFittedText(doc, value, {
      x: 655,
      y,
      width: 300,
      color: '#1b2a23',
      maxSize: 11,
      minSize: 8,
      align: 'left',
    });
  }

  paperPatch(doc, background, 435, 640, 335, 38);
  const cgpa = certificate.cgpa === null || certificate.cgpa === undefined ? '—' : Number(certificate.cgpa).toFixed(2);
  drawFittedText(doc, `CUMULATIVE GPA ${cgpa} / 4.00`, {
    x: 435,
    y: 644,
    width: 335,
    color: '#0f2747',
    bold: true,
    maxSize: 18,
    minSize: 11,
    align: 'center',
  });

  paperPatch(doc, background, 225, 685, 140, 125);
  if (sealBuffer) {
    try {
      doc.image(sealBuffer, tplX(240), tplY(695), {
        fit: [tplSize(140), tplSize(140)],
        align: 'center',
        valign: 'center',
      });
    } catch {
      // The configuration check already guarantees a readable seal; a render
      // failure here should not hide the rest of the certificate.
    }
  }

  paperPatch(doc, background, 480, 695, 220, 82);
  if (signatureBuffer) {
    try {
      doc.image(signatureBuffer, tplX(500), tplY(700), {
        fit: [tplSize(170), tplSize(60)],
        align: 'center',
        valign: 'center',
      });
    } catch {
      // Same reasoning as the seal above.
    }
  }
  doc
    .moveTo(tplX(500), tplY(752))
    .lineTo(tplX(675), tplY(752))
    .lineWidth(0.6)
    .strokeColor('#8c9a92')
    .stroke();
  drawFittedText(doc, 'AUTHORIZED SIGNATURE', {
    x: 500,
    y: 758,
    width: 175,
    color: '#52645c',
    maxSize: 8,
    minSize: 6,
    align: 'center',
  });

  paperPatch(doc, background, 780, 748, 200, 50);
  drawFittedText(doc, template.signatoryName || '', {
    x: 780,
    y: 754,
    width: 200,
    color: '#0f2747',
    bold: true,
    maxSize: 9,
    minSize: 7,
    align: 'center',
  });
  drawFittedText(doc, template.signatoryTitle || '', {
    x: 780,
    y: 770,
    width: 200,
    color: '#52645c',
    maxSize: 8,
    minSize: 6,
    align: 'center',
  });

  paperPatch(doc, background, 1012, 680, 106, 130);
  const verification = template.verificationBaseUrl
    ? `${template.verificationBaseUrl.replace(/\/+$/, '')}/${certificate.verificationId}`
    : certificate.verificationId;
  doc.font('Helvetica-Bold').fontSize(6).fillColor('#0f2747').text('VERIFY', tplX(1012), tplY(690), {
    width: tplSize(106),
    align: 'center',
  });
  doc.font('Helvetica').fontSize(5.5).fillColor('#52645c').text(verification || '', tplX(1012), tplY(704), {
    width: tplSize(106),
    align: 'center',
  });

  paperPatch(doc, background, 525, 802, 150, 28);
  drawFittedText(doc, certificate.certificateNumber || 'PREVIEW', {
    x: 525,
    y: 808,
    width: 150,
    color: '#0f2747',
    maxSize: 9,
    minSize: 7,
    align: 'center',
  });

  if (preview) watermark(doc, 'PREVIEW', CERT_PAGE);
}

function drawCustomCertificatePage(doc, { certificate, template, photoBuffer, sealBuffer, signatureBuffer, preview }) {
  const primary = safeColor(template.theme?.primary, '#123b2d');
  const accent = safeColor(template.theme?.accent, '#b38b4d');
  const paper = safeColor(template.theme?.paper, '#fffdf7');
  doc.rect(0, 0, PAGE.width, PAGE.height).fill(paper);
  border(doc, primary, accent);
  drawInstitution(doc, template);

  doc
    .font('Times-Bold')
    .fillColor(primary)
    .fontSize(30)
    .text(template.certificateTitle || 'Certificate of Graduation', MARGIN, 188, {
      width: PAGE.width - MARGIN * 2,
      align: 'center',
    });
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(accent)
    .text('THIS IS TO CERTIFY THAT', MARGIN, 230, {
      width: PAGE.width - MARGIN * 2,
      align: 'center',
      characterSpacing: 2,
    });

  const snapshot = certificate.studentSnapshot || {};
  fontFor(doc, snapshot.fullName, { bold: true });
  doc.fillColor('#1b2a23').fontSize(24).text(snapshot.fullName || 'Student name', MARGIN + 30, 248, {
    width: 335,
    align: 'center',
  });
  doc
    .moveTo(MARGIN + 56, doc.y + 7)
    .lineTo(MARGIN + 365, doc.y + 7)
    .lineWidth(0.7)
    .strokeColor(accent)
    .stroke();

  const program = certificate.programSnapshot || {};
  const qualification = String(program.qualificationType || '').replace('-', ' ');
  doc
    .font('Times-Roman')
    .fontSize(12)
    .fillColor('#26352d')
    .text(
      `has completed the requirements for the ${program.name || 'programme'}${qualification ? ` (${qualification})` : ''}`,
      MARGIN + 30,
      doc.y + 20,
      { width: 335, align: 'center' },
    );
  if (certificate.cgpa !== null && certificate.cgpa !== undefined) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#4b5b52')
      .text(`Cumulative grade point average: ${Number(certificate.cgpa).toFixed(2)}`, MARGIN + 30, doc.y + 6, {
        width: 335,
        align: 'center',
      });
  }

  drawPhoto(doc, photoBuffer, PAGE.width - MARGIN - 113, 248);

  const detailsY = 390;
  doc.font('Helvetica').fontSize(8).fillColor('#68756e');
  doc.text('STUDENT ID', MARGIN + 14, detailsY);
  doc.text('DATE OF COMPLETION', MARGIN + 170, detailsY);
  doc.text('ACADEMIC YEAR', MARGIN + 340, detailsY);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#1b2a23');
  doc.text(snapshot.studentId || '—', MARGIN + 14, detailsY + 14);
  doc.text(certificateDate(certificate.completionDate), MARGIN + 170, detailsY + 14);
  doc.text(certificate.academicYearLabel || '—', MARGIN + 340, detailsY + 14);

  doc.font('Helvetica').fontSize(8).fillColor('#68756e');
  doc.text('DEPARTMENT', MARGIN + 14, detailsY + 54);
  doc.text('CERTIFICATE NUMBER', MARGIN + 340, detailsY + 54);
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#1b2a23');
  doc.text(certificate.departmentSnapshot?.name || '—', MARGIN + 14, detailsY + 68, { width: 300 });
  doc.text(certificate.certificateNumber || 'PREVIEW', MARGIN + 340, detailsY + 68);

  drawSeal(doc, sealBuffer, MARGIN + 54, 570);
  drawSignature(doc, signatureBuffer, PAGE.width - MARGIN - 206, 566);
  doc
    .moveTo(PAGE.width - MARGIN - 206, 620)
    .lineTo(PAGE.width - MARGIN - 10, 620)
    .lineWidth(0.6)
    .strokeColor('#8c9a92')
    .stroke();
  doc.font('Helvetica-Bold').fontSize(9).fillColor(primary).text(template.signatoryName, PAGE.width - MARGIN - 206, 626, {
    width: 196,
    align: 'center',
  });
  doc.font('Helvetica').fontSize(8).fillColor('#68756e').text(template.signatoryTitle, PAGE.width - MARGIN - 206, 639, {
    width: 196,
    align: 'center',
  });

  doc.font('Helvetica').fontSize(7.5).fillColor('#68756e');
  doc.text(`Issued ${certificateDate(certificate.issuedAt)}`, MARGIN + 14, 708, { width: 250 });
  if (template.verificationBaseUrl && certificate.verificationId) {
    doc.text(`Verify: ${template.verificationBaseUrl.replace(/\/+$/, '')}/${certificate.verificationId}`, MARGIN + 14, 720, {
      width: 500,
    });
  }
  if (preview) watermark(doc);
}

function sectionTitle(doc, text, y) {
  doc.font('Times-Bold').fontSize(16).fillColor('#123b2d').text(text, MARGIN, y);
  doc.moveTo(MARGIN, doc.y + 4).lineTo(PAGE.width - MARGIN, doc.y + 4).lineWidth(0.8).strokeColor('#b38b4d').stroke();
  return doc.y + 14;
}

function tableHeader(doc, y) {
  const columns = [
    ['Year / term', MARGIN, 78],
    ['Level', MARGIN + 78, 34],
    ['Code', MARGIN + 112, 54],
    ['Course', MARGIN + 166, 188],
    ['Cr', MARGIN + 354, 24],
    ['Mark', MARGIN + 378, 34],
    ['Grade', MARGIN + 412, 34],
    ['Pts', MARGIN + 446, 24],
  ];
  doc.rect(MARGIN, y, PAGE.width - MARGIN * 2, 20).fill('#eef3ef');
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#254238');
  for (const [label, x, width] of columns) doc.text(label, x, y + 6, { width, align: label === 'Cr' || label === 'Pts' ? 'right' : 'left' });
  return y + 20;
}

function ensureSpace(doc, y, needed, template, continuationTitle) {
  if (y + needed <= BOTTOM) return y;
  doc.addPage({ size: 'A4', layout: 'portrait' });
  doc.rect(0, 0, PAGE.width, PAGE.height).fill('#fffdf7');
  drawInstitution(doc, template, { compact: true });
  let next = 52;
  doc.font('Times-Bold').fontSize(13).fillColor('#123b2d').text(continuationTitle, MARGIN, next);
  next = doc.y + 8;
  return tableHeader(doc, next);
}

function drawAcademicRecord(doc, { certificate, template, preview }) {
  doc.addPage({ size: 'A4', layout: 'portrait' });
  doc.rect(0, 0, PAGE.width, PAGE.height).fill('#fffdf7');
  drawInstitution(doc, template, { compact: true });
  let y = sectionTitle(doc, 'Detailed Academic Record', 56);
  const meta = certificate.studentSnapshot || {};
  doc.font('Helvetica').fontSize(8.5).fillColor('#4b5b52');
  doc.text(`${meta.fullName || ''}  •  ${meta.studentId || ''}  •  ${certificate.programSnapshot?.name || ''}`, MARGIN, y);
  y = doc.y + 8;
  y = tableHeader(doc, y);

  let previousGroup = '';
  for (const row of certificate.academicSnapshot || []) {
    const group = `${row.academicYear || '—'} / ${row.term || '—'}`;
    if (group !== previousGroup) {
      y = ensureSpace(doc, y, 46, template, 'Detailed Academic Record (continued)');
      doc.rect(MARGIN, y, PAGE.width - MARGIN * 2, 18).fill('#f8f4e8');
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#5a4a2c').text(group, MARGIN + 6, y + 5);
      y += 18;
      previousGroup = group;
    }
    y = ensureSpace(doc, y, 28, template, 'Detailed Academic Record (continued)');
    if (row.letterGrade && !row.letterGrade.toLowerCase().includes('fail') && row.gradePoint !== null) {
      // keep the row neutral; status columns carry the meaning
    }
    doc.font('Helvetica').fontSize(7.5).fillColor('#26352d');
    doc.text(row.academicYear || '—', MARGIN, y + 7, { width: 78, lineBreak: false, ellipsis: true });
    doc.text(String(row.level ?? '—'), MARGIN + 78, y + 7, { width: 34 });
    doc.font('Helvetica-Bold').text(row.code || '—', MARGIN + 112, y + 7, { width: 54, lineBreak: false, ellipsis: true });
    doc.font('Helvetica').text(row.title || '—', MARGIN + 166, y + 5, { width: 188, height: 22, ellipsis: true });
    doc.text(String(row.credits ?? ''), MARGIN + 354, y + 7, { width: 24, align: 'right' });
    doc.text(row.mark === null || row.mark === undefined ? '—' : String(row.mark), MARGIN + 378, y + 7, {
      width: 34,
      align: 'right',
    });
    doc.text(row.letterGrade || '—', MARGIN + 405, y + 7, { width: 40, align: 'center' });
    doc.text(row.gradePoint === null || row.gradePoint === undefined ? '—' : Number(row.gradePoint).toFixed(2), MARGIN + 443, y + 7, {
      width: 30,
      align: 'right',
    });
    doc
      .moveTo(MARGIN, y + 27)
      .lineTo(PAGE.width - MARGIN, y + 27)
      .lineWidth(0.25)
      .strokeColor('#d9dfda')
      .stroke();
    y += 28;
  }

  y = ensureSpace(doc, y, 150, template, 'Detailed Academic Record (continued)');
  y += 12;
  doc.font('Times-Bold').fontSize(11).fillColor('#123b2d').text('Summary', MARGIN, y);
  y = doc.y + 6;
  const summary = [
    ['Required credits', certificate.requiredCredits ?? '—'],
    ['Earned credits', certificate.earnedCredits ?? '—'],
    ['Official CGPA', certificate.cgpa === null || certificate.cgpa === undefined ? 'Not available' : Number(certificate.cgpa).toFixed(2)],
    ['Completion date', certificateDate(certificate.completionDate)],
  ];
  doc.font('Helvetica').fontSize(8.5).fillColor('#26352d');
  for (const [label, value] of summary) {
    doc.font('Helvetica').text(label, MARGIN, y, { width: 150 });
    doc.font('Helvetica-Bold').text(String(value), MARGIN + 160, y, { width: 220 });
    y += 16;
  }

  const legend = certificate.gradingLegend || [];
  if (legend.length) {
    y += 12;
    doc.font('Times-Bold').fontSize(10).fillColor('#123b2d').text('Grading legend', MARGIN, y);
    y = doc.y + 4;
    doc.font('Helvetica').fontSize(7.5).fillColor('#4b5b52');
    const line = legend
      .map((band) => `${band.letter}: ${band.min}–${band.max}${band.pass ? '' : ' (fail)'}${band.points !== undefined ? ` · ${band.points} pts` : ''}`)
      .join('     ');
    doc.text(line, MARGIN, y, { width: PAGE.width - MARGIN * 2 });
  }

  if (preview) watermark(doc);
}

export function renderCertificatePdf({
  certificate,
  template,
  photoBuffer,
  logoBuffer,
  sealBuffer,
  signatureBuffer,
  preview = false,
}) {
  return new Promise((resolve, reject) => {
    try {
      fs.accessSync(ETHIOPIC_REGULAR);
      fs.accessSync(ETHIOPIC_BOLD);
    } catch {
      return reject(new AppError(500, 'FONT_MISSING', 'The Amharic font is missing from the server assets.'));
    }

    const background = templateBackground();
    const doc = new PDFDocument({
      ...(background ? { size: 'A4', layout: 'landscape' } : { size: 'A4' }),
      margin: 0,
      bufferPages: true,
      info: {
        Title: `${preview ? 'Preview — ' : ''}${template.certificateTitle || 'Certificate'} — ${certificate.studentSnapshot?.fullName || ''}`,
        Author: template.institutionName,
        Subject: 'Official certificate and academic record',
        Creator: 'SMS Registrar',
      },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont('NotoEthiopic', ETHIOPIC_REGULAR);
    doc.registerFont('NotoEthiopicBold', ETHIOPIC_BOLD);
    doc._certificateNumber = preview ? 'PREVIEW' : certificate.certificateNumber;
    const merged = {
      ...template,
      _logoBuffer: logoBuffer,
    };
    if (background) {
      drawTemplateCertificatePage(doc, {
        certificate,
        template: merged,
        photoBuffer,
        sealBuffer,
        signatureBuffer,
        preview,
        background,
      });
    } else {
      drawCustomCertificatePage(doc, {
        certificate,
        template: merged,
        photoBuffer,
        sealBuffer,
        signatureBuffer,
        preview,
      });
    }
    drawAcademicRecord(doc, { certificate, template, preview });
    addPageFooter(doc, template);
    doc.end();
  });
}

export function renderTranscriptPdf({ transcript, template, photoBuffer, logoBuffer }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      bufferPages: true,
      info: {
        Title: `Academic transcript — ${transcript.studentSnapshot?.fullName || ''}`,
        Author: template?.institutionName || 'Registrar',
      },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont('NotoEthiopic', ETHIOPIC_REGULAR);
    doc.registerFont('NotoEthiopicBold', ETHIOPIC_BOLD);
    doc.rect(0, 0, PAGE.width, PAGE.height).fill('#fffdf7');
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, MARGIN, 34, { fit: [42, 42] });
      } catch {
        // logo is optional
      }
    }
    doc.font('Times-Bold').fontSize(17).fillColor('#123b2d').text(template?.institutionName || 'Institution', MARGIN + 52, 38, {
      width: PAGE.width - MARGIN * 2 - 52,
    });
    doc.font('Helvetica').fontSize(8).fillColor('#68756e').text('OFFICIAL ACADEMIC TRANSCRIPT', MARGIN + 52, 58);
    doc.moveTo(MARGIN, 88).lineTo(PAGE.width - MARGIN, 88).lineWidth(0.8).strokeColor('#b38b4d').stroke();
    doc.font('Times-Bold').fontSize(13).fillColor('#1b2a23').text(transcript.studentSnapshot?.fullName || '', MARGIN, 104);
    doc.font('Helvetica').fontSize(8.5).fillColor('#4b5b52');
    doc.text(
      `${transcript.studentSnapshot?.studentId || ''}  •  ${transcript.programSnapshot?.name || ''}  •  ${transcript.studentSnapshot?.sex || ''}`,
      MARGIN,
      122,
    );
    if (photoBuffer) {
      try {
        doc.image(photoBuffer, PAGE.width - MARGIN - 55, 100, { cover: [55, 55] });
      } catch {
        // photo is not required for the transcript
      }
    }
    let y = 150;
    y = tableHeader(doc, y);
    for (const row of transcript.academicSnapshot || []) {
      if (y + 26 > BOTTOM) {
        doc.addPage();
        doc.rect(0, 0, PAGE.width, PAGE.height).fill('#fffdf7');
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#123b2d').text('Academic transcript (continued)', MARGIN, 40);
        y = tableHeader(doc, 58);
      }
      doc.font('Helvetica').fontSize(7.5).fillColor('#26352d');
      doc.text(row.academicYear || '—', MARGIN, y + 7, { width: 78, lineBreak: false, ellipsis: true });
      doc.text(String(row.level ?? '—'), MARGIN + 78, y + 7, { width: 34 });
      doc.font('Helvetica-Bold').text(row.code || '—', MARGIN + 112, y + 7, { width: 54 });
      doc.font('Helvetica').text(row.title || '—', MARGIN + 166, y + 5, { width: 188, height: 22, ellipsis: true });
      doc.text(String(row.credits ?? ''), MARGIN + 354, y + 7, { width: 24, align: 'right' });
      doc.text(row.mark === null || row.mark === undefined ? '—' : String(row.mark), MARGIN + 378, y + 7, { width: 34, align: 'right' });
      doc.text(row.letterGrade || '—', MARGIN + 405, y + 7, { width: 40, align: 'center' });
      doc.text(row.gradePoint === null || row.gradePoint === undefined ? '—' : Number(row.gradePoint).toFixed(2), MARGIN + 443, y + 7, {
        width: 30,
        align: 'right',
      });
      doc.moveTo(MARGIN, y + 27).lineTo(PAGE.width - MARGIN, y + 27).lineWidth(0.25).strokeColor('#d9dfda').stroke();
      y += 28;
    }
    if (y + 100 > BOTTOM) {
      doc.addPage();
      doc.rect(0, 0, PAGE.width, PAGE.height).fill('#fffdf7');
      y = 50;
    }
    y += 14;
    doc.font('Times-Bold').fontSize(11).fillColor('#123b2d').text('Summary', MARGIN, y);
    y = doc.y + 6;
    doc.font('Helvetica').fontSize(8.5).fillColor('#26352d');
    doc.text(`Total credits: ${transcript.totalCredits ?? '—'}`, MARGIN, y);
    doc.text(`Official CGPA: ${transcript.cgpa === null || transcript.cgpa === undefined ? 'Not available' : Number(transcript.cgpa).toFixed(2)}`, MARGIN + 180, y);
    y += 18;
    doc.text(`Issued: ${certificateDate(transcript.issuedAt)}`, MARGIN, y);
    doc.text(`Verification: ${transcript.verificationId}`, MARGIN + 180, y);
    if (transcript.purpose) doc.text(`Purpose: ${transcript.purpose}`, MARGIN, y + 16, { width: 500 });
    if (template?.verificationBaseUrl) {
      doc.text(`Verify: ${template.verificationBaseUrl.replace(/\/+$/, '')}/${transcript.verificationId}`, MARGIN, y + 34);
    }
    const range = doc.bufferedPageRange();
    for (let index = 0; index < range.count; index += 1) {
      doc.switchToPage(range.start + index);
      doc.font('Helvetica').fontSize(7).fillColor('#68756e').text(
        `Official transcript  •  ${transcript.verificationId}  •  Page ${index + 1} of ${range.count}`,
        MARGIN,
        PAGE.height - 32,
        { width: PAGE.width - MARGIN * 2, align: 'center' },
      );
    }
    doc.end();
  });
}
