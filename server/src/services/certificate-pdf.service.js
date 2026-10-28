import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
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

function safeColor(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;
}

function cgpaClassification(cgpa) {
  const val = Number(cgpa);
  if (Number.isNaN(val) || val === 0) return 'Pass';
  if (val >= 3.75) return 'Very Great Distinction';
  if (val >= 3.5) return 'Great Distinction';
  if (val >= 3.25) return 'Distinction';
  if (val >= 2.0) return 'Satisfactory';
  return 'Pass';
}

function drawVectorCrest(doc, cx, cy, radius) {
  doc.save();
  doc.circle(cx, cy, radius).strokeColor('#0f2747').lineWidth(1.6).stroke();
  doc.circle(cx, cy, radius - 3).strokeColor('#b89047').lineWidth(0.8).stroke();
  doc.circle(cx, cy, radius - 8).fill('#0f2747');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(14).text('★', cx - 7, cy - 9);
  doc.restore();
}

function drawAuthorityEmblem(doc, cx, cy, radius) {
  doc.save();
  doc.circle(cx, cy, radius).strokeColor('#b89047').lineWidth(1).stroke();
  doc.circle(cx, cy, radius - 2).strokeColor('#0f2747').lineWidth(0.5).stroke();
  doc.fillColor('#0f2747').font('Helvetica-Bold').fontSize(10).text('★', cx - 5, cy - 6);
  doc.restore();
}

