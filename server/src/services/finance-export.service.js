import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from 'docx';

const PAGE = { margin: 42, width: 511, x0: 42 };
const BRAND = '#4338ca';
const SLATE = '#475569';

const FALLBACK_USER_ICON_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAADRUlEQVR4nO3UMZITQRBE0b2/zQ24BOfBwuQGEBgYG0hoJE3Pq67KjEi/K/+P/vhIkiQZm+8/fv7Sb0hOzh+oq6pvS25kJfAIUTASeISA0XAjAogGGRlQNLSIgKIhRQQUDSUioGgIFaoZsOjhK1WzuDR67MrVbJZHD7xDNaNl0cPuVM3q1Ogxd65m93b0gB2qGb4cPVynapZPRw/WsZrp4eihOlezfRg90IRqxnejhznaL1+/3a1+27YS6EFeBf6o+u1bSKCHWAF+FxE0+5LwzwS/gwgR4ALwlUUI/IvhR4LAny2BPrQK/LES6CMrwa8mQeBHgnUS6MMqwx8hgT4qAkAB9EE7wG8tgT4mAkAB9CE7wW8pgT4iAkAB9AE7wm8lgX58BIAC6IdHACyBfnQEiAARQAmgHxwBsAT6sbvDryjBlvAjAJBAPzICRIAWEujNIkAEeF4A/cAIgCXQj4sAESACRID9JdBbvSSAflgEwBLoR0WACNBCAr1RBIgAfQWoLoHeZoQAVSXQm0SACDBHgGoS6C1GClBFAr3BaAG0BPr2CAAl0DefKoB+0E4i6BsjAZRA37YMficBVoigb4kAi8BO/SG2FEDD7STCVgJomB1F2EYADbCrBOUF0NC6i1BaAA1qggQlBdBwJolQTgANZJoEpQTQICZKcFMAIYEGUKFl4F8tgB6+UscJoAev2DEC6KErlwtwhQR65Mrl8FcLoAfeoW0F0MPu1HYC6EF3LBNghQR6zB3L4J8tgB5y5zIBzpJAD9ihBH4EqNNtBdDDdSoR4F0J9GidSuC/I4AerGOJAK9KoMfqWAI/AtQpE+BZCfRQnUvgR4A6ZQI8I4EeqXMZ/KMC6IEmlAlwRAI9zoQy+Eck0ONMKIX/PwH0MJNKBbgngR5lUin8exLoUSaVw78lgR5lUkvAjwAR4JMEepRJLQP/byLA9QJo5v9EjzKpmvXd6GEmVDN+GD1Q52q2h6OH6ljN9OnowTpVs3w5ergO1Qzfjh5w52p2p0aPuVM1q2XRw+5QzWh59MCVq9lcGj12pWoWLHr4CtUMSkRDCPgi0VACvkg0pIAvEg0t4AtFgwz0ItFwA75YAjz5lABPDidQk9H5DX4jJNpuDqsIAAAAAElFTkSuQmCC',
  'base64'
);

async function fetchImageBuffer(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 400 ? buf : null;
  } catch {
    return null;
  }
}

function detectImageType(buf) {
  if (!buf) return null;
  if (buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  return null;
}

const money = (santim) => `${(Number(santim || 0) / 100).toFixed(2)}`;

function studentFullName(student) {
  if (!student) return 'Student';
  return (
    student.fullName ||
    [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' ') ||
    'Student'
  );
}

const identityRows = (student) => [
  ['Student ID', student.studentId || '-'],
  ['Full name', studentFullName(student)],
  ['Department', student.department?.name || student.department || '-'],
  ['Programme', student.program?.name || student.programme || '-'],
  ['Batch', student.batch?.name || student.batch || '-'],
  ['Category', student.studentCategory || 'regular'],
  ['Phone', student.phone || '-'],
  ['Email', student.email || '-'],
  ['Sex', student.sex || '-'],
];

function statementRows(snapshot) {
  return (snapshot.charges || []).map((c) => ({
    cycle: c.cycle?.title || 'Fee cycle',
    ethYear: c.cycle?.ethYear ?? '',
    ethMonth: c.cycle?.ethMonth ?? '',
    amountDueEtb: money(c.amountDue),
    status: (c.status || '').toUpperCase(),
    paidAt: c.paidAt ? new Date(c.paidAt).toISOString().slice(0, 10) : '',
    reference: c.payment?.receiptNumber || (c.waiver?.reason ? `Waiver (${c.waiver.reason})` : '-'),
  }));
}

function paymentRows(snapshot) {
  return (snapshot.payments || []).map((p) => ({
    receiptNumber: p.receiptNumber || '-',
    cycle: p.cycle?.title || '-',
    amountEtb: money(p.amount),
    method: String(p.method || '').replace(/_/g, ' ').toUpperCase(),
    paidAt: p.paidAt ? new Date(p.paidAt).toISOString().slice(0, 10) : '',
    reference: p.bankReference || p.chapaReference || '-',
  }));
}

// ---------------------------------------------------------------- DOCX

function docxCell(text, { bold = false, color = '0f172a', width = 18 } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    children: [new Paragraph({ children: [new TextRun({ text: String(text ?? '-'), bold, color })] })],
  });
}

