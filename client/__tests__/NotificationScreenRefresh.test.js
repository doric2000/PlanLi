import React from 'react';
import { Alert, StyleSheet } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import NotificationScreen from '../src/features/notifications/screens/NotificationScreen';

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() };
let mockCenter;
const mockGetIdTokenResult = jest.fn();
const mockSignOutCentral = jest.fn(async () => {});
const mockOpenAuthFlow = jest.fn();
const mockUser = {
  uid: 'owner',
  displayName: 'דנה',
  photoURL: null,
  getIdTokenResult: (...args) => mockGetIdTokenResult(...args),
};
const mockResolveTargetAvailability = jest.fn();

jest.mock('../src/services/AuthService', () => ({
  signOutCentral: (...args) => mockSignOutCentral(...args),
}));
jest.mock('../src/navigation/authNavigation', () => ({
  openAuthFlow: (...args) => mockOpenAuthFlow(...args),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useFocusEffect: (callback) => {
    const ReactRuntime = require('react');
    ReactRuntime.useEffect(callback, [callback]);
  },
}));

jest.mock('react-native-gesture-handler', () => {
  const ReactRuntime = require('react');
  const { View } = require('react-native');
  return {
    GestureHandlerRootView: ({ children, ...props }) => ReactRuntime.createElement(View, props, children),
  };
});

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const ReactRuntime = require('react');
  const { View } = require('react-native');
  return ReactRuntime.forwardRef(function MockSwipeable({
    children,
    renderRightActions,
    onSwipeableOpen,
    ...props
  }, ref) {
    ReactRuntime.useImperativeHandle(ref, () => ({ close: jest.fn() }), []);
    return ReactRuntime.createElement(
      View,
      { ...props, onSwipeableOpen },
      children,
      renderRightActions?.()
    );
  });
});

jest.mock('@expo/vector-icons', () => {
  const ReactRuntime = require('react');
  const { Text } = require('react-native');
  const Icon = ({ name, ...props }) => ReactRuntime.createElement(
    Text,
    { ...props, testID: props.testID || `icon-${name}` },
    name
  );
  return { Ionicons: Icon, MaterialIcons: Icon };
});

jest.mock('react-native-safe-area-context', () => {
  const ReactRuntime = require('react');
  const { View } = require('react-native');
  return { SafeAreaView: ({ children, ...props }) => ReactRuntime.createElement(View, props, children) };
});

jest.mock('../src/features/notifications/context/NotificationCenterContext', () => ({
  useNotificationCenter: () => mockCenter,
}));
jest.mock('../src/features/notifications/services/NotificationService', () => ({
  resolveNotificationTargetAvailability: (...args) => mockResolveTargetAvailability(...args),
}));
jest.mock('../src/hooks/useAuthUser', () => ({ useAuthUser: () => ({ user: mockUser }) }));
jest.mock('../src/components/LikesModal', () => {
  const ReactRuntime = require('react');
  const { View } = require('react-native');
  return function MockLikesModal({ visible, collectionName, itemId, likeCount }) {
    return visible ? ReactRuntime.createElement(View, {
      testID: 'likes-modal',
      collectionName,
      itemId,
      likeCount,
    }) : null;
  };
});

const personalLike = {
  id: 'like-1',
  schemaVersion: 2,
  channel: 'personal',
  type: 'like',
  priority: 'normal',
  isRead: false,
  createdAt: new Date('2026-08-21T10:00:00Z'),
  count: 1,
  actorPreview: { id: 'actor-1', displayName: 'נועה', photoURL: null },
  actorPreviews: Array.from({ length: 4 }, (_, index) => ({
    id: `actor-${index}`,
    displayName: `מטייל ${index}`,
    photoURL: null,
  })),
  target: {
    type: 'recommendation',
    title: 'מסעדה בחיפה',
    thumbUrls: ['https://example.com/post.jpg', 'https://example.com/unused.jpg'],
  },
  navigation: { action: 'open_recommendation', recommendationId: 'post-1' },
};

const personalComment = {
  ...personalLike,
  id: 'comment-1',
  type: 'comment',
  isRead: true,
  commentExcerpt: 'איזה מקום נהדר',
  navigation: {
    action: 'open_comment',
    parentType: 'recommendation',
    parentId: 'post-1',
    commentId: 'comment-doc-1',
  },
};

