const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_ARRAY_LENGTH,
  MAX_DEPTH,
  MAX_OBJECT_FIELDS,
  MAX_STRING_LENGTH,
  normalizeCallableInput,
} = require('./callableInputSecurity');

function reason(error) {
  return error?.details?.reason;
}

test('callable input is a bounded plain object and normalizes text safely', () => {
  const input = { text: 'é\r\nשלום\u0000', nested: { ok: true } };
  const result = normalizeCallableInput(input);
  assert.equal(Object.getPrototypeOf(result), null);
  assert.equal(result.text, 'é\nשלום');
  assert.deepEqual({ ...result.nested }, { ok: true });
  assert.throws(() => normalizeCallableInput('text'), (error) => reason(error) === 'CALLABLE_INPUT_OBJECT_REQUIRED');
  assert.throws(() => normalizeCallableInput({ number: Infinity }), (error) => reason(error) === 'CALLABLE_INPUT_INVALID_NUMBER');
});

test('prototype keys, unsafe objects, cycles and bidi overrides fail closed', () => {
  const prototypeKey = JSON.parse('{"__proto__":{"admin":true}}');
  assert.throws(() => normalizeCallableInput(prototypeKey), (error) => reason(error) === 'CALLABLE_INPUT_UNSAFE_FIELD');
  assert.throws(() => normalizeCallableInput({ constructor: 'x' }), (error) => reason(error) === 'CALLABLE_INPUT_UNSAFE_FIELD');
  assert.throws(() => normalizeCallableInput({ date: new Date() }), (error) => reason(error) === 'CALLABLE_INPUT_UNSAFE_OBJECT');
  const cycle = {};
  cycle.self = cycle;
  assert.throws(() => normalizeCallableInput(cycle), (error) => reason(error) === 'CALLABLE_INPUT_CYCLE');
  assert.equal(normalizeCallableInput({ text: 'safe\u202Eevil' }).text, 'safeevil');
});

test('depth, field count, array length and string length are bounded', () => {
  assert.throws(
    () => normalizeCallableInput({ values: Array(MAX_ARRAY_LENGTH + 1).fill('x') }),
    (error) => reason(error) === 'CALLABLE_INPUT_ARRAY_TOO_LONG'
  );
  assert.throws(
    () => normalizeCallableInput(Object.fromEntries(Array.from({ length: MAX_OBJECT_FIELDS + 1 }, (_, index) => [`k${index}`, true]))),
    (error) => reason(error) === 'CALLABLE_INPUT_TOO_MANY_FIELDS'
  );
  assert.throws(
    () => normalizeCallableInput({ value: 'x'.repeat(MAX_STRING_LENGTH + 1) }),
    (error) => reason(error) === 'CALLABLE_INPUT_STRING_TOO_LONG'
  );
  let deep = {};
  let cursor = deep;
  for (let index = 0; index <= MAX_DEPTH; index += 1) {
    cursor.next = {};
    cursor = cursor.next;
  }
  assert.throws(() => normalizeCallableInput(deep), (error) => reason(error) === 'CALLABLE_INPUT_TOO_DEEP');
});
