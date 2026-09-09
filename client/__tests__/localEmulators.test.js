const { resolveLocalEmulators, LOCAL_PROJECT_ID, localMediaUrl } = require('../src/config/localEmulators');

test('emulator mode is opt-in and rejects live projects and release apps', () => {
  expect(resolveLocalEmulators({ development: true, projectId: 'planli-f0b12' })).toBeNull();
  expect(() => resolveLocalEmulators({ enabled: 'true', development: true, projectId: 'planli-f0b12' })).toThrow(/demo-planli/);
  expect(() => resolveLocalEmulators({ enabled: 'true', development: false, projectId: LOCAL_PROJECT_ID })).toThrow(/development/);
  expect(() => resolveLocalEmulators({ development: true, projectId: LOCAL_PROJECT_ID })).toThrow(/explicit/);
  expect(() => resolveLocalEmulators({ enabled: 'true', development: true, projectId: LOCAL_PROJECT_ID, host: 'example.com' })).toThrow(/local host/);
});
test('the demo uses all four SDK emulators', () => {
  expect(resolveLocalEmulators({ enabled: 'true', development: true, projectId: LOCAL_PROJECT_ID })).toEqual({
    projectId: LOCAL_PROJECT_ID, host: '127.0.0.1', auth: 9099, firestore: 8080, storage: 9199, functions: 5001,
  });
});
test('normal media URLs are unchanged', () => {
  expect(localMediaUrl('https://example.com/photo.jpg')).toBe('https://example.com/photo.jpg');
});
