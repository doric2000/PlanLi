const test = require('node:test');
const assert = require('node:assert/strict');

const {
  sanitizePublicProfile,
  sanitizePublicSmartProfile,
} = require('./publicProfiles');

test('public profile keeps only explicitly public identity and smart-profile fields', () => {
  const result = sanitizePublicProfile('user-1', {
    displayName: '  Dana  ',
    email: 'private@example.com',
    photoURL: 'https://example.com/avatar.jpg',
    photoMedia: { assetId: 'asset-1' },
    isExpert: true,
    credibilityScore: 99,
    smartProfile: {
      interests: ['food', 'nature'],
      vibe: ['quiet'],
      budget: 'high',
      travelStyleTag: 'luxury',
      constraints: ['medical'],
    },
  });

  assert.deepEqual(result, {
    uid: 'user-1',
    displayName: 'Dana',
    photoURL: 'https://example.com/avatar.jpg',
    photoMedia: { assetId: 'asset-1' },
    isExpert: true,
    smartProfile: {
      interests: ['food', 'nature'],
      vibe: ['quiet'],
    },
  });
  assert.equal('email' in result, false);
  assert.equal('credibilityScore' in result, false);
});

test('public smart profile rejects unsupported values and caps arrays', () => {
  const result = sanitizePublicSmartProfile({
    interests: [...Array.from({ length: 35 }, (_, index) => `tag-${index}`), 42],
    vibe: { private: true },
    budget: 'private',
  });

  assert.equal(result.interests.length, 30);
  assert.equal('vibe' in result, false);
  assert.equal('budget' in result, false);
});
