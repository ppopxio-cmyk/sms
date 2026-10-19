// Text that goes into a regular expression search has to be escaped, otherwise
// somebody can type a pattern that is slow to run or that matches more than they
// should see. See the security checklist, section 15.
export const escapeRegex = (value) => String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