function docxTable(header, rows, widths) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: header.map((h, i) => docxCell(h, { bold: true, color: BRANDING_COLOR, width: widths[i] })),
  });
  const bodyRows = rows.map((r) => new TableRow({ children: r.map((cell, i) => docxCell(cell, { width: widths[i] })) }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  });
}

const BRANDING_COLOR = '334155';

export async function buildStudentStatementDocx(snapshot) {
  const { student, summary, matrix } = snapshot;
  const children = [];

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Student Fee Statement', bold: true, color: BRANDING_COLOR })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Generated ${new Date().toISOString().slice(0, 10)}`, size: 18, color: SLATE })],
    }),
    new Paragraph({ text: '' }),
  );

  let img = student?.photo?.url ? await fetchImageBuffer(student.photo.url) : null;
  let imgType = detectImageType(img);
  if (!img || !imgType) {
    img = FALLBACK_USER_ICON_PNG;
    imgType = 'png';
  }
  try {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new ImageRun({ data: img, transformation: { width: 100, height: 100 }, type: imgType })],
      }),
    );
  } catch {
    // keep the statement working even if the photo cannot be embedded
  }

  children.push(docxTable(['Field', 'Value'], identityRows(student), [30, 70]));
  children.push(new Paragraph({ text: '' }));

  children.push(
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Financial Summary', bold: true, color: BRANDING_COLOR })] }),
  );
  children.push(
    docxTable(
      ['Metric', 'Amount (ETB)'],
      [
        ['Total billed', money(summary?.totalBilledSantim)],
        ['Total settled', money(summary?.totalPaidSantim)],
        ['Total waived', money(summary?.totalWaivedSantim)],
        ['Outstanding', money(summary?.outstandingSantim)],
        ['Academic hold', (summary?.holdStatus?.hasHold ? 'ACTIVE' : 'NONE')],
      ],
      [40, 60],
    ),
  );
  children.push(new Paragraph({ text: '' }));

  if (matrix) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Monthly standing (Ethiopian calendar)', bold: true, color: BRANDING_COLOR })] }),
    );
    const mRows = [];
    for (const [year, months] of Object.entries(matrix)) {
      const cols = months
        .map((m) => `${m.name?.slice(0, 3) || m.month}: ${m.status === 'none' ? '—' : m.label}`)
        .join('  ');
      mRows.push([`Year ${year}`, cols]);
    }
    children.push(docxTable(['Academic year', 'Standing by month'], mRows, [20, 80]));
    children.push(new Paragraph({ text: '' }));
  }

  const charges = statementRows(snapshot);
  if (charges.length) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Fee cycles & charges', bold: true, color: BRANDING_COLOR })] }),
    );
    children.push(
      docxTable(
        ['Cycle', 'Year', 'Month', 'Amount', 'Status', 'Reference'],
        charges.map((c) => [c.cycle, String(c.ethYear), String(c.ethMonth), `${c.amountDueEtb} ETB`, c.status, c.reference]),
        [28, 10, 8, 16, 14, 24],
      ),
    );
    children.push(new Paragraph({ text: '' }));
  }

  const payments = paymentRows(snapshot);
  if (payments.length) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: 'Payment history', bold: true, color: BRANDING_COLOR })] }),
    );
    children.push(
      docxTable(
        ['Receipt', 'Cycle', 'Amount', 'Method', 'Paid at', 'Reference'],
        payments.map((p) => [p.receiptNumber, p.cycle, `${p.amountEtb} ETB`, p.method, p.paidAt, p.reference]),
        [22, 24, 16, 14, 12, 12],
      ),
    );
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

