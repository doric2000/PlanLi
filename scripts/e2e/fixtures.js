'use strict';

const ACCOUNT = Object.freeze({
  uid: 'local-e2e-traveler', email: 'traveler@example.test', password: 'Local-E2E-only-2468!',
});

function recommendationFixture(media = []) {
  return { taxonomyVersion: 5, title: 'Local E2E Gallery', description: 'Synthetic local recommendation',
    category: 'Food', categoryId: 'food', tags: ['cafe'], budget: '$$', media,
    attributes: { audienceScope: 'all', audiences: [], vibes: ['relaxed'], environment: 'indoor', needs: [], needsConfirmed: false } };
}

module.exports = { ACCOUNT, recommendationFixture };
