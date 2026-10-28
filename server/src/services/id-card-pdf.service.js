import PDFDocument from 'pdfkit';

// Exact 75 × 90 mm Portrait Dimensions in points (1 mm = 72 / 25.4 ≈ 2.83464567 pt)
export const CARD_WIDTH = 212.6;
export const CARD_HEIGHT = 255.1;

function drawSchoolLogo(doc, x, y, size = 18) {
  doc.save();
  doc.circle(x + size / 2, y + size / 2, size / 2).strokeColor('#ffffff').lineWidth(0.8).stroke();
  doc.circle(x + size / 2, y + size / 2, size / 2 - 1.5).fill('#0d9488');
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(size * 0.45).text('★', x, y + size * 0.22, {
    width: size,
    align: 'center',
  });
  doc.restore();
}

function drawWatermark(doc, cx, cy, radius = 42) {
  doc.save();
  doc.opacity(0.04);
  doc.circle(cx, cy, radius).strokeColor('#0f2747').lineWidth(3).stroke();
  doc.circle(cx, cy, radius - 6).strokeColor('#0d9488').lineWidth(1.5).stroke();
  doc.circle(cx, cy, radius - 14).fill('#0f2747');
  doc.fillColor('#0f2747').font('Helvetica-Bold').fontSize(26).text('★', cx - 13, cy - 18);
  doc.restore();
}

/**
 * Draws the front side of a single 75 × 90 mm student ID card onto the current doc context.
 * Strictly 1 single page.
 * Displays only: Student Name, Student ID, Programme, Gender, Phone, Photo, and College Header.
 * No QR code.
 */
