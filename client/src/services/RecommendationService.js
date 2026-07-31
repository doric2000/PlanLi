import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../config/firebase';

let saveRecommendationCallable;
let resolveRecommendationDestinationCallable;

const getSaveRecommendationCallable = () => {
  if (!saveRecommendationCallable) {
    saveRecommendationCallable = httpsCallable(
      cloudFunctions,
      'saveRecommendation'
    );
  }
  return saveRecommendationCallable;
};

export const saveRecommendation = async (payload) => {
  const response = await getSaveRecommendationCallable()(payload);
  return response?.data || null;
};

const getResolveRecommendationDestinationCallable = () => {
  if (!resolveRecommendationDestinationCallable) {
    resolveRecommendationDestinationCallable = httpsCallable(
      cloudFunctions,
      'resolveRecommendationDestination'
    );
  }
  return resolveRecommendationDestinationCallable;
};

export const resolveRecommendationDestination = async (placeId) => {
  const response = await getResolveRecommendationDestinationCallable()({
    placeId,
  });
  return response?.data || null;
};
