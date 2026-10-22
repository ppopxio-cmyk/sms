// Ethiopian mobile numbers are written abroad as +251 9 12 34 56 and at home as
// 091234567 or 91234567. Every official record stores the international form, so this
// module is the single place a number is normalised or checked. The registrar requires
// a working phone before a student may be admitted, and the same rule applies to
// teachers, so the logic lives here rather than in a schema validator.
//
// The prefix is mandatory: a bare national number is ambiguous and could belong to a
// different country. Only the international form is accepted on the way in.

export const ETHIOPIA_COUNTRY_CODE = '251';
const PREFIX = '+251';
const NATIONAL_PREFIX = '0';
const MIN_DIGITS = 9;
const MAX_DIGITS = 9;

const DIGITS_ONLY = /^\d+$/;

// Strip everything that is not a digit, then treat a leading 0 as the national prefix.
export function normalizePhone(value) {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text) return '';

  let digits = text.replace(/\D/g, '');

  // +251 91234567 -> 25191234567
  if (text.startsWith('+')) {
    digits = text.replace(/\+/, '').replace(/\D/g, '');
  }

  // 091234567 -> 25191234567
  if (digits.startsWith(NATIONAL_PREFIX)) {
    digits = digits.slice(NATIONAL_PREFIX.length);
  }

  // 91234567 (already without the national prefix) -> 25191234567
  if (digits.length === MIN_DIGITS) {
    return `${PREFIX}${digits}`;
  }

  // 25191234567 (international without the plus) -> +25191234567
  if (
    digits.length === ETHIOPIA_COUNTRY_CODE.length + MIN_DIGITS &&
    digits.startsWith(ETHIOPIA_COUNTRY_CODE)
  ) {
    return `+${digits}`;
  }

  return '';
}

export function isValidEthiopianPhone(value) {
  return Boolean(normalizePhone(value));
}

export function formatPhone(value) {
  const normalized = normalizePhone(value);
  if (!normalized) return '';
  // +251 9XX XXX XXX is the form most people recognise.
  const body = normalized.slice(1); // drop the +
  return `+${body.slice(0, 3)} ${body.slice(3, 6)} ${body.slice(6)}`;
}

export function phoneErrorMessage(value, label = 'Phone number') {
  if (value == null || String(value).trim() === '') {
    return `${label} is required.`;
  }
  if (!isValidEthiopianPhone(value)) {
    return `${label} must be a valid Ethiopian mobile number, e.g. +251 912 345 678.`;
  }
  return '';
}