const test = require('node:test');
const assert = require('node:assert/strict');
const { sharedTripLinking } = require('../src/navigation/sharedTripLinking');

test('server-issued shared-trip paths preserve the token and target', () => {
  for (const length of [40, 43, 128]) {
    const token = `aZ_-${'x'.repeat(length - 4)}`;
    for (const prefix of ['', '/']) {
      assert.deepEqual(sharedTripLinking.getStateFromPath(`${prefix}shared-trip/${token}`), {
        routes: [{ name: 'SharedTrip', params: { token } }],
      });
    }
  }
});

test('untrusted paths cannot select other screens or invoke query decoding', () => {
  const token = 'x'.repeat(43);
  for (const path of [null, undefined, {}, '', 'AdminPanel', `shared-trip/${'x'.repeat(39)}`,
    `shared-trip/${'x'.repeat(129)}`, `shared-trip/${token}/extra`, `shared-trip/${token}?x=%E0%A4`,
    `shared-trip/${token}#fragment`, `shared-trip/${token}\n`, `shared-trip/${token}%2f`,
    `//shared-trip/${token}`, `shared-trip/${'x'.repeat(100000)}`]) {
    assert.equal(sharedTripLinking.getStateFromPath(path), undefined);
  }
});
