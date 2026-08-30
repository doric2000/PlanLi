const { appCheckTokenExpiry } = require('../src/config/appCheckToken');

test('App Check bridge uses the signed token expiry and falls back conservatively', () => {
  const now = Date.UTC(2026, 7, 28, 12);
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor((now + 30 * 60 * 1000) / 1000) }))
    .toString('base64url');
  expect(appCheckTokenExpiry(`header.${payload}.signature`, now)).toBe(now + 30 * 60 * 1000);
  expect(appCheckTokenExpiry('malformed', now)).toBe(now + 5 * 60 * 1000);
});
