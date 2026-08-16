const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_TEXT_LENGTH,
  buildModerationPreview,
  canonicalTargetPath,
  hydrateModerationPreviews,
  preserveReportedPreview,
} = require('./moderationPreview');

function fakeAdmin(records) {
  const db = {
    doc(path) {
      return { path, id: path.split('/').pop() };
    },
    async getAll(...refs) {
      return refs.map((ref) => ({
        ref,
        id: ref.id,
        exists: Object.hasOwn(records, ref.path),
        data: () => records[ref.path],
      }));
    },
  };
  return { firestore: () => db };
}

test('builds bounded recommendation previews from approved public fields', () => {
  const preview = buildModerationPreview({
    target: { type: 'recommendation', id: 'rec-1' },
    data: {
      ownerId: 'owner-1',
      status: 'moderation_hold',
      title: 'מסעדה מומלצת',
      description: 'תיאור מלא של ההמלצה',
      destination: { cityName: 'חיפה', countryName: 'ישראל' },
      media: [{ feed: { url: 'https://img.example/feed.webp' } }, { thumb: { url: 'https://img.example/2.webp' } }],
    },
    ownerProfile: { displayName: 'מטיילת', photoURL: 'https://img.example/avatar.webp' },
  });

  assert.equal(preview.available, true);
  assert.equal(preview.title, 'מסעדה מומלצת');
  assert.equal(preview.text, 'תיאור מלא של ההמלצה');
  assert.equal(preview.imageUrl, 'https://img.example/feed.webp');
  assert.equal(preview.mediaCount, 2);
  assert.equal(preview.author.displayName, 'מטיילת');
  assert.equal(preview.destination.cityName, 'חיפה');
});

test('comment previews include the reported text and parent post context', () => {
  const preview = buildModerationPreview({
    target: { type: 'comment', id: 'comment-1', parentType: 'route', parentId: 'route-1' },
    data: { authorId: 'author-1', text: 'תגובה בעייתית', authorPreview: { displayName: 'כותב' }, status: 'active' },
    parentData: { title: 'מסלול בצפון', media: [{ thumb: { url: 'https://img.example/route.webp' } }] },
  });

  assert.equal(preview.title, 'מסלול בצפון');
  assert.equal(preview.text, 'תגובה בעייתית');
  assert.equal(preview.parent.id, 'route-1');
  assert.equal(preview.imageUrl, 'https://img.example/route.webp');
});

test('legacy cases hydrate from live content and deleted targets stay recognizable', async () => {
  const admin = fakeAdmin({
    'trips/trip-1': { ownerId: 'owner-1', title: 'טיול קיץ', description: 'פרטי הטיול', status: 'active' },
    'publicProfiles/owner-1': { displayName: 'מטייל' },
  });
  const items = await hydrateModerationPreviews(admin, [
    { id: 'case-1', target: { type: 'trip', id: 'trip-1' } },
    { id: 'case-2', target: { type: 'route', id: 'missing-route' } },
  ]);

  assert.equal(items[0].targetPreview.title, 'טיול קיץ');
  assert.equal(items[0].targetPreview.author.displayName, 'מטייל');
  assert.equal(items[1].targetPreview.available, false);
  assert.equal(items[1].targetPreview.status, 'missing');
});

test('stored report snapshots remain visible while reflecting current target availability', async () => {
  const stored = { available: true, title: 'הגרסה המקורית', text: 'התוכן שנשמר' };
  const [item] = await hydrateModerationPreviews(fakeAdmin({}), [{
    id: 'case-1',
    target: { type: 'recommendation', id: 'deleted-rec' },
    targetPreview: stored,
  }]);
  assert.equal(item.targetPreview.available, false);
  assert.equal(item.targetPreview.title, 'הגרסה המקורית');
  assert.equal(item.targetPreview.text, 'התוכן שנשמר');
});

test('stored report snapshots reflect the current moderation status', async () => {
  const stored = { available: true, title: 'הגרסה המקורית', status: 'active' };
  const [item] = await hydrateModerationPreviews(fakeAdmin({
    'recommendations/rec-1': { title: 'גרסה נוכחית', status: 'moderation_hold' },
  }), [{
    id: 'case-1',
    target: { type: 'recommendation', id: 'rec-1' },
    targetPreview: stored,
  }]);
  assert.equal(item.targetPreview.status, 'moderation_hold');
});

test('first-reported snapshots are immutable and unsafe preview input is bounded', () => {
  const original = { available: true, title: 'הגרסה שדווחה' };
  assert.equal(preserveReportedPreview(original, { title: 'גרסה חדשה' }), original);
  const preview = buildModerationPreview({
    target: { type: 'profile', id: 'profile-1' },
    data: { displayName: 'שם', bio: 'א'.repeat(MAX_TEXT_LENGTH + 50), photoURL: 'javascript:alert(1)' },
  });
  assert.equal(Array.from(preview.text).length, MAX_TEXT_LENGTH);
  assert.equal(preview.imageUrl, undefined);
  assert.equal(canonicalTargetPath({ type: 'recommendation', id: '../bad' }), null);
});
