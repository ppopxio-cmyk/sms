import { AuditLog } from '../models/AuditLog.js';
import { logger } from '../utils/logger.js';

const MAX_TRIES = 5;
const MAX_QUEUE = 5000;
const queue = [];
let running = null;

const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function buildDoc({ req, actorId, actorRole, action, targetType, targetId, status = 'success', meta }) {
  // Login entries carry the canonical place in meta. Lifting it to top-level fields
  // keeps audit history readable after the session row (the other copy) is deleted.
  const place = meta && typeof meta === 'object' ? meta : {};
  return {
    actorId: actorId ?? req?.user?.id,
    actorRole: actorRole ?? req?.user?.role,
    action,
    targetType,
    targetId: targetId ? String(targetId) : undefined,
    status,
    meta,
    ip: req?.ip,
    sessionId: req?.user?.sid,
    location: place.location,
    country: place.country,
    countryCode: place.countryCode,
    city: place.city,
    region: place.region,
    detectionStatus: place.detectionStatus,
    detectedAt: place.detectedAt,
  };
}

// One drain at a time. A failed write is retried with a short backoff; after
// MAX_TRIES it is dropped with an error log so a broken database can never
// spin forever or grow the queue without bound.
function drain() {
  if (running) return running;

  running = (async () => {
    while (queue.length) {
      const job = queue[0];
      try {
        await AuditLog.create(job.doc);
        queue.shift();
      } catch (err) {
        job.tries += 1;
        if (job.tries >= MAX_TRIES) {
          queue.shift();
          logger.error({ err: err.message, action: job.doc.action }, 'audit write dropped after retries');
        } else {
          await wait(50 * job.tries);
        }
      }
    }
  })()
    .catch(() => {})
    .finally(() => { running = null; });

  return running;
}

// Fire and forget, so the person never waits for the log. Never put secrets in meta.
export function audit(input) {
  queue.push({ doc: buildDoc(input), tries: 0 });
  if (queue.length > MAX_QUEUE) queue.shift();
  void drain();
}

export const pendingAudits = () => queue.length;

// Used on shutdown so queued entries are not lost when the process exits.
export const flushAudit = () => drain();
