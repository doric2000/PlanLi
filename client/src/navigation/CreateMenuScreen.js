import React, { useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppText from '../components/AppText';
import { useAuthUser } from '../hooks/useAuthUser';
import { CAPABILITIES } from '../constants/authPolicy';
import { mainNavigationStyles as styles, navigationPalette as c } from '../styles/mainNavigationStyles';

const ACTIONS = [
  { id: 'trip', title: 'תכנון טיול', description: 'שלבו המלצות ועצירות משלכם · נשמר פרטי', icon: 'location-outline', comingSoon: true },
  { id: 'recommendation', title: 'פרסום המלצה', description: 'מקום שאהבת ושווה להכיר', icon: 'people-outline', screen: 'AddRecommendation' },
  { id: 'route', title: 'פרסום מסלול', description: 'מסלול שהקהילה תוכל לגלות', icon: 'map-outline', screen: 'AddRoutesScreen' },
];

export default function CreateMenuScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { ensureCapability } = useAuthUser();
  const opening = useRef(false);
  const open = async (action) => {
    if (action.comingSoon || opening.current) return;
    opening.current = true;
    // This is a JS stack sheet, so it can close before the native auth gate opens.
    navigation.goBack();
    if (await ensureCapability(CAPABILITIES.ACTIVE, { name: action.screen })) {
      navigation.navigate(action.screen);
    }
  };
  return (
    <View style={styles.sheetScreen} testID="create-menu">
      <Pressable style={styles.backdrop} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="סגירת תפריט היצירה" />
      <ScrollView style={styles.sheet} contentContainerStyle={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 20) }]} bounces={false} accessibilityViewIsModal>
        <View style={styles.handle} />
        <View style={styles.sheetHeader}>
          <View style={styles.copy}>
            <AppText accessibilityRole="header" style={styles.title}>מה ניצור היום?</AppText>
            <AppText style={styles.description}>טיול בשבילכם, המלצה או מסלול לקהילה</AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="סגירה" testID="create-menu-close" style={styles.close} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={22} color={c.navy} />
          </Pressable>
        </View>
        {ACTIONS.map((action) => (
          <Pressable
            key={action.id} testID={`create-${action.id}`}
            accessibilityRole="button"
            accessibilityLabel={action.comingSoon ? `${action.title}, בקרוב` : action.title}
            accessibilityHint={action.description}
            accessibilityState={{ disabled: Boolean(action.comingSoon) }}
            disabled={action.comingSoon}
            onPress={() => open(action)}
            style={({ pressed }) => [styles.action, action.comingSoon && styles.planAction, pressed && styles.pressed]}
          >
            <View style={[styles.actionIcon, action.comingSoon && styles.planIcon]}><Ionicons name={action.icon} size={22} color={c.navy} /></View>
            <View style={styles.copy}>
              <AppText style={styles.actionTitle}>{action.title}</AppText>
              <AppText style={styles.description}>{action.description}</AppText>
            </View>
            {action.comingSoon ? <AppText style={styles.soon}>בקרוב</AppText> : <Ionicons name="arrow-back" size={20} color={c.navy} />}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
