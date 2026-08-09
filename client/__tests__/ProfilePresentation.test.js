import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';

import ProfileBioModal from '../src/features/profile/components/ProfileBioModal';
import ProfileHeader from '../src/features/profile/components/ProfileHeader';
import ProfilePreferencesSignature from '../src/features/profile/components/ProfilePreferencesSignature';
import ProfileStatsCard from '../src/features/profile/components/ProfileStatsCard';
import { createProfileStyles } from '../src/features/profile/components/profileStyles';
import { getPreferencePresentation } from '../src/constants/travelPresentation';

jest.mock('@expo/vector-icons', () => ({
  MaterialIcons: ({ name }) => {
    const ReactRuntime = jest.requireActual('react');
    const ReactNative = jest.requireActual('react-native');
    return ReactRuntime.createElement(ReactNative.Text, null, name);
  },
}));

const styles = createProfileStyles({}, 390);

describe('profile presentation', () => {
  it('keeps typography across the shared profile below bold weights', () => {
    Object.entries(styles)
      .filter(([, style]) => style.fontWeight != null)
      .forEach(([, textStyle]) => {
        expect(Number(textStyle.fontWeight)).toBeLessThanOrEqual(600);
      });
  });

  it('always renders the three activity metrics without legacy rating fields', () => {
    const screen = render(
      <ProfileStatsCard
        stats={{ recommendations: 0, routes: 2, likesReceived: 4 }}
        loading={false}
        styles={styles}
      />
    );

    expect(screen.getByText('המלצות')).toBeTruthy();
    expect(screen.getByText('מסלולים')).toBeTruthy();
    expect(screen.getByText('לייקים')).toBeTruthy();
    expect(screen.getByText('0')).toBeTruthy();
    expect(screen.queryByText(/rating|דירוג|כוכב/i)).toBeNull();
  });

  it('uses the same travel-taste presentation for owner and public profiles', () => {
    const smartProfile = {
      interests: ['food', 'hiking', 'culture_history'],
      vibe: ['relaxed'],
    };
    const publicProfile = render(
      <ProfilePreferencesSignature
        smartProfile={smartProfile}
        isOwner={false}
        styles={styles}
      />
    );
    const ownerProfile = render(
      <ProfilePreferencesSignature
        smartProfile={smartProfile}
        isOwner
        onEdit={jest.fn()}
        styles={styles}
      />
    );

    ['אוכל וקולינריה', 'מסלולי הליכה', 'תרבות והיסטוריה', 'רגוע'].forEach((label) => {
      expect(publicProfile.getByText(label)).toBeTruthy();
      expect(ownerProfile.getByText(label)).toBeTruthy();
    });
    expect(publicProfile.getByText('תחומי עניין')).toBeTruthy();
    expect(publicProfile.getByText('סגנון')).toBeTruthy();
    expect(ownerProfile.getByText('תחומי עניין')).toBeTruthy();
    expect(ownerProfile.getByText('סגנון')).toBeTruthy();
    expect(publicProfile.queryByText('הדברים שהופכים טיול למדויק בשבילי')).toBeNull();
    expect(ownerProfile.queryByText('הדברים שהופכים טיול למדויק בשבילי')).toBeNull();
    expect(publicProfile.queryByLabelText('עריכת העדפות הטיול')).toBeNull();
    expect(ownerProfile.getByLabelText('עריכת העדפות הטיול')).toBeTruthy();

    const publicChipStyle = StyleSheet.flatten(publicProfile.getByTestId('profile-preference-interest-food').props.style);
    const ownerChipStyle = StyleSheet.flatten(ownerProfile.getByTestId('profile-preference-interest-food').props.style);
    expect(ownerChipStyle).toEqual(publicChipStyle);
    expect(publicChipStyle).toMatchObject({
      minHeight: 36,
      backgroundColor: '#FFFFFF',
      borderColor: '#DCE2EA',
    });
  });

  it.each([
    ['relaxed', 'רגוע'],
    ['romantic', 'רומנטי'],
    ['adventurous', 'הרפתקני'],
    ['cultural', 'תרבותי'],
    ['social', 'חברתי'],
    ['local', 'מקומי ואותנטי'],
    ['lively', 'תוסס'],
    ['quiet_secluded', 'שקט ומבודד'],
  ])('uses a stable masculine-singular profile label for the %s vibe', (vibe, label) => {
    expect(getPreferencePresentation('vibe', vibe).label).toBe(label);
  });

  it('shows an owner-only empty-state CTA for missing preferences', () => {
    const publicEmpty = render(
      <ProfilePreferencesSignature
        smartProfile={{ interests: [], vibe: [] }}
        isOwner={false}
        styles={styles}
      />
    );
    expect(publicEmpty.queryByTestId('profile-preferences-signature')).toBeNull();

    const empty = render(
      <ProfilePreferencesSignature
        smartProfile={{ interests: [], vibe: [] }}
        isOwner
        onEdit={jest.fn()}
        styles={styles}
      />
    );
    expect(empty.getByText('להגדרת העדפות')).toBeTruthy();
  });

  it('keeps public identity focused on the bio and hides email', () => {
    const screen = render(
      <ProfileHeader
        userData={{
          displayName: 'Dana',
          email: 'private@example.com',
          bio: 'ים, קפה וטיולים',
          photoURL: null,
          photoMedia: null,
          smartProfile: { interests: [], vibe: [] },
          isExpert: false,
        }}
        stats={{
          recommendations: 3,
          routes: 1,
          likesReceived: 2,
          standing: { label: 'בתחילת הדרך', color: '#64748B', icon: 'explore' },
          dominantCategory: null,
        }}
        statsLoading={false}
        heroMedia={[]}
        isOwner={false}
        styles={styles}
        width={390}
      />
    );

    expect(screen.getByText('Dana')).toBeTruthy();
    expect(screen.getByText('ים, קפה וטיולים')).toBeTruthy();
    expect(screen.queryByText('private@example.com')).toBeNull();
  });

  it('saves a valid bio and exposes the public visibility note', async () => {
    const onSave = jest.fn().mockResolvedValue({ bio: 'חדשה' });
    const screen = render(
      <ProfileBioModal
        visible
        initialValue="ישנה"
        onClose={jest.fn()}
        onSave={onSave}
        styles={styles}
      />
    );

    expect(screen.getByText(/גלוי לקהילת PlanLi/)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('משפט פרופיל'), 'חדשה');
    expect(screen.getByText('4/160')).toBeTruthy();
    fireEvent.press(screen.getByText('שמירה'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('חדשה'));
  });
});