// ---------------------------------------------------------------- XLSX

export async function buildStudentStatementXlsx(snapshot) {
  const { student, summary } = snapshot;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'College Finance';

  const info = wb.addWorksheet('Student Info');
  info.columns = [{ width: 28 }, { width: 50 }];
  info.addRow(['STUDENT FEE STATEMENT']).font = { bold: true, size: 14, color: { argb: 'FF4338CA' } };
  info.addRow([`Generated`, new Date().toISOString().slice(0, 10)]);
  info.addRow([]);
  for (const [k, v] of identityRows(student)) info.addRow([k, String(v ?? '-')]);
  info.addRow([]);
  info.addRow(['FINANCIAL SUMMARY']).font = { bold: true, color: { argb: 'FF4338CA' } };
  info.addRow(['Total billed (ETB)', money(summary?.totalBilledSantim)]);
  info.addRow(['Total settled (ETB)', money(summary?.totalPaidSantim)]);
  info.addRow(['Total waived (ETB)', money(summary?.totalWaivedSantim)]);
  info.addRow(['Outstanding (ETB)', money(summary?.outstandingSantim)]);
  info.addRow(['Academic hold', summary?.holdStatus?.hasHold ? 'ACTIVE' : 'NONE']);

  const charges = statementRows(snapshot);
  if (charges.length) {
    const sheet = wb.addWorksheet('Fee Cycles');
    sheet.columns = [
      { header: 'Cycle', key: 'cycle', width: 26 },
      { header: 'Eth Year', key: 'ethYear', width: 10 },
      { header: 'Eth Month', key: 'ethMonth', width: 10 },
      { header: 'Amount due (ETB)', key: 'amountDueEtb', width: 18 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Paid at', key: 'paidAt', width: 14 },
      { header: 'Reference', key: 'reference', width: 32 },
    ];
    sheet.getRow(1).font = { bold: true };
    charges.forEach((c) => sheet.addRow(c));
    let img = student?.photo?.url ? await fetchImageBuffer(student.photo.url) : null;
    let type = detectImageType(img);
    if (!img || !type) {
      img = FALLBACK_USER_ICON_PNG;
      type = 'png';
    }
    try {
      const imageId = wb.addImage({ buffer: img, extension: type });
      sheet.addImage(imageId, { tl: { col: 8, row: 1 }, ext: { width: 120, height: 120 } });
    } catch {
      // photo embed is best-effort
    }
  }

  const payments = paymentRows(snapshot);
  if (payments.length) {
    const sheet = wb.addWorksheet('Payments');
    sheet.columns = [
      { header: 'Receipt', key: 'receiptNumber', width: 20 },
      { header: 'Cycle', key: 'cycle', width: 26 },
      { header: 'Amount (ETB)', key: 'amountEtb', width: 16 },
      { header: 'Method', key: 'method', width: 14 },
      { header: 'Paid at', key: 'paidAt', width: 14 },
      { header: 'Reference', key: 'reference', width: 32 },
    ];
    sheet.getRow(1).font = { bold: true };
    payments.forEach((p) => sheet.addRow(p));
  }

  return wb.xlsx.writeBuffer();
}

// ---------------------------------------------------------------- PDF

async function pdfFetchPhoto(student) {
  const img = student?.photo?.url ? await fetchImageBuffer(student.photo.url) : null;
  const type = detectImageType(img);
  return img && type ? { buffer: img, type } : null;
}

export async function buildStudentStatementPdf(snapshot) {
  const { student, summary, matrix } = snapshot;

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: PAGE.margin, right: PAGE.margin } });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(20).text('STUDENT FEE STATEMENT', { align: 'center', width: PAGE.width });
      doc.moveDown(0.2);
      doc.fillColor(SLATE).font('Helvetica').fontSize(9).text(`Generated ${new Date().toISOString().slice(0, 10)}`, { align: 'center', width: PAGE.width });
      doc.moveDown(1);

      let photo = await pdfFetchPhoto(student);
      if (!photo) {
        photo = { buffer: FALLBACK_USER_ICON_PNG, type: 'png' };
      }

      if (photo) {
        try {
          doc.image(photo.buffer, PAGE.x0, doc.y, { width: 100 });
        } catch {
          // ignore unreadable photos
        }
        doc.x = PAGE.x0 + 116;
        doc.y = doc.y + 4;
      }

      doc.font('Helvetica').fontSize(9.5).fillColor('#0f172a');
      const idRows = identityRows(student);
      for (const [k, v] of idRows) {
        doc.x = PAGE.x0 + 116;
        doc.text(`${k}: ${String(v ?? '-')}`, { width: PAGE.width - 116, continued: false });
      }
      doc.x = PAGE.x0;
      doc.y += 110;
      doc.moveDown(1);

      pdfH2(doc, 'FINANCIAL SUMMARY');
      pdfTable(
        doc,
        ['Metric', 'Amount (ETB)'],
        [
          ['Total billed', money(summary?.totalBilledSantim)],
          ['Total settled', money(summary?.totalPaidSantim)],
          ['Total waived', money(summary?.totalWaivedSantim)],
          ['Outstanding', money(summary?.outstandingSantim)],
          ['Academic hold', summary?.holdStatus?.hasHold ? 'ACTIVE' : 'NONE'],
        ],
        [220, 120],
      );
      doc.moveDown(1);

      if (matrix) {
        pdfH2(doc, 'MONTHLY STANDING (ETHIOPIAN CALENDAR)');
        pdfTable(
          doc,
          ['Year', 'Standing by month'],
          Object.entries(matrix).map(([year, months]) => [
            year,
            months.map((m) => (m.status === 'none' ? '' : `${String(m.name || m.month).slice(0, 3)}: ${m.label}`)).join('   '),
          ]),
          [70, 270],
          5.5,
        );
        doc.moveDown(1);
      }

      const charges = statementRows(snapshot);
      if (charges.length) {
        pdfH2(doc, 'FEE CYCLES & CHARGES');
        pdfTable(
          doc,
          ['Cycle', 'Amount', 'Status', 'Reference'],
          charges.map((c) => [c.cycle, `${c.amountDueEtb} ETB`, c.status, c.reference]),
          [200, 95, 65, 151],
        );
        doc.moveDown(1);
      }

      const payments = paymentRows(snapshot);
      if (payments.length) {
        pdfH2(doc, 'PAYMENT HISTORY');
        pdfTable(
          doc,
          ['Receipt', 'Cycle', 'Amount', 'Method', 'Paid at'],
          payments.map((p) => [p.receiptNumber, p.cycle, `${p.amountEtb} ETB`, p.method, p.paidAt]),
          [95, 155, 85, 70, 106],
        );
      }

      doc.moveDown(2);
      doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text('College Finance Office — official fee statement. Please keep for your records.', PAGE.x0, doc.y, { width: PAGE.width });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function pdfH2(doc, title) {
  doc.font('Helvetica-Bold').fontSize(11.5).fillColor(BRAND).text(title, PAGE.x0, doc.y + 4);
  doc.text('', PAGE.x0, doc.y + 24);
  doc.font('Helvetica').fontSize(9).fillColor('#0f172a');
}

