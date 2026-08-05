import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { colors } from '../../../styles';
import { useTabPressScrollOrRefresh } from '../../../hooks/useTabPressScrollOrRefresh';
import ProfileBioModal from './ProfileBioModal';
import {
  ProfileContentHeader,
  ProfileContentEmpty,
  ProfileGridTile,
} from './ProfileContentGrid';
import ProfileHeader from './ProfileHeader';
import { createProfileStyles } from './profileStyles';
import { selectProfileHeroMedia } from '../utils/profileMetrics';

export default function ProfileView({
  navigation,
  userData,
  stats,
  statsLoading,
  recommendations = [],
  routes = [],
  contentLoading,
  isOwner,
  onPickImage,
  uploading,
  onEditSmartProfile,
  onSaveBio,
  onMenuPress,
  onBackPress,
  onRefresh,
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createProfileStyles(insets, width), [insets, width]);
  const [contentTab, setContentTab] = useState('recommendations');
  const [bioModalVisible, setBioModalVisible] = useState(false);
  const profileListRef = useRef(null);
  const activeData = contentTab === 'recommendations' ? recommendations : routes;
  const heroMedia = useMemo(
    () => selectProfileHeroMedia(recommendations, routes),
    [recommendations, routes]
  );

  useEffect(() => {
    profileListRef.current?.scrollToOffset?.({ offset: 0, animated: false });
  }, [contentTab]);

  const { onScroll } = useTabPressScrollOrRefresh({
    variant: 'flatlist',
    scrollRef: profileListRef,
    onRefresh,
    enabled: !contentLoading,
    scrollYResetKey: contentTab,
  });

  const title = isOwner
    ? 'התוכן שלי'
    : `התוכן של ${userData?.displayName || 'המטייל/ת'}`;

  return (
    <SafeAreaView style={styles.screen}>
      {isOwner && typeof onMenuPress === 'function' ? (
        <Pressable
          style={[styles.topAction, styles.topActionEnd]}
          onPress={onMenuPress}
          accessibilityRole="button"
          accessibilityLabel="פתיחת תפריט פרופיל"
        >
          <MaterialIcons name="menu" size={24} color={colors.textPrimary} />
        </Pressable>
      ) : null}
      {!isOwner && typeof onBackPress === 'function' ? (
        <Pressable
          style={[styles.topAction, styles.topActionStart]}
          onPress={onBackPress}
          accessibilityRole="button"
          accessibilityLabel="חזרה"
        >
          <MaterialIcons name="arrow-back" size={23} color={colors.textPrimary} />
        </Pressable>
      ) : null}

      <FlatList
        ref={profileListRef}
        data={activeData}
        keyExtractor={(item, index) => String(item?.id || `${contentTab}-${index}`)}
        extraData={contentTab}
        numColumns={3}
        initialNumToRender={6}
        maxToRenderPerBatch={9}
        windowSize={7}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.listContent}
        ListHeaderComponentStyle={styles.headerBlock}
        onScroll={onScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={(
          <View style={styles.headerBlock}>
            <ProfileHeader
              userData={userData}
              stats={stats}
              statsLoading={statsLoading}
              heroMedia={heroMedia}
              isOwner={isOwner}
              onPickImage={onPickImage}
              uploading={uploading}
              onEditBio={isOwner && typeof onSaveBio === 'function'
                ? () => setBioModalVisible(true)
                : undefined}
              onEditSmartProfile={onEditSmartProfile}
              styles={styles}
              width={width}
            />
            <ProfileContentHeader
              styles={styles}
              contentTab={contentTab}
              onChangeTab={setContentTab}
              contentLoading={contentLoading}
              recommendationsCount={stats?.recommendations ?? 0}
              routesCount={stats?.routes ?? 0}
              title={title}
            />
          </View>
        )}
        renderItem={({ item }) => (
          <ProfileGridTile
            item={item}
            contentTab={contentTab}
            contentLoading={contentLoading}
            navigation={navigation}
            styles={styles}
          />
        )}
        ListEmptyComponent={!contentLoading ? (
          <ProfileContentEmpty
            contentTab={contentTab}
            styles={styles}
            ownerLabel={userData?.displayName || 'הפרופיל'}
          />
        ) : null}
      />

      {isOwner && typeof onSaveBio === 'function' ? (
        <ProfileBioModal
          visible={bioModalVisible}
          initialValue={userData?.bio}
          onClose={() => setBioModalVisible(false)}
          onSave={onSaveBio}
          styles={styles}
        />
      ) : null}
    </SafeAreaView>
  );
}
