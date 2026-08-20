import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, RefreshControl } from 'react-native';

import AdminPanelScreen from '../src/features/admin/screens/AdminPanelScreen';
import * as AdminService from '../src/services/AdminService';

jest.mock('../src/services/AdminService', () => ({
  approveDestination: jest.fn(), deactivateDestination: jest.fn(), deleteUserAsAdmin: jest.fn(),
  getAirportCandidates: jest.fn(), getDestinationImageCandidates: jest.fn(), getDestinationReview: jest.fn(),
  getModerationCase: jest.fn(), getModerationDashboard: jest.fn(), listAdminUsers: jest.fn(),
  listDestinationReviews: jest.fn(), listHeldContent: jest.fn(), listModerationAudit: jest.fn(),
  listModerationCases: jest.fn(), moderateContent: jest.fn(), recheckDestination: jest.fn(),
  selectDestinationImageCandidate: jest.fn(), setDestinationAirport: jest.fn(), setDestinationUploadedImage: jest.fn(),
  setUserAdmin: jest.fn(), setUserEmailVerified: jest.fn(), setUserSuspension: jest.fn(),
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
jest.mock('../src/features/admin/components/ModerationTargetPreview', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return ({ preview }) => ReactModule.createElement(View, { testID: `preview-${preview?.title || 'missing'}` });
});

const navigation = { setOptions: jest.fn(), goBack: jest.fn() };
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const user = (uid) => ({ uid, displayName: `User ${uid}`, email: `${uid}@example.com`, disabled: false, emailVerified: false, admin: false });

describe('AdminPanelScreen request and action isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AdminService.getModerationDashboard.mockResolvedValue({ openCases: 1, urgentCases: 0, heldContent: 0, pendingDestinations: 2 });
    AdminService.listModerationCases.mockResolvedValue({ items: [], nextCursor: null });
    AdminService.listHeldContent.mockResolvedValue({ items: [], nextCursor: null });
    AdminService.listDestinationReviews.mockResolvedValue({ items: [], nextCursor: null });
    AdminService.listAdminUsers.mockResolvedValue({ items: [], nextCursor: null });
    AdminService.listModerationAudit.mockResolvedValue({ items: [], nextCursor: null });
    Alert.prompt = jest.fn((_title, _message, callback) => callback('סיבה תקינה'));
  });

  it('shows a scoped error and retries only the active tab', async () => {
    AdminService.getModerationDashboard
      .mockRejectedValueOnce(new Error('private backend detail'))
      .mockResolvedValueOnce({ openCases: 4, urgentCases: 1, heldContent: 2 });
    const screen = render(<AdminPanelScreen navigation={navigation} />);

    expect(await screen.findByTestId('admin-overview-error')).toBeTruthy();
    fireEvent.press(screen.getByTestId('admin-overview-retry'));
    expect(await screen.findByText('4')).toBeTruthy();
    expect(AdminService.getModerationDashboard).toHaveBeenCalledTimes(2);
  });

  it('keeps admin chrome and replaces the active tab body while refreshing', async () => {
    const screen = render(<AdminPanelScreen navigation={navigation} />);
    await screen.findByText('1');

    const pendingRefresh = deferred();
    AdminService.getModerationDashboard.mockReturnValueOnce(pendingRefresh.promise);
    const control = screen.UNSAFE_getByType(RefreshControl);
    let refreshPromise;
    act(() => {
      refreshPromise = control.props.onRefresh();
    });

    expect(screen.getByTestId('admin-tab-overview')).toBeTruthy();
    expect(screen.getByTestId('admin-overview-loading')).toBeTruthy();
    expect(screen.queryByText('1')).toBeNull();

    await act(async () => {
      pendingRefresh.resolve({ openCases: 3, urgentCases: 0, heldContent: 0, pendingDestinations: 0 });
      await refreshPromise;
    });
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('executes the same user search every time it is submitted', async () => {
    const screen = render(<AdminPanelScreen navigation={navigation} />);
    await screen.findByText('1');
    fireEvent.press(screen.getByTestId('admin-tab-users'));
    await waitFor(() => expect(AdminService.listAdminUsers).toHaveBeenCalledWith({}));

    fireEvent.changeText(screen.getByTestId('admin-user-search-input'), 'user@example.com');
    fireEvent.press(screen.getByTestId('admin-user-search'));
    await waitFor(() => expect(AdminService.listAdminUsers).toHaveBeenCalledWith({ query: 'user@example.com' }));
    fireEvent.press(screen.getByTestId('admin-user-search'));
    await waitFor(() => {
      const matching = AdminService.listAdminUsers.mock.calls.filter(([payload]) => payload?.query === 'user@example.com');
      expect(matching).toHaveLength(2);
    });

    fireEvent.changeText(screen.getByTestId('admin-user-search-input'), " !–' ");
    fireEvent.press(screen.getByTestId('admin-user-search'));
    await waitFor(() => expect(AdminService.listAdminUsers).toHaveBeenLastCalledWith({}));
  });

  it('keeps a slow user action local and patches the row without reloading the tab', async () => {
    AdminService.listAdminUsers.mockResolvedValue({ items: [user('one'), user('two')], nextCursor: null });
    const slowSuspension = deferred();
    AdminService.setUserSuspension.mockReturnValue(slowSuspension.promise);
    const screen = render(<AdminPanelScreen navigation={navigation} />);
    await screen.findByText('1');
    fireEvent.press(screen.getByTestId('admin-tab-users'));
    await screen.findByText('User one');

    fireEvent.press(screen.getByTestId('admin-user-suspend-one'));
    await waitFor(() => expect(screen.getByTestId('admin-user-suspend-one').props.accessibilityState.busy).toBe(true));
    expect(screen.getByTestId('admin-user-verify-one').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('admin-user-delete-one').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('admin-user-suspend-two').props.accessibilityState.disabled).toBe(false);
    expect(screen.getByTestId('admin-tab-reports').props.accessibilityState.selected).toBe(false);

    await act(async () => slowSuspension.resolve({ uid: 'one', suspended: true }));
    await waitFor(() => expect(screen.getByText(/User one/)).toBeTruthy());
    expect(screen.getAllByText(/מושעה/)).toHaveLength(1);
    expect(AdminService.listAdminUsers).toHaveBeenCalledTimes(1);
  });

  it('discards an older response when the same tab is loaded again', async () => {
    const oldRequest = deferred();
    AdminService.listModerationCases
      .mockReturnValueOnce(oldRequest.promise)
      .mockResolvedValueOnce({ items: [{ id: 'new', target: { type: 'route', id: 'new' }, targetPreview: { title: 'חדש' } }], nextCursor: null });
    const screen = render(<AdminPanelScreen navigation={navigation} />);
    await screen.findByText('1');
    fireEvent.press(screen.getByTestId('admin-tab-reports'));
    await screen.findByTestId('admin-reports-loading');
    fireEvent.press(screen.getByTestId('admin-tab-users'));
    await screen.findByTestId('admin-users-empty');
    fireEvent.press(screen.getByTestId('admin-tab-reports'));
    expect(await screen.findByTestId('admin-case-new')).toBeTruthy();

    await act(async () => oldRequest.resolve({ items: [{ id: 'old', target: { type: 'route', id: 'old' }, targetPreview: { title: 'ישן' } }], nextCursor: null }));
    expect(screen.queryByTestId('admin-case-old')).toBeNull();
    expect(screen.getByTestId('admin-case-new')).toBeTruthy();
  });

  it('shows only meaningful actions for content that is already held', async () => {
    AdminService.listHeldContent.mockResolvedValue({
      items: [{ id: 'content_one', target: { type: 'recommendation', id: 'one' }, targetPreview: { title: 'ממתין' } }],
      nextCursor: null,
    });
    AdminService.moderateContent.mockResolvedValue({ success: true });
    const screen = render(<AdminPanelScreen navigation={navigation} />);
    await screen.findByText('1');
    fireEvent.press(screen.getByTestId('admin-tab-content'));
    await screen.findByTestId('admin-case-content_one');

    expect(screen.getByTestId('admin-case-restore-content_one')).toBeTruthy();
    expect(screen.getByTestId('admin-case-delete-content_one')).toBeTruthy();
    expect(screen.queryByTestId('admin-case-hold-content_one')).toBeNull();
  });

  it('clears stale load-more progress when the tab is refreshed', async () => {
    const staleLoadMore = deferred();
    AdminService.listModerationCases
      .mockResolvedValueOnce({ items: [{ id: 'first', target: { type: 'route', id: 'first' }, targetPreview: { title: 'ראשון' } }], nextCursor: 'cursor-1' })
      .mockReturnValueOnce(staleLoadMore.promise)
      .mockResolvedValueOnce({ items: [{ id: 'fresh', target: { type: 'route', id: 'fresh' }, targetPreview: { title: 'עדכני' } }], nextCursor: 'cursor-2' });
    const screen = render(<AdminPanelScreen navigation={navigation} />);
    await screen.findByText('1');
    fireEvent.press(screen.getByTestId('admin-tab-reports'));
    await screen.findByTestId('admin-case-first');

    fireEvent.press(screen.getByTestId('admin-reports-load-more'));
    await waitFor(() => expect(screen.getByTestId('admin-reports-load-more').props.accessibilityState.busy).toBe(true));
    fireEvent.press(screen.getByTestId('admin-tab-users'));
    await screen.findByTestId('admin-users-empty');
    fireEvent.press(screen.getByTestId('admin-tab-reports'));

    expect(await screen.findByTestId('admin-case-fresh')).toBeTruthy();
    expect(screen.getByTestId('admin-reports-load-more').props.accessibilityState.busy).toBe(false);
    expect(screen.getByTestId('admin-reports-load-more').props.accessibilityState.disabled).toBe(false);
    await act(async () => staleLoadMore.resolve({ items: [], nextCursor: null }));
    expect(screen.getByTestId('admin-reports-load-more').props.accessibilityState.disabled).toBe(false);
  });

  it('renders report details inline and never opens an alert', async () => {
    AdminService.listModerationCases.mockResolvedValue({
      items: [{ id: 'case-1', target: { type: 'recommendation', id: 'rec-1' }, targetPreview: { available: true, status: 'active', title: 'פוסט' }, reportCount: 1 }],
      nextCursor: null,
    });
    AdminService.getModerationCase.mockResolvedValue({
      reports: [{ id: 'report-1', category: 'spam_scam_commercial', details: 'קישור מסחרי חוזר' }],
    });
    const alertSpy = jest.spyOn(Alert, 'alert');
    const screen = render(<AdminPanelScreen navigation={navigation} />);
    await screen.findByText('1');
    fireEvent.press(screen.getByTestId('admin-tab-reports'));
    await screen.findByTestId('admin-case-case-1');

    fireEvent.press(screen.getByTestId('admin-case-details-case-1'));
    expect(await screen.findByTestId('admin-case-details-panel-case-1')).toBeTruthy();
    expect(screen.getByText('קישור מסחרי חוזר')).toBeTruthy();
    expect(alertSpy).not.toHaveBeenCalled();

    AdminService.getModerationCase.mockResolvedValue({
      reports: [{ id: 'report-2', category: 'other', details: 'דיווח חדש לאחר הרענון' }],
    });
    fireEvent.press(screen.getByTestId('admin-tab-users'));
    await screen.findByTestId('admin-users-empty');
    fireEvent.press(screen.getByTestId('admin-tab-reports'));
    await waitFor(() => expect(AdminService.listModerationCases).toHaveBeenCalledTimes(2));
    await screen.findByTestId('admin-case-case-1');
    fireEvent.press(screen.getByTestId('admin-case-details-case-1'));
    expect(await screen.findByText('דיווח חדש לאחר הרענון')).toBeTruthy();
    expect(AdminService.getModerationCase).toHaveBeenCalledTimes(2);
  });

  it('dismisses a report on published content without offering a redundant restore action', async () => {
    AdminService.listModerationCases.mockResolvedValue({
      items: [{ id: 'case-1', target: { type: 'recommendation', id: 'rec-1' }, targetPreview: { available: true, status: 'active', title: 'פוסט' }, reportCount: 1 }],
      nextCursor: null,
    });
    AdminService.moderateContent.mockResolvedValue({ success: true, action: 'dismiss' });
    const screen = render(<AdminPanelScreen navigation={navigation} />);
    await screen.findByText('1');
    fireEvent.press(screen.getByTestId('admin-tab-reports'));
    await screen.findByTestId('admin-case-case-1');

    expect(screen.queryByTestId('admin-case-restore-case-1')).toBeNull();
    fireEvent.press(screen.getByTestId('admin-case-dismiss-case-1'));
    await waitFor(() => expect(AdminService.moderateContent).toHaveBeenCalledWith({
      caseId: 'case-1', target: { type: 'recommendation', id: 'rec-1' }, action: 'dismiss', reason: 'סיבה תקינה',
    }));
    await waitFor(() => expect(screen.queryByTestId('admin-case-case-1')).toBeNull());
  });

  it('sorts cities awaiting approval before approved cities', async () => {
    AdminService.listDestinationReviews.mockResolvedValue({
      items: [
        { id: 'approved', status: 'approved', cityId: 'approved', names: { he: 'עיר מאושרת' }, updatedAt: '2026-08-16T12:00:00Z' },
        { id: 'pending', status: 'open', cityId: 'pending', names: { he: 'עיר ממתינה' }, updatedAt: '2026-08-15T12:00:00Z' },
      ],
      nextCursor: null,
    });
    const screen = render(<AdminPanelScreen navigation={navigation} />);
    await screen.findByText('1');
    fireEvent.press(screen.getByTestId('admin-tab-destinations'));
    await screen.findByTestId('admin-destination-pending');
    let rows = screen.getAllByTestId(/^admin-destination-(pending|approved)$/);
    expect(rows.map((row) => row.props.testID)).toEqual(['admin-destination-pending', 'admin-destination-approved']);

    AdminService.approveDestination.mockResolvedValue({ success: true });
    AdminService.getDestinationReview.mockResolvedValue({
      countryId: 'country', cityId: 'pending', city: { status: 'active', googleCache: { names: { he: 'עיר ממתינה' } } },
      country: {}, review: { status: 'approved' }, issues: [],
    });
    fireEvent.press(screen.getByTestId('admin-destination-approve-pending'));
    await waitFor(() => expect(AdminService.getDestinationReview).toHaveBeenCalled());
    rows = screen.getAllByTestId(/^admin-destination-(pending|approved)$/);
    expect(rows.map((row) => row.props.testID)).toEqual(['admin-destination-approved', 'admin-destination-pending']);
  });

  it('shows the admin name in the activity log and the pending-city metric in overview', async () => {
    const screen = render(<AdminPanelScreen navigation={navigation} />);
    expect(await screen.findByText('ערים ממתינות לאישור')).toBeTruthy();
    AdminService.listModerationAudit.mockResolvedValue({
      items: [{ id: 'audit-1', action: 'content_hold', reason: 'בדיקה', actorUid: 'uid-hidden', actorName: 'מנהלת פלאן לי' }],
      nextCursor: null,
    });
    fireEvent.press(screen.getByTestId('admin-tab-audit'));
    expect(await screen.findByText('מנהל: מנהלת פלאן לי')).toBeTruthy();
    expect(screen.queryByText('מנהל: uid-hidden')).toBeNull();
  });
});