function pdfTable(doc, headers, rows, colWidths, fontSize = 8.5) {
  doc.font('Helvetica-Bold').fontSize(fontSize).fillColor(BRAND);
  pdfRow(doc, headers, colWidths, true);
  doc.font('Helvetica').fontSize(fontSize).fillColor('#0f172a');
  rows.forEach((r, ri) => {
    if (doc.y + 42 > 770) doc.addPage();
    pdfRow(doc, r, colWidths, ri % 2 === 0);
  });
  doc.x = PAGE.x0;
  doc.y += 6;
}

function pdfRow(doc, cells, colWidths, headerShade) {
  const startX = PAGE.x0;
  const startY = doc.y + 2;
  const rowH = 16;
  if (headerShade) {
    doc.save().fillOpacity(0.08).rect(startX - 2, startY - 2, colWidths.reduce((a, b) => a + b, 0) + 4, rowH).fill('#6366f1').fillOpacity(1).restore();
  }
  let x = startX;
  cells.forEach((cell, i) => {
    doc.text(String(cell ?? '-'), x, startY, { width: colWidths[i], continued: false, lineBreak: false, height: rowH });
    x += colWidths[i];
  });
  doc.x = startX;
  doc.y = startY + rowH;
  doc.text('', PAGE.x0, doc.y);
}

