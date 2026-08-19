import { getPersonalizedMapRecommendations } from './PersonalizationService';

export const getMapRecommendations = (payload, options = {}) =>
  getPersonalizedMapRecommendations(payload, options);
