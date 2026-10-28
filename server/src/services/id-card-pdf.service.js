import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { formatEthiopian } from '../utils/ethiopianDate.js';

// CR80 Card Dimensions (Horizontal: 85.6 x 54 mm scaled to 340 x 215 pt for crisp rendering)
export const CARD_WIDTH = 340;
export const CARD_HEIGHT = 215;

function formatDate(date) {
  if (!date) return '____________________';
  try {
    return formatEthiopian(date);
  } catch {
    return String(date).slice(0, 10);
  }
}

function drawSchoolLogo(doc, x, y, size = 22) {
  doc.save();
  doc.circle(x + size / 2, y + size / 2, size / 2).strokeColor('#ffffff').lineWidth(1).stroke();
  doc.circle(x + size / 2, y + size / 2, size / 2 - 2).fill('#0d9488');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(size * 0.45).text('★', x, y + size * 0.22, {
    width: size,
    align: 'center',
  });
  doc.restore();
}

function drawWatermark(doc, cx, cy, radius = 55) {
  doc.save();
  doc.opacity(0.04);
  doc.circle(cx, cy, radius).strokeColor('#0f2747').lineWidth(4).stroke();
  doc.circle(cx, cy, radius - 8).strokeColor('#0d9488').lineWidth(2).stroke();
  doc.circle(cx, cy, radius - 18).fill('#0f2747');
  doc.fillColor('#0f2747').font('Helvetica-Bold').fontSize(36).text('★', cx - 18, cy - 24);
  doc.restore();
}

/**
 * Draws the front side of a single CR80 student ID card onto the current doc context.
 */
