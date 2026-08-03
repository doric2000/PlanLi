const test = require('node:test');
const assert = require('node:assert/strict');

const {
  sanitizePublicProfile,
  sanitizePublicSmartProfile,
  publicProfileProjectionChanged,
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
      interests: ['food', 'nature_scenery'],
      vibe: ['relaxed'],
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
      interests: ['food', 'nature_scenery'],
      vibe: ['relaxed'],
    },
  });
  assert.equal('email' in result, false);
  assert.equal('credibilityScore' in result, false);
});

test('private preference and activity updates do not refresh the public projection', () => {
  const before = {
    displayName: 'Dana',
    smartProfile: {
      interests: ['food'], vibe: ['relaxed'], budget: 'balanced', travelParties: ['couple'],
    },
  };
  const afterPrivateUpdate = {
    ...before,
    smartProfile: { ...before.smartProfile, budget: 'premium', needs: ['kosher'] },
    personalization: { facetScores: { interests: { food: 5 } } },
  };
  const afterPublicUpdate = {
    ...afterPrivateUpdate,
    smartProfile: { ...afterPrivateUpdate.smartProfile, interests: ['hiking'] },
  };

  assert.equal(publicProfileProjectionChanged('user-1', before, afterPrivateUpdate), false);
  assert.equal(publicProfileProjectionChanged('user-1', before, afterPublicUpdate), true);
});

test('public smart profile rejects unsupported values and caps canonical arrays', () => {
  const result = sanitizePublicSmartProfile({
    interests: ['food', 'food', 'nature_scenery', 'unknown'],
    vibe: { private: true },
    budget: 'private',
  });

  assert.deepEqual(result.interests, ['food', 'nature_scenery']);
  assert.equal('vibe' in result, false);
  assert.equal('budget' in result, false);
});
