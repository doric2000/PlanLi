export {
  BUDGETS,
  INTERESTS,
  NEEDS,
  POST_BUDGETS,
  TRAVEL_PARTIES,
  VIBES,
} from '../../../constants/travelTaxonomy';

import {
  BUDGETS,
  INTERESTS,
  NEEDS,
  TRAVEL_PARTIES,
  VIBES,
} from '../../../constants/travelTaxonomy';

export const TRAVEL_STYLES = BUDGETS;
export const TRIP_TYPES = TRAVEL_PARTIES;
export const CONSTRAINTS = NEEDS;

export const labelMapFromOptions = (options) => Object.fromEntries(
  options.map((option) => [option.value, option.label])
);

export const INTEREST_LABELS = labelMapFromOptions(INTERESTS);
export const BUDGET_LABELS = labelMapFromOptions(BUDGETS);
export const PARTY_LABELS = labelMapFromOptions(TRAVEL_PARTIES);
export const VIBE_LABELS = labelMapFromOptions(VIBES);
export const NEED_LABELS = labelMapFromOptions(NEEDS);

export function getPersonalizationReasonLabel(reasonCode) {
  if (typeof reasonCode !== 'string') return '';
  if (reasonCode === 'budget') return 'מתאים לתקציב שלך';
  const [kind, value] = reasonCode.split(':');
  if (kind === 'interest' && INTEREST_LABELS[value]) return `מתאים ל${INTEREST_LABELS[value]}`;
  if (kind === 'party' && PARTY_LABELS[value]) return `מתאים ל${PARTY_LABELS[value]}`;
  return '';
}