export async function drawSingleIdCardFront(doc, { idCard = {}, photoBuffer = null, originX = 0, originY = 0 }) {
  const snap = idCard.studentSnapshot || {};
  const student = idCard.student || {};
  const ox = originX;
  const oy = originY;

  const fullName = (snap.fullName || student.fullName || '—').trim();
  const studentId = (snap.studentId || student.studentId || '—').trim();
  const programName = (snap.programName || student.program?.name || '—').trim();

  let rawGender = snap.gender || snap.sex || student.sex || student.gender || '—';
  if (rawGender && rawGender !== '—') {
    rawGender = rawGender.charAt(0).toUpperCase() + rawGender.slice(1).toLowerCase();
  }
  const gender = rawGender;
  const phone = snap.phone || student.phone || '—';

  doc.save();

  // 1. Crisp white background with rounded corner frame
  doc.roundedRect(ox, oy, CARD_WIDTH, CARD_HEIGHT, 4).fill('#ffffff');
  // Outer deep navy border
  doc.roundedRect(ox, oy, CARD_WIDTH, CARD_HEIGHT, 4).strokeColor('#0f2747').lineWidth(1.2).stroke();
  // Inner subtle border
  doc.roundedRect(ox + 2, oy + 2, CARD_WIDTH - 4, CARD_HEIGHT - 4, 3).strokeColor('#0d9488').lineWidth(0.5).stroke();

  // 2. Top Header Bar: Navy Blue with Teal accent stripe
  const headerH = 30;
  doc.rect(ox + 2, oy + 2, CARD_WIDTH - 4, headerH).fill('#0f2747');
  doc.rect(ox + 2, oy + headerH + 2, CARD_WIDTH - 4, 2).fill('#0d9488');

  // School Logo placeholder (Upper-Left corner)
  drawSchoolLogo(doc, ox + 6, oy + 7, 18);

  // Institution title and ID subtitle
  const instName = 'COLLEGE OF HIGHER EDUCATION';
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5).text(instName, ox + 28, oy + 8, {
    width: CARD_WIDTH - 34,
    ellipsis: true,
  });
  doc.fillColor('#5eead4').font('Helvetica-Bold').fontSize(5.2).text('STUDENT IDENTITY CARD', ox + 28, oy + 19, {
    width: CARD_WIDTH - 34,
    characterSpacing: 0.8,
  });

  // 3. Centered subtle background watermark
  drawWatermark(doc, ox + CARD_WIDTH / 2, oy + CARD_HEIGHT / 2 + 15, 38);

  // 4. Student Photograph: Centered horizontally near the top
  const photoW = 58;
  const photoH = 68;
  const photoX = ox + (CARD_WIDTH - photoW) / 2;
  const photoY = oy + headerH + 8;

  // Photo frame
  doc.rect(photoX, photoY, photoW, photoH).fill('#f8fafc').strokeColor('#0f2747').lineWidth(1).stroke();
  doc.rect(photoX + 1.5, photoY + 1.5, photoW - 3, photoH - 3).strokeColor('#0d9488').lineWidth(0.5).stroke();

  if (photoBuffer) {
    try {
      doc.image(photoBuffer, photoX + 2, photoY + 2, {
        fit: [photoW - 4, photoH - 4],
        align: 'center',
        valign: 'center',
      });
    } catch {
      doc.fillColor('#64748b').font('Helvetica').fontSize(6).text('PHOTO', photoX, photoY + photoH / 2 - 4, {
        width: photoW,
        align: 'center',
      });
    }
  } else {
    doc.fillColor('#64748b').font('Helvetica').fontSize(6).text('PHOTO', photoX, photoY + photoH / 2 - 4, {
      width: photoW,
      align: 'center',
    });
  }

  // 5. Student Information Section: Exactly the requested fields
  // Student Name, Student ID, Programme, Gender, Phone
  const infoStartY = photoY + photoH + 8;
  const colLeftX = ox + 14;
  const labelW = 54;
  const valueX = colLeftX + labelW;
  const valueW = CARD_WIDTH - valueX - 14;
  const rowH = 17.5;

  const fields = [
    { label: 'Student Name', value: fullName, bold: true, color: '#0f172a' },
    { label: 'Student ID', value: studentId, bold: true, color: '#1d4ed8' },
    { label: 'Programme', value: programName, bold: false, color: '#0f172a' },
    { label: 'Gender', value: gender, bold: false, color: '#0f172a' },
    { label: 'Phone', value: phone, bold: false, color: '#0f172a' },
  ];

  fields.forEach((f, idx) => {
    const y = infoStartY + idx * rowH;

    // Light alternating zebra background for rows
    if (idx % 2 === 0) {
      doc.roundedRect(colLeftX - 3, y - 2, CARD_WIDTH - 22, 16, 2).fill('#f8fafc');
    }

    // Label
    doc.fillColor('#475569').font('Helvetica-Bold').fontSize(5.8).text(f.label, colLeftX, y + 1, {
      width: labelW - 4,
    });
    doc.fillColor('#94a3b8').font('Helvetica-Bold').fontSize(5.8).text(':', colLeftX + labelW - 6, y + 1);

    // Value
    doc.fillColor(f.color)
      .font(f.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(6.8)
      .text(f.value, valueX, y + 0.5, {
        width: valueW,
        ellipsis: true,
      });
  });

  // 6. Bottom Footer: Single page - issue counter & official notice
  const footerY = oy + CARD_HEIGHT - 24;

  // Thin separator line
  doc.moveTo(ox + 12, footerY).lineTo(ox + CARD_WIDTH - 12, footerY).lineWidth(0.5).strokeColor('#cbd5e1').stroke();

  // Left notice
  doc.fillColor('#64748b').font('Helvetica').fontSize(4.6).text('Office of the Registrar', ox + 12, footerY + 5, {
    width: 90,
  });

  // Right issue counter pill
  const pillW = 54;
  const pillH = 11;
  const pillX = ox + CARD_WIDTH - pillW - 12;
  const pillY = footerY + 3;

  doc.roundedRect(pillX, pillY, pillW, pillH, 2.5).fill('#f0fdfa').strokeColor('#0d9488').lineWidth(0.5).stroke();
  doc.fillColor('#0f766e').font('Helvetica-Bold').fontSize(5).text(`Issue #${idCard.issueNumber || 1} of 4`, pillX, pillY + 2.5, {
    width: pillW,
    align: 'center',
  });

  doc.restore();
}

