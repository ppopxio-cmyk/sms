import crypto from 'node:crypto';

// A live list of open event streams, one entry per signed-in browser tab that has the
// portal open. It is deliberately in-process and never persisted: if the API restarts,
// every browser reconnects and asks for a fresh ticket.
const clients = new Map(); // key -> { userId, sid, role, res }
const HEARTBEAT_MS = 25_000;

function write(res, event, payload) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

export function addClient(userId, res, sid, role = null) {
  const key = crypto.randomUUID();
  clients.set(key, {
    userId: String(userId),
    sid: sid ? String(sid) : null,
    role: role || null,
    res,
  });
  return key;
}

export function removeClient(key) {
  clients.delete(key);
}

// Closing the portal ends ordinary browser streams too. The clients reconnect by asking
// for a new ticket, which the maintenance guard refuses for every non-admin session.
// Administrators keep their stream so the recovery UI still updates live.
export function closeNonAdmins() {
  let closed = 0;
  for (const [key, client] of clients) {
    if (client.role === 'ADMIN') continue;
    try {
      client.res.end();
    } catch {
      // the socket was already gone; removing the entry is enough
    }
    clients.delete(key);
    closed += 1;
  }
  return closed;
}

export function countForUser(userId) {
  let total = 0;
  for (const client of clients.values()) if (client.userId === String(userId)) total += 1;
  return total;
}

// Returns how many open tabs received the event. Tabs belonging to `exceptSid` are
// skipped, so a device is never told about the sign-in it just performed itself.
export function sendToUser(userId, event, payload, { exceptSid } = {}) {
  const skip = exceptSid ? String(exceptSid) : null;
  let sent = 0;
  for (const client of clients.values()) {
    if (client.userId !== String(userId)) continue;
    if (skip && client.sid === skip) continue;
    if (write(client.res, event, payload)) sent += 1;
  }
  return sent;
}

// One timer for the whole process. The comment lines keep proxies from closing an idle
// stream, and they are ignored by EventSource.
const heartbeat = setInterval(() => {
  for (const [key, client] of clients) if (!write(client.res, 'ping', { at: Date.now() })) clients.delete(key);
}, HEARTBEAT_MS);
heartbeat.unref?.();

export const streamCount = () => clients.size;
