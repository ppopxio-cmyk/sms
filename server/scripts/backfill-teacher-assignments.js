import 'dotenv/config';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { backfillTeacherProgramAssignments } from '../src/services/teacherAccess.service.js';

await connectDB();
try {
  const result = await backfillTeacherProgramAssignments();
  console.log(
    `Teacher programme assignments: ${result.assigned} created, ${result.revoked} revoked across ${result.programs} programme(s).`,
  );
} finally {
  await disconnectDB();
}
