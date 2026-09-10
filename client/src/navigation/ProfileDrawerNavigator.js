import React, { useMemo } from 'react';
import { createNavigatorFactory, DrawerRouter, useNavigationBuilder } from '@react-navigation/native';
import { DrawerView } from '@react-navigation/drawer';

// Drawer 7.7 emits completion events to the navigator key, not a screen key.
// Observe that public emitter at the DrawerView boundary; screen listeners
// cannot receive those events. Preserve its normal delivery and return value.
export function observeDrawerTransitions(navigation, drawerKey, onTransition) {
  return {
    ...navigation,
    emit(event) {
      const result = navigation.emit(event);
      if (event.target === drawerKey
        && (event.type === 'transitionStart' || event.type === 'transitionEnd')) {
        onTransition(event);
      }
      return result;
    },
  };
}

function ProfileDrawerNavigator({ id, children, screenOptions, drawerContent, onTransition }) {
  const { state, descriptors, navigation, NavigationContent } = useNavigationBuilder(DrawerRouter, {
    id, children, screenOptions, defaultStatus: 'closed',
  });
  const observedNavigation = useMemo(
    () => observeDrawerTransitions(navigation, state.key, onTransition),
    [navigation, state.key, onTransition]
  );
  return (
    <NavigationContent>
      <DrawerView
        state={state}
        descriptors={descriptors}
        navigation={observedNavigation}
        drawerContent={drawerContent}
        defaultStatus="closed"
      />
    </NavigationContent>
  );
}

export const createProfileDrawerNavigator = createNavigatorFactory(ProfileDrawerNavigator);