async function drawCleanTrainingCertificatePage(doc, {
  certificate,
  template,
  photoBuffer,
  sealBuffer,
  signatureBuffer,
  preview,
}) {
  const width = CERT_PAGE.width; // 841.89
  const height = CERT_PAGE.height; // 595.28

  // 1. Crisp white or light-gray background
  doc.rect(0, 0, width, height).fill('#fafaf9');

  // 2. Thin double-line rectangular border surrounding the page
  const outerMargin = 22;
  const innerMargin = 26;
  doc.save();
  doc.rect(outerMargin, outerMargin, width - outerMargin * 2, height - outerMargin * 2)
    .strokeColor('#0f2747')
    .lineWidth(1.8)
    .stroke();
  doc.rect(innerMargin, innerMargin, width - innerMargin * 2, height - innerMargin * 2)
    .strokeColor('#b89047')
    .lineWidth(0.8)
    .stroke();

  // Corner ornamental squares
  const cornerSize = 10;
  const corners = [
    [outerMargin, outerMargin],
    [width - outerMargin - cornerSize, outerMargin],
    [outerMargin, height - outerMargin - cornerSize],
    [width - outerMargin - cornerSize, height - outerMargin - cornerSize],
  ];
  for (const [cx, cy] of corners) {
    doc.rect(cx, cy, cornerSize, cornerSize).fill('#0f2747');
    doc.rect(cx + 2, cy + 2, cornerSize - 4, cornerSize - 4).strokeColor('#b89047').lineWidth(0.6).stroke();
  }
  doc.restore();

  // 3. Upper-Left Corner: Institution Logo (x: 46, y: 40)
  const logoBoxSize = 75;
  if (template._logoBuffer) {
    try {
      doc.image(template._logoBuffer, 46, 40, { fit: [logoBoxSize, logoBoxSize], align: 'center', valign: 'center' });
    } catch {
      drawVectorCrest(doc, 46 + logoBoxSize / 2, 40 + logoBoxSize / 2, 34);
    }
  } else {
    drawVectorCrest(doc, 46 + logoBoxSize / 2, 40 + logoBoxSize / 2, 34);
  }

  // 4. Near the top center: Official Seal / Authority Emblem
  if (sealBuffer) {
    try {
      doc.image(sealBuffer, width / 2 - 24, 34, { fit: [48, 48], align: 'center', valign: 'center' });
    } catch {
      drawAuthorityEmblem(doc, width / 2, 54, 20);
    }
  } else {
    drawAuthorityEmblem(doc, width / 2, 54, 20);
  }

  // 5. Upper-Right Corner: Trainee Photograph (x: 720, y: 40)
  const photoW = 76;
  const photoH = 92;
  const photoX = width - 46 - photoW;
  const photoY = 40;
  doc.save();
  doc.rect(photoX, photoY, photoW, photoH).fill('#ffffff').strokeColor('#0f2747').lineWidth(1.2).stroke();
  doc.rect(photoX + 2, photoY + 2, photoW - 4, photoH - 4).strokeColor('#b89047').lineWidth(0.6).stroke();
  if (photoBuffer) {
    try {
      doc.image(photoBuffer, photoX + 3, photoY + 3, { fit: [photoW - 6, photoH - 6], align: 'center', valign: 'center' });
    } catch {
      doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('TRAINEE PHOTO', photoX, photoY + photoH / 2 - 6, { width: photoW, align: 'center' });
    }
  } else {
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text('TRAINEE PHOTO', photoX, photoY + photoH / 2 - 6, { width: photoW, align: 'center' });
  }
  doc.restore();

  // 6. Centered Institution / Training Authority Header
  const headerX = 140;
  const headerW = width - 280;

  doc.fillColor('#0f2747').font('Helvetica-Bold').fontSize(8.5).text('FEDERAL DEMOCRATIC REPUBLIC OF ETHIOPIA', headerX, 38, {
    width: headerW,
    align: 'center',
    characterSpacing: 1.5,
  });
  doc.fillColor('#475569').font('Helvetica').fontSize(7.5).text('MINISTRY OF EDUCATION · HIGHER EDUCATION AUTHORITY', headerX, 50, {
    width: headerW,
    align: 'center',
    characterSpacing: 1,
  });

  const instName = template.institutionName || 'COLLEGE OF ADVANCED TECHNOLOGY & HEALTH SCIENCES';
  doc.fillColor('#0f172a').font('Times-Bold').fontSize(instName.length > 40 ? 17 : 20).text(instName, headerX, 70, {
    width: headerW,
    align: 'center',
  });

  if (template.institutionNameAmharic) {
    try {
      doc.font('NotoEthiopicBold').fontSize(11).fillColor('#334155').text(template.institutionNameAmharic, headerX, doc.y + 2, {
        width: headerW,
        align: 'center',
      });
    } catch {}
  }

  // Large, Bold, Centered Title in formal serif
  doc.fillColor('#0f2747').font('Times-Bold').fontSize(25).text('TRAINING COMPLETION CERTIFICATE', 46, 122, {
    width: width - 92,
    align: 'center',
    characterSpacing: 1.5,
  });

  // Dual-line decorative separator with centered gold diamond
  const divY = 156;
  doc.save();
  doc.moveTo(160, divY).lineTo(width / 2 - 20, divY).lineWidth(0.8).strokeColor('#b89047').stroke();
  doc.moveTo(width / 2 + 20, divY).lineTo(width - 160, divY).lineWidth(0.8).strokeColor('#b89047').stroke();
  doc.polygon([width / 2, divY - 4], [width / 2 + 5, divY], [width / 2, divY + 4], [width / 2 - 5, divY]).fill('#0f2747');
  doc.restore();

  // 7. Main Body
  doc.fillColor('#475569').font('Times-Italic').fontSize(12).text('This is to certify that', 46, 168, {
    width: width - 92,
    align: 'center',
  });

  const snap = certificate.studentSnapshot || {};
  const studentName = snap.fullName || 'Trainee Full Name';
  doc.fillColor('#0f172a').font('Times-Bold').fontSize(24).text(studentName, 46, 186, {
    width: width - 92,
    align: 'center',
  });

  // Name underline
  const nameWidth = Math.min(width - 240, doc.widthOfString(studentName) + 40);
  doc.save();
  doc.moveTo((width - nameWidth) / 2, 214).lineTo((width + nameWidth) / 2, 214).lineWidth(1).strokeColor('#b89047').stroke();
  doc.restore();

  doc.fillColor('#475569').font('Helvetica-Bold').fontSize(9).text(`STUDENT ID: ${snap.studentId || '—'}`, 46, 220, {
    width: width - 92,
    align: 'center',
    characterSpacing: 0.8,
  });

  doc.fillColor('#334155').font('Times-Roman').fontSize(11).text(
    'has satisfactorily completed the prescribed requirements and training curriculum for the award of:',
    46,
    236,
    { width: width - 92, align: 'center' },
  );

  // Structured Information Card (6 Placeholders / Fields)
  const cardX = 64;
  const cardW = width - 128;
  const cardY = 256;
  const cardH = 126;

  doc.save();
  doc.roundedRect(cardX, cardY, cardW, cardH, 6).fill('#ffffff').strokeColor('#cbd5e1').lineWidth(1).stroke();
  doc.restore();

  // 3 Columns x 2 Rows of Placeholders
  const colW = cardW / 3;
  const row1Y = cardY + 14;
  const row2Y = cardY + 68;

  const fields = [
    { label: 'SECTOR / FIELD OF STUDY', val: certificate.departmentSnapshot?.name || 'Information Technology', x: cardX + 16, y: row1Y },
    { label: 'TRAINING PROGRAMME', val: certificate.programSnapshot?.name || 'Computer Science', x: cardX + colW + 10, y: row1Y },
    { label: 'QUALIFICATION LEVEL', val: (certificate.programSnapshot?.qualificationType || 'Degree').toUpperCase(), x: cardX + colW * 2 + 10, y: row1Y },
    { label: 'TRAINING PERIOD', val: `${certificateDate(certificate.admissionDate || '2019-01-10')} — ${certificateDate(certificate.completionDate || new Date())}`, x: cardX + 16, y: row2Y },
    { label: 'CREDITS COMPLETED', val: `${certificate.earnedCredits || 0} / ${certificate.requiredCredits || 0} Credit Hours`, x: cardX + colW + 10, y: row2Y },
    { label: 'CUMULATIVE CGPA / GRADE', val: certificate.cgpa != null ? `${Number(certificate.cgpa).toFixed(2)} / 4.00 (${cgpaClassification(certificate.cgpa)})` : 'COMPLETED', x: cardX + colW * 2 + 10, y: row2Y },
  ];

  for (const f of fields) {
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7.5).text(f.label, f.x, f.y, { width: colW - 24 });
    doc.fillColor('#0f172a').font('Times-Bold').fontSize(11.5).text(f.val, f.x, f.y + 13, { width: colW - 24 });
  }

  // 8. Bottom Section: Signatures, Seal, Serial Number, and QR Code
  const botY = 405;

  // Dean's Signature (Left)
  const deanX = 54;
  const sigW = 160;
  doc.save();
  doc.moveTo(deanX, botY + 45).lineTo(deanX + sigW, botY + 45).lineWidth(0.8).strokeColor('#94a3b8').stroke();
  doc.restore();
  doc.fillColor('#0f2747').font('Helvetica-Bold').fontSize(9).text('Dean / Academic Director', deanX, botY + 49, { width: sigW, align: 'center' });
  doc.fillColor('#64748b').font('Helvetica').fontSize(7.5).text('College Leadership', deanX, botY + 61, { width: sigW, align: 'center' });

  // Registrar's Signature (Center-Left)
  const regX = 236;
  if (signatureBuffer) {
    try {
      doc.image(signatureBuffer, regX + 15, botY, { fit: [sigW - 30, 42], align: 'center' });
    } catch {}
  }
  doc.save();
  doc.moveTo(regX, botY + 45).lineTo(regX + sigW, botY + 45).lineWidth(0.8).strokeColor('#94a3b8').stroke();
  doc.restore();
  doc.fillColor('#0f2747').font('Helvetica-Bold').fontSize(9).text(template.signatoryName || 'Dr. Academic Registrar', regX, botY + 49, { width: sigW, align: 'center' });
  doc.fillColor('#64748b').font('Helvetica').fontSize(7.5).text(template.signatoryTitle || 'Office of the Academic Registrar', regX, botY + 61, { width: sigW, align: 'center' });

  // Official Stamp / Seal (Center)
  const stampX = 440;
  const stampY = botY + 30;
  doc.save();
  doc.circle(stampX, stampY, 32).strokeColor('#0f2747').lineWidth(1.2).stroke();
  doc.circle(stampX, stampY, 29).strokeColor('#b89047').lineWidth(0.6).stroke();
  doc.fillColor('#0f2747').font('Helvetica-Bold').fontSize(6).text('OFFICIAL REGISTRAR STAMP', stampX - 28, stampY - 12, { width: 56, align: 'center' });
  doc.fillColor('#b89047').font('Helvetica-Bold').fontSize(7).text('APPROVED', stampX - 28, stampY - 1, { width: 56, align: 'center' });
  doc.fillColor('#64748b').font('Helvetica').fontSize(5.5).text(formatEthiopian(certificate.issuedAt || new Date()), stampX - 28, stampY + 11, { width: 56, align: 'center' });
  doc.restore();

  // Certificate Serial Number & Verification Info (Center-Right)
  const infoX = 496;
  doc.fillColor('#64748b').font('Helvetica').fontSize(7.5).text('CERTIFICATE SERIAL NUMBER:', infoX, botY + 10);
  doc.fillColor('#0f2747').font('Helvetica-Bold').fontSize(10).text(certificate.certificateNumber || 'CERT-2019-XXXX', infoX, botY + 22);
  doc.fillColor('#64748b').font('Helvetica').fontSize(7.5).text('VERIFICATION REFERENCE:', infoX, botY + 38);
  doc.fillColor('#1e40af').font('Helvetica-Bold').fontSize(9.5).text(certificate.verificationId || 'V-XXXXXXXX', infoX, botY + 50);
  doc.fillColor('#64748b').font('Helvetica').fontSize(7).text(`Date of Issue: ${certificateDate(certificate.issuedAt)}`, infoX, botY + 64);

  // QR Code (Right, x: 724, y: botY - 5)
  const qrX = 724;
  const qrY = botY - 5;
  const qrSize = 64;
  const verifyUrl = `${template.verificationBaseUrl || 'https://sms-portal.edu/verify'}/${certificate.verificationId || certificate.certificateNumber || ''}`;

  try {
    const qrBuffer = await QRCode.toBuffer(verifyUrl, { width: 140, margin: 1, color: { dark: '#0f2747', light: '#ffffff' } });
    doc.save();
    doc.rect(qrX - 2, qrY - 2, qrSize + 4, qrSize + 4).fill('#ffffff').strokeColor('#cbd5e1').lineWidth(0.8).stroke();
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
    doc.restore();
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(6).text('SCAN TO VERIFY', qrX - 4, qrY + qrSize + 4, { width: qrSize + 8, align: 'center' });
  } catch {
    doc.save();
    doc.rect(qrX, qrY, qrSize, qrSize).strokeColor('#cbd5e1').lineWidth(1).stroke();
    doc.fillColor('#64748b').font('Helvetica-Bold').fontSize(7).text('VERIFY QR', qrX, qrY + 24, { width: qrSize, align: 'center' });
    doc.restore();
  }

  if (preview) watermark(doc, 'PREVIEW', CERT_PAGE);
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

