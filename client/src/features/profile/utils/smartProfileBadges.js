import {
  INTERESTS,
  VIBES,
} from '../constants/smartProfileOptions';

const labelMapFromOptions = (arr) =>
  (arr || []).reduce((acc, it) => {
    acc[it.value] = it.label;
    return acc;
  }, {});

export const INTEREST_LABEL = labelMapFromOptions(INTERESTS);
export const VIBE_LABEL = labelMapFromOptions(VIBES);

export function getSmartProfileBadges(smartProfile) {
  if (!smartProfile) return [];

  const badges = [];

  const interests = Array.isArray(smartProfile.interests) ? smartProfile.interests : [];
  interests.forEach((value) => badges.push(INTEREST_LABEL[value] || value));

  const vibes = Array.isArray(smartProfile.vibe) ? smartProfile.vibe : [];
  vibes.forEach((value) => badges.push(VIBE_LABEL[value] || value));

  return badges;
}
