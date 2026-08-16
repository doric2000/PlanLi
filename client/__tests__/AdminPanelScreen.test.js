import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

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
    AdminService.getModerationDashboard.mockResolvedValue({ openCases: 1, urgentCases: 0, heldContent: 0 });
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

  it('keeps held content visible when the admin leaves it on hold', async () => {
    AdminService.listHeldContent.mockResolvedValue({
      items: [{ id: 'content_one', target: { type: 'recommendation', id: 'one' }, targetPreview: { title: 'ממתין' } }],
      nextCursor: null,
    });
    AdminService.moderateContent.mockResolvedValue({ success: true });
    const screen = render(<AdminPanelScreen navigation={navigation} />);
    await screen.findByText('1');
    fireEvent.press(screen.getByTestId('admin-tab-content'));
    await screen.findByTestId('admin-case-content_one');

    fireEvent.press(screen.getByTestId('admin-case-hold-content_one'));
    await waitFor(() => expect(AdminService.moderateContent).toHaveBeenCalled());
    expect(screen.getByTestId('admin-case-content_one')).toBeTruthy();
    expect(AdminService.listHeldContent).toHaveBeenCalledTimes(1);
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
});