/**
 * Generate a standalone 1-page PDF for a single 75 × 90 mm student ID card.
 */
export async function generateIdCardPdf({ idCard, photoBuffer }) {
  const doc = new PDFDocument({
    size: [CARD_WIDTH, CARD_HEIGHT],
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    autoFirstPage: false,
  });

  const buffers = [];
  doc.on('data', (chunk) => buffers.push(chunk));

  // Exactly 1 single 75 × 90 mm page
  doc.addPage({ size: [CARD_WIDTH, CARD_HEIGHT], margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  await drawSingleIdCardFront(doc, { idCard, photoBuffer, originX: 0, originY: 0 });

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
  });
}

/**
 * Generate all students' ID cards in one single PDF on A4 Landscape print sheets.
 * Places 6 cards (3 columns × 2 rows) of 75 × 90 mm cards on each A4 Landscape page.
 * Strictly 1 side (no back page).
 */
export async function generateBulkIdCardsLandscapePdf({ cardsWithPhotos = [], batchInfo = {} }) {
  // A4 Landscape: 841.89 x 595.28 pt
  const SHEET_W = 841.89;
  const SHEET_H = 595.28;

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: { top: 15, bottom: 15, left: 25, right: 25 },
    autoFirstPage: false,
  });

  const buffers = [];
  doc.on('data', (chunk) => buffers.push(chunk));

  // Lay out 6 cards per sheet (3 cols x 2 rows)
  // Horizontal: CARD_WIDTH = 212.6.
  // 3 * 212.6 = 637.8. Remaining: 841.89 - 637.8 = 204.09 pt.
  // Margins: left = 40, col gap = 62, right = 40.09.
  // Col 0: 40, Col 1: 314.6, Col 2: 589.2.
  // Vertical: CARD_HEIGHT = 255.1.
  // 2 * 255.1 = 510.2. Remaining: 595.28 - 510.2 = 85.08 pt.
  // Top: 38, row gap = 24, bottom = 23.08.
  // Row 0: 38, Row 1: 317.1.
  const POSITIONS_6 = [
    { x: 40, y: 38 },
    { x: 314.6, y: 38 },
    { x: 589.2, y: 38 },
    { x: 40, y: 317.1 },
    { x: 314.6, y: 317.1 },
    { x: 589.2, y: 317.1 },
  ];

  // Process cards in batches of 6 per sheet
  for (let i = 0; i < cardsWithPhotos.length; i += 6) {
    const chunk = cardsWithPhotos.slice(i, i + 6);

    doc.addPage({ size: 'A4', layout: 'landscape', margins: { top: 15, bottom: 15, left: 25, right: 25 } });

    // Sheet Header Banner
    doc.fillColor('#0f2747').font('Helvetica-Bold').fontSize(9.5).text(
      `STUDENT ID CARDS PRINT SHEET (75 × 90 mm) · ${batchInfo.programName || 'PROGRAMME'} · BATCH ${batchInfo.batchCode || '2019'}`,
      40,
      16,
      { width: SHEET_W - 80, align: 'left' },
    );

    doc.fillColor('#64748b').font('Helvetica').fontSize(7.5).text(
      `Page ${Math.floor(i / 6) + 1} of ${Math.ceil(cardsWithPhotos.length / 6)} · ${cardsWithPhotos.length} Total Student ID Cards`,
      40,
      16,
      { width: SHEET_W - 80, align: 'right' },
    );

    // Draw cards and dashed cut guidelines
    for (let c = 0; c < chunk.length; c++) {
      const pos = POSITIONS_6[c];

      // Subtle dashed cutting guide around each card
      doc.save()
        .dash(3, { space: 3 })
        .rect(pos.x - 2, pos.y - 2, CARD_WIDTH + 4, CARD_HEIGHT + 4)
        .strokeColor('#cbd5e1')
        .lineWidth(0.5)
        .stroke()
        .restore();

      await drawSingleIdCardFront(doc, {
        idCard: chunk[c].idCard,
        photoBuffer: chunk[c].photoBuffer,
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
