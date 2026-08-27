import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

import {
  RecommendationPublishProvider,
  recommendationPublishProgress,
  isTransientPublishError,
  normalizedPublishError,
  normalizePublicationOutcome,
  publishRetryPolicy,
  upgradeRestoredPublishJob,
  useRecommendationPublish,
} from '../src/features/community/publishing/RecommendationPublishContext';

let mockUuidSerial = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => `123e4567-e89b-42d3-a456-${String(++mockUuidSerial).padStart(12, '0')}`,
}));

const mockUser = { uid: 'owner-1' };
const mockUploadImageAsset = jest.fn();
const mockSaveRecommendation = jest.fn();
const mockSaveRecommendationDraft = jest.fn();
const mockPublishRecommendationDraft = jest.fn();
const mockSaveRoute = jest.fn();
const mockSaveRouteDraft = jest.fn();
const mockPublishRouteDraft = jest.fn();
const mockLoadJobs = jest.fn();
const mockSaveJobs = jest.fn();
const mockPersistMedia = jest.fn();
const mockMaterializeMedia = jest.fn();
const mockDeleteJobMedia = jest.fn();
const mockAddDiagnosticBreadcrumb = jest.fn();
const mockCaptureDiagnosticException = jest.fn();
const mockPrepareTravelMediaSource = jest.fn();
const mockDeletePreparedTravelMedia = jest.fn();

jest.mock('../src/hooks/useAuthUser', () => ({
  useAuthUser: () => ({ user: mockUser, loading: false }),
}));
jest.mock('../src/config/firebase', () => ({ auth: { currentUser: mockUser } }));
jest.mock('../src/hooks/useImagePickerWithUpload', () => ({
  useImagePickerWithUpload: () => ({ uploadImageAsset: mockUploadImageAsset }),
}));
jest.mock('../src/services/RecommendationService', () => ({
  saveRecommendation: (...args) => mockSaveRecommendation(...args),
  saveRecommendationDraft: (...args) => mockSaveRecommendationDraft(...args),
  publishRecommendationDraft: (...args) => mockPublishRecommendationDraft(...args),
}));
jest.mock('../src/services/RouteService', () => ({
  saveRoute: (...args) => mockSaveRoute(...args),
  saveRouteDraft: (...args) => mockSaveRouteDraft(...args),
  publishRouteDraft: (...args) => mockPublishRouteDraft(...args),
}));
jest.mock('../src/services/ErrorReporting', () => ({
  addDiagnosticBreadcrumb: (...args) => mockAddDiagnosticBreadcrumb(...args),
  captureDiagnosticException: (...args) => mockCaptureDiagnosticException(...args),
}));
jest.mock('../src/utils/recentDiscoveryDestinations', () => ({
  rememberDiscoveryDestinations: jest.fn(async () => []),
}));
jest.mock('../src/utils/travelMediaPreparation', () => ({
  prepareTravelMediaSource: (...args) => mockPrepareTravelMediaSource(...args),
  deletePreparedTravelMedia: (...args) => mockDeletePreparedTravelMedia(...args),
}));
jest.mock('../src/features/community/publishing/recommendationPublishStorage', () => ({
  deleteRecommendationPublishJobMedia: (...args) => mockDeleteJobMedia(...args),
  deleteRecommendationPublishMedia: jest.fn(async () => {}),
  loadRecommendationPublishJobs: (...args) => mockLoadJobs(...args),
  materializeRecommendationPublishMedia: (...args) => mockMaterializeMedia(...args),
  persistRecommendationPublishMedia: (...args) => mockPersistMedia(...args),
  saveRecommendationPublishJobs: (...args) => mockSaveJobs(...args),
}));

let api;
function Harness() {
  api = useRecommendationPublish();
  return null;
}

