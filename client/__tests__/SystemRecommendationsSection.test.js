import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import SystemRecommendationsSection from '../src/features/admin/components/SystemRecommendationsSection';
import * as AdminService from '../src/services/AdminService';
import { POST_BUDGETS } from '../src/constants/travelTaxonomy';

jest.mock('../src/services/AdminService', () => ({
  advanceRecommendationIngestionStage: jest.fn(),
  approveSystemRecommendationCandidate: jest.fn(),
  bulkApproveSystemRecommendationCandidates: jest.fn(),
  getRecommendationIngestionStatus: jest.fn(),
  getSystemRecommendationCandidate: jest.fn(),
  listSystemRecommendationCandidates: jest.fn(),
  rejectSystemRecommendationCandidate: jest.fn(),
  searchSystemRecommendationPlaces: jest.fn(),
  startRecommendationIngestionCollection: jest.fn(),
  updateRecommendationIngestionGroup: jest.fn(),
  updateSystemRecommendationCandidate: jest.fn(),
}));
jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name }) => ReactModule.createElement(Text, null, `icon:${name}`);
  return { Ionicons: Icon, MaterialIcons: Icon };
});
jest.mock('../src/components/Avatar', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return { Avatar: () => ReactModule.createElement(View) };
});
jest.mock('../src/components/ExactLocationMapPreview', () => () => null);
jest.mock('../src/components/OpenWithLocationSheet', () => () => null);
jest.mock('../src/features/moderation/components/ReportButton', () => () => null);

const status = {
  enabled: true,
  publisherConfigured: true,
  rolloutStage: 'trial',
  nextStage: 'pilot',
  stageChecklist: ['photos', 'title', 'description', 'location', 'budget', 'author'],
  stageLimits: { maxResultsLimit: 10, maxEnabledGroups: 1, bulk: false },
  budget: { capUsd: 10, capPosts: 1000, spentUsd: 0.05, reservedUsd: 0, collectedPosts: 10 },
  groups: [{ groupKey: 'fbg_1', label: 'פראג', url: 'https://www.facebook.com/groups/1/', enabled: true, verified: true, resultsLimit: 10, countryId: 'CZ', cityId: 'prague' }],
  runs: [],
};

function detail({ budget = '', revision = 2, missing = ['budget'], reviewState = 'needs_input' } = {}) {
  return {
    candidate: {
      candidateId: 'cand_1', revision, reviewState,
      readiness: { ready: !missing.length, missing },
      content: { title: 'Cafe Aurora', description: 'quiet garden, excellent buns.', categoryId: 'food', subcategoryIds: ['cafe'], budget, details: {} },
      location: { status: 'resolved', placeId: 'p1', place: { name: 'Cafe Aurora', address: 'Synthetic street 1' }, choices: [] },
      photoIds: [0],
      issues: [],
      photoMapping: { mode: 'single_recommendation', evidence: '' },
      published: null,
    },
    preview: {
      id: 'preview_cand_1', ownerId: 'system', title: 'Cafe Aurora', description: 'quiet garden, excellent buns.',
      categoryId: 'food', subcategoryIds: ['cafe'], budget, details: {}, facets: { needs: [], practicalFacts: [] },
      media: [{ assetId: 'a1', feed: { url: 'https://firebasestorage.googleapis.com/feed' } }],
      destination: { countryId: 'CZ', cityId: 'prague', cityName: 'פראג', countryName: 'צ׳כיה' },
      locationMode: 'exact', place: { name: 'Cafe Aurora', address: 'Synthetic street 1' },
    },
    publisher: { uid: 'system', displayName: 'המלצות מערכת' },
    source: { url: 'https://www.facebook.com/groups/1/posts/1/', postedAtMs: Date.UTC(2026, 8, 20), actualLikes: 72, totalReactions: 130, text: 'Cafe Aurora: quiet garden, excellent buns.' },
    photoPool: [{ index: 0, state: 'prepared', thumbUrl: 'https://firebasestorage.googleapis.com/thumb' }],
  };
}

const confirmLastAlert = () => {
  const buttons = Alert.alert.mock.calls.at(-1)[2];
  buttons.find((button) => button.onPress).onPress();
};

