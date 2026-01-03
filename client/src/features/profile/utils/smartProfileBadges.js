import {
  TRAVEL_STYLES,
  TRIP_TYPES,
  INTERESTS,
  CONSTRAINTS,
} from '../constants/smartProfileOptions';

const labelMapFromOptions = (arr) =>
  (arr || []).reduce((acc, it) => {
    acc[it.value] = it.label;
    return acc;
  }, {});

export const TRAVEL_STYLE_LABEL = labelMapFromOptions(TRAVEL_STYLES);
export const TRIP_TYPE_LABEL = labelMapFromOptions(TRIP_TYPES);
export const INTEREST_LABEL = labelMapFromOptions(INTERESTS);
export const CONSTRAINT_LABEL = labelMapFromOptions(CONSTRAINTS);

export function getSmartProfileBadges(smartProfile) {
  if (!smartProfile) return [];

  const badges = [];

  if (smartProfile.travelStyle) {
    badges.push(TRAVEL_STYLE_LABEL[smartProfile.travelStyle] || smartProfile.travelStyle);
  }

  if (smartProfile.tripType) {
    badges.push(TRIP_TYPE_LABEL[smartProfile.tripType] || smartProfile.tripType);
  }

  const interests = Array.isArray(smartProfile.interests) ? smartProfile.interests : [];
  interests.forEach((value) => badges.push(INTEREST_LABEL[value] || value));

  const constraints = Array.isArray(smartProfile.constraints) ? smartProfile.constraints : [];
  constraints.forEach((value) => badges.push(CONSTRAINT_LABEL[value] || value));

  return badges;
}