describe('RecommendationPublishProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api = null;
    mockLoadJobs.mockResolvedValue([]);
    mockSaveJobs.mockResolvedValue(undefined);
    mockPersistMedia.mockResolvedValue({ platform: 'native', key: 'file:///durable.jpg' });
    mockMaterializeMedia.mockResolvedValue({ uri: 'file:///durable.jpg', revoke: jest.fn() });
    mockUploadImageAsset.mockResolvedValue({
      assetId: '123e4567-e89b-42d3-a456-426614174000',
      large: { url: 'https://cdn/large.webp' },
      feed: { url: 'https://cdn/feed.webp' },
      thumb: { url: 'https://cdn/thumb.webp' },
    });
    mockDeleteJobMedia.mockResolvedValue(undefined);
    mockPrepareTravelMediaSource.mockImplementation(async (uri, transform) => transform
      ? { uri: `${uri}.prepared.jpg`, temporary: true }
      : { uri, temporary: false });
    mockDeletePreparedTravelMedia.mockResolvedValue(undefined);
    mockSaveRecommendation.mockResolvedValue({
      recommendationId: 'rec-1', publicationStatus: 'active', publiclyVisible: true,
    });
    mockSaveRoute.mockResolvedValue({
      routeId: 'route-1', publicationStatus: 'active', publiclyVisible: true,
    });
    mockSaveRouteDraft.mockResolvedValue({ draftId: 'draft-1', version: 4 });
    mockPublishRouteDraft.mockResolvedValue({
      routeId: 'route-1', published: true, publicationStatus: 'active', publiclyVisible: true,
    });
    mockSaveRecommendationDraft.mockResolvedValue({ draftId: 'recommendation-draft-1', version: 8 });
    mockPublishRecommendationDraft.mockResolvedValue({
      recommendationId: 'rec-draft-1', published: true,
      publicationStatus: 'active', publiclyVisible: true,
    });
  });

  it('normalizes active, pending-review, and missing publication outcomes without guessing visibility', () => {
    expect(normalizePublicationOutcome({ publicationStatus: 'active', publiclyVisible: true }))
      .toMatchObject({ publicationStatus: 'active', publiclyVisible: true });
    expect(normalizePublicationOutcome({ publicationStatus: 'moderation_hold', publiclyVisible: false }))
      .toMatchObject({ publicationStatus: 'moderation_hold', publiclyVisible: false });
    expect(normalizePublicationOutcome({ recommendationId: 'rec-unknown' }))
      .toMatchObject({ publicationStatus: 'unknown', publiclyVisible: false });
  });

  it('keeps a held save as a successful durable job with an explicit pending-review result', async () => {
    mockSaveRecommendation.mockResolvedValue({
      recommendationId: 'rec-held',
      publicationStatus: 'moderation_hold',
      publiclyVisible: false,
    });
    const screen = render(
      <RecommendationPublishProvider><Harness /></RecommendationPublishProvider>
    );
    await waitFor(() => expect(api).toBeTruthy());
    await act(async () => {
      await api.enqueueCreate({
        payload: { recommendation: { title: 'Held', media: [] } },
        media: [],
        draft: {},
      });
    });
    await waitFor(() => expect(api.activeJob?.status).toBe('success'));
    expect(api.activeJob.result).toMatchObject({
      recommendationId: 'rec-held',
      publicationStatus: 'moderation_hold',
      publiclyVisible: false,
    });
    expect(mockCaptureDiagnosticException).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ code: 'publication_status_missing' })
    );
    screen.unmount();
  });

  it('durably enqueues before the unresolved network save and completes in the background', async () => {
    let finishSave;
    mockSaveRecommendation.mockImplementation(() => new Promise((resolve) => { finishSave = resolve; }));
    const screen = render(
      <RecommendationPublishProvider><Harness /></RecommendationPublishProvider>
    );
    await waitFor(() => expect(api).toBeTruthy());

    await act(async () => {
      await api.enqueueCreate({
        payload: {
          placeId: 'place-1',
          recommendation: { title: 'Queued', description: 'Background', media: [] },
        },
        media: [{ uri: 'file:///source.jpg' }],
        draft: { selectedPlace: { placeId: 'place-1' } },
      });
    });

    expect(mockPersistMedia).toHaveBeenCalled();
    expect(mockSaveJobs).toHaveBeenCalled();
    await waitFor(() => expect(mockSaveRecommendation).toHaveBeenCalled());
    expect(api.activeJob.status).toBe('saving');

    await act(async () => {
      finishSave({
        recommendationId: 'rec-1',
        country: { id: 'IL', name: 'Israel' },
        city: { id: 'TLV', name: 'Tel Aviv' },
      });
    });
    await waitFor(() => expect(api.activeJob.status).toBe('success'));
    expect(api.completedVersion).toBe(1);
    expect(mockDeleteJobMedia).toHaveBeenCalled();
    screen.unmount();
  });

  it('runs the saved transform once in preparing before upload and cleans the temporary file', async () => {
    mockSaveRecommendation.mockResolvedValue({ recommendationId: 'rec-1' });
    const transform = {
      version: 1,
      crop: { originX: 100, originY: 0, width: 1200, height: 1200 },
      maxLongEdge: 1600,
      compress: 0.94,
      format: 'jpeg',
    };
    const screen = render(
      <RecommendationPublishProvider><Harness /></RecommendationPublishProvider>
    );
    await waitFor(() => expect(api).toBeTruthy());
    await act(async () => {
      await api.enqueueCreate({
        payload: { placeId: 'place-1', recommendation: { title: 'Prepared', media: [] } },
        media: [{ uri: 'file:///source.heic', transform }],
        draft: { selectedPlace: { placeId: 'place-1' } },
      });
    });
    await waitFor(() => expect(api.activeJob?.status).toBe('success'));
    expect(mockPrepareTravelMediaSource).toHaveBeenCalledTimes(1);
    expect(mockPrepareTravelMediaSource).toHaveBeenCalledWith('file:///durable.jpg', transform);
    expect(mockUploadImageAsset).toHaveBeenCalledWith(
      'file:///durable.jpg.prepared.jpg',
      expect.objectContaining({ onProgress: expect.any(Function) })
    );
    expect(mockPrepareTravelMediaSource.mock.invocationCallOrder[0])
      .toBeLessThan(mockUploadImageAsset.mock.invocationCallOrder[0]);
    expect(mockDeletePreparedTravelMedia).toHaveBeenCalledWith({
      uri: 'file:///durable.jpg.prepared.jpg', temporary: true,
    });
    screen.unmount();
  });

  it('publishes a route through the same durable queue and restores its nested media slot', async () => {
    const screen = render(
      <RecommendationPublishProvider><Harness /></RecommendationPublishProvider>
    );
    await waitFor(() => expect(api).toBeTruthy());
    await act(async () => {
      await api.enqueueCreate({
        contentType: 'route',
        payload: { route: { title: 'Queued route', days: [{ draftId: 'day-1', stops: [] }] } },
        draft: { route: { title: 'Queued route', days: [{ draftId: 'day-1', stops: [] }] } },
        media: [{ uri: 'file:///day.jpg', slot: { type: 'route-day', dayIndex: 0, draftId: 'day-1' } }],
      });
    });
    await waitFor(() => expect(mockSaveRoute).toHaveBeenCalled());
    const [routePayload, routeId, publishRequestId] = mockSaveRoute.mock.calls[0];
    expect(routePayload.days[0].media.assetId).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(routePayload.days[0].image).toBeUndefined();
    expect(routeId).toBeNull();
    expect(publishRequestId).toMatch(/^[0-9a-f-]{36}$/i);
    await waitFor(() => expect(api.completedVersionByType.route).toBe(1));
    screen.unmount();
  });

  it('uploads route draft media in the background before publishing the new draft revision', async () => {
    const screen = render(
      <RecommendationPublishProvider><Harness /></RecommendationPublishProvider>
    );
    await waitFor(() => expect(api).toBeTruthy());
    await act(async () => {
      await api.enqueueCreate({
        contentType: 'route',
        payload: {
          draftId: 'draft-1',
          expectedVersion: 3,
          route: {
            title: 'Queued route',
            days: [{ draftId: 'day-1', stops: [{ draftId: 'stop-1' }] }],
          },
        },
        draft: { route: { title: 'Queued route' } },
        media: [{
          uri: 'file:///stop.jpg',
          slot: {
            type: 'route-stop', dayIndex: 0, stopIndex: 0,
            dayDraftId: 'day-1', draftId: 'stop-1', mediaIndex: 0,
          },
        }],
      });
    });
    await waitFor(() => expect(mockSaveRouteDraft).toHaveBeenCalledWith(expect.objectContaining({
      draftId: 'draft-1',
      expectedVersion: 3,
      saveRequestId: expect.any(String),
      draft: expect.objectContaining({
        days: [expect.objectContaining({
          stops: [expect.objectContaining({ media: expect.objectContaining({ assetId: expect.any(String) }) })],
        })],
      }),
    })));
    await waitFor(() => expect(mockPublishRouteDraft).toHaveBeenCalledWith('draft-1', 4));
    expect(mockSaveRoute).not.toHaveBeenCalled();
    screen.unmount();
  });

  it('reuses the route media save request after a lost draft-version response', async () => {
    mockSaveRouteDraft
      .mockRejectedValueOnce({ code: 'functions/invalid-argument', message: 'lost response' })
      .mockResolvedValueOnce({ draftId: 'draft-1', version: 4, idempotentReplay: true });
    const screen = render(
      <RecommendationPublishProvider><Harness /></RecommendationPublishProvider>
    );
    await waitFor(() => expect(api).toBeTruthy());
    await act(async () => {
      await api.enqueueCreate({
        contentType: 'route',
        payload: {
          draftId: 'draft-1', expectedVersion: 3,
          route: { title: 'Queued route', days: [{ draftId: 'day-1', stops: [{ draftId: 'stop-1' }] }] },
        },
        draft: { route: { title: 'Queued route' } },
        media: [{
          uri: 'file:///stop.jpg',
          slot: {
            type: 'route-stop', dayIndex: 0, stopIndex: 0,
            dayDraftId: 'day-1', draftId: 'stop-1', mediaIndex: 0,
          },
        }],
      });
    });
    await waitFor(() => expect(api.activeJob.status).toBe('failed'));
    const jobId = api.activeJob.id;
    const firstRequest = mockSaveRouteDraft.mock.calls[0][0].saveRequestId;
    expect(firstRequest).toEqual(expect.any(String));
    await act(async () => { await api.retry(jobId); });
    await waitFor(() => expect(mockSaveRouteDraft).toHaveBeenCalledTimes(2));
    expect(mockSaveRouteDraft.mock.calls[1][0].saveRequestId).toBe(firstRequest);
    await waitFor(() => expect(mockPublishRouteDraft).toHaveBeenCalledWith('draft-1', 4));
    await waitFor(() => expect(api.activeJob.status).toBe('success'));
    screen.unmount();
  });

  it('saves canonical recommendation media into an exact draft version before publishing it', async () => {
    const screen = render(
      <RecommendationPublishProvider><Harness /></RecommendationPublishProvider>
    );
    await waitFor(() => expect(api).toBeTruthy());
    await act(async () => {
      await api.enqueueCreate({
        payload: {
          draftId: 'recommendation-draft-1',
          expectedVersion: 7,
          sourceRecommendationId: 'rec-1',
        },
        draft: {
          step: 4,
          title: 'טיוטה לפרסום',
          media: [],
          localMediaCount: 1,
        },
        media: [{ uri: 'file:///recommendation.jpg' }],
      });
    });
    await waitFor(() => expect(mockSaveRecommendationDraft).toHaveBeenCalledWith({
      draftId: 'recommendation-draft-1',
      sourceRecommendationId: 'rec-1',
      expectedVersion: 7,
      saveRequestId: expect.any(String),
      draft: expect.objectContaining({
        title: 'טיוטה לפרסום',
        media: [expect.objectContaining({ assetId: '123e4567-e89b-42d3-a456-426614174000' })],
        localMediaCount: 0,
      }),
    }));
    await waitFor(() => expect(mockPublishRecommendationDraft)
      .toHaveBeenCalledWith('recommendation-draft-1', 8));
    expect(mockSaveRecommendation).not.toHaveBeenCalled();
    await waitFor(() => expect(api.activeJob.status).toBe('success'));
    screen.unmount();
  });

  it('publishes the draft id returned by the media save when recovery rotates it', async () => {
    mockSaveRecommendationDraft.mockResolvedValue({ draftId: 'rotated-draft', version: 1 });
    const screen = render(
      <RecommendationPublishProvider><Harness /></RecommendationPublishProvider>
    );
    await waitFor(() => expect(api).toBeTruthy());
    await act(async () => {
      await api.enqueueCreate({
        payload: { draftId: 'missing-draft', expectedVersion: 7 },
        draft: { title: 'Recovered', media: [], localMediaCount: 1 },
        media: [{ uri: 'file:///recommendation.jpg' }],
      });
    });
    await waitFor(() => expect(mockPublishRecommendationDraft).toHaveBeenCalledWith('rotated-draft', 1));
    expect(api.jobs[0].payload.draftId).toBe('rotated-draft');
    screen.unmount();
  });

  it('rebuilds a missing recommendation draft once and publishes the recovered id', async () => {
    mockSaveRecommendationDraft
      .mockResolvedValueOnce({ draftId: 'recommendation-draft-1', version: 8 })
      .mockResolvedValueOnce({ draftId: 'recovered-draft', version: 1 });
    mockPublishRecommendationDraft
      .mockRejectedValueOnce({
        code: 'functions/not-found',
        message: 'Recommendation draft does not exist.',
        details: { reason: 'RECOMMENDATION_DRAFT_NOT_FOUND', retryable: false },
      })
      .mockResolvedValueOnce({ recommendationId: 'rec-recovered', published: true });
    const screen = render(
      <RecommendationPublishProvider><Harness /></RecommendationPublishProvider>
    );
    await waitFor(() => expect(api).toBeTruthy());
    await act(async () => {
      await api.enqueueCreate({
        payload: { draftId: 'recommendation-draft-1', expectedVersion: 7 },
        draft: { title: 'Recovered', media: [], localMediaCount: 1 },
        media: [{ uri: 'file:///recommendation.jpg' }],
      });
    });
    await waitFor(() => expect(mockSaveRecommendationDraft).toHaveBeenCalledTimes(2));
    expect(mockSaveRecommendationDraft.mock.calls[1][0]).toEqual(expect.objectContaining({
      draftId: 'recommendation-draft-1',
      expectedVersion: 8,
      saveRequestId: expect.any(String),
    }));
    await waitFor(() => expect(mockPublishRecommendationDraft).toHaveBeenLastCalledWith('recovered-draft', 1));
    await waitFor(() => expect(api.activeJob.status).toBe('success'));
    screen.unmount();
  });

  it('repairs a persisted failed job whose completed media save rotated the draft id', async () => {
    const canonicalMedia = {
      assetId: '123e4567-e89b-42d3-a456-426614174000',
      large: { url: 'https://cdn/large.webp' },
      feed: { url: 'https://cdn/feed.webp' },
      thumb: { url: 'https://cdn/thumb.webp' },
    };
    mockLoadJobs.mockResolvedValue([{
      version: 3,
      id: 'legacy-stale-draft-job',
      publishRequestId: '123e4567-e89b-42d3-a456-426614174010',
      ownerUid: 'owner-1',
      contentType: 'recommendation',
      createdAt: 1,
      updatedAt: 1,
      status: 'failed',
      stage: 'failed',
      attempts: 1,
      retryAt: 0,
      progress: 0.9,
      payload: {
        draftId: 'stale-draft',
        expectedVersion: 8,
        recommendationDraftMediaSaved: true,
        recommendationDraftMediaSaveRequestId: '123e4567-e89b-42d3-a456-426614174011',
        recommendation: { taxonomyVersion: 999, budget: 'midrange' },
      },
      draft: { title: 'Persisted failure', media: [canonicalMedia], localMediaCount: 0 },
      media: [{ id: 'media-1', type: 'remote', asset: canonicalMedia, progress: 1 }],
      timings: { queuedAt: 1 },
      error: {
        code: 'functions/permission-denied',
        details: { reason: 'RECOMMENDATION_DRAFT_FORBIDDEN', retryable: false },
      },
    }]);
    mockSaveRecommendationDraft.mockResolvedValue({
      draftId: 'rotated-draft', version: 1, idempotentReplay: true,
    });
    const screen = render(
      <RecommendationPublishProvider><Harness /></RecommendationPublishProvider>
    );
    await waitFor(() => expect(api.activeJob?.id).toBe('legacy-stale-draft-job'));
    await act(async () => { await api.retry('legacy-stale-draft-job'); });
    await waitFor(() => expect(mockSaveRecommendationDraft).toHaveBeenCalledWith(expect.objectContaining({
      draftId: 'stale-draft',
      expectedVersion: 8,
      saveRequestId: '123e4567-e89b-42d3-a456-426614174011',
    })));
    await waitFor(() => expect(mockPublishRecommendationDraft).toHaveBeenCalledWith('rotated-draft', 1));
    await waitFor(() => expect(api.activeJob?.status).toBe('success'));
    screen.unmount();
  });

  it('re-saves provider metadata before retrying an already-failed destination draft', async () => {
    const canonicalMedia = {
      assetId: '123e4567-e89b-42d3-a456-426614174000',
      large: { url: 'https://cdn/large.webp' },
      feed: { url: 'https://cdn/feed.webp' },
      thumb: { url: 'https://cdn/thumb.webp' },
    };
    mockLoadJobs.mockResolvedValue([{
      version: 3,
      id: 'provider-destination-job',
      publishRequestId: '123e4567-e89b-42d3-a456-426614174020',
      ownerUid: 'owner-1',
      contentType: 'recommendation',
      createdAt: 1,
      updatedAt: 1,
      status: 'failed',
      stage: 'failed',
      attempts: 1,
      retryAt: 0,
      progress: 0.9,
      payload: {
        draftId: 'recommendation-draft-1',
        expectedVersion: 8,
        recommendationDraftMediaSaved: true,
        recommendationDraftIdSynced: true,
      },
      draft: {
        locationMode: 'destination',
        generalDestination: {
          countryId: 'GR',
          cityId: 'dst_mykonos',
          providerPlaceId: 'google-mykonos',
          resolvedPlaceToken: 'resolved-token-1',
        },
        media: [canonicalMedia],
        localMediaCount: 0,
      },
      media: [{ id: 'media-1', type: 'remote', asset: canonicalMedia, progress: 1 }],
      timings: { queuedAt: 1 },
      error: {
        code: 'functions/not-found',
        details: { reason: 'place_not_found', retryable: false },
      },
    }]);
    mockSaveRecommendationDraft.mockResolvedValue({
      draftId: 'recommendation-draft-1', version: 9,
    });
    const screen = render(
      <RecommendationPublishProvider><Harness /></RecommendationPublishProvider>
    );
    await waitFor(() => expect(api.activeJob?.id).toBe('provider-destination-job'));
    await act(async () => { await api.retry('provider-destination-job'); });
    await waitFor(() => expect(mockSaveRecommendationDraft).toHaveBeenCalledWith(expect.objectContaining({
      draftId: 'recommendation-draft-1',
      expectedVersion: 8,
      saveRequestId: expect.any(String),
      draft: expect.objectContaining({
        generalDestination: expect.objectContaining({
          providerPlaceId: 'google-mykonos',
          resolvedPlaceToken: 'resolved-token-1',
        }),
      }),
    })));
    await waitFor(() => expect(mockPublishRecommendationDraft)
      .toHaveBeenCalledWith('recommendation-draft-1', 9));
    expect(api.jobs[0].payload.recommendationDraftProviderDestinationSaved).toBe(true);
    await waitFor(() => expect(api.activeJob?.status).toBe('success'));
    screen.unmount();
  });

  it('reuses the provider destination save request after an interrupted retry', async () => {
    const canonicalMedia = {
      assetId: '123e4567-e89b-42d3-a456-426614174000',
      large: { url: 'https://cdn/large.webp' },
      feed: { url: 'https://cdn/feed.webp' },
      thumb: { url: 'https://cdn/thumb.webp' },
    };
    mockLoadJobs.mockResolvedValue([{
      version: 3,
      id: 'provider-replay-job',
      publishRequestId: '123e4567-e89b-42d3-a456-426614174021',
      ownerUid: 'owner-1',
      contentType: 'recommendation',
      createdAt: 1,
      updatedAt: 1,
      status: 'failed',
      stage: 'failed',
      attempts: 1,
      retryAt: 0,
      progress: 0.9,
      payload: {
        draftId: 'recommendation-draft-1',
        expectedVersion: 8,
        recommendationDraftMediaSaved: true,
        recommendationDraftIdSynced: true,
      },
      draft: {
        locationMode: 'destination',
        generalDestination: {
          countryId: 'IT', cityId: 'dst_venice', providerPlaceId: 'google-venice',
        },
        media: [canonicalMedia],
        localMediaCount: 0,
      },
      media: [{ id: 'media-1', type: 'remote', asset: canonicalMedia, progress: 1 }],
      timings: { queuedAt: 1 },
      error: { code: 'functions/not-found', details: { reason: 'place_not_found', retryable: false } },
    }]);
    mockSaveRecommendationDraft
      .mockRejectedValueOnce({ code: 'functions/internal', message: 'lost response', details: { retryable: false } })
      .mockResolvedValueOnce({ draftId: 'recommendation-draft-1', version: 9, idempotentReplay: true });
    const screen = render(
      <RecommendationPublishProvider><Harness /></RecommendationPublishProvider>
    );
    await waitFor(() => expect(api.activeJob?.id).toBe('provider-replay-job'));
    await act(async () => { await api.retry('provider-replay-job'); });
    await waitFor(() => expect(api.activeJob?.status).toBe('failed'));
    const firstRequestId = mockSaveRecommendationDraft.mock.calls[0][0].saveRequestId;
    await act(async () => { await api.retry('provider-replay-job'); });
    await waitFor(() => expect(mockSaveRecommendationDraft).toHaveBeenCalledTimes(2));
    expect(mockSaveRecommendationDraft.mock.calls[1][0].saveRequestId).toBe(firstRequestId);
    await waitFor(() => expect(mockPublishRecommendationDraft)
      .toHaveBeenCalledWith('recommendation-draft-1', 9));
    await waitFor(() => expect(api.activeJob?.status).toBe('success'));
    screen.unmount();
  });

  it('hides a failed banner while its job is being reviewed and restores it on exit', async () => {
    mockPublishRecommendationDraft.mockRejectedValue({
      code: 'functions/invalid-argument', message: 'Could not publish.', details: { retryable: false },
    });
    const screen = render(
      <RecommendationPublishProvider><Harness /></RecommendationPublishProvider>
    );
    await waitFor(() => expect(api).toBeTruthy());
    await act(async () => {
      await api.enqueueCreate({
        payload: { draftId: 'recommendation-draft-1', expectedVersion: 7 },
        draft: { title: 'Review', media: [], localMediaCount: 1 },
        media: [{ uri: 'file:///recommendation.jpg' }],
      });
    });
    await waitFor(() => expect(api.activeJob?.status).toBe('failed'));
    const jobId = api.activeJob.id;
    act(() => api.beginReview(jobId));
    expect(api.activeJob).toBeNull();
    expect(api.jobs).toHaveLength(1);
    act(() => api.endReview(jobId));
    expect(api.activeJob?.id).toBe(jobId);
    screen.unmount();
  });

  it('reuses the persisted save request after a lost media-version response', async () => {
    mockSaveRecommendationDraft
      .mockRejectedValueOnce({ code: 'functions/invalid-argument', message: 'lost response' })
      .mockResolvedValueOnce({ draftId: 'recommendation-draft-1', version: 8, idempotentReplay: true });
    const screen = render(
      <RecommendationPublishProvider><Harness /></RecommendationPublishProvider>
    );
    await waitFor(() => expect(api).toBeTruthy());
    await act(async () => {
      await api.enqueueCreate({
        payload: { draftId: 'recommendation-draft-1', expectedVersion: 7 },
        draft: { title: 'Recovered', media: [], localMediaCount: 1 },
        media: [{ uri: 'file:///recommendation.jpg' }],
      });
    });
    await waitFor(() => expect(api.activeJob.status).toBe('failed'));
    const jobId = api.activeJob.id;
    const firstRequest = mockSaveRecommendationDraft.mock.calls[0][0].saveRequestId;
    expect(firstRequest).toEqual(expect.any(String));
    await act(async () => { await api.retry(jobId); });
    await waitFor(() => expect(mockSaveRecommendationDraft).toHaveBeenCalledTimes(2));
    expect(mockSaveRecommendationDraft.mock.calls[1][0].saveRequestId).toBe(firstRequest);
    await waitFor(() => expect(mockPublishRecommendationDraft)
      .toHaveBeenCalledWith('recommendation-draft-1', 8));
    await waitFor(() => expect(api.activeJob.status).toBe('success'));
    screen.unmount();
  });

  it('retries a route draft publication without uploading or saving its media revision twice', async () => {
    mockPublishRouteDraft
      .mockRejectedValueOnce({ code: 'functions/invalid-argument', message: 'Could not publish route.' })
      .mockResolvedValueOnce({ routeId: 'route-1', published: true });
    const screen = render(
      <RecommendationPublishProvider><Harness /></RecommendationPublishProvider>
    );
    await waitFor(() => expect(api).toBeTruthy());
    await act(async () => {
      await api.enqueueCreate({
        contentType: 'route',
        payload: {
          draftId: 'draft-1', expectedVersion: 3,
          route: { title: 'Queued route', days: [{ draftId: 'day-1', stops: [] }] },
        },
        draft: { route: { title: 'Queued route' } },
        media: [{
          uri: 'file:///day.jpg',
          slot: { type: 'route-day', dayIndex: 0, draftId: 'day-1' },
        }],
      });
    });
    await waitFor(() => expect(api.activeJob.status).toBe('failed'));
    const jobId = api.activeJob.id;
    await act(async () => { await api.retry(jobId); });
    await waitFor(() => expect(api.activeJob.status).toBe('success'));
    expect(mockUploadImageAsset).toHaveBeenCalledTimes(1);
    expect(mockSaveRouteDraft).toHaveBeenCalledTimes(1);
    expect(mockPublishRouteDraft).toHaveBeenCalledTimes(2);
    screen.unmount();
  });

  it('writes only the manifest when accepted crops were already persisted', async () => {
    const screen = render(
      <RecommendationPublishProvider><Harness /></RecommendationPublishProvider>
    );
    await waitFor(() => expect(api).toBeTruthy());
    const alreadyDurable = { platform: 'native', key: 'file:///private/crop.jpg' };
    await act(async () => {
      await api.enqueueCreate({
        draftJobId: '123e4567-e89b-42d3-a456-426614174099',
        payload: { destinationRef: { countryId: 'IL', cityId: 'TLV' }, recommendation: { media: [] } },
        draft: {},
        media: [{
          uri: 'file:///crop.jpg',
          mediaId: '123e4567-e89b-42d3-a456-426614174098',
          localReference: alreadyDurable,
        }],
      });
    });
    expect(mockPersistMedia).not.toHaveBeenCalled();
    expect(mockSaveJobs).toHaveBeenCalled();
    screen.unmount();
  });

  it('does not expose or process durable jobs belonging to another UID', async () => {
    mockLoadJobs.mockResolvedValue([{
      id: 'foreign-job', ownerUid: 'owner-2', status: 'queued', stage: 'queued', media: [],
    }]);
    const screen = render(
      <RecommendationPublishProvider><Harness /></RecommendationPublishProvider>
    );
    await waitFor(() => expect(mockLoadJobs).toHaveBeenCalled());
    expect(api.jobs).toEqual([]);
    expect(mockSaveRecommendation).not.toHaveBeenCalled();
    screen.unmount();
  });

  it('resumes a queued job for the same UID after provider startup', async () => {
    mockLoadJobs.mockResolvedValue([{
      id: 'restored-job',
      publishRequestId: '123e4567-e89b-42d3-a456-426614174000',
      ownerUid: 'owner-1',
      createdAt: 1,
      updatedAt: 1,
      status: 'queued',
      stage: 'queued',
      attempts: 0,
      retryAt: 0,
      payload: {
        placeId: 'place-1',
        recommendation: { title: 'Restored', description: 'Resume', media: [] },
      },
      draft: { selectedPlace: { placeId: 'place-1' } },
      media: [],
      timings: { queuedAt: 1 },
    }]);
    mockSaveRecommendation.mockResolvedValue({
      recommendationId: 'rec-restored',
      country: { id: 'IL', name: 'Israel' },
      city: { id: 'TLV', name: 'Tel Aviv' },
    });
    const screen = render(
      <RecommendationPublishProvider><Harness /></RecommendationPublishProvider>
    );

    await waitFor(() => expect(api.activeJob?.status).toBe('success'));
    expect(mockSaveRecommendation).toHaveBeenCalledWith(expect.objectContaining({
      publishRequestId: '123e4567-e89b-42d3-a456-426614174000',
    }));
    screen.unmount();
  });

  it('reuses prepared media when a failed final save is retried', async () => {
    mockSaveRecommendation
      .mockRejectedValueOnce({ code: 'functions/invalid-argument', message: 'Review the post.' })
      .mockResolvedValueOnce({
        recommendationId: 'rec-2',
        country: { id: 'IL', name: 'Israel' },
        city: { id: 'TLV', name: 'Tel Aviv' },
      });
    const screen = render(
      <RecommendationPublishProvider><Harness /></RecommendationPublishProvider>
    );
    await waitFor(() => expect(api).toBeTruthy());
    await act(async () => {
      await api.enqueueCreate({
        payload: {
          placeId: 'place-1',
          recommendation: { title: 'Retry', description: 'Retry save', media: [] },
        },
        media: [{ uri: 'file:///source.jpg' }],
        draft: { locationMode: 'exact', selectedPlace: { placeId: 'place-1' } },
      });
    });
    await waitFor(() => expect(api.activeJob.status).toBe('failed'));
    expect(mockAddDiagnosticBreadcrumb).toHaveBeenCalledWith(expect.objectContaining({
      category: 'network',
      data: expect.objectContaining({
        operation: 'publish_recommendation',
        status: 'saving',
        attempt: 1,
      }),
    }));
    expect(mockCaptureDiagnosticException).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ContentPublishError' }),
      {
        operation: 'publish_recommendation_saving',
        code: 'functions/invalid-argument',
        contentMode: 'exact',
        contentType: 'recommendation',
      }
    );
    const jobId = api.activeJob.id;
    await act(async () => { await api.retry(jobId); });
    await waitFor(() => expect(api.activeJob.status).toBe('success'));

    expect(mockUploadImageAsset).toHaveBeenCalledTimes(1);
    expect(mockSaveRecommendation).toHaveBeenCalledTimes(2);
    screen.unmount();
  });
});