describe('SystemRecommendationsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    AdminService.getRecommendationIngestionStatus.mockResolvedValue(status);
    AdminService.listSystemRecommendationCandidates.mockResolvedValue({
      items: [{ candidateId: 'cand_1', title: 'Cafe Aurora', cityName: 'פראג', reviewState: 'needs_input', revision: 2, actualLikes: 72, readiness: { ready: false, missing: ['budget'] } }],
      nextCursor: null,
    });
  });

  it('shows list errors with a retry', async () => {
    AdminService.listSystemRecommendationCandidates.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'functions/permission-denied' }));
    const screen = render(<SystemRecommendationsSection />);
    await screen.findByTestId('system-rec-list-error');
    fireEvent.press(screen.getByTestId('system-rec-list-retry'));
    await screen.findByTestId('system-rec-row-cand_1');
  });

  it('completes the budget, then approves the exact saved revision and shows the published link', async () => {
    AdminService.getSystemRecommendationCandidate
      .mockResolvedValueOnce(detail())
      .mockResolvedValueOnce(detail({ budget: 'economy', revision: 3, missing: [], reviewState: 'ready' }))
      .mockResolvedValue({ ...detail({ budget: 'economy', revision: 3, missing: [], reviewState: 'published' }) });
    AdminService.updateSystemRecommendationCandidate.mockResolvedValue({ revision: 3, reviewState: 'ready', readiness: { ready: true, missing: [] } });
    AdminService.approveSystemRecommendationCandidate.mockResolvedValue({
      recommendationId: 'rec_1', url: 'https://planli.cc/recommendation/rec_1', publicationStatus: 'active',
    });
    const screen = render(<SystemRecommendationsSection />);
    fireEvent.press(await screen.findByTestId('system-rec-row-cand_1'));
    await screen.findByTestId('system-rec-preview');
    expect(screen.getByText('72', { exact: false })).toBeTruthy();
    expect(screen.getByTestId('system-rec-approve').props.accessibilityState.disabled).toBe(true);

    fireEvent.press(screen.getByTestId(`system-rec-budget-${POST_BUDGETS.findIndex((item) => item.value === 'economy')}`));
    fireEvent.press(screen.getByTestId('system-rec-save'));
    await waitFor(() => expect(AdminService.updateSystemRecommendationCandidate).toHaveBeenCalledWith('cand_1', 2, { budget: 'economy' }));
    await waitFor(() => expect(screen.getByTestId('system-rec-approve').props.accessibilityState.disabled).toBe(false));

    fireEvent.press(screen.getByTestId('system-rec-approve'));
    confirmLastAlert();
    await waitFor(() => expect(AdminService.approveSystemRecommendationCandidate).toHaveBeenCalledWith('cand_1', 3));
    await screen.findByTestId('system-rec-success-link');
  }, 20000);

  it('reloads the candidate when the reviewed revision is stale', async () => {
    AdminService.getSystemRecommendationCandidate.mockResolvedValue(detail({ budget: 'economy', missing: [], reviewState: 'ready' }));
    AdminService.approveSystemRecommendationCandidate.mockRejectedValue(Object.assign(new Error('stale'), {
      code: 'functions/aborted', details: { reason: 'candidate_revision_conflict' },
    }));
    const screen = render(<SystemRecommendationsSection />);
    fireEvent.press(await screen.findByTestId('system-rec-row-cand_1'));
    await screen.findByTestId('system-rec-preview');
    fireEvent.press(screen.getByTestId('system-rec-approve'));
    confirmLastAlert();
    expect(await screen.findByText(/עודכנה מאז שנטענה/)).toBeTruthy();
    await waitFor(() => expect(AdminService.getSystemRecommendationCandidate).toHaveBeenCalledTimes(2));
  });

  it('keeps bulk publication unavailable during the trial stage', async () => {
    AdminService.listSystemRecommendationCandidates.mockResolvedValue({
      items: [{ candidateId: 'cand_1', title: 'Cafe Aurora', reviewState: 'ready', revision: 2, readiness: { ready: true, missing: [] } }],
      nextCursor: null,
    });
    const screen = render(<SystemRecommendationsSection />);
    await screen.findByTestId('system-rec-row-cand_1');
    expect(screen.queryByTestId('system-rec-select-cand_1')).toBeNull();
  });
});