function drawFittedText(doc, value, { x, y, width, color, bold = false, sans = false, maxSize = 12, minSize = 7, align = 'left', characterSpacing = 0 } = {}) {
  const text = String(value ?? '').trim();
  if (!text) return;
  const font = isEthiopic(text)
    ? fontNameFor(text, { bold })
    : sans
      ? bold
        ? 'Helvetica-Bold'
        : 'Helvetica'
      : fontNameFor(text, { bold });
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
  doc.rect(dx, dy, extent, extent).fill('#fdfcf1');
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
  const size = 113.39; // 4 cm at 72 points/inch (4x4 cm square)
  doc.save();
  doc.lineWidth(1.2).strokeColor('#b7a887').rect(x, y, size, size).stroke();
  if (buffer) {
    try {
      doc.image(buffer, x + 3, y + 3, { cover: [size - 6, size - 6], align: 'center', valign: 'center' });
    } catch {
      doc.fillColor('#6b7280').fontSize(9).font('Helvetica-Bold').text('4×4 PHOTO', x, y + 46, { width: size, align: 'center' });
      doc.font('Helvetica').fontSize(7.5).fillColor('#9ca3af').text('Affix photo here', x, y + 60, { width: size, align: 'center' });
    }
  } else {
    doc.fillColor('#4b5563').fontSize(9).font('Helvetica-Bold').text('4×4 PHOTO', x, y + 46, { width: size, align: 'center' });
    doc.font('Helvetica').fontSize(7.5).fillColor('#9ca3af').text('Affix photo here', x, y + 60, { width: size, align: 'center' });
  }
  doc.restore();
}

