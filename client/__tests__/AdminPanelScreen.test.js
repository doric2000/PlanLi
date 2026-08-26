import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import AdminPanelScreen from '../src/features/admin/screens/AdminPanelScreen';
import * as AdminService from '../src/services/AdminService';

jest.mock('../src/services/AdminService', () => ({
  approveDestination: jest.fn(),
  bulkUpdateModerationCases: jest.fn(),
  deactivateDestination: jest.fn(),
  deleteAdminSavedView: jest.fn(),
  deleteUserAsAdmin: jest.fn(),
  getAdminResource: jest.fn(),
  getAirportCandidates: jest.fn(),
  getDestinationImageCandidates: jest.fn(),
  getDestinationRenameJob: jest.fn(),
  getDestinationReview: jest.fn(),
  getModerationCase: jest.fn(),
  getModerationDashboard: jest.fn(),
  getModerationPolicy: jest.fn(),
  listAdminSavedViews: jest.fn(),
  listAdminUsers: jest.fn(),
  listDestinationReviews: jest.fn(),
  listModerationAudit: jest.fn(),
  listModerationCases: jest.fn(),
  recheckDestination: jest.fn(),
  resolveModerationCase: jest.fn(),
  saveAdminSavedView: jest.fn(),
  searchAdminResources: jest.fn(),
  selectDestinationImageCandidate: jest.fn(),
  setDestinationAirport: jest.fn(),
  setDestinationHebrewName: jest.fn(),
  setDestinationUploadedImage: jest.fn(),
  setUserAdmin: jest.fn(),
  setUserEmailVerified: jest.fn(),
  setUserSuspension: jest.fn(),
  updateAdminAttachedPlace: jest.fn(),
  updateModerationCase: jest.fn(),
}));
jest.mock('../src/services/LocationService', () => ({
  searchPlaces: jest.fn(),
  resolveDestinationForPlacePreview: jest.fn(),
}));
jest.mock('../src/hooks/useAdminClaim', () => ({ useAdminClaim: () => ({ isAdmin: true, loading: false }) }));
jest.mock('../src/hooks/useBackButton', () => ({ useBackButton: jest.fn() }));
jest.mock('../src/hooks/useImagePickerWithUpload', () => ({
  useImagePickerWithUpload: () => ({ pickFromGallery: jest.fn(), uploadImageAsset: jest.fn() }),
}));
jest.mock('../src/config/firebase', () => ({ auth: {} }));
jest.mock('firebase/auth', () => ({ signOut: jest.fn() }));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: (props) => {
    const ReactModule = require('react');
    const { View } = require('react-native');
    return ReactModule.createElement(View, props);
  },
}));

const navigation = { setOptions: jest.fn(), setParams: jest.fn(), goBack: jest.fn() };
const dashboard = {
  openCases: 8,
  urgentCases: 2,
  myCases: 3,
  unassignedCases: 4,
  overdueCases: 1,
  heldContent: 5,
  pendingDestinations: 6,
  failedJobs: 0,
};
const queueCase = (id, overrides = {}) => ({
  id,
  revision: 2,
  target: { type: 'recommendation', id: `rec-${id}`, path: `recommendations/rec-${id}` },
  targetPreview: { available: true, title: `תוכן ${id}`, status: 'active', author: { displayName: 'מטיילת' } },
  status: 'open',
  priority: 'normal',
  reportCount: 2,
  categoryCounts: { spam_scam_commercial: 2 },
  assignmentUid: '',
  dueAtMs: Date.now() + 3600000,
  ...overrides,
});
const detailsFor = (item) => ({
  ...item,
  reports: [{ id: 'anonymous-report', category: 'spam_scam_commercial', details: 'קישור מסחרי חוזר' }],
  events: [],
  enforcements: [],
  recentContent: [],
  subjectUser: { uid: 'owner-1', displayName: 'מטיילת', status: 'active' },
});

