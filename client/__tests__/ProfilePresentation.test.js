import { fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

import ProfileBioModal from '../src/features/profile/components/ProfileBioModal';
import ProfileHeader from '../src/features/profile/components/ProfileHeader';
import ProfilePreferencesSignature from '../src/features/profile/components/ProfilePreferencesSignature';
import ProfileStatsCard from '../src/features/profile/components/ProfileStatsCard';
import { createProfileStyles } from '../src/features/profile/components/profileStyles';

jest.mock('@expo/vector-icons', () => ({
  MaterialIcons: ({ name }) => {
    const ReactRuntime = jest.requireActual('react');
    const ReactNative = jest.requireActual('react-native');
    return ReactRuntime.createElement(ReactNative.Text, null, name);
  },
}));

const styles = createProfileStyles({}, 390);

describe('profile presentation', () => {
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

  it('shows the preference signature and owner empty-state CTA', () => {
    const withPreferences = render(
      <ProfilePreferencesSignature
        smartProfile={{ interests: ['food', 'hiking', 'culture_history'], vibe: ['relaxed'] }}
        isOwner={false}
        styles={styles}
      />
    );
    expect(withPreferences.getByText('אוכל וקולינריה')).toBeTruthy();
    expect(withPreferences.getByText('מסלולי הליכה')).toBeTruthy();
    expect(withPreferences.getByText('תרבות והיסטוריה')).toBeTruthy();
    expect(withPreferences.getByText('רגועה')).toBeTruthy();

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
    fireEvent.press(screen.getByText('שמירה'));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('חדשה'));
  });
});
