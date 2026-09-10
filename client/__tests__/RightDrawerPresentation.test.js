import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

import { CustomDrawerContent, DrawerIdentity, getDrawerWidth } from '../src/navigation/RightDrawerNavigator';

import useDrawerCloseAction from '../src/navigation/useDrawerCloseAction';
import { observeDrawerTransitions } from '../src/navigation/ProfileDrawerNavigator';
import { openAuthFlow } from '../src/navigation/authNavigation';
import { signOutCentral } from '../src/services/AuthService';

let mockAuthUser = { isGuest: true };
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@react-navigation/drawer', () => {
  const ReactRuntime = require('react');
  const { View } = require('react-native');
  return {
    getDrawerStatusFromState: (state) => state.history.find((item) => item.type === 'drawer')?.status || 'closed',
    createDrawerNavigator: () => ({
      Navigator: (props) => ReactRuntime.createElement(View, props),
      Screen: (props) => ReactRuntime.createElement(View, props),
    }),
    DrawerContentScrollView: (props) => ReactRuntime.createElement(View, props),
  };
});

jest.mock('@expo/vector-icons', () => {
  const ReactRuntime = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, ...props }) => ReactRuntime.createElement(Text, props, name),
    MaterialIcons: ({ name, ...props }) => ReactRuntime.createElement(Text, props, name),
  };
});

jest.mock('expo-linear-gradient', () => {
  const ReactRuntime = require('react');
  const { View } = require('react-native');
  return { LinearGradient: (props) => ReactRuntime.createElement(View, props) };
});

jest.mock('../src/navigation/TabNavigator', () => () => null);
jest.mock('../src/services/AuthService', () => ({ signOutCentral: jest.fn() }));
jest.mock('../src/navigation/authNavigation', () => ({ openAuthFlow: jest.fn() }));
jest.mock('../src/features/notifications/hooks/useUnreadCount', () => ({ useUnreadCount: () => 0 }));
jest.mock('../src/hooks/useAuthUser', () => ({ useAuthUser: () => mockAuthUser }));
jest.mock('../src/hooks/useAdminClaim', () => ({ useAdminClaim: () => ({ isAdmin: true }) }));

describe('right drawer presentation', () => {
  it('keeps the drawer responsive between its mobile and wide caps', () => {
    expect(getDrawerWidth(320)).toBe(288);
    expect(getDrawerWidth(390)).toBeCloseTo(343.2);
    expect(getDrawerWidth(1200)).toBe(380);
  });

  it('prefers the private profile document for the signed-in identity', () => {
    const screen = render(
      <DrawerIdentity
        isGuest={false}
        user={{ displayName: 'שם Auth', email: 'traveler@example.com' }}
        userDocument={{ displayName: 'שם פרופיל' }}
      />
    );

    expect(screen.getByText('שם פרופיל')).toBeTruthy();
    expect(screen.getByText('traveler@example.com')).toBeTruthy();
  });

  it('shows a branded guest message without account data', () => {
    const screen = render(<DrawerIdentity isGuest user={null} userDocument={null} />);

    expect(screen.getByText('הטיול הבא מתחיל כאן')).toBeTruthy();
    expect(screen.getByText('מתחברים ושומרים את כל התוכניות במקום אחד')).toBeTruthy();
  });
});


