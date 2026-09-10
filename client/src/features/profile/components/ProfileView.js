import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { getContentGridColumns } from '../../../components/ContentTile';
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
import ReportButton from '../../moderation/components/ReportButton';
import { CenteredRefreshControl, CenteredRefreshState } from '../../../components/CenteredRefresh';
import EmptyState from '../../../components/EmptyState';
import AppText from '../../../components/AppText';
import { Ionicons } from '@expo/vector-icons';
import { createRefreshedProfileStyles } from '../../../styles/profileRefresh';

export default function ProfileView({
  navigation,
  userData,
  stats,
  statsLoading,
  recommendations = [],
  routes = [],
  pendingContent = [],
  pendingError = null,
  contentLoading,
  contentError,
  isOwner,
  onPickImage,
  uploading,
  onEditSmartProfile,
  onSaveBio,
  onMenuPress,
  onBackPress,
  onRefresh,
  refreshing = false,
  confirming = false,
  profileUid,
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const gridColumns = getContentGridColumns(width);
  const styles = useMemo(() => {
    const classic = createProfileStyles(insets, width, gridColumns);
    return createRefreshedProfileStyles(classic, width, gridColumns);
  }, [insets, width, gridColumns]);
  const [contentTab, setContentTab] = useState('recommendations');
  const [bioModalVisible, setBioModalVisible] = useState(false);
  const profileListRef = useRef(null);
  const activeData = contentTab === 'recommendations'
    ? recommendations
    : contentTab === 'routes'
      ? routes
      : pendingContent;
  const activeContentError = contentTab === 'pending' ? pendingError : contentError;
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
      <View style={styles.toolbar} testID="profile-refresh-toolbar">
        {typeof (isOwner ? onMenuPress : onBackPress) === 'function' ? (
          <Pressable style={styles.toolbarAction} onPress={isOwner ? onMenuPress : onBackPress} accessibilityRole="button" accessibilityLabel={isOwner ? 'פתיחת תפריט פרופיל' : 'חזרה'}>
            <Ionicons name={isOwner ? 'menu-outline' : 'arrow-forward-outline'} size={26} color={colors.white} />
          </Pressable>
        ) : null}
        <AppText style={styles.toolbarTitle} numberOfLines={1}>{isOwner ? 'הפרופיל שלי' : 'פרופיל המטייל/ת'}</AppText>
        {!isOwner && profileUid ? <ReportButton target={{ type: 'profile', id: profileUid }} ownerId={profileUid} compact color={colors.white} subjectLabel="פרופיל" /> : null}
      </View>

      <FlatList
        style={styles.list}
        key={`profile-${contentTab}-${gridColumns}`}
        ref={profileListRef}
        data={contentLoading || refreshing || confirming ? [] : activeData}
        keyExtractor={(item, index) => String(item?.id || `${contentTab}-${index}`)}
        extraData={contentTab}
        numColumns={gridColumns}
        initialNumToRender={6}
        maxToRenderPerBatch={9}
        windowSize={7}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.listContent}
        ListHeaderComponentStyle={styles.headerBlock}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={<CenteredRefreshControl
          refreshing={refreshing || confirming}
          onRefresh={onRefresh}
        />}
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
              refreshed
            />
            <ProfileContentHeader
              styles={styles}
              contentTab={contentTab}
              onChangeTab={setContentTab}
              contentLoading={contentLoading}
              recommendationsCount={stats?.recommendations ?? 0}
              routesCount={stats?.routes ?? 0}
              pendingCount={pendingContent.length}
              showPending={isOwner}
              title={title}
              compact
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
        ListEmptyComponent={contentLoading || refreshing || confirming ? (
          <CenteredRefreshState
            accessibilityLabel={confirming ? 'הפרופיל מעודכן' : refreshing ? 'מרענן פרופיל' : 'טוען תוכן פרופיל'}
            confirming={confirming}
            style={styles.refreshBody}
            testID={confirming ? 'profile-refresh-confirmation' : refreshing ? 'profile-refresh-state' : 'profile-content-loading-state'}
          />
        ) : activeContentError ? (
          <View style={styles.refreshBody} testID="profile-content-error-state">
            <EmptyState
              icon="cloud-off"
              title="לא הצלחנו לעדכן את הפרופיל"
              message="אפשר למשוך שוב מטה ולנסות מחדש."
            />
          </View>
        ) : (
          <ProfileContentEmpty
            contentTab={contentTab}
            styles={styles}
            ownerLabel={userData?.displayName || 'הפרופיל'}
          />
        )}
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
