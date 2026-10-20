// Google publishes the list of devices its store recognises: retail brand, the name on
// the box, a codename, and the model code the phone reports to a browser. That is the only
// public, maintained source for turning "SM-M135F" into "Samsung Galaxy M13", so it is
// downloaded once and turned into a small lookup file that ships with the server.
//
// Run with: npm run build:devices
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://storage.googleapis.com/play_public/supported_devices.csv';
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'device-names.json');

// The file is CSV with quoted fields, so a plain split on commas would break any name that
// contains one. This keeps quoted commas and doubled quotes intact.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`The device catalogue could not be downloaded (${response.status}).`);

// UTF-16LE with a byte-order mark.
const text = new TextDecoder('utf-16le').decode(await response.arrayBuffer()).replace(/^\uFEFF/, '');
const rows = parseCsv(text);

const names = {};
for (const [brand, marketing, , model] of rows.slice(1)) {
  const code = String(model ?? '').trim().toUpperCase();
  const maker = String(brand ?? '').trim();
  const name = String(marketing ?? '').trim();
  if (!code || !name) continue;
  // Some marketing names already begin with the maker ("Redmi Note 12"), so the maker is
  // only added when it is not already there.
  const label = maker && !name.toLowerCase().startsWith(maker.toLowerCase()) ? `${maker} ${name}` : name;
  // Several rows can share a code across regions; the first name is the one kept.
  if (!names[code]) names[code] = label.replace(/\s+/g, ' ');
}

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify(names)}\n`, 'utf8');
console.log(`${Object.keys(names).length} models written to ${path.relative(process.cwd(), OUT)}`);