// ------------------------------------------------------------ list export

export async function buildListXlsx({ title, meta, rows }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'College Finance';
  const sheet = wb.addWorksheet('Summary');
  sheet.columns = [{ width: 30 }, { width: 60 }];
  sheet.addRow([title]).font = { bold: true, size: 14, color: { argb: 'FF4338CA' } };
  sheet.addRow(['Generated', new Date().toISOString().slice(0, 10)]);
  for (const [k, v] of Object.entries(meta || {})) sheet.addRow([k, String(v ?? '-')]);
  sheet.addRow([]);

  const dataSheet = wb.addWorksheet('Data');
  if (rows.length) {
    const headers = Object.keys(rows[0]);
    dataSheet.columns = headers.map((h) => ({ header: h, key: h, width: Math.min(38, Math.max(12, h.length + 6)) }));
    dataSheet.getRow(1).font = { bold: true };
    rows.forEach((r) => dataSheet.addRow(r));
  } else {
    dataSheet.addRow(['No records found']);
  }
  return wb.xlsx.writeBuffer();
}

export function buildListCsv(rows, headers) {
  const cols = headers || (rows.length ? Object.keys(rows[0]) : []);
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '\uFEFF' + [cols.map(esc).join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

export async function buildListDocx({ title, meta, rows }) {
  const headers = rows.length ? Object.keys(rows[0]) : ['Note'];
  const children = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: title, bold: true, color: BRANDING_COLOR })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: new Date().toISOString().slice(0, 10), size: 18, color: SLATE })],
    }),
    new Paragraph({ text: '' }),
  ];
  if (meta && Object.keys(meta).length) {
    children.push(docxTable(['Field', 'Value'], Object.entries(meta).map(([k, v]) => [k, String(v ?? '-')]), [30, 70]));
    children.push(new Paragraph({ text: '' }));
  }
  const cells = rows.map((r) => headers.map((h) => String(r[h] ?? '-')));
  children.push(docxTable(headers, cells, headers.map(() => 100 / Math.max(1, headers.length))));
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export async function buildListPdf({ title, meta, rows }) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const landscape = headers.length > 5;
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: PAGE.margin });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const usable = doc.page.width - PAGE.margin * 2;
      const colCount = Math.max(1, headers.length);
      const widths = headers.length ? headers.map(() => Math.floor(usable / colCount)) : [usable];

      doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(16).text(title, PAGE.x0, 50, { width: usable });
      doc.font('Helvetica').fontSize(9).fillColor('#64748b');
      if (meta) {
        for (const [k, v] of Object.entries(meta)) doc.text(k + ': ' + v, PAGE.x0, doc.y, { width: usable });
      }
      doc.moveDown(1);

      pdfTable(
        doc,
        headers.length ? headers : ['Note'],
        (rows.length ? rows : [{ Note: 'No records found' }]).map((r) => (headers.length ? headers.map((h) => r[h]) : [String(r.Note ?? '-')])),
        widths,
      );

      doc.moveDown(1);
      doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text('College Finance Office', PAGE.x0, doc.y, { width: usable });
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ------------------------------------------------------------ Collections Monthly Layout Exports

