import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import { formatEthiopianAmharic } from '../utils/ethiopianDate.js';

export const EXPORT_LIMIT = 5000;

export const EXPORT_FORMATS = {
  xlsx: {
    label: 'የኤክሴል የሥራ ወረቀት',
    extension: 'xlsx',
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  docx: {
    label: 'የወርድ ሰነድ',
    extension: 'docx',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  pdf: {
    label: 'የPDF ሰነድ',
    extension: 'pdf',
    contentType: 'application/pdf',
  },
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.resolve(HERE, '../assets/fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'NotoSansEthiopic-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'NotoSansEthiopic-Bold.ttf');
const HAS_ETHIOPIC_FONT = existsSync(FONT_REGULAR) && existsSync(FONT_BOLD);

const INK = '0F172A';
const MUTED = '64748B';
const LINE = 'E2E8F0';
const BRAND = '4F46E5';

function cleanText(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
    .slice(0, 32767);
}

// A spreadsheet treats a text cell that starts with = + - @ as a formula. Prefixing an
// apostrophe keeps the value as text in Excel, LibreOffice and any CSV re-export.
export function safeCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const text = cleanText(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

const cellText = (row, column) => cleanText(row?.[column.key] ?? '');

const sheetName = (title) =>
  String(title || 'ሪፖርት')
    .replace(/[\\/:*?\[\]]/g, ' ')
    .trim()
    .slice(0, 31) || 'ሪፖርት';

const addisDay = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Addis_Ababa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
};

export function exportFilename(prefix, format) {
  const clean = String(prefix || 'export').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'export';
  return `${clean}-${addisDay()}.${EXPORT_FORMATS[format]?.extension || 'xlsx'}`;
}

function widthFor(column) {
  return Math.min(60, Math.max(8, Number(column.width) || 16));
}

async function buildXlsx({ title, subtitle, summary, note, columns, rows }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SMS';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.lastModifiedBy = 'SMS';

  const worksheet = workbook.addWorksheet(sheetName(title), {
    views: [{ state: 'frozen', ySplit: 6, showGridLines: false }],
    properties: { defaultRowHeight: 18 },
  });
  worksheet.properties.defaultColWidth = 18;

  const lastColumn = Math.max(1, columns.length);
  let rowIndex = 1;

  const addMerged = (text, style = {}, height = 22) => {
    worksheet.mergeCells(rowIndex, 1, rowIndex, lastColumn);
    const cell = worksheet.getCell(rowIndex, 1);
    cell.value = safeCell(text);
    cell.alignment = { vertical: 'middle', ...(style.alignment || {}) };
    if (style.font) cell.font = style.font;
    if (style.fill) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fill } };
    }
    worksheet.getRow(rowIndex).height = height;
    rowIndex += 1;
  };

  addMerged(title, {
    font: { name: 'Ebrima', size: 16, bold: true, color: { argb: 'FFFFFFFF' } },
    fill: 'FF312E81',
    alignment: { horizontal: 'left' },
  }, 30);

  addMerged(subtitle || 'ከትምህርት ቤቱ አስተዳደር ስርዓት የተወጣ', {
    font: { name: 'Ebrima', size: 10, color: { argb: 'FFCBD5E1' } },
    fill: 'FF312E81',
  }, 20);

  addMerged(
    `የተዘጋጀበት፡ ${formatEthiopianAmharic(new Date(), { time: true })} (የኢትዮጵያ ዘመን አቆጣጠር)`,
    {
      font: { name: 'Ebrima', size: 9, color: { argb: 'FF64748B' } },
    },
    18,
  );

  if (summary?.length) {
    addMerged(summary.map((item) => `${item.label}: ${item.value}`).join('   ·   '), {
      font: { name: 'Ebrima', size: 9, bold: true, color: { argb: 'FF334155' } },
    }, 20);
  }

  if (note) {
    addMerged(note, {
      font: { name: 'Ebrima', size: 9, italic: true, color: { argb: 'FFB45309' } },
    }, 20);
  }

  rowIndex += 1; // one blank row between the report heading and the table

  const headerIndex = rowIndex;
  const header = worksheet.getRow(headerIndex);
  columns.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.value = safeCell(column.header);
    cell.font = { name: 'Ebrima', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND}` } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
    cell.border = {
      top: { style: 'thin', color: { argb: `FF${LINE}` } },
      left: { style: 'thin', color: { argb: `FF${LINE}` } },
      bottom: { style: 'thin', color: { argb: `FF${LINE}` } },
      right: { style: 'thin', color: { argb: `FF${LINE}` } },
    };
  });
  header.height = 22;

  rows.forEach((row, rowOffset) => {
    const dataRow = worksheet.getRow(headerIndex + rowOffset + 1);
    columns.forEach((column, index) => {
      const cell = dataRow.getCell(index + 1);
      cell.value = safeCell(row?.[column.key]);
      cell.font = { name: 'Ebrima', size: 9, color: { argb: `FF${INK}` } };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
      cell.border = {
        top: { style: 'hair', color: { argb: `FF${LINE}` } },
        left: { style: 'hair', color: { argb: `FF${LINE}` } },
        bottom: { style: 'hair', color: { argb: `FF${LINE}` } },
        right: { style: 'hair', color: { argb: `FF${LINE}` } },
      };
      if (rowOffset % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
    });
    dataRow.height = 18;
  });

  columns.forEach((column, index) => {
    const sample = rows.slice(0, 150).map((row) => String(row?.[column.key] ?? '').length);
    worksheet.getColumn(index + 1).width = Math.min(
      60,
      Math.max(widthFor(column), String(column.header || '').length + 3, ...sample.map((length) => length + 2)),
    );
  });

  const lastRow = headerIndex + rows.length;
  if (rows.length) {
    worksheet.autoFilter = {
      from: { row: headerIndex, column: 1 },
      to: { row: lastRow, column: lastColumn },
    };
  }

  if (!rows.length) {
    worksheet.addRow(['ከማጣሪያው ጋር የሚመሳሰል መረጃ አልተገኘም።']).font = {
      name: 'Ebrima',
      size: 10,
      italic: true,
      color: { argb: `FF${MUTED}` },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function docxCell(text, { header = false, alternate = false } = {}) {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    shading: header
      ? { type: ShadingType.CLEAR, fill: BRAND, color: 'auto' }
      : alternate
        ? { type: ShadingType.CLEAR, fill: 'F8FAFC', color: 'auto' }
        : undefined,
    margins: { top: 70, right: 90, bottom: 70, left: 90 },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: cleanText(text),
            bold: header,
            color: header ? 'FFFFFF' : INK,
            size: header ? 17 : 16,
            font: 'Ebrima',
          }),
        ],
      }),
    ],
  });
}

async function buildDocx({ title, subtitle, summary, note, columns, rows }) {
  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: columns.map((column) => docxCell(column.header, { header: true })),
    }),
    ...rows.map(
      (row, index) =>
        new TableRow({
          children: columns.map((column) => docxCell(row?.[column.key], { alternate: index % 2 === 1 })),
        }),
    ),
  ];

  const children = [
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 34, color: '312E81', font: 'Ebrima' })],
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: subtitle || 'ከትምህርት ቤቱ አስተዳደር ስርዓት የተወጣ',
          size: 19,
          color: MUTED,
          font: 'Ebrima',
        }),
      ],
      spacing: { after: 60 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `የተዘጋጀበት፡ ${formatEthiopianAmharic(new Date(), { time: true })} (የኢትዮጵያ ዘመን አቆጣጠር)`,
          size: 17,
          color: MUTED,
          font: 'Ebrima',
        }),
      ],
      spacing: { after: 120 },
    }),
  ];

  if (summary?.length) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: summary.map((item) => `${item.label}: ${item.value}`).join('   ·   '),
            size: 17,
            bold: true,
            color: '334155',
            font: 'Ebrima',
          }),
        ],
        spacing: { after: 80 },
      }),
    );
  }

  if (note) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: note, italics: true, size: 17, color: 'B45309', font: 'Ebrima' })],
        spacing: { after: 120 },
      }),
    );
  }

  if (rows.length) {
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: LINE },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE },
          left: { style: BorderStyle.SINGLE, size: 4, color: LINE },
          right: { style: BorderStyle.SINGLE, size: 4, color: LINE },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: LINE },
          insideVertical: { style: BorderStyle.SINGLE, size: 4, color: LINE },
        },
        rows: tableRows,
      }),
    );
  } else {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'ከማጣሪያው ጋር የሚመሳሰል መረጃ አልተገኘም።',
            italics: true,
            color: MUTED,
            font: 'Ebrima',
          }),
        ],
      }),
    );
  }

  const document = new Document({
    creator: 'SMS',
    title,
    description: subtitle,
    styles: {
      default: {
        document: {
          run: { font: 'Ebrima', size: 18, color: INK },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 16838, height: 11906, orientation: PageOrientation.LANDSCAPE },
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}

function pdfText(value) {
  return cleanText(value).replace(/\r\n?/g, '\n');
}

async function buildPdf({ title, subtitle, summary, note, columns, rows }) {
  const document = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 34,
    bufferPages: true,
    info: {
      Title: title,
      Author: 'SMS',
      Subject: subtitle || 'የትምህርት ቤት አስተዳደር ስርዓት ማውጣት',
      Creator: 'SMS',
    },
  });

  const chunks = [];
  const done = new Promise((resolve, reject) => {
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });

  if (HAS_ETHIOPIC_FONT) {
    document.registerFont('sms-body', FONT_REGULAR);
    document.registerFont('sms-bold', FONT_BOLD);
  }

  const body = () => (HAS_ETHIOPIC_FONT ? 'sms-body' : 'Helvetica');
  const bold = () => (HAS_ETHIOPIC_FONT ? 'sms-bold' : 'Helvetica-Bold');
  const margin = 34;
  const tableWidth = document.page.width - margin * 2;
  const pageBottom = document.page.height - margin;
  const widths = (() => {
    const absolute = columns.map((column) => Math.max(8, Number(column.width) || 16));
    const total = absolute.reduce((sum, value) => sum + value, 0);
    return absolute.map((value) => (value / total) * tableWidth);
  })();

  let y = margin;

  const pageHeader = (continued = false) => {
    document.font(bold()).fontSize(16).fillColor(`#${'312E81'}`).text(
      continued ? `${title} (ቀጣይ)` : title,
      margin,
      y,
      { width: tableWidth },
    );
    y = document.y + 3;

    if (!continued) {
      if (subtitle) {
        document.font(body()).fontSize(9).fillColor(`#${MUTED}`).text(subtitle, margin, y, { width: tableWidth });
        y = document.y + 2;
      }
      document.font(body()).fontSize(8).fillColor(`#${MUTED}`).text(
        `የተዘጋጀበት፡ ${formatEthiopianAmharic(new Date(), { time: true })} (የኢትዮጵያ ዘመን አቆጣጠር)`,
        margin,
        y,
        { width: tableWidth },
      );
      y = document.y + 3;

      if (summary?.length) {
        document.font(bold()).fontSize(8).fillColor('#334155').text(
          summary.map((item) => `${item.label}: ${item.value}`).join('   ·   '),
          margin,
          y,
          { width: tableWidth },
        );
        y = document.y + 2;
      }

      if (note) {
        document.font(body()).fontSize(8).fillColor('#B45309').text(note, margin, y, { width: tableWidth });
        y = document.y + 2;
      }
    }

    y += 6;
    return y;
  };

  const drawHeaderRow = () => {
    const height = 22;
    let x = margin;

    columns.forEach((column, index) => {
      const width = widths[index];
      document.rect(x, y, width, height).fill(`#${BRAND}`);
      document.font(bold()).fontSize(8).fillColor('#FFFFFF').text(column.header, x + 4, y + 7, {
        width: width - 8,
        height: height - 8,
        ellipsis: true,
      });
      x += width;
    });

    y += height;
  };

  const drawTable = () => {
    if (!rows.length) {
      document.font(body()).fontSize(10).fillColor(`#${MUTED}`).text('ከማጣሪያው ጋር የሚመሳሰል መረጃ አልተገኘም።', margin, y, {
        width: tableWidth,
      });
      y = document.y;
      return;
    }

    drawHeaderRow();

    rows.forEach((row, rowIndex) => {
      document.font(body()).fontSize(8);
      const heights = columns.map((column, index) =>
        document.heightOfString(pdfText(row?.[column.key]), { width: widths[index] - 8, lineGap: 0 }),
      );
      const height = Math.max(20, Math.max(...heights) + 8);

      if (y + height > pageBottom) {
        document.addPage();
        y = margin;
        pageHeader(true);
        drawHeaderRow();
      }

      if (rowIndex % 2 === 1) {
        document.rect(margin, y, tableWidth, height).fill('#F8FAFC');
      }

      let x = margin;
      columns.forEach((column, index) => {
        const width = widths[index];
        document
          .font(body())
          .fontSize(8)
          .fillColor(`#${INK}`)
          .text(pdfText(row?.[column.key]), x + 4, y + 5, {
            width: width - 8,
            height: height - 8,
            ellipsis: true,
          });
        x += width;
      });

      document.strokeColor(`#${LINE}`).lineWidth(0.5);
      document.moveTo(margin, y + height).lineTo(margin + tableWidth, y + height).stroke();

      let lineX = margin;
      columns.forEach((_, index) => {
        lineX += widths[index];
        if (index < columns.length - 1) {
          document.moveTo(lineX, y).lineTo(lineX, y + height).stroke();
        }
      });

      y += height;
    });
  };

  pageHeader(false);
  drawTable();
  document.end();

  return done;
}

export async function buildExport({ format, filenamePrefix, title, subtitle, summary, note, columns, rows }) {
  if (!EXPORT_FORMATS[format]) throw new Error('Unknown export format.');
  if (!columns?.length) throw new Error('An export needs at least one column.');

  const common = { title, subtitle, summary, note, columns, rows };
  let buffer;

  if (format === 'xlsx') buffer = await buildXlsx(common);
  else if (format === 'docx') buffer = await buildDocx(common);
  else buffer = await buildPdf(common);

  return {
    format,
    buffer,
    rowCount: rows.length,
    filename: exportFilename(filenamePrefix, format),
    contentType: EXPORT_FORMATS[format].contentType,
  };
}
