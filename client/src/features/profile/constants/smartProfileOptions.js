export {
  BUDGETS,
  INTERESTS,
  NEEDS,
  PACES,
  POST_BUDGETS,
  TRAVEL_PARTIES,
  TRAVELER_STYLES,
  VIBES,
} from '../../../constants/travelTaxonomy';

import {
  BUDGETS,
  INTERESTS,
  NEEDS,
  PACES,
  TRAVEL_PARTIES,
  TRAVELER_STYLES,
  VIBES,
} from '../../../constants/travelTaxonomy';
import { getPersonalizationReasonPresentation } from '../../../constants/travelPresentation';

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
export const TRAVELER_STYLE_LABELS = labelMapFromOptions(TRAVELER_STYLES);
export const PACE_LABELS = labelMapFromOptions(PACES);
export const NEED_LABELS = labelMapFromOptions(NEEDS);

export function getPersonalizationReasonLabel(reasonCode) {
  return getPersonalizationReasonPresentation(reasonCode)?.label || '';
}
