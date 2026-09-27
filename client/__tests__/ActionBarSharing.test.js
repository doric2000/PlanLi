import React from 'react';
import { Pressable, Share } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ActionBar from '../src/components/ActionBar';

const mockEnsureCapability = jest.fn().mockResolvedValue(true);
const mockToggleLike = jest.fn();
jest.mock('../src/features/community/hooks/useLikes', () => ({ useLikes: () => ({ isLiked: false, likeCount: 9999, toggleLike: mockToggleLike }) }));
jest.mock('../src/features/community/hooks/useCommentsCount', () => ({ useCommentsCount: () => 12345 }));
jest.mock('../src/hooks/useAuthUser', () => ({ useAuthUser: () => ({ ensureCapability: mockEnsureCapability }) }));
jest.mock('../src/components/LikesModal', () => () => null);
jest.mock('../src/features/tripPlanner/components/AddToTripModal', () => () => null);
jest.mock('@expo/vector-icons', () => ({ Ionicons: ({ name }) => {
  const { Text } = require('react-native');
  return <Text>{name}</Text>;
} }));

beforeEach(() => { jest.clearAllMocks(); jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction }); });
afterEach(() => jest.restoreAllMocks());

it.each([['recommendations', 'recommendation', 'ההמלצה'], ['routes', 'route', 'המסלול']])(
  'shares %s without triggering the card or its other actions', async (collectionName, kind, label) => {
    const openCard = jest.fn();
    const onCommentPress = jest.fn();
    const screen = render(<Pressable onPress={openCard}>
      <ActionBar compact collectionName={collectionName} item={{ id: 'content-1', title: 'טיול', status: 'active' }} onCommentPress={onCommentPress} />
    </Pressable>);
    const stopPropagation = jest.fn();
    fireEvent.press(screen.getByLabelText(`שיתוף ${label}`), { stopPropagation });
    await waitFor(() => expect(Share.share).toHaveBeenCalledWith({ title: 'טיול', message: `טיול\nhttps://planli.cc/${kind}/content-1` }));
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(openCard).not.toHaveBeenCalled();
    expect(mockEnsureCapability).not.toHaveBeenCalled();
    expect(mockToggleLike).not.toHaveBeenCalled();
    expect(onCommentPress).not.toHaveBeenCalled();
    expect(screen.queryByText('שיתוף')).toBeNull();
    expect(screen.getByText('10K')).toBeTruthy();
    expect(screen.getByText('12K')).toBeTruthy();
    expect(screen.getByLabelText('9999 לייקים, הצגת הרשימה')).toBeTruthy();
    expect(Boolean(screen.queryByTestId('recommendation-action-add-to-trip'))).toBe(kind === 'recommendation');
    fireEvent.press(screen.getByLabelText('12345 תגובות'));
    expect(onCommentPress).toHaveBeenCalledWith('content-1');
    fireEvent.press(screen.getByLabelText('הוספת לייק'));
    expect(mockToggleLike).toHaveBeenCalledTimes(1);
    if (kind === 'recommendation') {
      fireEvent.press(screen.getByLabelText('הוספת ההמלצה לטיול'));
      await waitFor(() => expect(mockEnsureCapability).toHaveBeenCalledTimes(1));
    }
  },
);

it('does not expose public sharing or add-to-trip for private trips', () => {
  const screen = render(<ActionBar collectionName="trips" item={{ id: 'private-trip', status: 'active' }} />);
  expect(screen.queryByTestId('recommendation-action-share')).toBeNull();
  expect(screen.queryByTestId('recommendation-action-add-to-trip')).toBeNull();
});

it('lets the map dismiss before protected actions without blocking public sharing', async () => {
  const guard = jest.fn(() => false);
  const screen = render(<ActionBar item={{ id: 'one', title: 'מקום', status: 'active' }} onBeforeProtectedAction={guard} />);
  fireEvent.press(screen.getByLabelText('הוספת לייק'));
  fireEvent.press(screen.getByLabelText('הוספת ההמלצה לטיול'));
  expect(guard).toHaveBeenCalledTimes(2);
  expect(mockToggleLike).not.toHaveBeenCalled();
  expect(mockEnsureCapability).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('שיתוף ההמלצה'));
  await waitFor(() => expect(Share.share).toHaveBeenCalled());
});
