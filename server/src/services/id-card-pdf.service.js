import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { formatEthiopian } from '../utils/ethiopianDate.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ID_CARD = path.resolve(HERE, '../assets/ID_CARD.png');

// CR80 Card Dimensions in points (landscape: 320 x 204 pt, standard high-DPI card ratio 1.56)
const CARD_WIDTH = 320;
const CARD_HEIGHT = 204;

export async function generateIdCardPdf({ idCard, photoBuffer }) {
  const doc = new PDFDocument({
    size: [CARD_WIDTH, CARD_HEIGHT],
    margins: { top: 10, bottom: 10, left: 12, right: 12 },
    autoFirstPage: false,
  });

  const buffers = [];
  doc.on('data', (chunk) => buffers.push(chunk));

  const snap = idCard.studentSnapshot || {};
  const isDegree = snap.qualificationType === 'degree';
  const isDiploma = snap.qualificationType === 'diploma';
  const stageUnit = isDegree ? 'Year' : isDiploma ? 'Level' : 'Month';
  const totalStages = isDegree ? 4 : isDiploma ? 4 : 3;
  const promoted = idCard.promotedStages || [];

  // ==========================================
  // PAGE 1: FRONT OF ID CARD
  // ==========================================
  doc.addPage({ size: [CARD_WIDTH, CARD_HEIGHT], margins: { top: 8, bottom: 8, left: 10, right: 10 } });

  // Draw background image if available, else clean institutional background
  if (fs.existsSync(TEMPLATE_ID_CARD)) {
    try {
      doc.image(TEMPLATE_ID_CARD, 0, 0, { width: CARD_WIDTH, height: CARD_HEIGHT });
    } catch {
      drawFallbackFront(doc);
    }
  } else {
    drawFallbackFront(doc);
  }

  // Header Bar
  doc.save();
  doc.roundedRect(8, 8, CARD_WIDTH - 16, 32, 4).fill('#0f2747');
  doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('ETHIOPIAN COLLEGE', 14, 13, { width: CARD_WIDTH - 28, align: 'left' });
  doc.fillColor('#93c5fd').fontSize(7).font('Helvetica').text('STUDENT IDENTIFICATION CARD', 14, 26, { width: CARD_WIDTH - 28, align: 'left' });
  doc.restore();

  // Photo Box (Right Side)
  const photoW = 58;
  const photoH = 68;
  const photoX = CARD_WIDTH - 18 - photoW;
  const photoY = 46;

  doc.save();
  doc.roundedRect(photoX, photoY, photoW, photoH, 4).strokeColor('#cbd5e1').lineWidth(1).stroke();
  if (photoBuffer) {
    try {
      doc.image(photoBuffer, photoX + 2, photoY + 2, { fit: [photoW - 4, photoH - 4], align: 'center', valign: 'center' });
    } catch {
      doc.fillColor('#64748b').fontSize(7).font('Helvetica').text('PHOTO', photoX, photoY + 28, { width: photoW, align: 'center' });
    }
  } else {
    doc.fillColor('#64748b').fontSize(7).font('Helvetica').text('PHOTO', photoX, photoY + 28, { width: photoW, align: 'center' });
  }
  doc.restore();

  // Student Details (Left Side)
  const textX = 14;
  let curY = 46;

  doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(11).text(snap.fullName || 'Student Name', textX, curY, { width: 190 });
  curY += 16;

  doc.fillColor('#1e40af').font('Helvetica-Bold').fontSize(8.5).text(`ID: ${snap.studentId || '—'}`, textX, curY);
  curY += 13;

  doc.fillColor('#475569').font('Helvetica').fontSize(7).text(`Department: ${snap.departmentName || '—'}`, textX, curY, { width: 190 });
  curY += 10;

  doc.fillColor('#475569').font('Helvetica').fontSize(7).text(`Program: ${snap.programName || '—'}`, textX, curY, { width: 190 });
  curY += 10;

  doc.fillColor('#475569').font('Helvetica').fontSize(7).text(`Batch: ${snap.batchCode || '2019'} · Cat: ${snap.qualificationType?.toUpperCase() || 'REGULAR'}`, textX, curY, { width: 190 });
  curY += 10;

  doc.fillColor('#64748b').font('Helvetica').fontSize(6.5).text(`Issued: ${formatEthiopian(idCard.issuedAt)}`, textX, curY);

  // Issue Counter Pill (Bottom Left)
  doc.save();
  doc.roundedRect(textX, CARD_HEIGHT - 26, 76, 16, 8).fill('#eff6ff');
  doc.fillColor('#1d4ed8').font('Helvetica-Bold').fontSize(7).text(`Issue #${idCard.issueNumber} of 4`, textX, CARD_HEIGHT - 22, { width: 76, align: 'center' });
  doc.restore();

  // Barcode simulation (Bottom Right)
  doc.save();
  doc.fillColor('#0f172a').font('Courier-Bold').fontSize(8).text(`*${snap.studentId || 'ID'}*`, photoX, CARD_HEIGHT - 24, { width: photoW, align: 'center' });
  doc.restore();

  // ==========================================
  // PAGE 2: BACK OF ID CARD (PROMOTION SLOTS)
  // ==========================================
  doc.addPage({ size: [CARD_WIDTH, CARD_HEIGHT], margins: { top: 8, bottom: 8, left: 10, right: 10 } });

  // Clean back background
  doc.save();
  doc.rect(0, 0, CARD_WIDTH, CARD_HEIGHT).fill('#f8fafc');
  doc.rect(5, 5, CARD_WIDTH - 10, CARD_HEIGHT - 10).strokeColor('#0f2747').lineWidth(1.5).stroke();
  doc.restore();

  // Title
  doc.fillColor('#0f2747').font('Helvetica-Bold').fontSize(8.5).text('ACADEMIC PROMOTION RECORD', 10, 12, { width: CARD_WIDTH - 20, align: 'center' });
  doc.fillColor('#64748b').font('Helvetica').fontSize(6).text('Official seal validates progression across academic stages', 10, 22, { width: CARD_WIDTH - 20, align: 'center' });

  // Grid of 4 (or 3) Promotion Slots
  const slotStartY = 34;
  const slotHeight = 32;

  for (let s = 1; s <= totalStages; s++) {
    const y = slotStartY + (s - 1) * slotHeight;
    const isPromoted = promoted.includes(s) || (idCard.currentLevel > s);

    // Slot row container
    doc.save();
    doc.roundedRect(12, y, CARD_WIDTH - 24, 28, 4).fill(isPromoted ? '#f0fdf4' : '#ffffff').strokeColor(isPromoted ? '#86efac' : '#e2e8f0').lineWidth(0.8).stroke();

    // Stage Label
    doc.fillColor('#1e293b').font('Helvetica-Bold').fontSize(8).text(`${stageUnit} ${s}:`, 18, y + 9);

    if (isPromoted) {
      // Seal of promotion
      doc.roundedRect(68, y + 4, CARD_WIDTH - 100, 20, 3).fill('#dcfce7').strokeColor('#22c55e').lineWidth(0.8).stroke();
      doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(7.5).text('✓ PROMOTED · REGISTRAR APPROVED', 68, y + 9, { width: CARD_WIDTH - 100, align: 'center' });
    } else {
      // Blank underline placeholder as requested: "year 1 : ______________________"
      doc.fillColor('#94a3b8').font('Helvetica').fontSize(8).text('____________________________________', 70, y + 7);
    }
    doc.restore();
  }

  // Footer Disclaimer
  doc.fillColor('#64748b').font('Helvetica').fontSize(5.5).text('If found, return to Registrar Office. Max 4 replacements allowed per student.', 10, CARD_HEIGHT - 16, { width: CARD_WIDTH - 20, align: 'center' });

  doc.end();

  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);
  });
}

function drawFallbackFront(doc) {
  doc.save();
  doc.rect(0, 0, CARD_WIDTH, CARD_HEIGHT).fill('#ffffff');
  doc.rect(4, 4, CARD_WIDTH - 8, CARD_HEIGHT - 8).strokeColor('#cbd5e1').lineWidth(1.2).stroke();
  doc.restore();
}
