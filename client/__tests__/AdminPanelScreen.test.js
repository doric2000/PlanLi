import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Dimensions, StyleSheet } from 'react-native';

import AdminPanelScreen from '../src/features/admin/screens/AdminPanelScreen';
import * as AdminService from '../src/services/AdminService';

let mockAdminClaim = {
  isAdmin: true,
  hasTotpEnrollment: true,
  signedInWithTotp: true,
  loading: false,
};

jest.mock('../src/services/AdminService', () => ({
  approveDestination: jest.fn(),
  bulkUpdateModerationCases: jest.fn(),
  deactivateDestination: jest.fn(),
  deleteAdminSavedView: jest.fn(),
  deleteUserAsAdmin: jest.fn(),
  getAdminResource: jest.fn(),
  getAdminUser: jest.fn(),
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
  listHeldContent: jest.fn(),
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
jest.mock('../src/hooks/useAdminClaim', () => ({
  useAdminClaim: () => mockAdminClaim,
}));
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

const navigation = { setOptions: jest.fn(), setParams: jest.fn(), goBack: jest.fn(), navigate: jest.fn() };
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
    mockAdminClaim = {
      isAdmin: true,
      hasTotpEnrollment: true,
      signedInWithTotp: true,
      loading: false,
    };
    AdminService.getModerationDashboard.mockResolvedValue(dashboard);
    AdminService.listModerationCases.mockResolvedValue({ items: [], nextCursor: null });
    AdminService.listHeldContent.mockResolvedValue({ items: [], nextCursor: null });
    AdminService.getModerationPolicy.mockResolvedValue({
      consoleContractVersion: 1,
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

  it('allows an authenticated non-admin to enroll TOTP without loading admin data', () => {
    mockAdminClaim = {
      isAdmin: false,
      hasTotpEnrollment: false,
      signedInWithTotp: false,
      loading: false,
    };

    const screen = render(<AdminPanelScreen navigation={navigation} />);

    expect(screen.getByTestId('admin-totp-enrollment-required')).toBeTruthy();
    expect(screen.getByText(/אינה מעניקה הרשאת מנהל/)).toBeTruthy();
    expect(AdminService.getModerationPolicy).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('admin-open-totp-enrollment'));
    expect(navigation.navigate).toHaveBeenCalledWith('TotpEnrollment');
  });

  it('keeps a TOTP-enrolled non-admin outside the console', () => {
    mockAdminClaim = {
      isAdmin: false,
      hasTotpEnrollment: true,
      signedInWithTotp: true,
      loading: false,
    };

    const screen = render(<AdminPanelScreen navigation={navigation} />);

    expect(screen.getByText('אין הרשאת מנהל פעילה לחשבון זה.')).toBeTruthy();
    expect(screen.queryByTestId('admin-panel-screen')).toBeNull();
    expect(AdminService.getModerationPolicy).not.toHaveBeenCalled();
  });

  it('keeps standard admin sections inside a vertical scroll container', async () => {
    const screen = render(<AdminPanelScreen navigation={navigation} />);
    await screen.findByTestId('admin-overview-content', {}, { timeout: 10000 });
    const sectionScroll = screen.getByTestId('admin-section-scroll');
    expect(StyleSheet.flatten(sectionScroll.props.style)).toEqual(expect.objectContaining({
      flex: 1,
      minHeight: 0,
    }));
  }, 20000);

  it('opens each workload metric as its matching filtered queue', async () => {
    const screen = render(<AdminPanelScreen navigation={navigation} />);
    await screen.findByTestId('admin-overview-content', {}, { timeout: 10000 });
    expect(screen.getByTestId('admin-metric-openCases')).toBeTruthy();
    expect(screen.getByTestId('admin-metric-urgentCases')).toBeTruthy();
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
      expect(StyleSheet.flatten((await screen.findByTestId('admin-queue-list-pane')).props.style)).toEqual(expect.objectContaining({
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: 425,
      }));
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

  it('shows success when a lost callable response reloads the same completed operation', async () => {
    const item = queueCase('response-lost');
    const initialDetails = detailsFor(item);
    let completedOperationId = '';
    AdminService.listModerationCases.mockResolvedValue({ items: [item], nextCursor: null });
    AdminService.getModerationCase
      .mockResolvedValueOnce(initialDetails)
      .mockImplementation(async () => ({
        ...initialDetails,
        revision: 4,
        status: 'resolved_dismissed',
        resolution: { operationId: completedOperationId, contentAction: 'dismiss', accountAction: 'none' },
      }));
    AdminService.resolveModerationCase.mockImplementationOnce(async (decision) => {
      completedOperationId = decision.operationId;
      throw Object.assign(new Error('response lost'), { code: 'functions/unavailable' });
    });

    const screen = render(<AdminPanelScreen navigation={navigation} route={{ params: { tab: 'queue' } }} />);
    fireEvent.press(await screen.findByTestId('admin-case-response-lost'));
    fireEvent.press(await screen.findByTestId('admin-decision-reason-no_violation'));
    fireEvent.press(screen.getByTestId('admin-decision-submit'));

    expect(await screen.findByText('ההחלטה נשמרה והאכיפה הושלמה.')).toBeTruthy();
    expect(screen.queryByText(/ייתכן שהיא עדיין מתבצעת/u)).toBeNull();
  });

  it('restores held content when the admin closes it as no violation', async () => {
    const item = queueCase('held', {
      status: 'auto_held',
      targetPreview: { available: true, title: 'פוסט מוחזק', status: 'moderation_hold', author: { displayName: 'מטיילת' } },
    });
    AdminService.listModerationCases.mockResolvedValue({ items: [item], nextCursor: null });
    AdminService.getModerationCase.mockResolvedValue({
      ...detailsFor(item),
      decisionOptions: {
        contentStatus: 'moderation_hold',
        accountStatus: 'active',
        contentActions: ['none', 'restore', 'delete'],
        accountActions: ['none', 'warn', 'suspend'],
        defaultContentAction: 'restore',
        defaultAccountAction: 'none',
      },
    });
    const screen = render(<AdminPanelScreen navigation={navigation} route={{ params: { tab: 'queue' } }} />);
    fireEvent.press(await screen.findByTestId('admin-case-held'));
    expect((await screen.findByTestId('admin-decision-content-restore')).props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByTestId('admin-decision-reason-no_violation'));
    fireEvent.press(screen.getByTestId('admin-decision-submit'));
    await waitFor(() => expect(AdminService.resolveModerationCase).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'held',
      expectedRevision: 2,
      contentAction: 'restore',
      accountAction: { type: 'none' },
      reasonCode: 'no_violation',
      operationId: expect.any(String),
    })));
  });

  it('lists system-managed held content and routes the admin to the destination review', async () => {
    const target = {
      type: 'recommendation',
      id: 'rec-destination-hold',
      path: 'recommendations/rec-destination-hold',
    };
    const preview = {
      available: true,
      title: 'נחל הקיבוצים בעמק המעיינות בית שאן',
      status: 'moderation_hold',
      author: { displayName: 'מטיילת' },
      destination: { countryId: 'IL', cityId: 'new-city', cityName: 'ניר דוד', countryName: 'ישראל' },
    };
    const holdContext = {
      kind: 'system',
      holdReason: 'destination_policy_review',
      systemGate: 'destination_pending_approval',
      destination: { countryId: 'IL', cityId: 'new-city', cityName: 'ניר דוד', countryName: 'ישראל' },
    };
    AdminService.listHeldContent
      .mockResolvedValueOnce({
        items: [{ id: 'content_recommendation_rec-destination-hold', target, targetPreview: preview, holdContext }],
        nextCursor: 'recommendations:rec-destination-hold',
      })
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    AdminService.getAdminResource.mockResolvedValue({ target, preview, holdContext, case: null });
    AdminService.getDestinationReview.mockResolvedValue({
      countryId: 'IL',
      cityId: 'new-city',
      country: { names: { he: 'ישראל' } },
      city: { status: 'active', identity: { names: { he: 'ניר דוד' } }, canonicalPolicy: { kind: 'natural_feature', groupingPolicy: 'self' } },
      review: { status: 'approved_with_warnings' },
      issues: [],
    });

    const screen = render(<AdminPanelScreen navigation={navigation} route={{ params: { tab: 'content' } }} />);
    await screen.findByTestId('admin-queue-view-held', {}, { timeout: 20000 });
    await waitFor(() => expect(AdminService.listHeldContent).toHaveBeenCalled(), { timeout: 20000 });
    const row = await screen.findByTestId('admin-case-content_recommendation_rec-destination-hold', {}, { timeout: 20000 });
    expect(AdminService.listModerationCases).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('admin-queue-load-more'));
    await waitFor(() => expect(AdminService.listHeldContent).toHaveBeenLastCalledWith({
      cursor: 'recommendations:rec-destination-hold',
    }));
    fireEvent.press(row);
    expect(await screen.findByTestId('admin-held-system-action', {}, { timeout: 20000 })).toBeTruthy();
    expect(screen.getByText(/אי אפשר לשחזר ידנית/u)).toBeTruthy();
    expect(screen.queryByTestId('admin-decision-content-restore')).toBeNull();

    fireEvent.press(screen.getByTestId('admin-held-destination-action'));
    await waitFor(() => expect(AdminService.getDestinationReview).toHaveBeenCalledWith('IL', 'new-city'));
    expect(await screen.findByText('IL/new-city')).toBeTruthy();
  }, 60000);

  it('opens the recorded moderation case from the held-content view', async () => {
    const target = { type: 'recommendation', id: 'rec-reported-hold', path: 'recommendations/rec-reported-hold' };
    const preview = {
      available: true,
      title: 'המלצה מוחזקת בעקבות דיווחים',
      status: 'moderation_hold',
      author: { displayName: 'מטיילת' },
    };
    const caseItem = queueCase('reported-hold-case', {
      target,
      status: 'auto_held',
      targetPreview: preview,
    });
    AdminService.listHeldContent.mockResolvedValue({
      items: [{
        id: 'content_recommendation_rec-reported-hold',
        target,
        targetPreview: preview,
        holdContext: { kind: 'moderation', holdReason: 'reports' },
      }],
      nextCursor: null,
    });
    AdminService.getAdminResource.mockResolvedValue({
      target,
      preview,
      holdContext: { kind: 'moderation', holdReason: 'reports' },
      case: { id: 'reported-hold-case' },
    });
    AdminService.getModerationCase.mockResolvedValue({
      ...detailsFor(caseItem),
      decisionOptions: {
        contentStatus: 'moderation_hold',
        accountStatus: 'active',
        contentActions: ['none', 'restore', 'delete'],
        accountActions: ['none', 'warn', 'suspend'],
        defaultContentAction: 'restore',
        defaultAccountAction: 'none',
      },
    });

    const screen = render(<AdminPanelScreen navigation={navigation} route={{ params: { tab: 'content' } }} />);
    fireEvent.press(await screen.findByTestId('admin-case-content_recommendation_rec-reported-hold', {}, { timeout: 20000 }));

    expect(await screen.findByTestId('admin-decision-content-restore', {}, { timeout: 20000 })).toBeTruthy();
    expect(screen.queryByTestId('admin-held-content-details')).toBeNull();
    expect(AdminService.getModerationCase).toHaveBeenCalledWith('reported-hold-case');
  }, 60000);

  it('reuses the recorded operation when retrying a failed decision', async () => {
    const item = queueCase('retry', { revision: 4 });
    AdminService.listModerationCases.mockResolvedValue({ items: [item], nextCursor: null });
    AdminService.getModerationCase.mockResolvedValue({
      ...detailsFor(item),
      decisionRetry: {
        operationId: 'retry-operation-123',
        requestedContentAction: 'dismiss',
        contentAction: 'dismiss',
        accountAction: 'none',
        durationHours: null,
        reasonCode: 'no_violation',
        userDetail: '',
        internalNote: '',
      },
    });
    const screen = render(<AdminPanelScreen navigation={navigation} route={{ params: { tab: 'queue' } }} />);
    fireEvent.press(await screen.findByTestId('admin-case-retry'));
    fireEvent.press(await screen.findByTestId('admin-decision-reason-no_violation'));
    fireEvent.press(await screen.findByTestId('admin-decision-submit'));
    await waitFor(() => expect(AdminService.resolveModerationCase).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'retry',
      expectedRevision: 4,
      contentAction: 'dismiss',
      reasonCode: 'no_violation',
      operationId: 'retry-operation-123',
    })));
  });

  it('requires explicit account reinstatement before restoring suspended content', async () => {
    const item = queueCase('suspended', {
      targetPreview: { available: true, title: 'מסלול מושעה', status: 'suspended', author: { displayName: 'מטיילת' } },
    });
    AdminService.listModerationCases.mockResolvedValue({ items: [item], nextCursor: null });
    AdminService.getModerationCase.mockResolvedValue({
      ...detailsFor(item),
      subjectUser: { uid: 'owner-1', displayName: 'מטיילת', status: 'suspended' },
      decisionOptions: {
        contentStatus: 'suspended',
        accountStatus: 'suspended',
        contentActions: ['none', 'restore', 'delete'],
        accountActions: ['none', 'reinstate'],
        defaultContentAction: 'restore',
        defaultAccountAction: 'none',
      },
    });
    const screen = render(<AdminPanelScreen navigation={navigation} route={{ params: { tab: 'queue' } }} />);
    fireEvent.press(await screen.findByTestId('admin-case-suspended'));
    expect((await screen.findByTestId('admin-decision-content-restore')).props.accessibilityState.selected).toBe(true);
    expect(screen.getByTestId('admin-decision-account-none').props.accessibilityState.selected).toBe(true);
    expect(screen.getByText('שחזור תוכן של משתמש מושעה דורש בחירה מפורשת ב״החזרה לפעילות״.')).toBeTruthy();
    expect(screen.getByTestId('admin-decision-submit').props.accessibilityState.disabled).toBe(true);

    fireEvent.press(screen.getByTestId('admin-decision-reason-no_violation'));
    expect(screen.getByTestId('admin-decision-account-reinstate').props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByTestId('admin-decision-submit'));
    await waitFor(() => expect(AdminService.resolveModerationCase).toHaveBeenCalledWith(expect.objectContaining({
      caseId: 'suspended',
      contentAction: 'restore',
      accountAction: { type: 'reinstate' },
      reasonCode: 'no_violation',
    })));
  });

  it('clears a guided reinstatement when delete is selected and confirms both actions', async () => {
    const item = queueCase('suspended-delete', {
      targetPreview: { available: true, title: 'מסלול מושעה', status: 'suspended', author: { displayName: 'מטיילת' } },
    });
    AdminService.listModerationCases.mockResolvedValue({ items: [item], nextCursor: null });
    AdminService.getModerationCase.mockResolvedValue({
      ...detailsFor(item),
      subjectUser: { uid: 'owner-1', displayName: 'מטיילת', status: 'suspended' },
      decisionOptions: {
        contentStatus: 'suspended',
        accountStatus: 'suspended',
        contentActions: ['none', 'restore', 'delete'],
        accountActions: ['none', 'reinstate'],
        defaultContentAction: 'restore',
        defaultAccountAction: 'none',
      },
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => buttons[1].onPress());
    const screen = render(<AdminPanelScreen navigation={navigation} route={{ params: { tab: 'queue' } }} />);
    try {
      fireEvent.press(await screen.findByTestId('admin-case-suspended-delete'));
      fireEvent.press(await screen.findByTestId('admin-decision-reason-no_violation'));
      expect(screen.getByTestId('admin-decision-account-reinstate').props.accessibilityState.selected).toBe(true);
      fireEvent.press(screen.getByTestId('admin-decision-content-delete'));
      expect(screen.getByTestId('admin-decision-account-none').props.accessibilityState.selected).toBe(true);
      fireEvent.press(screen.getByTestId('admin-decision-reason-spam_scam_commercial'));
      fireEvent.press(screen.getByTestId('admin-decision-submit'));
      expect(alert).toHaveBeenCalledWith(
        'אישור פעולה רגישה',
        expect.stringContaining('פעולת תוכן: מחיקה\nפעולת חשבון: ללא פעולה'),
        expect.any(Array)
      );
      await waitFor(() => expect(AdminService.resolveModerationCase).toHaveBeenCalledWith(expect.objectContaining({
        caseId: 'suspended-delete',
        contentAction: 'delete',
        accountAction: { type: 'none' },
        reasonCode: 'spam_scam_commercial',
      })));
    } finally {
      alert.mockRestore();
    }
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

  it('opens user and destination tabs through full press targets', async () => {
    AdminService.listAdminUsers.mockResolvedValue({ items: [], nextCursor: null });
    AdminService.listDestinationReviews.mockResolvedValue({
      items: [{ id: 'destination-il-haifa', countryId: 'IL', cityId: 'haifa', names: { he: 'חיפה' }, countryNames: { he: 'ישראל' }, status: 'open' }],
      nextCursor: null,
    });
    const screen = render(<AdminPanelScreen navigation={navigation} />);
    await screen.findByTestId('admin-overview-content', {}, { timeout: 20000 });
    fireEvent.press(screen.getByTestId('admin-tab-users'));
    expect(await screen.findByTestId('admin-users-content')).toBeTruthy();
    fireEvent.press(screen.getByTestId('admin-tab-destinations'));
    fireEvent.press(await screen.findByTestId('admin-destination-destination-il-haifa'));
    expect(screen.getByText('IL/haifa')).toBeTruthy();
    expect(screen.getByText('סוג יעד: עיר או יישוב מרכזי · אופן שיוך: יעד עצמאי')).toBeTruthy();
    expect(screen.queryByText('קיבוץ: self')).toBeNull();
    expect(screen.getByText('אתר טבע')).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByTestId('admin-destination-policy-destination-il-haifa').props.style)).toMatchObject({
      flexBasis: 'auto',
      flexGrow: 0,
      width: '100%',
    });
  }, 60000);

  it('opens the exact case user even when the user is outside the current page', async () => {
    const item = queueCase('linked-user');
    AdminService.listModerationCases.mockResolvedValue({ items: [item], nextCursor: null });
    AdminService.getModerationCase.mockResolvedValue(detailsFor(item));
    AdminService.getAdminUser.mockResolvedValue({ uid: 'owner-1', displayName: 'מטיילת', email: 'owner@example.com', disabled: false, emailVerified: true, admin: false });
    const screen = render(<AdminPanelScreen navigation={navigation} route={{ params: { tab: 'queue' } }} />);
    fireEvent.press(await screen.findByTestId('admin-case-linked-user'));
    fireEvent.press(await screen.findByTestId('admin-case-open-user'));
    await waitFor(() => expect(AdminService.getAdminUser).toHaveBeenCalledWith('owner-1'));
    expect(await screen.findByTestId('admin-user-detail-owner-1')).toBeTruthy();
    fireEvent.press(screen.getByTestId('admin-user-back-to-case'));
    expect(await screen.findByTestId('admin-case-decision-linked-user')).toBeTruthy();
    fireEvent.press(screen.getByTestId('admin-tab-users'));
    expect(await screen.findByTestId('admin-users-content')).toBeTruthy();
    screen.rerender(<AdminPanelScreen navigation={navigation} route={{ params: {} }} />);
    expect(await screen.findByTestId('admin-users-content')).toBeTruthy();
    expect(screen.queryByTestId('admin-user-back-to-case')).toBeNull();
    expect(AdminService.getAdminUser).toHaveBeenCalledTimes(1);
  });

  it('opens the exact destination from case context and returns to the case', async () => {
    const item = queueCase('linked-destination', {
      targetPreview: {
        available: true,
        title: 'פוסט בחיפה',
        status: 'active',
        author: { displayName: 'מטיילת' },
        destination: { countryId: 'IL', cityId: 'haifa', cityName: 'חיפה', countryName: 'ישראל' },
      },
    });
    AdminService.listModerationCases.mockResolvedValue({ items: [item], nextCursor: null });
    AdminService.getModerationCase.mockResolvedValue(detailsFor(item));
    AdminService.listDestinationReviews.mockResolvedValue({ items: [], nextCursor: null });
    AdminService.getDestinationReview.mockResolvedValue({
      countryId: 'IL',
      cityId: 'haifa',
      country: { names: { he: 'ישראל' } },
      city: { status: 'active', identity: { names: { he: 'חיפה' } }, stats: { recommendationCount: 4 } },
      review: { status: 'open' },
      issues: [],
    });
    const screen = render(<AdminPanelScreen navigation={navigation} route={{ params: { tab: 'queue' } }} />);
    fireEvent.press(await screen.findByTestId('admin-case-linked-destination'));
    fireEvent.press(await screen.findByTestId('admin-case-open-destination'));
    await waitFor(() => expect(AdminService.getDestinationReview).toHaveBeenCalledWith('IL', 'haifa'));
    expect(await screen.findByText('IL/haifa')).toBeTruthy();
    fireEvent.press(screen.getByTestId('admin-destination-back-to-case'));
    expect(await screen.findByTestId('admin-case-decision-linked-destination')).toBeTruthy();
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

  it('blocks operational controls until the backend contract retry succeeds', async () => {
    const item = queueCase('policy');
    AdminService.listModerationCases.mockResolvedValue({ items: [item], nextCursor: null });
    AdminService.getModerationCase.mockResolvedValue(detailsFor(item));
    AdminService.getModerationPolicy.mockRejectedValueOnce(new Error('unavailable'));
    const screen = render(<AdminPanelScreen navigation={navigation} route={{ params: { tab: 'queue' } }} />);
    expect(await screen.findByTestId('admin-console-bootstrap-error')).toBeTruthy();
    expect(screen.queryByTestId('admin-queue-content')).toBeNull();
    expect(AdminService.listModerationCases).not.toHaveBeenCalled();
    AdminService.getModerationPolicy.mockResolvedValue({
      consoleContractVersion: 1,
      reasons: [{ id: 'no_violation', label: 'לא נמצאה הפרה', userMessage: 'לא נמצאה הפרה' }],
    });
    fireEvent.press(screen.getByTestId('admin-console-bootstrap-retry'));
    fireEvent.press(await screen.findByTestId('admin-case-policy'));
    expect(await screen.findByTestId('admin-case-decision-policy')).toBeTruthy();
  });

  it('keeps the console locked when the server returns an older contract', async () => {
    AdminService.getModerationPolicy.mockResolvedValueOnce({
      consoleContractVersion: 0,
      reasons: [{ id: 'no_violation', label: 'לא נמצאה הפרה' }],
    });
    const screen = render(<AdminPanelScreen navigation={navigation} />);
    expect(await screen.findByText(/אינה תואמת לשירותים הפעילים/u)).toBeTruthy();
    expect(screen.queryByTestId('admin-overview-content')).toBeNull();
    expect(AdminService.getModerationDashboard).not.toHaveBeenCalled();
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