describe('publish status helpers', () => {
  it('classifies retryable failures and bounds aggregate progress', () => {
    expect(isTransientPublishError({ code: 'functions/unavailable' })).toBe(true);
    expect(isTransientPublishError({ code: 'functions/invalid-argument' })).toBe(false);
    expect(isTransientPublishError({
      code: 'functions/resource-exhausted',
      details: { reason: 'daily_limit_reached', retryable: false },
    })).toBe(false);
    expect(isTransientPublishError({ code: 'functions/resource-exhausted' })).toBe(false);
    expect(recommendationPublishProgress({
      status: 'uploading', stage: 'uploading', media: [{ progress: 1 }, { progress: 0.5 }],
    })).toBeCloseTo(0.645);
    expect(recommendationPublishProgress({ status: 'success' })).toBe(1);
  });

  it('uses bounded automatic retries and leaves stalled uploads for manual retry', () => {
    expect(publishRetryPolicy({ code: 'functions/unavailable' }, 1)).toEqual({
      automaticRetry: true,
      retryable: true,
      shouldRetry: true,
      delayMs: 1000,
    });
    expect(publishRetryPolicy({ code: 'functions/unavailable' }, 3)).toEqual({
      automaticRetry: true,
      retryable: true,
      shouldRetry: false,
      delayMs: 0,
    });
    expect(publishRetryPolicy({
      code: 'media/upload-stalled',
      details: { retryable: true },
    }, 1)).toEqual({
      automaticRetry: false,
      retryable: true,
      shouldRetry: false,
      delayMs: 0,
    });
    expect(isTransientPublishError({ code: 'functions/deadline-exceeded' })).toBe(false);
  });

  it('preserves only safe location diagnostics in persisted publish errors', () => {
    expect(normalizedPublishError({
      code: 'functions/resource-exhausted',
      message: 'Daily limit reached',
      details: {
        reason: 'daily_limit_reached',
        incidentId: 'loc_1234567890ab',
        retryable: false,
        publishStage: 'processing',
        query: 'private query',
      },
    })).toEqual({
      code: 'functions/resource-exhausted',
      message: 'Daily limit reached',
      details: {
        reason: 'daily_limit_reached',
        incidentId: 'loc_1234567890ab',
        retryable: false,
        publishStage: 'processing',
      },
    });
  });

  it('pauses ambiguous pre-v5 queue jobs for review and clears only their budget', () => {
    const recommendation = upgradeRestoredPublishJob({
      id: 'old-rec', status: 'queued', payload: {
        recommendation: { taxonomyVersion: 4, title: 'Old', budget: 'economy' },
      },
      draft: { title: 'Old', budget: 'economy', description: 'Kept' },
    });
    expect(recommendation.status).toBe('failed');
    expect(recommendation.reviewRequired).toBe(true);
    expect(recommendation.payload.recommendation.taxonomyVersion).toBe(5);
    expect(recommendation.payload.recommendation.budget).toBe('');
    expect(recommendation.draft).toEqual(expect.objectContaining({ budget: '', description: 'Kept' }));

    const route = upgradeRestoredPublishJob({
      id: 'old-route', contentType: 'route', status: 'queued', payload: {
        route: { taxonomyVersion: 4, attributes: { budgetLevel: 'economy', pace: 'balanced' } },
      },
      draft: { route: { attributes: { budgetLevel: 'economy', pace: 'balanced' } } },
    });
    expect(route.reviewRequired).toBe(true);
    expect(route.payload.route.attributes).toEqual({ budgetLevel: '', pace: 'balanced' });
    expect(route.draft.route.attributes).toEqual({ budgetLevel: '', pace: 'balanced' });
  });

  it('upgrades an unambiguous pre-v5 queue job without requiring review', () => {
    const upgraded = upgradeRestoredPublishJob({
      contentType: 'recommendation', status: 'queued', payload: {
        recommendation: { taxonomyVersion: 4, budget: 'balanced' },
      }, draft: { budget: 'balanced' },
    });
    expect(upgraded.status).toBe('queued');
    expect(upgraded.reviewRequired).toBeUndefined();
    expect(upgraded.payload.recommendation.taxonomyVersion).toBe(5);
  });

  it('repairs and requeues only a failed invalid-selection job with a bidi-contaminated URL', () => {
    const repaired = upgradeRestoredPublishJob({
      version: 3,
      contentType: 'recommendation',
      status: 'failed',
      stage: 'failed',
      attempts: 1,
      error: { details: { reason: 'invalid_selection', retryable: false } },
      payload: { recommendation: { taxonomyVersion: 999, budget: 'balanced' } },
      draft: { details: { externalUrl: '\u200f https://example.com/place' } },
    });
    expect(repaired).toEqual(expect.objectContaining({
      version: 4,
      status: 'queued',
      stage: 'queued',
      attempts: 0,
      error: null,
      reviewRequired: false,
    }));
    expect(repaired.draft.details.externalUrl).toBe('https://example.com/place');

    const unrelated = upgradeRestoredPublishJob({
      version: 3,
      contentType: 'recommendation',
      status: 'failed',
      stage: 'failed',
      error: { details: { reason: 'invalid_selection', retryable: false } },
      payload: { recommendation: { taxonomyVersion: 999, budget: 'balanced' } },
      draft: { details: { externalUrl: 'not a link' } },
    });
    expect(unrelated.status).toBe('failed');
    expect(unrelated.error.details.reason).toBe('invalid_selection');
  });

  it('automatically publishes a restored bidi-URL failure without re-uploading media', async () => {
    const canonicalMedia = {
      assetId: '123e4567-e89b-42d3-a456-426614174000',
      large: { url: 'https://cdn/large.webp' },
      feed: { url: 'https://cdn/feed.webp' },
      thumb: { url: 'https://cdn/thumb.webp' },
    };
    mockLoadJobs.mockResolvedValue([{
      version: 3,
      id: 'rtl-url-job',
      publishRequestId: '123e4567-e89b-42d3-a456-426614174099',
      ownerUid: 'owner-1',
      contentType: 'recommendation',
      createdAt: 1,
      updatedAt: 1,
      status: 'failed',
      stage: 'failed',
      attempts: 1,
      retryAt: 0,
      progress: 0.9,
      payload: {
        draftId: 'recommendation-draft-1',
        expectedVersion: 26,
        recommendationDraftMediaSaved: true,
        recommendationDraftIdSynced: true,
      },
      draft: {
        details: { externalUrl: '\u200f https://example.com/place' },
        media: [canonicalMedia],
        localMediaCount: 0,
      },
      media: [{ id: 'media-1', type: 'remote', asset: canonicalMedia, progress: 1 }],
      timings: { queuedAt: 1 },
      error: {
        code: 'functions/invalid-argument',
        details: { reason: 'invalid_selection', retryable: false, publishStage: 'saving' },
      },
    }]);
    const screen = render(
      <RecommendationPublishProvider><Harness /></RecommendationPublishProvider>
    );
    await waitFor(() => expect(api.jobs[0]?.media[0]).toEqual(expect.objectContaining({
      type: 'remote',
      asset: canonicalMedia,
      progress: 1,
    })));
    await waitFor(() => expect(mockPublishRecommendationDraft)
      .toHaveBeenCalledWith('recommendation-draft-1', 26));
    await waitFor(() => expect(api.activeJob?.status).toBe('success'));
    screen.unmount();
  });
});