export async function buildCollectionsMonthlyExportXlsx({ title, meta, monthsData }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'College Finance Office';

  // 1. Overall Summary Worksheet
  const summarySheet = wb.addWorksheet('Academic Year Summary');
  summarySheet.columns = [
    { width: 16 },
    { width: 24 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 20 },
    { width: 20 },
    { width: 20 },
    { width: 16 },
  ];

  summarySheet.addRow([title]).font = { bold: true, size: 15, color: { argb: 'FF4338CA' } };
  summarySheet.addRow([`Generated`, new Date().toISOString().slice(0, 10)]);
  if (meta) {
    for (const [k, v] of Object.entries(meta)) {
      summarySheet.addRow([k, String(v ?? '-')]);
    }
  }
  summarySheet.addRow([]);

  const summaryHeader = [
    'Month',
    'Cycle Title',
    'Total Students',
    'Paid',
    'Unpaid',
    'Waived',
    'Billed (ETB)',
    'Collected (ETB)',
    'Outstanding (ETB)',
    'Rate (%)',
  ];
  const headerRow = summarySheet.addRow(summaryHeader);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4338CA' },
  };

  let grandTotalStudents = 0;
  let grandTotalPaid = 0;
  let grandTotalUnpaid = 0;
  let grandTotalWaived = 0;
  let grandBilled = 0;
  let grandCollected = 0;

  for (const m of monthsData) {
    grandTotalStudents += m.totalStudents || 0;
    grandTotalPaid += m.paidStudents || 0;
    grandTotalUnpaid += m.unpaidStudents || 0;
    grandTotalWaived += m.waivedStudents || 0;
    grandBilled += Number(m.totalBilledEtb || 0);
    grandCollected += Number(m.totalCollectedEtb || 0);

    const rate = m.totalStudents > 0 ? ((m.paidStudents / m.totalStudents) * 100).toFixed(1) + '%' : '0.0%';
    summarySheet.addRow([
      m.monthName,
      m.cycleTitle,
      m.totalStudents,
      m.paidStudents,
      m.unpaidStudents,
      m.waivedStudents,
      m.totalBilledEtb,
      m.totalCollectedEtb,
      (Math.max(0, Number(m.totalBilledEtb) - Number(m.totalCollectedEtb))).toFixed(2),
      rate,
    ]);
  }

  // Grand Totals Row
  const grandRate = grandTotalStudents > 0 ? ((grandTotalPaid / grandTotalStudents) * 100).toFixed(1) + '%' : '0.0%';
  const totalRow = summarySheet.addRow([
    'TOTAL / SUMMARY',
    'All Cycles',
    grandTotalStudents,
    grandTotalPaid,
    grandTotalUnpaid,
    grandTotalWaived,
    grandBilled.toFixed(2),
    grandCollected.toFixed(2),
    (Math.max(0, grandBilled - grandCollected)).toFixed(2),
    grandRate,
  ]);
  totalRow.font = { bold: true };

  // 2. Separate Worksheet per Month
  for (const m of monthsData) {
    // Sanitized worksheet name (max 31 chars, no special chars)
    const rawSheetName = `${m.monthIndex} - ${m.monthName}`;
    const sheetName = rawSheetName.slice(0, 31).replace(/[\\/*?[\]:]/g, '_');
    const ws = wb.addWorksheet(sheetName);

    ws.columns = [
      { header: 'Student ID', key: 'studentId', width: 20 },
      { header: 'Student Name', key: 'studentName', width: 28 },
      { header: 'Department', key: 'department', width: 24 },
      { header: 'Programme', key: 'programme', width: 24 },
      { header: 'Batch', key: 'batch', width: 16 },
      { header: 'Amount Due (ETB)', key: 'amountDueEtb', width: 18 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Receipt Number', key: 'receiptNumber', width: 22 },
      { header: 'Payment Method', key: 'method', width: 18 },
      { header: 'Paid Date', key: 'paidAt', width: 16 },
    ];

    // Month Title Banner
    ws.spliceRows(1, 0, [
      [`${m.monthName} ${m.ethYear} Fee Collections — ${m.cycleTitle}`],
      [`Summary: ${m.totalStudents} Students | Paid: ${m.paidStudents} | Unpaid: ${m.unpaidStudents} | Billed: ${m.totalBilledEtb} ETB | Collected: ${m.totalCollectedEtb} ETB`],
      [],
    ]);

    ws.getRow(1).font = { bold: true, size: 13, color: { argb: 'FF4338CA' } };
    ws.getRow(2).font = { size: 10, color: { argb: 'FF475569' } };

    // Format column headers (now on row 4)
    const monthHeaderRow = ws.getRow(4);
    monthHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    monthHeaderRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF334155' },
    };

    if (m.rows && m.rows.length) {
      for (const r of m.rows) {
        ws.addRow({
          studentId: String(r.studentId || '-'),
          studentName: String(r.studentName || '-'),
          department: String(r.department || '-'),
          programme: String(r.programme || '-'),
          batch: String(r.batch || '-'),
          amountDueEtb: String(r.amountDueEtb || '0.00'),
          status: String(r.status || 'UNPAID').toUpperCase(),
          receiptNumber: String(r.receiptNumber || '-'),
          method: String(r.method || '-'),
          paidAt: String(r.paidAt || '-'),
        });
      }
    } else {
      ws.addRow({ studentId: 'No students assigned for this month' });
    }
  }

  return wb.xlsx.writeBuffer();
}

export async function buildCollectionsMonthlyExportDocx({ title, meta, monthsData }) {
  const children = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: title, bold: true, color: BRANDING_COLOR })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Generated ${new Date().toISOString().slice(0, 10)}`, size: 18, color: SLATE })],
    }),
    new Paragraph({ text: '' }),
  ];

  if (meta) {
    children.push(docxTable(['Field', 'Value'], Object.entries(meta).map(([k, v]) => [k, String(v ?? '-')]), [30, 70]));
    children.push(new Paragraph({ text: '' }));
  }

  for (const m of monthsData) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: `Month: ${m.monthName} ${m.ethYear} (${m.cycleTitle})`, bold: true, color: BRANDING_COLOR })],
      }),
      new Paragraph({
        children: [new TextRun({ text: `Students: ${m.totalStudents} | Paid: ${m.paidStudents} | Unpaid: ${m.unpaidStudents} | Billed: ${m.totalBilledEtb} ETB | Collected: ${m.totalCollectedEtb} ETB`, size: 18, color: SLATE })],
      }),
      new Paragraph({ text: '' }),
    );

    const headers = ['Student ID', 'Student Name', 'Programme', 'Amount (ETB)', 'Status', 'Receipt'];
    const rows = (m.rows || []).map((r) => [
      String(r.studentId || '-'),
      String(r.studentName || '-'),
      String(r.programme || '-'),
      String(r.amountDueEtb || '-'),
      String(r.status || '-'),
      String(r.receiptNumber || '-'),
    ]);

    children.push(docxTable(headers, rows.length ? rows : [['No records', '-', '-', '-', '-', '-']], [20, 26, 22, 12, 10, 10]));
    children.push(new Paragraph({ text: '' }));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

export async function buildCollectionsMonthlyExportPdf({ title, meta, monthsData }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: PAGE.margin });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const usable = doc.page.width - PAGE.margin * 2;
      doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(16).text(title, PAGE.x0, 40, { width: usable });
      doc.font('Helvetica').fontSize(9).fillColor('#64748b');
      if (meta) {
        for (const [k, v] of Object.entries(meta)) {
          doc.text(`${k}: ${v}`, PAGE.x0, doc.y, { width: usable });
        }
      }
      doc.moveDown(1);

      let first = true;
      for (const m of monthsData) {
        if (!first && doc.y + 120 > doc.page.height - 40) {
          doc.addPage();
        }
        first = false;

        // Month banner
        doc.save().fillOpacity(0.12).rect(PAGE.x0, doc.y, usable, 22).fill('#4338ca').restore();
        doc.font('Helvetica-Bold').fontSize(10.5).fillColor(BRAND).text(
          `  ${m.monthName} ${m.ethYear} — ${m.cycleTitle}  (Students: ${m.totalStudents} | Paid: ${m.paidStudents} | Unpaid: ${m.unpaidStudents} | Collected: ${m.totalCollectedEtb} ETB)`,
          PAGE.x0,
          doc.y + 5,
          { width: usable }
        );
        doc.moveDown(0.8);

        const headers = ['Student ID', 'Student Name', 'Department', 'Programme', 'Amount', 'Status', 'Receipt', 'Date'];
        const widths = [95, 140, 120, 120, 70, 65, 95, 65];
        const rows = (m.rows || []).map((r) => [
          String(r.studentId || '-'),
          String(r.studentName || '-'),
          String(r.department || '-'),
          String(r.programme || '-'),
          `${r.amountDueEtb} ETB`,
          String(r.status || '-'),
          String(r.receiptNumber || '-'),
          String(r.paidAt || '-'),
        ]);

        pdfTable(doc, headers, rows.length ? rows : [['No records', '-', '-', '-', '-', '-', '-', '-']], widths, 8);
        doc.moveDown(1.5);
      }

      doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text('College Finance Office — Official Monthly Collections', PAGE.x0, doc.y, { width: usable });
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
