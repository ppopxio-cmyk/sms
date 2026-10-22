import PDFDocument from 'pdfkit';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { signedImageUrl } from './imagekit.service.js';
import { exportFilename } from './export.service.js';
import { formatEthiopian } from '../utils/ethiopianDate.js';

const INK = '0F172A';
const MUTED = '64748B';
const LINE = 'E2E8F0';
const BRAND = '4F46E5';
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

const text = (value) => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim();
const dateText = (value) => (value ? formatEthiopian(value) : '');

function addressText(address) {
  return [address?.woreda, address?.city].map(text).filter(Boolean).join(', ');
}

function photoKind(photo) {
  const extension = text(photo?.extension).toLowerCase();
  if (['png'].includes(extension)) return 'png';
  if (['jpg', 'jpeg'].includes(extension)) return 'jpg';
  return '';
}

async function loadPhoto(photo) {
  const kind = photoKind(photo);
  if (!kind) return null;
  const url = photo.filePath ? signedImageUrl(photo.filePath, { expiresIn: 600 }) : photo.url;
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > MAX_PHOTO_BYTES) return null;
    return { buffer, kind };
  } catch {
    return null;
  }
}

function photoSize(photo, maxWidth = 120, maxHeight = 150) {
  const width = Number(photo?.width) || 0;
  const height = Number(photo?.height) || 0;
  if (!width || !height) return { width: maxWidth, height: maxHeight };
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function profileSections(student) {
  const name = text(student.fullName) || [student.firstName, student.middleName, student.lastName].map(text).filter(Boolean).join(' ');
  const program = student.program ? `${text(student.program.code)} · ${text(student.program.name)}` : '';
  const department = student.department ? `${text(student.department.code)} · ${text(student.department.name)}` : '';
  const batch = student.batch ? `${text(student.batch.code)} · ${text(student.batch.name)}` : '';
  return [
    {
      title: 'Identity',
      rows: [
        ['Full name', name],
        ['Student ID', student.studentId],
        ['Sex', student.sex],
        ['Date of birth', dateText(student.dateOfBirth)],
      ],
    },
    {
      title: 'Academic placement',
      rows: [
        ['Department', department],
        ['Programme', program],
        ['Qualification', student.qualificationType],
        ['Delivery stream', student.studentCategory || 'regular'],
        ['Level / year', student.level],
        ['Batch', batch],
        ['Admission year', student.admissionAcademicYear?.label],
        ['Admission date', dateText(student.admissionDate)],
        ['Completion date', dateText(student.completionDate)],
        ['Status', student.studentStatus],
      ],
    },
    {
      title: 'Contact',
      rows: [
        ['Phone', student.phone],
        ['Email', student.email],
        ['Address', addressText(student.address)],
      ],
    },
  ];
}

function docxCell(value, { label = false, title = false } = {}) {
  return new TableCell({
    shading: title
      ? { type: ShadingType.CLEAR, fill: 'EEF2FF', color: 'auto' }
      : label
        ? { type: ShadingType.CLEAR, fill: 'F8FAFC', color: 'auto' }
        : undefined,
    margins: { top: 80, right: 120, bottom: 80, left: 120 },
    columnSpan: title ? 2 : undefined,
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: text(value) || '—',
            bold: title || label,
            color: title ? '3730A3' : label ? MUTED : INK,
            size: title ? 20 : 18,
            font: 'Ebrima',
          }),
        ],
      }),
    ],
  });
}