describe('Admin console end-to-end surface', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AdminService.getModerationDashboard.mockResolvedValue(dashboard);
    AdminService.listModerationCases.mockResolvedValue({ items: [], nextCursor: null });
    AdminService.getModerationPolicy.mockResolvedValue({
      reasons: [
        { id: 'no_violation', label: 'לא נמצאה הפרה', userMessage: 'לא נמצאה הפרה' },
        { id: 'spam_scam_commercial', label: 'ספאם', userMessage: 'הפרת ספאם' },
      ],
    });
    AdminService.listAdminSavedViews.mockResolvedValue({ items: [] });
    AdminService.listDestinationReviews.mockResolvedValue({ items: [], nextCursor: null });
    AdminService.listAdminUsers.mockResolvedValue({ items: [], nextCursor: null });
    AdminService.listModerationAudit.mockResolvedValue({ items: [], nextCursor: null });
    AdminService.bulkUpdateModerationCases.mockResolvedValue({ results: [] });
    AdminService.resolveModerationCase.mockResolvedValue({ success: true });
  });

  it('opens each workload metric as its matching filtered queue', async () => {
    const screen = render(<AdminPanelScreen navigation={navigation} />);
    expect(await screen.findByTestId('admin-metric-openCases')).toBeTruthy();
    expect(await screen.findByTestId('admin-metric-urgentCases')).toBeTruthy();
    fireEvent.press(screen.getByTestId('admin-metric-urgentCases'));
    await waitFor(() => expect(AdminService.listModerationCases).toHaveBeenCalledWith(expect.objectContaining({ view: 'urgent' })));
    expect(screen.getByTestId('admin-queue-view-urgent').props.accessibilityState.selected).toBe(true);
  }, 20000);

  it('moves from a compact queue row to a contextual mobile decision screen', async () => {
    const item = queueCase('one');
    AdminService.listModerationCases.mockResolvedValue({ items: [item], nextCursor: null });
    AdminService.getModerationCase.mockResolvedValue(detailsFor(item));
    const screen = render(<AdminPanelScreen navigation={navigation} route={{ params: { tab: 'queue' } }} />);
    const row = await screen.findByTestId('admin-case-one');
    expect(screen.queryByText('קישור מסחרי חוזר')).toBeNull();
    fireEvent.press(row);
    expect(await screen.findByText('קישור מסחרי חוזר')).toBeTruthy();
    expect(screen.getByTestId('admin-case-decision-one')).toBeTruthy();
    expect(screen.getByTestId('admin-case-back')).toBeTruthy();
    expect(screen.queryByTestId('admin-case-one')).toBeNull();
  });

  it('keeps the queue and case context side by side on a wide screen', async () => {
    const originalWindow = Dimensions.get('window');
    const originalScreen = Dimensions.get('screen');
    Dimensions.set({ window: { ...originalWindow, width: 1280, height: 900 }, screen: { ...originalScreen, width: 1280, height: 900 } });
    const item = queueCase('wide');
    AdminService.listModerationCases.mockResolvedValue({ items: [item], nextCursor: null });
    AdminService.getModerationCase.mockResolvedValue(detailsFor(item));
    const screen = render(<AdminPanelScreen navigation={navigation} route={{ params: { tab: 'queue' } }} />);
    try {
      fireEvent.press(await screen.findByTestId('admin-case-wide'));
      expect(await screen.findByTestId('admin-case-decision-wide')).toBeTruthy();
      expect(screen.getByTestId('admin-case-wide')).toBeTruthy();
      expect(screen.queryByTestId('admin-case-back')).toBeNull();
    } finally {
      screen.unmount();
      Dimensions.set({ window: originalWindow, screen: originalScreen });
    }
  });

  it('submits one structured decision with the loaded revision and Hebrew policy reason', async () => {
    const item = queueCase('decision');
    AdminService.listModerationCases.mockResolvedValue({ items: [item], nextCursor: null });
    AdminService.getModerationCase.mockResolvedValue(detailsFor(item));
    const screen = render(<AdminPanelScreen navigation={navigation} route={{ params: { tab: 'queue' } }} />);
    fireEvent.press(await screen.findByTestId('admin-case-decision'));
    fireEvent.press(await screen.findByTestId('admin-decision-reason-no_violation'));
    fireEvent.press(screen.getByTestId('admin-decision-submit'));
    await waitFor(() => expect(AdminService.resolveModerationCase).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'decision',
      expectedRevision: 2,
      contentAction: 'dismiss',
      reasonCode: 'no_violation',
      accountAction: { type: 'none' },
    })));
  });

  it('can close a destination case as no violation without inventing a content action', async () => {
    const item = queueCase('destination', {
      target: { type: 'destination', id: 'haifa', countryId: 'il', path: 'countries/il/destinations/haifa' },
      targetPreview: { available: true, title: 'חיפה', status: 'active' },
    });
    AdminService.listModerationCases.mockResolvedValue({ items: [item], nextCursor: null });
    AdminService.getModerationCase.mockResolvedValue({ ...detailsFor(item), subjectUser: null });
    const screen = render(<AdminPanelScreen navigation={navigation} route={{ params: { tab: 'queue' } }} />);
    fireEvent.press(await screen.findByTestId('admin-case-destination'));
    fireEvent.press(await screen.findByTestId('admin-decision-reason-no_violation'));
    fireEvent.press(screen.getByTestId('admin-decision-submit'));
    await waitFor(() => expect(AdminService.resolveModerationCase).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'destination',
      contentAction: 'dismiss',
      accountAction: { type: 'none' },
      reasonCode: 'no_violation',
    })));
  });

  it('offers only safe bulk operations and limits selection to queue metadata', async () => {
    const first = queueCase('first');
    const second = queueCase('second');
    AdminService.listModerationCases.mockResolvedValue({ items: [first, second], nextCursor: null });
    AdminService.bulkUpdateModerationCases.mockResolvedValue({ results: [
      { caseId: 'first', success: true }, { caseId: 'second', success: true },
    ] });
    const screen = render(<AdminPanelScreen navigation={navigation} route={{ params: { tab: 'queue' } }} />);
    await screen.findByTestId('admin-case-first');
    fireEvent.press(screen.getByTestId('admin-case-select-first'));
    fireEvent.press(screen.getByTestId('admin-case-select-second'));
    expect(screen.getByTestId('admin-bulk-claim')).toBeTruthy();
    expect(screen.getByTestId('admin-bulk-priority')).toBeTruthy();
    expect(screen.getByTestId('admin-bulk-dismiss')).toBeTruthy();
    expect(screen.queryByText('מחיקה מרובה')).toBeNull();
    fireEvent.press(screen.getByTestId('admin-bulk-priority'));
    await waitFor(() => expect(AdminService.bulkUpdateModerationCases).toHaveBeenCalledWith({
      operation: 'set_priority',
      priority: 'urgent',
      cases: [
        { caseId: 'first', expectedRevision: 2 },
        { caseId: 'second', expectedRevision: 2 },
      ],
    }));
  });

  it('keeps account authority in the separate advanced users area', async () => {
    AdminService.listAdminUsers.mockResolvedValue({
      items: [{ uid: 'user-1', displayName: 'נועה', email: 'noya@example.com', disabled: false, emailVerified: true, admin: false }],
      nextCursor: null,
    });
    const screen = render(<AdminPanelScreen navigation={navigation} />);
    await screen.findByTestId('admin-overview-content');
    fireEvent.press(screen.getByTestId('admin-tab-users'));
    fireEvent.press(await screen.findByTestId('admin-user-user-1'));
    expect(screen.queryByTestId('admin-user-admin-user-1')).toBeNull();
    fireEvent.press(screen.getByTestId('admin-users-advanced-toggle'));
    expect(screen.getByTestId('admin-user-admin-user-1')).toBeTruthy();
    expect(screen.getByTestId('admin-user-delete-user-1')).toBeTruthy();
  });

  it('searches private admin projections and opens an existing case without exposing raw status codes', async () => {
    AdminService.searchAdminResources.mockResolvedValue({
      items: [{ id: 'result-1', type: 'recommendation', status: 'active', title: 'מסעדה בחיפה', target: { type: 'recommendation', id: 'rec-1' } }],
    });
    AdminService.getAdminResource.mockResolvedValue({
      preview: { title: 'מסעדה בחיפה', available: true },
      case: { id: 'case-search', status: 'open' },
    });
    const screen = render(<AdminPanelScreen navigation={navigation} />);
    await screen.findByTestId('admin-overview-content');
    fireEvent.press(screen.getByTestId('admin-tab-search'));
    fireEvent.changeText(screen.getByTestId('admin-resource-search-input'), 'חיפה');
    fireEvent.press(screen.getByTestId('admin-resource-search'));
    fireEvent.press(await screen.findByTestId('admin-search-result-result-1'));
    expect(await screen.findByTestId('admin-search-open-case')).toBeTruthy();
    expect(screen.queryByText('active')).toBeNull();
  });

  it('loads additional admin search pages with the returned cursor', async () => {
    AdminService.searchAdminResources
      .mockResolvedValueOnce({
        items: [{ id: 'result-1', type: 'recommendation', status: 'active', title: 'תוצאה ראשונה', target: { type: 'recommendation', id: 'rec-1' } }],
        nextCursor: 'cursor-1',
      })
      .mockResolvedValueOnce({
        items: [{ id: 'result-2', type: 'recommendation', status: 'active', title: 'תוצאה שנייה', target: { type: 'recommendation', id: 'rec-2' } }],
        nextCursor: null,
      });
    const screen = render(<AdminPanelScreen navigation={navigation} />);
    await screen.findByTestId('admin-overview-content');
    fireEvent.press(screen.getByTestId('admin-tab-search'));
    fireEvent.changeText(screen.getByTestId('admin-resource-search-input'), 'חיפה');
    fireEvent.press(screen.getByTestId('admin-resource-search'));
    fireEvent.press(await screen.findByTestId('admin-search-load-more'));
    expect(await screen.findByTestId('admin-search-result-result-2')).toBeTruthy();
    expect(AdminService.searchAdminResources).toHaveBeenLastCalledWith({ query: 'חיפה', cursor: 'cursor-1' });
  });

  it('shows a retryable local error when moderation policy loading fails', async () => {
    const item = queueCase('policy');
    AdminService.listModerationCases.mockResolvedValue({ items: [item], nextCursor: null });
    AdminService.getModerationCase.mockResolvedValue(detailsFor(item));
    AdminService.getModerationPolicy.mockRejectedValueOnce(new Error('unavailable'));
    const screen = render(<AdminPanelScreen navigation={navigation} route={{ params: { tab: 'queue' } }} />);
    fireEvent.press(await screen.findByTestId('admin-case-policy'));
    expect(await screen.findByTestId('admin-case-policy-error')).toBeTruthy();
    AdminService.getModerationPolicy.mockResolvedValue({
      reasons: [{ id: 'no_violation', label: 'לא נמצאה הפרה', userMessage: 'לא נמצאה הפרה' }],
    });
    fireEvent.press(screen.getByTestId('admin-case-policy-retry'));
    expect(await screen.findByTestId('admin-case-decision-policy')).toBeTruthy();
  });

  it('moves from a search result without reports to a documented decision', async () => {
    const target = { type: 'recommendation', id: 'rec-new', path: 'recommendations/rec-new' };
    AdminService.searchAdminResources.mockResolvedValue({
      items: [{ id: 'result-new', type: 'recommendation', status: 'active', title: 'תוכן ללא דיווח', target }],
    });
    AdminService.getAdminResource.mockResolvedValue({
      target,
      preview: { title: 'תוכן ללא דיווח', available: true },
      case: null,
    });
    AdminService.resolveModerationCase.mockResolvedValue({ caseId: 'case-created', revision: 2 });
    AdminService.getModerationCase.mockResolvedValue(detailsFor(queueCase('case-created', { target })));
    const screen = render(<AdminPanelScreen navigation={navigation} />);
    await screen.findByTestId('admin-overview-content');
    fireEvent.press(screen.getByTestId('admin-tab-search'));
    fireEvent.changeText(screen.getByTestId('admin-resource-search-input'), 'תוכן');
    fireEvent.press(screen.getByTestId('admin-resource-search'));
    fireEvent.press(await screen.findByTestId('admin-search-result-result-new'));
    fireEvent.press(await screen.findByTestId('admin-decision-reason-no_violation'));
    fireEvent.press(screen.getByTestId('admin-decision-submit'));
    await waitFor(() => expect(AdminService.resolveModerationCase).toHaveBeenCalledWith(expect.objectContaining({
      target,
      expectedRevision: 0,
      contentAction: 'dismiss',
      accountAction: { type: 'none' },
      reasonCode: 'no_violation',
    })));
    expect(await screen.findByTestId('admin-case-decision-case-created')).toBeTruthy();
  });
});
