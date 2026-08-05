import {
  calculateContributionScore,
  getDominantRecommendationCategory,
  getTravelerStanding,
  selectProfileHeroMedia,
} from '../src/features/profile/utils/profileMetrics';

describe('profile contribution metrics', () => {
  it('keeps the four standing boundaries stable', () => {
    expect(getTravelerStanding(0).id).toBe('starting');
    expect(getTravelerStanding(49).id).toBe('starting');
    expect(getTravelerStanding(50).id).toBe('keen_eye');
    expect(getTravelerStanding(199).id).toBe('keen_eye');
    expect(getTravelerStanding(200).id).toBe('tip_source');
    expect(getTravelerStanding(499).id).toBe('tip_source');
    expect(getTravelerStanding(500).id).toBe('community_compass');
  });

  it('calculates contribution score from recommendations and likes', () => {
    expect(calculateContributionScore({ recommendations: 3, likesReceived: 7 })).toBe(44);
  });

  it('requires a meaningful share before showing a dominant category', () => {
    const recommendations = [
      { categoryId: 'food', stats: { likeCount: 1 } },
      { categoryId: 'food', stats: { likeCount: 4 } },
      { categoryId: 'food', stats: { likeCount: 0 } },
      { categoryId: 'nature', stats: { likeCount: 20 } },
    ];
    expect(getDominantRecommendationCategory(recommendations)).toMatchObject({
      categoryId: 'food',
      count: 3,
      likes: 5,
    });
    expect(getDominantRecommendationCategory(recommendations.slice(0, 2))).toBeNull();
  });

  it('breaks category ties by likes and then removes duplicate hero media', () => {
    const recommendations = [
      { id: 'food-1', categoryId: 'food', createdAt: '2026-01-02', media: [{ feed: { url: 'https://example.com/shared.webp' } }] },
      { id: 'nature-1', categoryId: 'nature', createdAt: '2026-01-03', stats: { likeCount: 5 }, media: [{ feed: { url: 'https://example.com/nature.webp' } }] },
      { id: 'food-2', categoryId: 'food', createdAt: '2026-01-01', stats: { likeCount: 1 }, media: [{ feed: { url: 'https://example.com/shared.webp' } }] },
      { id: 'food-3', categoryId: 'food', createdAt: '2025-12-15', stats: { likeCount: 1 }, media: [{ feed: { url: 'https://example.com/food.webp' } }] },
      { id: 'nature-2', categoryId: 'nature', createdAt: '2025-12-01', stats: { likeCount: 5 }, media: [{ feed: { url: 'https://example.com/old.webp' } }] },
      { id: 'nature-3', categoryId: 'nature', createdAt: '2025-11-01', stats: { likeCount: 5 } },
      { id: 'nature-4', categoryId: 'nature', createdAt: '2025-10-01', stats: { likeCount: 5 } },
    ];
    expect(getDominantRecommendationCategory(recommendations)).toMatchObject({ categoryId: 'nature' });
    expect(selectProfileHeroMedia(recommendations, [], 3).map((entry) => entry.url)).toEqual([
      'https://example.com/nature.webp',
      'https://example.com/shared.webp',
      'https://example.com/food.webp',
    ]);
  });
});
