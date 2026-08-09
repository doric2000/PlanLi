import { canManageRecommendation } from '../src/utils/contentPermissions';

const verifiedUser = {
  uid: 'owner-1',
  emailVerified: true,
  providerData: [{ providerId: 'password' }],
};

describe('canManageRecommendation', () => {
  it('allows a verified owner or administrator', () => {
    expect(canManageRecommendation({ user: verifiedUser, ownerId: 'owner-1' })).toBe(true);
    expect(canManageRecommendation({ user: { ...verifiedUser, uid: 'admin-1' }, ownerId: 'owner-1', isAdmin: true })).toBe(true);
  });

  it('rejects guests, unverified users and unrelated users', () => {
    expect(canManageRecommendation({ user: null, ownerId: 'owner-1' })).toBe(false);
    expect(canManageRecommendation({
      user: { ...verifiedUser, emailVerified: false },
      ownerId: 'owner-1',
    })).toBe(false);
    expect(canManageRecommendation({
      user: { ...verifiedUser, uid: 'other-1' },
      ownerId: 'owner-1',
    })).toBe(false);
  });
});