function channelState(items = []) {
  return {
    items,
    loading: false,
    refreshing: false,
    loadingMore: false,
    error: '',
    cursor: null,
    hasMore: false,
    loaded: true,
  };
}

function createCenter({ isAdmin = false, personal = [personalLike, personalComment] } = {}) {
  return {
    channels: {
      personal: channelState(personal),
      admin: channelState([]),
    },
    unreadCounts: { personal: personal.filter((item) => !item.isRead).length, admin: 2 },
    activeFilters: { personal: 'all', admin: 'all' },
    totalUnread: 1,
    isAdmin,
    adminLoading: false,
    pendingActions: {},
    mutationError: '',
    clearMutationError: jest.fn(),
    setActiveFilter: jest.fn(),
    retry: jest.fn(),
    refresh: jest.fn(() => Promise.resolve(true)),
    loadMore: jest.fn(() => Promise.resolve(false)),
    setRead: jest.fn(() => Promise.resolve(true)),
    deleteOne: jest.fn(() => Promise.resolve(true)),
    markChannelRead: jest.fn(() => Promise.resolve(true)),
    clearChannel: jest.fn(() => Promise.resolve(true)),
    resolveNotification: jest.fn(() => Promise.resolve(null)),
  };
}

describe('NotificationScreen interactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCenter = createCenter();
    mockResolveTargetAvailability.mockResolvedValue({ available: true, reason: 'active' });
    mockGetIdTokenResult.mockResolvedValue({
      claims: {
        auth_time: Math.floor(Date.now() / 1000),
        firebase: { sign_in_second_factor: 'totp' },
      },
    });
  });

  it('keeps RTL header controls and gates the admin channel by the active claim', () => {
    const screen = render(<NotificationScreen />);

    expect(screen.getByTestId('notifications-header-profile-slot')).toBeTruthy();
    expect(screen.getByTestId('notifications-header-action-slot')).toBeTruthy();
    expect(screen.getByTestId('notifications-profile')).toBeTruthy();
    expect(screen.queryByTestId('notification-channel-tabs')).toBeNull();
    fireEvent.press(screen.getByTestId('notifications-profile'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('UserProfile', { uid: 'owner' });

    mockCenter = createCenter({ isAdmin: true });
    screen.rerender(<NotificationScreen />);
    expect(screen.getByTestId('notification-channel-tabs')).toBeTruthy();
    expect(screen.getByText(/ניהול/)).toBeTruthy();
  });

  it('always renders the full channel without filter or unread controls', () => {
    const screen = render(<NotificationScreen />);
    expect(screen.getByTestId('notification-row-like-1')).toBeTruthy();
    expect(screen.getByTestId('notification-row-comment-1')).toBeTruthy();
    expect(screen.queryByTestId('notification-filter-chips')).toBeNull();
    expect(screen.queryByTestId('notification-channel-menu')).toBeNull();
    expect(screen.queryByText(/לא נקראו|הכול נקרא/u)).toBeNull();
  });

  it('marks admin notifications only when the admin channel is entered', async () => {
    mockCenter = createCenter({ isAdmin: true });
    render(<NotificationScreen initialChannel="admin" />);

    await waitFor(() => {
      expect(mockCenter.markChannelRead).toHaveBeenCalledWith('personal');
      expect(mockCenter.markChannelRead).toHaveBeenCalledWith('admin');
    });
  });

  it('requires a recent TOTP session before auto-reading admin notifications', async () => {
    mockCenter = createCenter({ isAdmin: true });
    mockGetIdTokenResult.mockResolvedValue({
      claims: {
        auth_time: Math.floor(Date.now() / 1000) - (11 * 60),
        firebase: { sign_in_second_factor: 'totp' },
      },
    });
    const screen = render(<NotificationScreen initialChannel="admin" />);

    await waitFor(() => expect(screen.getByText('נדרשת התחברות מחדש')).toBeTruthy());
    expect(mockCenter.markChannelRead).toHaveBeenCalledWith('personal');
    expect(mockCenter.markChannelRead).not.toHaveBeenCalledWith('admin');

    fireEvent.press(screen.getByTestId('notification-admin-reauthenticate'));
    await waitFor(() => expect(mockSignOutCentral).toHaveBeenCalledWith());
    await waitFor(() => expect(mockOpenAuthFlow).toHaveBeenCalledWith(
      mockNavigation,
      'Login'
    ));
  });

  it('marks the personal channel on entry and opens a row without a per-item read write', async () => {
    const onOpenAction = jest.fn();
    const screen = render(<NotificationScreen onOpenAction={onOpenAction} />);
    await waitFor(() => expect(mockCenter.markChannelRead).toHaveBeenCalledWith('personal'));
    const row = screen.getByTestId('notification-row-like-1');

    fireEvent.press(row);
    fireEvent.press(row);

    await waitFor(() => expect(onOpenAction).toHaveBeenCalledTimes(1));
    expect(mockCenter.setRead).not.toHaveBeenCalled();
    expect(onOpenAction).toHaveBeenCalledWith(
      { type: 'navigate', routeName: 'RecommendationDetail', params: { postId: 'post-1' } },
      personalLike
    );
  });

  it.each([
    ['held', 'התוכן נמצא בבדיקה'],
    ['deleted', 'התוכן כבר לא זמין'],
    ['unavailable', 'התוכן אינו זמין כרגע'],
  ])('keeps a currently %s social target in a contextual sheet', async (reason, title) => {
    mockResolveTargetAvailability.mockResolvedValue({ available: false, reason });
    const onOpenAction = jest.fn();
    const screen = render(<NotificationScreen onOpenAction={onOpenAction} />);

    fireEvent.press(screen.getByTestId('notification-row-like-1'));

    await waitFor(() => expect(screen.getByText(title)).toBeTruthy());
    expect(onOpenAction).not.toHaveBeenCalled();
    expect(mockCenter.setRead).not.toHaveBeenCalled();
  });

  it('keeps a transient target lookup unread and retries before navigating', async () => {
    mockResolveTargetAvailability
      .mockRejectedValueOnce(Object.assign(new Error('offline'), {
        code: 'firestore/unavailable',
        reason: 'retryable',
      }))
      .mockResolvedValueOnce({ available: true, reason: 'active' });
    const onOpenAction = jest.fn();
    const screen = render(<NotificationScreen onOpenAction={onOpenAction} />);

    fireEvent.press(screen.getByTestId('notification-row-like-1'));
    await waitFor(() => expect(screen.getByTestId('notification-status-retry')).toBeTruthy());
    expect(mockCenter.setRead).not.toHaveBeenCalled();
    expect(onOpenAction).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('notification-status-retry'));
    await waitFor(() => expect(onOpenAction).toHaveBeenCalledTimes(1));
    expect(mockCenter.setRead).not.toHaveBeenCalled();
  });

  it('rechecks restored system content before opening it', async () => {
    const restored = {
      ...personalLike,
      id: 'restored-1',
      type: 'system',
      subtype: 'content_restored',
    };
    mockCenter = createCenter({ personal: [restored] });
    mockResolveTargetAvailability.mockResolvedValue({ available: false, reason: 'held' });
    const onOpenAction = jest.fn();
    const screen = render(<NotificationScreen onOpenAction={onOpenAction} />);

    expect(screen.getByTestId('notification-type-preview-restored-1', {
      includeHiddenElements: true,
    })).toBeTruthy();
    expect(screen.queryByTestId('notification-target-image-restored-1')).toBeNull();
    fireEvent.press(screen.getByTestId('notification-row-restored-1'));
    await waitFor(() => expect(mockResolveTargetAvailability).toHaveBeenCalledWith(restored));
    expect(onOpenAction).not.toHaveBeenCalled();
    expect(mockCenter.setRead).not.toHaveBeenCalled();
  });

  it('offers confirmed per-row deletion from the left-swipe action', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = render(<NotificationScreen />);

    fireEvent(screen.getByTestId('notification-swipe-like-1'), 'swipeableOpen');
    fireEvent.press(screen.getByTestId('notification-delete-like-1'));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const destructive = alertSpy.mock.calls[0][2].find((button) => button.style === 'destructive');
    destructive.onPress();
    await waitFor(() => expect(mockCenter.deleteOne).toHaveBeenCalledWith(personalLike));
    alertSpy.mockRestore();
  });

  it('disables swipe deletion while the channel read mutation is pending', () => {
    mockCenter.pendingActions = { 'channel:personal:read': true };
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = render(<NotificationScreen />);
    const deleteAction = screen.getByTestId('notification-delete-like-1');

    expect(deleteAction.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    fireEvent.press(deleteAction);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockCenter.deleteOne).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('renders all four bounded grouped-like actor previews', () => {
    const screen = render(<NotificationScreen />);
    expect(screen.getByTestId('notification-actor-like-1-0', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('notification-actor-like-1-3', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('notification-target-image-like-1').props.source).toEqual({
      uri: 'https://example.com/post.jpg',
    });
    expect(screen.queryByTestId('notification-previews-like-1')).toBeNull();
  });

  it('opens an actor profile directly from its 44px avatar action', async () => {
    const onOpenAction = jest.fn();
    const screen = render(<NotificationScreen onOpenAction={onOpenAction} />);
    const actor = screen.getByTestId('notification-actor-like-1-0');

    expect(StyleSheet.flatten(actor.props.style)).toMatchObject({ width: 44, height: 44 });
    fireEvent.press(actor);
    fireEvent.press(actor);

    await waitFor(() => expect(mockNavigation.navigate).toHaveBeenCalledWith(
      'UserProfile',
      { uid: 'actor-0' }
    ));
    expect(mockCenter.setRead).not.toHaveBeenCalled();
    expect(onOpenAction).not.toHaveBeenCalled();
  });

  it('aligns the clickable like count with the first notification text line', () => {
    const screen = render(<NotificationScreen />);
    const messageRow = StyleSheet.flatten(
      screen.getByTestId('notification-like-message-like-1').props.style
    );
    const likesAction = StyleSheet.flatten(
      screen.getByTestId('notification-likes-like-1').props.style
    );
    const message = screen.getByTestId('notification-row-like-1');
    const messageStyle = StyleSheet.flatten(message.props.style);

    expect(messageRow.alignItems).toBe('flex-start');
    expect(likesAction).toMatchObject({ minHeight: 44, justifyContent: 'flex-start' });
    expect(messageStyle).toMatchObject({ minHeight: 44, justifyContent: 'flex-start' });
  });

  it('opens the full liker list from the independent 44px like-count action', async () => {
    const onOpenAction = jest.fn();
    const screen = render(<NotificationScreen onOpenAction={onOpenAction} />);

    const likesAction = screen.getByTestId('notification-likes-like-1');
    expect(StyleSheet.flatten(likesAction.props.style).minHeight).toBe(44);
    fireEvent.press(likesAction);
    fireEvent.press(likesAction);

    await waitFor(() => expect(screen.getByTestId('likes-modal')).toBeTruthy());
    expect(screen.getByTestId('likes-modal').props).toMatchObject({
      collectionName: 'recommendations',
      itemId: 'post-1',
    });
    expect(screen.getByTestId('likes-modal').props).not.toHaveProperty('likeCount');
    expect(mockCenter.setRead).not.toHaveBeenCalled();
    expect(onOpenAction).not.toHaveBeenCalled();
  });

  it('uses a content fallback when social target media is missing', () => {
    mockCenter = createCenter({
      personal: [{
        ...personalLike,
        id: 'route-like-fallback',
        target: { type: 'route', title: 'מסלול בגליל', thumbUrls: [] },
        navigation: { action: 'open_route', routeId: 'route-1' },
      }],
    });
    const screen = render(<NotificationScreen />);

    expect(screen.getByTestId('notification-target-fallback-route-like-fallback')).toBeTruthy();
    expect(screen.getByTestId('notification-actor-route-like-fallback-0', {
      includeHiddenElements: true,
    })).toBeTruthy();
  });

  it('revalidates content before opening the liker list', async () => {
    mockResolveTargetAvailability.mockResolvedValue({ available: false, reason: 'held' });
    const screen = render(<NotificationScreen />);

    fireEvent.press(screen.getByTestId('notification-likes-like-1'));

    await waitFor(() => expect(screen.getByText('התוכן נמצא בבדיקה')).toBeTruthy());
    expect(screen.queryByTestId('likes-modal')).toBeNull();
    expect(mockCenter.setRead).not.toHaveBeenCalled();
  });

  it('opens a route like from its main thumbnail with the exact route id', async () => {
    const routeLike = {
      ...personalLike,
      id: 'route-like-1',
      target: {
        type: 'route',
        title: 'מסלול בגליל',
        thumbUrls: ['https://example.com/route.jpg'],
      },
      navigation: { action: 'open_route', routeId: 'route-1' },
    };
    mockCenter = createCenter({ personal: [routeLike] });
    const onOpenAction = jest.fn();
    const screen = render(<NotificationScreen onOpenAction={onOpenAction} />);

    fireEvent.press(screen.getByTestId('notification-target-route-like-1'));

    await waitFor(() => expect(onOpenAction).toHaveBeenCalledWith({
      type: 'navigate',
      routeName: 'RouteDetail',
      params: { routeId: 'route-1' },
    }, routeLike));
  });

  it('opens the exact comment from its main target thumbnail', async () => {
    const onOpenAction = jest.fn();
    const screen = render(<NotificationScreen onOpenAction={onOpenAction} />);

    fireEvent.press(screen.getByTestId('notification-target-comment-1'));

    await waitFor(() => expect(onOpenAction).toHaveBeenCalledWith({
      type: 'navigate',
      routeName: 'RecommendationDetail',
      params: { postId: 'post-1', openComments: true, commentId: 'comment-doc-1' },
    }, personalComment));
  });

  it('resolves a push id once and ignores duplicate route params without an item read write', async () => {
    mockCenter.resolveNotification.mockResolvedValue(personalLike);
    const onOpenAction = jest.fn();
    const route = { params: { notificationId: 'like-1', channel: 'personal' } };
    const screen = render(<NotificationScreen route={route} onOpenAction={onOpenAction} />);

    await waitFor(() => expect(onOpenAction).toHaveBeenCalledTimes(1));
    expect(mockCenter.resolveNotification).toHaveBeenCalledTimes(1);
    expect(mockCenter.resolveNotification).toHaveBeenCalledWith('like-1', 'personal');
    expect(mockCenter.setRead).not.toHaveBeenCalled();

    screen.rerender(<NotificationScreen route={route} onOpenAction={onOpenAction} />);
    await waitFor(() => expect(mockCenter.resolveNotification).toHaveBeenCalledTimes(1));
  });

  it('does not open a stale cold-start target after newer push params win', async () => {
    let finishFirstAvailability;
    mockResolveTargetAvailability
      .mockReturnValueOnce(new Promise((resolve) => { finishFirstAvailability = resolve; }))
      .mockResolvedValueOnce({ available: true, reason: 'active' });
    mockCenter.resolveNotification.mockImplementation((notificationId) => Promise.resolve(
      notificationId === 'like-1' ? personalLike : personalComment
    ));
    const onOpenAction = jest.fn();
    const screen = render(
      <NotificationScreen
        route={{ params: { notificationId: 'like-1', channel: 'personal' } }}
        onOpenAction={onOpenAction}
      />
    );
    await waitFor(() => expect(mockResolveTargetAvailability).toHaveBeenCalledTimes(1));

    screen.rerender(
      <NotificationScreen
        route={{ params: { notificationId: 'comment-1', channel: 'personal' } }}
        onOpenAction={onOpenAction}
      />
    );
    await waitFor(() => expect(onOpenAction).toHaveBeenCalledTimes(1));
    expect(onOpenAction.mock.calls[0][0]).toEqual({
      type: 'navigate',
      routeName: 'RecommendationDetail',
      params: { postId: 'post-1', openComments: true, commentId: 'comment-doc-1' },
    });

    await act(async () => {
      finishFirstAvailability({ available: true, reason: 'active' });
      await Promise.resolve();
    });
    expect(onOpenAction).toHaveBeenCalledTimes(1);
  });

  it('shows contextual missing content instead of navigating arbitrary push data', async () => {
    const screen = render(
      <NotificationScreen route={{ params: { notificationId: 'missing', channel: 'personal' } }} />
    );

    await waitFor(() => expect(screen.getByText('התוכן כבר לא זמין')).toBeTruthy());
    expect(mockNavigation.navigate).not.toHaveBeenCalledWith(expect.any(String), expect.anything());
  });

  it('renders loading, retryable error, and empty states', () => {
    mockCenter.channels.personal = { ...channelState([]), loading: true, loaded: false };
    const screen = render(<NotificationScreen />);
    expect(screen.getByTestId('notifications-loading-state')).toBeTruthy();

    mockCenter.channels.personal = { ...channelState([]), error: 'בעיה זמנית' };
    screen.rerender(<NotificationScreen />);
    expect(screen.getByTestId('notifications-error-state')).toBeTruthy();
    fireEvent.press(screen.getByTestId('notifications-retry'));
    expect(mockCenter.retry).toHaveBeenCalledWith('personal');

    mockCenter.channels.personal = channelState([]);
    screen.rerender(<NotificationScreen />);
    expect(screen.getByTestId('notifications-empty-state')).toBeTruthy();
  });
});