export async function drawSingleIdCardFront(doc, { idCard = {}, photoBuffer = null, originX = 0, originY = 0 }) {
  const snap = idCard.studentSnapshot || {};
  const ox = originX;
  const oy = originY;

  doc.save();

  // 1. Clean white background
  doc.rect(ox, oy, CARD_WIDTH, CARD_HEIGHT).fill('#ffffff');
  // Thin border
  doc.rect(ox, oy, CARD_WIDTH, CARD_HEIGHT).strokeColor('#0f2747').lineWidth(1.2).stroke();

  // 2. Top Header Bar: Navy Blue with Teal accent stripe
  const headerH = 34;
  doc.rect(ox, oy, CARD_WIDTH, headerH).fill('#0f2747');
  doc.rect(ox, oy + headerH, CARD_WIDTH, 2.5).fill('#0d9488');

  // School Logo placeholder (Upper-Left corner)
  drawSchoolLogo(doc, ox + 8, oy + 6, 22);

  // Institution name and department at the top
  const instName = 'COLLEGE OF HIGHER EDUCATION';
  const deptName = snap.departmentName || 'DEPARTMENT OF STUDY';
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9).text(instName, ox + 36, oy + 8, {
    width: CARD_WIDTH - 44,
    ellipsis: true,
  });
  doc.fillColor('#5eead4').font('Helvetica').fontSize(6.5).text(deptName.toUpperCase(), ox + 36, oy + 21, {
    width: CARD_WIDTH - 44,
    ellipsis: true,
  });

  // 3. Centered low-opacity background watermark
  drawWatermark(doc, ox + CARD_WIDTH / 2 - 20, oy + CARD_HEIGHT / 2 + 10, 48);

  // 4. Right side: 4 × 4 cm student photograph placeholder with a thin border
  const photoW = 76;
  const photoH = 92;
  const photoX = ox + CARD_WIDTH - photoW - 10;
  const photoY = oy + headerH + 8;

  doc.rect(photoX, photoY, photoW, photoH).fill('#ffffff').strokeColor('#0f2747').lineWidth(1).stroke();
  doc.rect(photoX + 1.5, photoY + 1.5, photoW - 3, photoH - 3).strokeColor('#0d9488').lineWidth(0.5).stroke();

  if (photoBuffer) {
    try {
      doc.image(photoBuffer, photoX + 2, photoY + 2, { fit: [photoW - 4, photoH - 4], align: 'center', valign: 'center' });
    } catch {
      doc.fillColor('#64748b').font('Helvetica').fontSize(6.5).text('4 × 4 cm PHOTO', photoX, photoY + photoH / 2 - 4, {
        width: photoW,
        align: 'center',
      });
    }
  } else {
    doc.fillColor('#64748b').font('Helvetica').fontSize(6.5).text('4 × 4 cm PHOTO', photoX, photoY + photoH / 2 - 4, {
      width: photoW,
      align: 'center',
    });
  }

  // 5. Left and Center: Arranged clearly labeled fields using clean typography and consistent spacing
  const col1X = ox + 10;
  const col1W = 115;
  const col2X = ox + 128;
  const col2W = photoX - col2X - 6;

  let fieldY = oy + headerH + 7;
  const lineGap = 9.8;

  // Primary Highlights: Full Name and ID
  doc.fillColor('#0f2747').font('Helvetica-Bold').fontSize(6.5).text('STUDENT NAME:', col1X, fieldY);
  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(7.5).text(snap.fullName || '____________________', col1X + 60, fieldY, {
    width: CARD_WIDTH - (col1X + 60) - photoW - 12,
    ellipsis: true,
  });
  fieldY += 11;

  doc.fillColor('#0f2747').font('Helvetica-Bold').fontSize(6.5).text('STUDENT ID:', col1X, fieldY);
  doc.fillColor('#1d4ed8').font('Helvetica-Bold').fontSize(7.5).text(snap.studentId || '____________________', col1X + 60, fieldY);
  fieldY += 11;

  // Clearly labeled fields list (Column 1 & 2)
  const leftFields = [
    ['Department:', snap.departmentName || '____________________'],
    ['Programme:', snap.programName || '____________________'],
    ['Qualification:', (snap.qualificationType || 'Degree').toUpperCase()],
    ['Delivery Stream:', (snap.category || 'Regular').toUpperCase()],
    ['Admission Year:', snap.admissionYear || '2019'],
    ['Admission Date:', formatDate(snap.admissionDate)],
    ['Completion Date:', formatDate(snap.completionDate)],
  ];

  const rightFields = [
    ['Batch:', snap.batchCode || '2019 Regular'],
    ['Sex:', snap.gender || snap.sex || '—'],
    ['Date of Birth:', formatDate(snap.dob)],
    ['Email:', snap.email ? String(snap.email).slice(0, 16) : '—'],
    ['Phone:', snap.phone || '—'],
    ['Student Status:', (snap.studentStatus || 'Active').toUpperCase()],
  ];

  let curY1 = fieldY;
  for (const [lbl, val] of leftFields) {
    doc.fillColor('#475569').font('Helvetica-Bold').fontSize(5.2).text(lbl, col1X, curY1, { width: 50 });
    doc.fillColor('#0f172a').font('Helvetica').fontSize(5.5).text(String(val), col1X + 52, curY1, { width: 62, ellipsis: true });
    curY1 += lineGap;
  }

  let curY2 = fieldY;
  for (const [lbl, val] of rightFields) {
    doc.fillColor('#475569').font('Helvetica-Bold').fontSize(5.2).text(lbl, col2X, curY2, { width: 44 });
    doc.fillColor('#0f172a').font('Helvetica').fontSize(5.5).text(String(val), col2X + 46, curY2, { width: col2W - 46, ellipsis: true });
    curY2 += lineGap;
  }

  // 6. Bottom Section: Signature, Issue Date, QR Code, and Issue Counter
  const bottomY = oy + CARD_HEIGHT - 32;

  // Signature line
  doc.save();
  doc.moveTo(col1X, bottomY + 14).lineTo(col1X + 85, bottomY + 14).lineWidth(0.6).strokeColor('#94a3b8').stroke();
  doc.restore();
  doc.fillColor('#64748b').font('Helvetica').fontSize(4.8).text('Authorized Signature: ____________________', col1X, bottomY + 16, { width: 95 });

  // Issue Date
  doc.fillColor('#475569').font('Helvetica-Bold').fontSize(5).text(`Card Issue Date: ${formatDate(idCard.issuedAt)}`, col1X + 96, bottomY + 16);

  // Issue Counter Pill
  doc.save();
  doc.roundedRect(col1X + 185, bottomY + 13, 62, 12, 3).fill('#f0fdfa').strokeColor('#0d9488').lineWidth(0.6).stroke();
  doc.fillColor('#0f766e').font('Helvetica-Bold').fontSize(5.5).text(`Issue #${idCard.issueNumber || 1} of 4`, col1X + 185, bottomY + 16, {
    width: 62,
    align: 'center',
  });
  doc.restore();

  // Small QR-code placeholder for student record verification (Bottom Right)
  const qrX = ox + CARD_WIDTH - 32;
  const qrY = bottomY + 2;
  const qrSize = 24;
  const verifyUrl = `https://sms-portal.edu/verify/student/${snap.studentId || idCard.student || ''}`;

  try {
    const qrBuffer = await QRCode.toBuffer(verifyUrl, { width: 60, margin: 0, color: { dark: '#0f2747', light: '#ffffff' } });
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
  } catch {
    doc.save();
    doc.rect(qrX, qrY, qrSize, qrSize).strokeColor('#0f2747').lineWidth(0.6).stroke();
    doc.fillColor('#0f2747').font('Helvetica').fontSize(4.5).text('QR VERIFY', qrX, qrY + 9, { width: qrSize, align: 'center' });
    doc.restore();
  }

  doc.restore();
}