function drawSeal(doc, buffer, x, y) {
  if (!buffer) return;
  try {
    doc.image(buffer, x, y, { fit: [92, 92], align: 'center', valign: 'center' });
  } catch {
    // Graceful fallback when seal cannot be drawn
  }
}

function drawSignature(doc, buffer, x, y) {
  if (!buffer) return;
  try {
    doc.image(buffer, x, y, { fit: [140, 52], align: 'center', valign: 'center' });
  } catch {
    // Graceful fallback when signature cannot be drawn
  }
}

function certificateDate(value) {
  if (!value) return 'Date not recorded';
  return formatEthiopian(value);
}

function qualificationLabel(value) {
  const text = String(value || '').trim();
  if (!text) return '—';
  const minor = new Set(['of', 'and', 'in', 'the']);
  return text
    .replaceAll('-', ' ')
    .split(/\s+/)
    .map((word, index) =>
      index > 0 && minor.has(word.toLowerCase())
        ? word.toLowerCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}

function graduationYear(value, fallback) {
  const date = value ? new Date(value) : null;
  if (date && !Number.isNaN(date.getTime())) return String(date.getFullYear());
  const match = String(fallback || '').match(/\d{4}/);
  return match ? match[0] : '—';
}

function drawTemplateCertificatePage(doc, { certificate, template, photoBuffer, sealBuffer, signatureBuffer, preview, background }) {
  doc.rect(0, 0, CERT_PAGE.width, CERT_PAGE.height).fill('#fdfcf1');
  doc.save();
  doc.rect(0, 0, CERT_PAGE.width, CERT_PAGE.height).clip();
  const isFormal = Boolean(background && background.includes('Formal Training Completion Certificate'));
  if (isFormal) {
    doc.image(background, 0, 0, { width: CERT_PAGE.width, height: CERT_PAGE.height });
  } else {
    doc.image(background, TEMPLATE_X, 0, {
      width: TEMPLATE.width * TEMPLATE_SCALE,
      height: TEMPLATE.height * TEMPLATE_SCALE,
    });
  }
  doc.restore();

  const snapshot = certificate.studentSnapshot || {};
  const program = certificate.programSnapshot || {};

  // The template already contains the ornate frame and the static ceremony
  // wording. Replace only the sample-specific lines with the official record.
  paperPatch(doc, background, 245, 150, 710, 50);
  drawFittedText(doc, String(template.institutionName || 'Institution').toUpperCase(), {
    x: 245,
    y: 152,
    width: 710,
    color: '#0f2747',
    bold: true,
    maxSize: 30,
    minSize: 12,
    align: 'center',
  });

  paperPatch(doc, background, 255, 242, 690, 54);
  drawFittedText(doc, String(template.certificateTitle || 'Certificate of Graduation').toUpperCase(), {
    x: 255,
    y: 254,
    width: 690,
    color: '#0f2747',
    bold: true,
    maxSize: 22,
    minSize: 14,
    align: 'center',
  });

  paperPatch(doc, background, 370, 336, 460, 48);
  drawFittedText(doc, String(snapshot.fullName || 'Student name').toUpperCase(), {
    x: 370,
    y: 342,
    width: 460,
    color: '#b08d57',
    bold: true,
    maxSize: 30,
    minSize: 14,
    align: 'center',
    characterSpacing: 1.1,
  });

  paperPatch(doc, background, 300, 458, 182, 168);
  drawTemplatePhoto(doc, photoBuffer, 340, 472, 132);

  paperPatch(doc, background, 650, 470, 310, 140);
  const detailRows = [
    [snapshot.studentId || '—', 477],
    [certificate.departmentSnapshot?.name || '—', 505],
    [program.name || '—', 533],
    [qualificationLabel(program.qualificationType), 561],
    [graduationYear(certificate.completionDate, certificate.academicYearLabel), 589],
  ];
  for (const [value, y] of detailRows) {
    drawFittedText(doc, value, {
      x: 655,
      y,
      width: 300,
      color: '#1b2a23',
      sans: true,
      maxSize: 11,
      minSize: 8,
      align: 'left',
    });
  }

  paperPatch(doc, background, 442, 642, 320, 34);
  const cgpa = certificate.cgpa === null || certificate.cgpa === undefined ? '—' : Number(certificate.cgpa).toFixed(2);
  drawFittedText(doc, `CUMULATIVE GPA ${cgpa} / 4.00`, {
    x: 442,
    y: 646,
    width: 320,
    color: '#0f2747',
    bold: true,
    maxSize: 18,
    minSize: 11,
    align: 'center',
  });

  paperPatch(doc, background, 212, 678, 176, 142);
  if (sealBuffer) {
    try {
      doc.image(sealBuffer, tplX(228), tplY(695), {
        fit: [tplSize(140), tplSize(140)],
        align: 'center',
        valign: 'center',
      });
    } catch {
      // Safe fallback if seal cannot be embedded
    }
  }

  paperPatch(doc, background, 480, 695, 220, 82);
  if (signatureBuffer) {
    try {
      doc.image(signatureBuffer, tplX(515), tplY(700), {
        fit: [tplSize(170), tplSize(60)],
        align: 'center',
        valign: 'center',
      });
    } catch {
      // Safe fallback if signature cannot be embedded
    }
  }
  doc
    .moveTo(tplX(520), tplY(752))
    .lineTo(tplX(680), tplY(752))
    .lineWidth(0.6)
    .strokeColor('#8c9a92')
    .stroke();
  drawFittedText(doc, 'AUTHORIZED SIGNATURE', {
    x: 520,
    y: 758,
    width: 160,
    color: '#52645c',
    bold: true,
    sans: true,
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
    maxSize: 11,
    minSize: 7,
    align: 'center',
  });
  drawFittedText(doc, template.signatoryTitle || '', {
    x: 780,
    y: 770,
    width: 200,
    color: '#52645c',
    maxSize: 10,
    minSize: 6,
    align: 'center',
  });

  paperPatch(doc, background, 1010, 668, 108, 132);
  const verification = template.verificationBaseUrl
    ? `${template.verificationBaseUrl.replace(/\/+$/, '')}/${certificate.verificationId}`
    : certificate.verificationId;
  doc
    .rect(tplX(1012), tplY(676), tplSize(104), tplSize(120))
    .lineWidth(0.8)
    .strokeColor('#b08d57')
    .stroke();
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#0f2747').text('VERIFY', tplX(1012), tplY(688), {
    width: tplSize(104),
    align: 'center',
  });
  doc.font('Helvetica').fontSize(5.5).fillColor('#52645c').text(verification || '', tplX(1012), tplY(704), {
    width: tplSize(104),
    align: 'center',
  });

  paperPatch(doc, background, 525, 802, 150, 28);
  drawFittedText(doc, certificate.certificateNumber || 'PREVIEW', {
    x: 525,
    y: 808,
    width: 150,
    color: '#0f2747',
    sans: true,
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
  return new Promise(async (resolve, reject) => {
    try {
      fs.accessSync(ETHIOPIC_REGULAR);
      fs.accessSync(ETHIOPIC_BOLD);
    } catch {
      return reject(new AppError(500, 'FONT_MISSING', 'The Amharic font is missing from the server assets.'));
    }

    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 0,
      bufferPages: true,
      info: {
        Title: `${preview ? 'Preview — ' : ''}${template.certificateTitle || 'Training Completion Certificate'} — ${certificate.studentSnapshot?.fullName || ''}`,
        Author: template.institutionName || 'College of Higher Education',
        Subject: 'Official Training Completion Certificate and academic record',
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

    try {
      await drawCleanTrainingCertificatePage(doc, {
        certificate,
        template: merged,
        photoBuffer,
        sealBuffer,
        signatureBuffer,
        preview,
      });

      // Page 2: Official Course-by-Course Academic Record
      doc.addPage({ size: 'A4', layout: 'portrait', margin: 0 });
      drawAcademicRecord(doc, { certificate, template: merged, preview });
      addPageFooter(doc, merged);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

export function renderTranscriptPdf({ transcript, template, photoBuffer, logoBuffer }) {
  return new Promise((resolve, reject) => {
    try {
      fs.accessSync(ETHIOPIC_REGULAR);
      fs.accessSync(ETHIOPIC_BOLD);
    } catch {
      return reject(new AppError(500, 'FONT_MISSING', 'The Amharic font is missing from the server assets.'));
    }

    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      bufferPages: true,
      info: {
        Title: `Academic Transcript — ${transcript.studentSnapshot?.fullName || ''}`,
        Author: template?.institutionName || 'Registrar',
        Subject: 'Official Academic Transcript',
        Creator: 'SMS Academic Registrar',
      },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.registerFont('NotoEthiopic', ETHIOPIC_REGULAR);
    doc.registerFont('NotoEthiopicBold', ETHIOPIC_BOLD);

    const L = 36;
    const R = PAGE.width - 36;
    const W = R - L; // 523.28
    const T_BOTTOM = PAGE.height - 40;

    const drawHeader = (isContinuation = false) => {
      doc.rect(0, 0, PAGE.width, PAGE.height).fill('#ffffff');

      if (isContinuation) {
        doc.font('Times-Bold').fontSize(11).fillColor('#0f2747').text(
          `${template?.institutionName || 'College of Higher Education'} — Official Academic Transcript (Continued)`,
          L,
          26,
          { width: W, align: 'center' },
        );
        doc.moveTo(L, 42).lineTo(R, 42).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
        return 48;
      }

      // Institutional Logo
      if (logoBuffer) {
        try {
          doc.image(logoBuffer, L, 24, { fit: [46, 46] });
        } catch {}
      }

      // Centered College Names
      const collegeAmharic = template?.institutionNameAmharic || 'የከፍተኛ ትምህርት ኮሌጅ';
      const collegeEnglish = (template?.institutionName || 'COLLEGE OF HIGHER EDUCATION').toUpperCase();

      doc.font('NotoEthiopicBold').fontSize(14).fillColor('#0f2747').text(collegeAmharic, L, 22, {
        width: W,
        align: 'center',
      });
      doc.font('Times-Bold').fontSize(12).fillColor('#0f2747').text(collegeEnglish, L, 40, {
        width: W,
        align: 'center',
      });
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#8c6b2d').text('OFFICIAL ACADEMIC TRANSCRIPT', L, 56, {
        width: W,
        align: 'center',
        characterSpacing: 1.2,
      });

      // Top divider
      doc.moveTo(L, 72).lineTo(R, 72).lineWidth(0.75).strokeColor('#8c6b2d').stroke();

      // Serial & Date row
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#475569');
      doc.text(`SERIAL NO: ${(transcript.verificationId || '').toUpperCase()}`, L + 2, 77);
      doc.text(`DATE / TIME: ${certificateDate(transcript.issuedAt)}`, R - 180, 77, { width: 178, align: 'right' });

      doc.moveTo(L, 88).lineTo(R, 88).lineWidth(0.5).strokeColor('#cbd5e1').stroke();

      // Trainee Information Card (Two Columns)
      const cardY = 92;
      const cardH = 68;
      doc.rect(L, cardY, W, cardH).fill('#f8fafc');
      doc.rect(L, cardY, W, cardH).lineWidth(0.5).strokeColor('#e2e8f0').stroke();

      const snap = transcript.studentSnapshot || {};
      const prog = transcript.programSnapshot || {};
      const colW = (W - 20) / 2;
      const col1X = L + 10;
      const col2X = L + colW + 16;
      let ty = cardY + 7;

      const drawField = (x, y, label, value) => {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748b').text(label, x, y, { width: 85 });
        doc.font('Helvetica').fontSize(8).fillColor('#0f172a').text(String(value || '—'), x + 85, y, {
          width: colW - 88,
          ellipsis: true,
        });
      };

      drawField(col1X, ty, 'Trainee Name:', snap.fullName);
      drawField(col2X, ty, 'Programme:', prog.name);
      ty += 14;

      drawField(col1X, ty, 'Trainee ID:', snap.studentId);
      drawField(col2X, ty, 'Batch Code:', snap.batchCode || '—');
      ty += 14;

      drawField(col1X, ty, 'Sex:', snap.sex ? snap.sex.toUpperCase() : '—');
      drawField(col2X, ty, 'Admission Date:', snap.admissionDate ? certificateDate(snap.admissionDate) : '—');
      ty += 14;

      drawField(col1X, ty, 'Date of Birth:', snap.dateOfBirth ? certificateDate(snap.dateOfBirth) : '—');
      drawField(col2X, ty, 'Issue Date:', certificateDate(transcript.issuedAt));

      return cardY + cardH + 10;
    };

    let y = drawHeader(false);

    // Group courses by level/stage
    const stageGroups = new Map();
    for (const c of transcript.academicSnapshot || []) {
      const lvl = Number(c.level) || 1;
      if (!stageGroups.has(lvl)) stageGroups.set(lvl, []);
      stageGroups.get(lvl).push(c);
    }
    const stages = Array.from(stageGroups.entries()).sort(([a], [b]) => a - b);

    // Column coordinates
    // W = 523.28
    // sn: 26, code: 72, title: 215, hours: 50, mark: 52, letter: 50, points: 58.28
    const cols = {
      sn: { x: L, w: 26 },
      code: { x: L + 26, w: 72 },
      title: { x: L + 98, w: 215 },
      hours: { x: L + 313, w: 50 },
      mark: { x: L + 363, w: 52 },
      letter: { x: L + 415, w: 50 },
      points: { x: L + 465, w: 58.28 },
    };

    const drawTableHeader = (curY, stageLabel) => {
      // Stage Banner
      doc.rect(L, curY, W, 17).fill('#0f2747');
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff').text(stageLabel.toUpperCase(), L + 8, curY + 4, {
        width: W - 16,
      });
      curY += 17;

      // Grouped Header Row 1 & 2
      const hH = 26;
      doc.rect(L, curY, W, hH).fill('#f1f5f9');
      doc.rect(L, curY, W, hH).lineWidth(0.5).strokeColor('#cbd5e1').stroke();

      // Vertical lines inside header
      doc.moveTo(cols.code.x, curY).lineTo(cols.code.x, curY + hH).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
      doc.moveTo(cols.title.x, curY).lineTo(cols.title.x, curY + hH).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
      doc.moveTo(cols.hours.x, curY).lineTo(cols.hours.x, curY + hH).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
      doc.moveTo(cols.mark.x, curY).lineTo(cols.mark.x, curY + hH).lineWidth(0.5).strokeColor('#cbd5e1').stroke();

      // Top-level labels
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#334155');
      doc.text('S.N.', cols.sn.x, curY + 8, { width: cols.sn.w, align: 'center' });
      doc.text('Course Code', cols.code.x + 4, curY + 8, { width: cols.code.w - 8, align: 'left' });
      doc.text('Course Name', cols.title.x + 4, curY + 8, { width: cols.title.w - 8, align: 'left' });
      doc.text('Total Hours', cols.hours.x, curY + 8, { width: cols.hours.w, align: 'center' });

      // Grouped "Result" header
      const resW = cols.mark.w + cols.letter.w + cols.points.w;
      doc.text('Result', cols.mark.x, curY + 3, { width: resW, align: 'center' });
      doc.moveTo(cols.mark.x, curY + 13).lineTo(R, curY + 13).lineWidth(0.5).strokeColor('#cbd5e1').stroke();

      // Sub-columns
      doc.fontSize(7).text('Grade (Num)', cols.mark.x, curY + 16, { width: cols.mark.w, align: 'center' });
      doc.text('Grade (Ltr)', cols.letter.x, curY + 16, { width: cols.letter.w, align: 'center' });
      doc.text('Grade Point', cols.points.x, curY + 16, { width: cols.points.w, align: 'center' });

      doc.moveTo(cols.letter.x, curY + 13).lineTo(cols.letter.x, curY + hH).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
      doc.moveTo(cols.points.x, curY + 13).lineTo(cols.points.x, curY + hH).lineWidth(0.5).strokeColor('#cbd5e1').stroke();

      return curY + hH;
    };

    for (const [lvl, courseList] of stages) {
      const isDiploma = transcript.programSnapshot?.qualificationType === 'diploma';
      const stageName = isDiploma ? `Level ${lvl}` : `Year ${lvl}`;

      // Check if space is needed for table header + at least 2 rows + footer
      if (y + 110 > T_BOTTOM) {
        doc.addPage();
        y = drawHeader(true);
      }

      y = drawTableHeader(y, `${stageName} Academic Record`);

      let sn = 1;
      let stageCredits = 0;
      let stageQualityPoints = 0;

      for (const row of courseList) {
        if (y + 22 > T_BOTTOM) {
          doc.addPage();
          y = drawHeader(true);
          y = drawTableHeader(y, `${stageName} Academic Record (Continued)`);
        }

        const cr = Number(row.credits || 0);
        const pts = row.gradePoint != null ? Number(row.gradePoint) : null;
        stageCredits += cr;
        if (pts !== null && cr > 0) {
          stageQualityPoints += pts * cr;
        }

        const rowH = 18;
        // Alternating row background
        if (sn % 2 === 0) {
          doc.rect(L, y, W, rowH).fill('#f8fafc');
        }
        doc.rect(L, y, W, rowH).lineWidth(0.3).strokeColor('#e2e8f0').stroke();

        doc.font('Helvetica').fontSize(7.5).fillColor('#334155');
        doc.text(String(sn), cols.sn.x, y + 4.5, { width: cols.sn.w, align: 'center' });
        doc.font('Helvetica-Bold').text(row.code || '—', cols.code.x + 4, y + 4.5, {
          width: cols.code.w - 8,
          ellipsis: true,
        });
        doc.font('Helvetica').text(row.title || '—', cols.title.x + 4, y + 4.5, {
          width: cols.title.w - 8,
          ellipsis: true,
        });
        doc.text(String(cr || '—'), cols.hours.x, y + 4.5, { width: cols.hours.w, align: 'center' });
        doc.text(row.mark != null ? String(row.mark) : '—', cols.mark.x, y + 4.5, {
          width: cols.mark.w - 4,
          align: 'right',
        });
        doc.font('Helvetica-Bold').text(row.letterGrade || '—', cols.letter.x, y + 4.5, {
          width: cols.letter.w,
          align: 'center',
        });
        doc.font('Helvetica').text(pts != null ? pts.toFixed(2) : '—', cols.points.x, y + 4.5, {
          width: cols.points.w - 6,
          align: 'right',
        });

        y += rowH;
        sn += 1;
      }

      // Stage Footer (Total Hours & Stage GPA)
      const stageGpa = stageCredits > 0 ? stageQualityPoints / stageCredits : null;
      const footH = 18;
      doc.rect(L, y, W, footH).fill('#f1f5f9');
      doc.rect(L, y, W, footH).lineWidth(0.5).strokeColor('#cbd5e1').stroke();

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0f2747');
      doc.text(`Total Hours: ${stageCredits}`, L + 8, y + 4.5);
      doc.text(
        `${stageName} GPA: ${stageGpa != null ? stageGpa.toFixed(2) : '—'}`,
        R - 180,
        y + 4.5,
        { width: 172, align: 'right' },
      );

      y += footH + 10;
    }

    // Check space for Summary + Footer
    if (y + 115 > T_BOTTOM) {
      doc.addPage();
      y = drawHeader(true);
    }

    // Overall Cumulative Summary Box
    const sumH = 24;
    doc.rect(L, y, W, sumH).fill('#e0f2fe');
    doc.rect(L, y, W, sumH).lineWidth(0.75).strokeColor('#7dd3fc').stroke();

    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0369a1');
    doc.text(`CUMULATIVE TOTAL HOURS: ${transcript.totalCredits ?? 0}`, L + 12, y + 7);
    doc.text(
      `CUMULATIVE CGPA: ${transcript.cgpa != null ? Number(transcript.cgpa).toFixed(2) : '—'} / 4.00`,
      R - 220,
      y + 7,
      { width: 208, align: 'right' },
    );

    y += sumH + 14;

    // Official Footer (Signature, Stamp, Verification)
    const footCardY = y;
    const signW = 180;

    // Official Stamp
    doc.rect(L + 16, footCardY, 120, 48).lineWidth(0.5).strokeColor('#94a3b8').stroke();
    doc.font('Helvetica').fontSize(7).fillColor('#64748b').text('OFFICIAL STAMP', L + 16, footCardY + 20, {
      width: 120,
      align: 'center',
    });

    // Official Signature
    const signX = R - signW - 10;
    doc.moveTo(signX, footCardY + 32).lineTo(signX + signW, footCardY + 32).lineWidth(0.6).strokeColor('#475569').stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f2747').text(
      template?.signatoryName || 'Dr. Abebe Bekele',
      signX,
      footCardY + 35,
      { width: signW, align: 'center' },
    );
    doc.font('Helvetica').fontSize(7).fillColor('#64748b').text(
      template?.signatoryTitle || 'Dean & Academic Registrar',
      signX,
      footCardY + 45,
      { width: signW, align: 'center' },
    );

    // Verification Info & Page Numbering across all pages
    const verificationUrl = template?.verificationBaseUrl
      ? `${template.verificationBaseUrl.replace(/\/+$/, '')}/${transcript.verificationId}`
      : `http://localhost:5173/verify/${transcript.verificationId}`;

    const range = doc.bufferedPageRange();
    for (let index = 0; index < range.count; index += 1) {
      doc.switchToPage(range.start + index);
      doc.moveTo(L, PAGE.height - 34).lineTo(R, PAGE.height - 34).lineWidth(0.4).strokeColor('#e2e8f0').stroke();
      doc.font('Helvetica').fontSize(6.5).fillColor('#64748b').text(
        `Verification URL: ${verificationUrl}   •   Serial: ${transcript.verificationId}   •   Page ${index + 1} of ${range.count}`,
        L,
        PAGE.height - 28,
        { width: W, align: 'center' },
      );
    }

    doc.end();
  });
}
