import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../config/firebase';
import { clearPersonalizationDiscoveryCache } from './PersonalizationService';

let saveRecommendationCallable;
let resolveRecommendationDestinationCallable;
let getCurrentRecommendationDraftCallable;
let saveRecommendationDraftCallable;
let discardRecommendationDraftCallable;
let publishRecommendationDraftCallable;

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
  const result = response?.data || null;
  if (result?.publicationStatus === 'active') clearPersonalizationDiscoveryCache('recommendations');
  return result;
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

export const resolveRecommendationDestination = async (selection) => {
  const payload = typeof selection === 'string' ? { placeId: selection } : selection;
  const response = await getResolveRecommendationDestinationCallable()(payload);
  return response?.data || null;
};

export const getCurrentRecommendationDraft = async () => {
  getCurrentRecommendationDraftCallable ||= httpsCallable(cloudFunctions, 'getCurrentRecommendationDraft');
  const response = await getCurrentRecommendationDraftCallable({});
  return response.data?.draft || null;
};

export const saveRecommendationDraft = async ({
  draftId = null,
  sourceRecommendationId = null,
  expectedVersion = null,
  saveRequestId = null,
  draft,
}) => {
  saveRecommendationDraftCallable ||= httpsCallable(cloudFunctions, 'saveRecommendationDraft');
  const response = await saveRecommendationDraftCallable({
    draft,
    ...(draftId ? { draftId } : {}),
    ...(sourceRecommendationId ? { sourceRecommendationId } : {}),
    ...(expectedVersion != null ? { expectedVersion } : {}),
    ...(saveRequestId ? { saveRequestId } : {}),
  });
  return response.data;
};

export const discardRecommendationDraft = async (draftId) => {
  discardRecommendationDraftCallable ||= httpsCallable(cloudFunctions, 'discardRecommendationDraft');
  const response = await discardRecommendationDraftCallable({ draftId });
  return response.data;
};

export const publishRecommendationDraft = async (draftId, expectedVersion) => {
  publishRecommendationDraftCallable ||= httpsCallable(cloudFunctions, 'publishRecommendationDraft');
  const response = await publishRecommendationDraftCallable({ draftId, expectedVersion });
  if (response.data?.publicationStatus === 'active') clearPersonalizationDiscoveryCache('recommendations');
  return response.data;
};