async function buildDocx(student, photo) {
  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'Student Record', bold: true, size: 36, color: '312E81', font: 'Ebrima' })],
      spacing: { after: 80 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `${text(student.studentId)} · ${text(student.fullName)}`,
          size: 20,
          color: MUTED,
          font: 'Ebrima',
        }),
      ],
      spacing: { after: 60 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `Generated ${formatEthiopian(new Date(), { time: true })} (Ethiopian calendar)`,
          size: 16,
          color: MUTED,
          font: 'Ebrima',
        }),
      ],
      spacing: { after: 160 },
    }),
  ];

  if (photo) {
    const size = photoSize(student.photo);
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data: photo.buffer,
            type: photo.kind,
            transformation: size,
          }),
        ],
        spacing: { after: 140 },
      }),
    );
  }

  const tableRows = [];
  for (const section of profileSections(student)) {
    tableRows.push(new TableRow({ children: [docxCell(section.title, { title: true })] }));
    for (const [label, value] of section.rows) {
      tableRows.push(
        new TableRow({
          children: [docxCell(label, { label: true }), docxCell(value)],
        }),
      );
    }
  }

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 2, color: LINE },
        bottom: { style: BorderStyle.SINGLE, size: 2, color: LINE },
        left: { style: BorderStyle.SINGLE, size: 2, color: LINE },
        right: { style: BorderStyle.SINGLE, size: 2, color: LINE },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: LINE },
        insideVertical: { style: BorderStyle.SINGLE, size: 2, color: LINE },
      },
      rows: tableRows,
    }),
  );

  children.push(
    new Paragraph({
      spacing: { before: 200 },
      children: [
        new TextRun({
          text: 'Official record produced by the Registrar workspace. Changes are recorded in the audit history.',
          size: 15,
          italics: true,
          color: MUTED,
          font: 'Ebrima',
        }),
      ],
    }),
  );

  const document = new Document({
    creator: 'SMS',
    title: `Student record ${student.studentId}`,
    description: student.fullName,
    styles: { default: { document: { run: { font: 'Ebrima', size: 18, color: INK } } } },
    sections: [
      {
        properties: { page: { margin: { top: 720, right: 900, bottom: 720, left: 900 } } },
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}

async function buildPdf(student, photo) {
  const document = new PDFDocument({
    size: 'A4',
    margin: 48,
    bufferPages: true,
    info: {
      Title: `Student record ${student.studentId}`,
      Author: 'SMS',
      Subject: student.fullName || 'Student record',
      Creator: 'SMS',
    },
  });

  const chunks = [];
  const done = new Promise((resolve, reject) => {
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });

  const width = document.page.width - 96;
  const contentWidth = photo ? width - 140 : width;
  let y = 48;

  document.font('Helvetica-Bold').fontSize(20).fillColor('#312E81').text('Student Record', 48, y, { width: contentWidth });
  y = document.y + 4;
  document.font('Helvetica').fontSize(10).fillColor(`#${MUTED}`).text(
    `${text(student.studentId)} · ${text(student.fullName)}`,
    48,
    y,
    { width: contentWidth },
  );
  y = document.y + 2;
  document.fontSize(8).text(
    `Generated ${formatEthiopian(new Date(), { time: true })} (Ethiopian calendar)`,
    48,
    y,
    { width: contentWidth },
  );

  if (photo) {
    const size = photoSize(student.photo, 120, 150);
    const photoX = document.page.width - 48 - 120 + (120 - size.width) / 2;
    document.image(photo.buffer, photoX, 48, { fit: [size.width, size.height] });
  }

  y = Math.max(document.y, photo ? 210 : 0) + 18;

  for (const section of profileSections(student)) {
    if (y > document.page.height - 150) {
      document.addPage();
      y = 48;
    }
    document.font('Helvetica-Bold').fontSize(9).fillColor('#3730A3').text(section.title.toUpperCase(), 48, y, { width });
    y = document.y + 4;
    document.moveTo(48, y).lineTo(48 + width, y).strokeColor(`#${LINE}`).lineWidth(0.8).stroke();
    y += 8;
    for (const [label, value] of section.rows) {
      if (y > document.page.height - 70) {
        document.addPage();
        y = 48;
      }
      document.font('Helvetica-Bold').fontSize(9).fillColor(`#${MUTED}`).text(text(label), 48, y, { width: 150 });
      document.font('Helvetica').fontSize(9).fillColor(`#${INK}`).text(text(value) || '—', 198, y, {
        width: width - 150,
      });
      y = Math.max(document.y, y + 13) + 4;
    }
    y += 8;
  }

  const footer = 'Official record produced by the Registrar workspace. Changes are recorded in the audit history.';
  document.font('Helvetica-Oblique').fontSize(7.5).fillColor(`#${MUTED}`).text(footer, 48, document.page.height - 60, {
    width,
    align: 'center',
  });
  document.end();

  return done;
}

export async function buildStudentProfileExport({ student, format }) {
  if (!['docx', 'pdf'].includes(format)) throw new Error('Unknown export format.');
  const photo = await loadPhoto(student.photo);
  const buffer = format === 'docx' ? await buildDocx(student, photo) : await buildPdf(student, photo);
  return {
    format,
    buffer,
    filename: exportFilename(`${student.studentId}-student-record`, format),
    contentType: format === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/pdf',
  };
}
