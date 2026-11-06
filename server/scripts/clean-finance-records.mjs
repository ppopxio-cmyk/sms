import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log('Connected to MongoDB.');

  const db = mongoose.connection.db;
  const collections = [
    'paymentcycles',
    'studentcharges',
    'payments',
    'paymentattempts',
    'waivers',
    'deadlineextensions',
  ];

  console.log('Current finance collections count:');
  for (const collName of collections) {
    const coll = db.collection(collName);
    const count = await coll.countDocuments();
    console.log(`  - ${collName}: ${count} documents`);
  }

  const shouldDelete = process.argv.includes('--confirm-delete');
  if (!shouldDelete) {
    console.log('\nDry run completed. Pass --confirm-delete to delete all cycles and payment records.');
    await mongoose.disconnect();
    return;
  }

  console.log('\nProceeding to delete all cycles and payment records...');
  for (const collName of collections) {
    const coll = db.collection(collName);
    const result = await coll.deleteMany({});
    console.log(`  - Deleted ${result.deletedCount} from ${collName}`);
  }

  console.log('\nAll cycles and payment records have been cleanly deleted.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Error running clean-finance-records:', err);
  process.exit(1);
});
