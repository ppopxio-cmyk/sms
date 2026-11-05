// One-off maintenance script: shift an open payment cycle's due date and propagate the
// same date to its unpaid student charges, exactly like the "Update due date" action in
// Finance > Payment Cycles (PUT /finance/cycles/:id) does.
//
// Usage:
//   node scripts/set-cycle-due.mjs --hash 919f096d6534774f50d1a93c32b450e3 --ethDay 18
//   node scripts/set-cycle-due.mjs --all-tikimt-2019 --ethDay 18
//   node scripts/set-cycle-due.mjs --list
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromEthiopian, toEthiopian, ETH_MONTHS, parseEATDate } from '../src/utils/ethiopianDate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const args = process.argv.slice(2);
function argValue(name) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}
const hasFlag = (name) => args.includes(`--${name}`);

const HASH = argValue('hash');
const ALL_TIKIMT = hasFlag('all-tikimt-2019');
const LIST_ONLY = hasFlag('list');
const ETH_DAY = Number(argValue('ethDay') || 18);
const ETH_YEAR = Number(argValue('ethYear') || 2019);
const ETH_MONTH = Number(argValue('ethMonth') || 2); // 2 = Tikimt

function dueValue() {
  const gregorian = fromEthiopian(ETH_YEAR, ETH_MONTH, ETH_DAY, 23, 59, 59);
  if (!gregorian) throw new Error(`Invalid Ethiopian date ${ETH_YEAR} - ${ETH_MONTH} - ${ETH_DAY}`);
  return gregorian;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log('Connected to database.');

  const db = mongoose.connection.db;
  const cycles = db.collection('paymentcycles');
  const charges = db.collection('studentcharges');

  if (LIST_ONLY) {
    const docs = await cycles.find({ deletedAt: null }).sort({ ethYear: -1, ethMonth: -1 }).limit(20).toArray();
    for (const cycle of docs) {
      console.log(
        `- ${cycle.title || `${ETH_MONTHS[(cycle.ethMonth || 1) - 1]} ${cycle.ethYear}`} | month ${cycle.ethMonth} year ${cycle.ethYear} | hash ${cycle.portalHash} | status ${cycle.status} | opens ${cycle.opensAt ? toEthiopian(cycle.opensAt).month + '/' + toEthiopian(cycle.opensAt).day : '—'} | due ${cycle.dueAt ? toEthiopian(cycle.dueAt).month + '/' + toEthiopian(cycle.dueAt).day : '—'} (E.C.)`
      );
    }
    return;
  }

  let filter;
  if (ALL_TIKIMT) {
    filter = { deletedAt: null, ethYear: ETH_YEAR, ethMonth: ETH_MONTH };
  } else if (HASH) {
    filter = {
      deletedAt: null,
      $or: [{ portalHash: HASH.toLowerCase().trim() }, { slug: HASH.toLowerCase().trim() }],
    };
  } else {
    filter = { deletedAt: null, ethYear: ETH_YEAR, ethMonth: ETH_MONTH };
  }

  const targets = await cycles.find(filter).toArray();
  if (!targets.length) {
    console.log('No matching cycles found.');
    return;
  }

  const newDue = dueValue();
  console.log(
    `New due date: ${ETH_MONTHS[ETH_MONTH - 1]} ${ETH_DAY}, ${ETH_YEAR} E.C. -> ${newDue.toISOString()} (end of day EAT)`
  );

  for (const cycle of targets) {
    const before = cycle.dueAt ? toEthiopian(cycle.dueAt) : null;
    const result = await cycles.updateOne(
      { _id: cycle._id },
      { $set: { dueAt: newDue, updatedAt: new Date() } }
    );
    const chargesResult = await charges.updateMany(
      { cycle: cycle._id, status: { $in: ['unpaid', 'overdue', 'partially_paid'] } },
      { $set: { dueAt: newDue } }
    );
    console.log(
      `Updated "${cycle.title}" (${String(cycle._id)}) hash=${cycle.portalHash}: ${result.modifiedCount} cycle, ${chargesResult.modifiedCount} unpaid charges. Due was ${before ? `${ETH_MONTHS[before.month - 1]} ${before.day}` : 'n/a'} -> now ${ETH_MONTHS[ETH_MONTH - 1]} ${ETH_DAY}.`
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect().catch(() => {}));
