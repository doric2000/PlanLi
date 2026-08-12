import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

import {
  RecommendationPublishProvider,
  recommendationPublishProgress,
  isTransientPublishError,
  useRecommendationPublish,
} from '../src/features/community/publishing/RecommendationPublishContext';

let mockUuidSerial = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: () => `123e4567-e89b-42d3-a456-${String(++mockUuidSerial).padStart(12, '0')}`,
}));

const mockUser = { uid: 'owner-1' };
const mockUploadImageAsset = jest.fn();
const mockSaveRecommendation = jest.fn();
const mockSaveRoute = jest.fn();
const mockLoadJobs = jest.fn();
const mockSaveJobs = jest.fn();
const mockPersistMedia = jest.fn();
const mockMaterializeMedia = jest.fn();
const mockDeleteJobMedia = jest.fn();

jest.mock('../src/hooks/useAuthUser', () => ({
  useAuthUser: () => ({ user: mockUser, loading: false }),
}));
jest.mock('../src/config/firebase', () => ({ auth: { currentUser: mockUser } }));
jest.mock('../src/hooks/useImagePickerWithUpload', () => ({
  useImagePickerWithUpload: () => ({ uploadImageAsset: mockUploadImageAsset }),
}));
jest.mock('../src/services/RecommendationService', () => ({
  saveRecommendation: (...args) => mockSaveRecommendation(...args),
}));
jest.mock('../src/services/RouteService', () => ({
  saveRoute: (...args) => mockSaveRoute(...args),
}));
jest.mock('../src/utils/recentDiscoveryDestinations', () => ({
  rememberDiscoveryDestinations: jest.fn(async () => []),
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
    mockSaveRoute.mockResolvedValue({ routeId: 'route-1' });
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
        draft: { selectedPlace: { placeId: 'place-1' } },
      });
    });
    await waitFor(() => expect(api.activeJob.status).toBe('failed'));
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
    expect(recommendationPublishProgress({
      status: 'uploading', stage: 'uploading', media: [{ progress: 1 }, { progress: 0.5 }],
    })).toBeCloseTo(0.645);
    expect(recommendationPublishProgress({ status: 'success' })).toBe(1);
  });
});