/**
 * Draws the back side (Academic Progression Section) of a single CR80 card.
 */
export function drawSingleIdCardBack(doc, { idCard = {}, originX = 0, originY = 0 }) {
  const ox = originX;
  const oy = originY;
  const snap = idCard.studentSnapshot || {};
  const promoted = idCard.promotedStages || [];
  const level = idCard.currentLevel || 1;

  doc.save();

  // Clean white background & double border
  doc.rect(ox, oy, CARD_WIDTH, CARD_HEIGHT).fill('#ffffff');
  doc.rect(ox, oy, CARD_WIDTH, CARD_HEIGHT).strokeColor('#0f2747').lineWidth(1.2).stroke();
  doc.rect(ox + 3, oy + 3, CARD_WIDTH - 6, CARD_HEIGHT - 6).strokeColor('#0d9488').lineWidth(0.6).stroke();

  // Top Navy & Teal Banner
  doc.rect(ox + 4, oy + 4, CARD_WIDTH - 8, 22).fill('#0f2747');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8).text('ACADEMIC PROGRESSION RECORD', ox + 4, oy + 8, {
    width: CARD_WIDTH - 8,
    align: 'center',
    characterSpacing: 0.8,
  });
  doc.fillColor('#5eead4').font('Helvetica').fontSize(5.5).text('Institutional Verification of Annual Advancement', ox + 4, oy + 18, {
    width: CARD_WIDTH - 8,
    align: 'center',
  });

  // Academic progression section with four clearly labeled blank lines:
  // Year 1: ____________________
  // Year 2: ____________________
  // Year 3: ____________________
  // Year 4: ____________________
  const startY = oy + 36;
  const rowHeight = 28;

  for (let s = 1; s <= 4; s++) {
    const y = startY + (s - 1) * rowHeight;
    const isPromoted = promoted.includes(s) || level > s;

    // Slot box
    doc.roundedRect(ox + 12, y, CARD_WIDTH - 24, 24, 3)
      .fill(isPromoted ? '#f0fdf4' : '#fafafa')
      .strokeColor(isPromoted ? '#86efac' : '#cbd5e1')
      .lineWidth(0.8)
      .stroke();

    // Stage Label
    doc.fillColor('#0f2747').font('Helvetica-Bold').fontSize(7.5).text(`Year ${s}:`, ox + 18, y + 8);

    if (isPromoted) {
      // Official promotion seal
      doc.roundedRect(ox + 60, y + 3, CARD_WIDTH - 86, 18, 2)
        .fill('#dcfce7')
        .strokeColor('#16a34a')
        .lineWidth(0.8)
        .stroke();
      doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(6.5).text('✓ PROMOTED · REGISTRAR APPROVED', ox + 60, y + 7, {
        width: CARD_WIDTH - 86,
        align: 'center',
      });
    } else {
      // Clearly labeled blank line: ____________________
      doc.fillColor('#64748b').font('Helvetica').fontSize(8).text('________________________________________', ox + 60, y + 6);
    }
  }

  // Footer & Return Notice
  doc.fillColor('#475569').font('Helvetica').fontSize(5.2).text(
    'This card is institutional property. If found, return to Office of the Registrar. Maximum 4 replacements permitted.',
    ox + 10,
    oy + CARD_HEIGHT - 18,
    { width: CARD_WIDTH - 20, align: 'center' },
  );

  doc.restore();
}

