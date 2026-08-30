const { HttpsError } = require('firebase-functions/v2/https');

const MAX_PAYLOAD_BYTES = 512 * 1024;
const MAX_DEPTH = 12;
const MAX_ARRAY_LENGTH = 100;
const MAX_OBJECT_FIELDS = 100;
const MAX_STRING_LENGTH = 64 * 1024;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const UNSAFE_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/gu;

function invalid(reason = 'INVALID_CALLABLE_INPUT') {
  throw new HttpsError('invalid-argument', 'The request payload is invalid.', { reason });
}

function normalizeString(value) {
  return value
    .normalize('NFC')
    .replace(/\r\n?/gu, '\n')
    .replace(UNSAFE_CONTROLS, '');
}

function normalizeValue(value, depth, seen) {
  if (depth > MAX_DEPTH) invalid('CALLABLE_INPUT_TOO_DEEP');
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid('CALLABLE_INPUT_INVALID_NUMBER');
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) invalid('CALLABLE_INPUT_STRING_TOO_LONG');
    return normalizeString(value);
  }
  if (typeof value !== 'object') invalid('CALLABLE_INPUT_UNSUPPORTED_TYPE');
  if (seen.has(value)) invalid('CALLABLE_INPUT_CYCLE');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_ARRAY_LENGTH) invalid('CALLABLE_INPUT_ARRAY_TOO_LONG');
      return value.map((item) => normalizeValue(item, depth + 1, seen));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      invalid('CALLABLE_INPUT_UNSAFE_OBJECT');
    }
    const entries = Object.entries(value);
    if (entries.length > MAX_OBJECT_FIELDS) invalid('CALLABLE_INPUT_TOO_MANY_FIELDS');
    const normalized = Object.create(null);
    for (const [key, item] of entries) {
      if (FORBIDDEN_KEYS.has(key) || UNSAFE_CONTROLS.test(key) || key.includes('\r') || key.includes('\n')) {
        UNSAFE_CONTROLS.lastIndex = 0;
        invalid('CALLABLE_INPUT_UNSAFE_FIELD');
      }
      UNSAFE_CONTROLS.lastIndex = 0;
      normalized[key] = normalizeValue(item, depth + 1, seen);
    }
    return normalized;
  } finally {
    seen.delete(value);
  }
}

function normalizeCallableInput(data) {
  if (data == null) return data;
  if (typeof data !== 'object' || Array.isArray(data)) invalid('CALLABLE_INPUT_OBJECT_REQUIRED');
  const normalized = normalizeValue(data, 0, new WeakSet());
  const serialized = JSON.stringify(normalized);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PAYLOAD_BYTES) {
    invalid('CALLABLE_INPUT_TOO_LARGE');
  }
  return normalized;
}

module.exports = {
  MAX_ARRAY_LENGTH,
  MAX_DEPTH,
  MAX_OBJECT_FIELDS,
  MAX_PAYLOAD_BYTES,
  MAX_STRING_LENGTH,
  normalizeCallableInput,
};
