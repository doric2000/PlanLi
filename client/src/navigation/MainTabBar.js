import React, { useEffect, useState } from 'react';
import { Keyboard, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from '../components/AppText';
import CachedImage from '../components/CachedImage';
import SwipeableTabBarButton from './SwipeableTabBarButton';
import { shouldHideMainTabBar } from './tabBarVisibility';
import { tabConfigs } from './TabConfigs';
import { NOYA_MAIN_TAB_TARGETS, NOYA_MAIN_TARGETS } from '../features/noya/NoyaTourDefinitions';
import { mainNavigationStyles as styles, navigationPalette as c } from '../styles/mainNavigationStyles';

export default function MainTabBar({ state, navigation, user, unreadCount = 0, onSwipe }) {
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible?.() || false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (keyboardVisible || shouldHideMainTabBar(state.routes[state.index]?.name)) return null;

  // Physical left-to-right slots; Create is an action, never a navigator route.
  const slots = [...state.routes.slice(0, 2), { key: 'create', name: 'Create' }, ...state.routes.slice(2)];
  return (
    <View style={[styles.bar, { bottom: Math.max(insets.bottom, 10) }]} testID="main-tab-bar">
      {slots.map((route) => {
        const isCreate = route.name === 'Create';
        const focused = !isCreate && state.routes[state.index].key === route.key;
        const config = tabConfigs[route.name];
        const showUnreadBadge = route.name === 'Profile' && unreadCount > 0;
        const unreadLabel = unreadCount === 1 ? 'התראה אחת שלא נקראה' : `${unreadCount} התראות שלא נקראו`;
        return (
          <SwipeableTabBarButton
            key={route.key}
            testID={isCreate ? 'main-create-button' : `main-tab-${route.name.toLowerCase()}`}
            role={isCreate ? 'button' : 'tab'}
            accessibilityRole={isCreate ? 'button' : 'tab'}
            accessibilityLabel={isCreate ? 'יצירה' : showUnreadBadge ? `${config.label}, ${unreadLabel}` : config.label}
            accessibilityState={isCreate ? {} : { selected: focused }}
            aria-selected={isCreate ? undefined : focused}
            accessibilityHint={isCreate ? 'פתיחת תפריט תכנון ופרסום' : undefined}
            tourTargetId={isCreate ? NOYA_MAIN_TARGETS.communityAdd : NOYA_MAIN_TAB_TARGETS[route.name]}
            onSwipe={(gesture) => onSwipe?.(navigation, gesture)}
            onPress={() => {
              if (isCreate) { navigation.navigate('CreateMenu'); return; }
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            onLongPress={isCreate ? undefined : () => navigation.emit({ type: 'tabLongPress', target: route.key })}
            style={[styles.slot, focused && styles.selected]}
          >
            {isCreate ? (
              <View style={styles.create}><Ionicons name="add" size={28} color={c.navy} /></View>
            ) : (
              <>
                <View style={styles.icon}>
                  {route.name === 'Profile' && user?.photoURL ? (
                    <CachedImage source={{ uri: user.photoURL }} style={styles.avatar} contentFit="cover" />
                  ) : (
                    <Ionicons name={focused ? config.icon : `${config.icon}-outline`} size={22} color={c.navy} />
                  )}
                  {showUnreadBadge && (
                    <View style={styles.unread} pointerEvents="none" testID="profile-unread-badge">
                      <AppText style={styles.unreadText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </AppText>
                    </View>
                  )}
                </View>
                <AppText style={styles.label} numberOfLines={1} maxFontSizeMultiplier={1.2}>{config.label}</AppText>
              </>
            )}
          </SwipeableTabBarButton>
        );
      })}
    </View>
  );
}
