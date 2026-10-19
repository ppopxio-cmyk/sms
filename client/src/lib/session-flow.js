// Half-finished journeys live in sessionStorage so a refresh does not throw the
// person back to the start. sessionStorage is per tab and dies with the tab, and
// every key is cleared the moment its journey ends.
export const FLOW_KEYS = {
  pendingVerify: 'sms.pending-verify',
  setup: 'sms.setup-flow',
  reset: 'sms.reset-flow',
};

export function readFlow(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeFlow(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked (private mode): the journey simply will not survive a refresh
  }
}

export function clearFlow(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // nothing to do
  }
}

export function clearFlows() {
  Object.values(FLOW_KEYS).forEach(clearFlow);
}