describe('drawer transition handoff', () => {
  let state, nav, root, observed, events, queue;
  function Harness() {
    queue = useDrawerCloseAction(mockAuthUser.user?.uid + ':' + mockAuthUser.isGuest);
    observed = observeDrawerTransitions(nav, state.key, queue.onTransition);
    return <CustomDrawerContent navigation={observed} runAfterClose={queue.runAfterClose} />;
  }
  function event(type = 'transitionEnd', closing = true, target = 'drawer') {
    act(() => observed.emit({ type, target, data: { closing } }));
  }
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthUser = { isGuest: false, user: { uid: 'a' } };
    state = { key: 'drawer', history: [{ type: 'drawer', status: 'open' }] };
    events = [];
    root = { navigate: jest.fn(() => events.push('navigate')), reset: jest.fn() };
    nav = {
      getState: () => state,
      getParent: () => root,
      navigate: jest.fn(() => events.push('navigate')),
      emit: jest.fn((e) => { events.push(e.type); return e; }),
      closeDrawer: jest.fn(() => { events.push('close'); state.history = []; }),
    };
  });
  it.each([['editProfile', 'EditProfile'], ['settings', 'Settings'], ['notifications', 'Notifications'], ['adminPanel', 'AdminPanel']])('opens %s only after the actual drawer-key closing event', (key, destination) => {
    const s = render(<Harness />);
    fireEvent.press(s.getByTestId('drawer-menu-item-' + key));
    expect(root.navigate).not.toHaveBeenCalled();
    expect(nav.closeDrawer).toHaveBeenCalledTimes(1);
    event('transitionEnd', true, 'parent-stack');
    expect(root.navigate).not.toHaveBeenCalled();
    event();
    expect(root.navigate).toHaveBeenCalledTimes(1); expect(root.navigate).toHaveBeenCalledWith(destination);
    expect(events.at(-2)).toBe('transitionEnd');
    expect(events.at(-1)).toBe('navigate');
  });
  it('keeps the first selection and consumes completion only once', () => {
    const s = render(<Harness />);
    fireEvent.press(s.getByTestId('drawer-menu-item-settings'));
    fireEvent.press(s.getByTestId('drawer-menu-item-editProfile'));
    event(); event();
    expect(root.navigate).toHaveBeenCalledTimes(1); expect(root.navigate).toHaveBeenCalledWith('Settings');
    expect(nav.closeDrawer).toHaveBeenCalledTimes(1);
  });
  it('does not treat the already-queued opening completion as a closing completion', () => {
    const s = render(<Harness />);
    fireEvent.press(s.getByTestId('drawer-menu-item-settings'));
    event('transitionEnd', false);
    expect(root.navigate).not.toHaveBeenCalled();
    event();
    expect(root.navigate).toHaveBeenCalledTimes(1); expect(root.navigate).toHaveBeenCalledWith('Settings');
  });
  it('cancels the destination when closing is interrupted by reopening', () => {
    const s = render(<Harness />);
    fireEvent.press(s.getByTestId('drawer-menu-item-settings'));
    state.history = [{ type: 'drawer', status: 'open' }];
    event('transitionStart', false); event('transitionEnd', false);
    state.history = []; event();
    expect(root.navigate).not.toHaveBeenCalled();
    fireEvent.press(s.getByTestId('drawer-menu-item-notifications'));
    expect(root.navigate).toHaveBeenCalledTimes(1); expect(root.navigate).toHaveBeenCalledWith('Notifications');
  });
  it('runs immediately when already closed, but waits when a close is still animating', () => {
    state.history = [];
    const s = render(<Harness />);
    fireEvent.press(s.getByTestId('drawer-menu-item-settings'));
    expect(root.navigate).toHaveBeenCalledTimes(1);
    event('transitionStart');
    fireEvent.press(s.getByTestId('drawer-menu-item-notifications'));
    expect(root.navigate).toHaveBeenCalledTimes(1);
    event();
    expect(root.navigate).toHaveBeenCalledTimes(2);
  });
  it('clears pending navigation on account changes and unmount', () => {
    const s = render(<Harness />);
    fireEvent.press(s.getByTestId('drawer-menu-item-settings'));
    mockAuthUser = { isGuest: false, user: { uid: 'b' } };
    s.rerender(<Harness />); event();
    expect(root.navigate).not.toHaveBeenCalled();
    state.history = [{ type: 'drawer', status: 'open' }];
    fireEvent.press(s.getByTestId('drawer-menu-item-settings'));
    s.unmount(); event();
    expect(root.navigate).not.toHaveBeenCalled();
  });
  it('opens support through the Profile tab after closing', () => {
    const s = render(<Harness />);
    fireEvent.press(s.getByTestId('drawer-menu-item-support'));
    expect(nav.navigate).not.toHaveBeenCalled();
    event();
    expect(nav.navigate).toHaveBeenCalledWith('Tabs', { screen: 'Profile', params: { openSupport: true } });
  });
  it('keeps guest authentication and sign-out actions behind closing too', async () => {
    mockAuthUser = { isGuest: true };
    const s = render(<Harness />);
    fireEvent.press(s.getByTestId('drawer-menu-item-register'));
    expect(openAuthFlow).not.toHaveBeenCalled(); event();
    expect(openAuthFlow).toHaveBeenCalledWith(root, 'Register');
    mockAuthUser = { isGuest: false, user: { uid: 'a' } };
    s.rerender(<Harness />);
    state.history = [{ type: 'drawer', status: 'open' }];
    fireEvent.press(s.getByTestId('drawer-sign-out-button'));
    expect(signOutCentral).not.toHaveBeenCalled();
    await act(async () => { observed.emit({ type: 'transitionEnd', target: 'drawer', data: { closing: true } }); });
    expect(signOutCentral).toHaveBeenCalledTimes(1);
    expect(root.reset).toHaveBeenCalledWith({ index: 0, routes: [{ name: 'Main' }] });
  });
  it('preserves the original emitter result and leaves unrelated events untouched', () => {
    render(<Harness />);
    const e = { type: 'state', target: 'drawer', data: { state } };
    expect(observed.emit(e)).toBe(e);
    expect(nav.emit).toHaveBeenCalledWith(e);
  });
});
