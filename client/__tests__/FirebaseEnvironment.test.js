import { resolveFirebaseEnvironment } from '../src/config/firebaseEnvironment';

const valid = {
  apiKey: ['AI', 'za', 'S'.repeat(35)].join(''),
  authDomain: 'planli.cc',
  projectId: 'planli-f0b12',
  storageBucket: 'planli-f0b12-media-eu',
  messagingSenderId: '633543026638',
  appId: '1:633543026638:web:b63d2a622f3d685646ad9f',
};

describe('Firebase release environment', () => {
  it('keeps the custom Auth domain on Web', () => {
    expect(resolveFirebaseEnvironment(valid, 'web').authDomain).toBe('planli.cc');
  });

  it('uses the Firebase-owned Auth domain on native platforms', () => {
    expect(resolveFirebaseEnvironment(valid, 'ios').authDomain).toBe('planli-f0b12.firebaseapp.com');
    expect(resolveFirebaseEnvironment(valid, 'android').authDomain).toBe('planli-f0b12.firebaseapp.com');
  });

  it('fails closed when a required value is missing or a dummy fallback appears', () => {
    expect(() => resolveFirebaseEnvironment({ ...valid, apiKey: '' }, 'ios'))
      .toThrow(/apiKey/);
    expect(() => resolveFirebaseEnvironment({ ...valid, projectId: 'planli-dummy' }, 'ios'))
      .toThrow(/projectId/);
  });

  it('rejects a Firebase App ID from a different project', () => {
    expect(() => resolveFirebaseEnvironment({
      ...valid,
      appId: '1:111111111111:web:abcdef1234',
    }, 'ios')).toThrow(/different projects/);
  });
});
