const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isPublicProfileEligible,
  sanitizePublicProfile,
  sanitizePublicSmartProfile,
  publicProfileProjectionChanged,
} = require('./publicProfiles');

test('public profile keeps only explicitly public identity and smart-profile fields', () => {
  const result = sanitizePublicProfile('user-1', {
    displayName: '  Dana  ',
    email: 'private@example.com',
    photoURL: 'https://lh3.googleusercontent.com/avatar.jpg',
    photoMedia: { assetId: 'asset-1' },
    isExpert: true,
    credibilityScore: 99,
    smartProfile: {
      interests: ['food', 'nature_scenery'],
      vibe: ['relaxed'],
      budget: 'premium',
      travelParties: ['couple'],
      onboardingVersion: 2,
      setupRequired: false,
      completedAt: 'time',
      travelStyleTag: 'luxury',
      constraints: ['medical'],
    },
  });

  assert.deepEqual(result, {
    uid: 'user-1',
    displayName: 'Dana',
    photoURL: 'https://lh3.googleusercontent.com/avatar.jpg',
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

test('public profiles require current onboarding, legal consent and active moderation without preferences', () => {
  const eligible = {
    displayName: 'Dana',
    onboarding: { profileDetailsVersion: 1, profileDetailsCompletedAt: 'time' },
    legal: {
      termsVersion: '2026-08-15-community-safety',
      privacyVersion: '2026-08-18-beta-observability',
      acceptedAt: 'time',
    },
    smartProfile: { setupRequired: false, completedAt: 'time' },
    moderation: { status: 'active' },
  };
  assert.equal(isPublicProfileEligible(eligible), true);
  assert.equal(isPublicProfileEligible({ ...eligible, smartProfile: { setupRequired: true } }), true);
  assert.equal(isPublicProfileEligible({ ...eligible, legal: {} }), false);
  assert.equal(isPublicProfileEligible({ ...eligible, moderation: { status: 'suspended' } }), false);
});

test('public profile keeps incomplete Noa preference drafts private', () => {
  const incomplete = sanitizePublicProfile('user-incomplete', {
    displayName: 'Dana',
    smartProfile: {
      interests: ['food'],
      vibe: ['relaxed'],
      onboardingVersion: 2,
      setupRequired: true,
    },
  });
  const completed = sanitizePublicProfile('user-complete', {
    displayName: 'Dana',
    smartProfile: {
      interests: ['food', 'nature_scenery'],
      vibe: ['relaxed'],
      budget: 'balanced',
      travelParties: ['couple'],
      onboardingVersion: 2,
      setupRequired: false,
      completedAt: 'time',
    },
  });

  assert.equal(incomplete.smartProfile, null);
  assert.deepEqual(completed.smartProfile, {
    interests: ['food', 'nature_scenery'],
    vibe: ['relaxed'],
  });
});

test('public profile projection rejects arbitrary remote avatar origins', () => {
  assert.equal(sanitizePublicProfile('user-1', {
    displayName: 'Dana',
    photoURL: 'https://tracker.example/pixel.gif',
  }).photoURL, null);
});

test('private preference and activity updates do not refresh the public projection', () => {
  const before = {
    displayName: 'Dana',
    onboarding: { profileDetailsVersion: 1, profileDetailsCompletedAt: 'time' },
    legal: {
      termsVersion: '2026-08-15-community-safety',
      privacyVersion: '2026-08-18-beta-observability',
      acceptedAt: 'time',
    },
    moderation: { status: 'active' },
    smartProfile: {
      interests: ['food', 'nature_scenery'], vibe: ['relaxed'], budget: 'balanced',
      travelParties: ['couple'], onboardingVersion: 2, setupRequired: false, completedAt: 'time',
    },
  };
  const afterPrivateUpdate = {
    ...before,
    smartProfile: { ...before.smartProfile, budget: 'premium', needs: ['kosher'] },
    personalization: { facetScores: { interests: { food: 5 } } },
  };
  const afterPublicUpdate = {
    ...afterPrivateUpdate,
    smartProfile: { ...afterPrivateUpdate.smartProfile, interests: ['beaches_water', 'nature_scenery'] },
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

test('public profile includes a short bio but never private account fields', () => {
  const result = sanitizePublicProfile('user-bio', {
    displayName: 'Dana',
    email: 'private@example.com',
    bio: '  ים, קפה וטיולים 🌊  ',
    smartProfile: {
      interests: ['food', 'nature_scenery'],
      vibe: ['relaxed'],
      budget: 'premium',
      travelParties: ['solo'],
      onboardingVersion: 2,
      setupRequired: false,
      completedAt: 'time',
    },
  });

  assert.equal(result.bio, 'ים, קפה וטיולים 🌊');
  assert.equal('email' in result, false);
  assert.equal('budget' in result.smartProfile, false);
  assert.equal('travelParties' in result.smartProfile, false);
});