/**
 * Generate a standalone 2-sided PDF for a single student ID card.
 */
export async function generateIdCardPdf({ idCard, photoBuffer }) {
  const doc = new PDFDocument({
    size: [CARD_WIDTH, CARD_HEIGHT],
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    autoFirstPage: false,
  });

  const buffers = [];
  doc.on('data', (chunk) => buffers.push(chunk));

  // Page 1: Front
  doc.addPage({ size: [CARD_WIDTH, CARD_HEIGHT], margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  await drawSingleIdCardFront(doc, { idCard, photoBuffer, originX: 0, originY: 0 });

  // Page 2: Back (Academic Progression Record)
  doc.addPage({ size: [CARD_WIDTH, CARD_HEIGHT], margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  drawSingleIdCardBack(doc, { idCard, originX: 0, originY: 0 });

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
  });
}

/**
 * Generate all students' ID cards in one single PDF on A4 Landscape print sheets.
 * Formats multiple CR80 cards per landscape sheet with trim lines, saving time and paper.
 */
export async function generateBulkIdCardsLandscapePdf({ cardsWithPhotos = [], batchInfo = {} }) {
  // A4 Landscape: 841.89 x 595.28 pt
  const SHEET_W = 841.89;
  const SHEET_H = 595.28;

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: { top: 20, bottom: 20, left: 30, right: 30 },
    autoFirstPage: false,
  });

  const buffers = [];
  doc.on('data', (chunk) => buffers.push(chunk));

  // Lay out 4 cards per sheet (2 cols x 2 rows)
  // Cards are 340 x 215 pt.
  // Sheet is 841.89 x 595.28 pt.
  // Col 1: x = 50, Col 2: x = 450
  // Row 1: y = 50, Row 2: y = 300
  const POSITIONS = [
    { x: 55, y: 50 },
    { x: 445, y: 50 },
    { x: 55, y: 310 },
    { x: 445, y: 310 },
  ];

  // Process cards in batches of 4
  for (let i = 0; i < cardsWithPhotos.length; i += 4) {
    const chunk = cardsWithPhotos.slice(i, i + 4);

    // Fronts Sheet
    doc.addPage({ size: 'A4', layout: 'landscape', margins: { top: 20, bottom: 20, left: 30, right: 30 } });

    // Sheet Header
    doc.fillColor('#0f2747').font('Helvetica-Bold').fontSize(10).text(
      `STUDENT ID CARDS PRINT SHEET · ${batchInfo.programName || 'PROGRAMME'} · BATCH ${batchInfo.batchCode || '2019'} (FRONTS)`,
      30,
      16,
      { width: SHEET_W - 60, align: 'left' },
    );

    for (let c = 0; c < chunk.length; c++) {
      const pos = POSITIONS[c];
      await drawSingleIdCardFront(doc, {
        idCard: chunk[c].idCard,
        photoBuffer: chunk[c].photoBuffer,
        originX: pos.x,
        originY: pos.y,
      });
    }

    // Backs Sheet (Academic Progression Records)
    doc.addPage({ size: 'A4', layout: 'landscape', margins: { top: 20, bottom: 20, left: 30, right: 30 } });

    doc.fillColor('#0f2747').font('Helvetica-Bold').fontSize(10).text(
      `STUDENT ID CARDS PRINT SHEET · ${batchInfo.programName || 'PROGRAMME'} · BATCH ${batchInfo.batchCode || '2019'} (BACKS · PROGRESSION RECORDS)`,
      30,
      16,
      { width: SHEET_W - 60, align: 'left' },
    );

    for (let c = 0; c < chunk.length; c++) {
      const pos = POSITIONS[c];
      drawSingleIdCardBack(doc, {
        idCard: chunk[c].idCard,
        originX: pos.x,
        originY: pos.y,
      });
    }
  }

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
  });
}
