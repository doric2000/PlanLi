import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import { RecommendationActionBar } from '../src/components/RecommendationActionBar';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text: MockText } = require('react-native');
  const Icon = ({ name, color }) => (
    <MockText testID={`icon-${name}`} data-color={color}>{name}</MockText>
  );
  return { Ionicons: Icon };
});

jest.mock('../src/features/moderation/components/ReportButton', () => {
  const { Pressable, Text: MockText } = require('react-native');
  return ({ color, subjectLabel }) => (
    <Pressable
      testID="report-button"
      style={{ minWidth: 44, minHeight: 44 }}
      accessibilityRole="button"
      accessibilityLabel={`דיווח על ${subjectLabel}`}
    >
      <MockText style={{ color }}>דגל</MockText>
    </Pressable>
  );
});

describe('RecommendationActionBar', () => {
  it('opens the complete community card without triggering its social actions', () => {
    const onReadMore = jest.fn();
    const onLikePress = jest.fn();
    const onCommentPress = jest.fn();
    const screen = render(<RecommendationActionBar onReadMore={onReadMore} onLikePress={onLikePress} onCommentPress={onCommentPress} />);
    const stopPropagation = jest.fn();
    fireEvent.press(screen.getByLabelText('קריאת ההמלצה במלואה'), { stopPropagation });
    expect(onReadMore).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onLikePress).not.toHaveBeenCalled();
    expect(onCommentPress).not.toHaveBeenCalled();
    expect(screen.queryByTestId('recommendation-action-divider')).toBeNull();
  });
  it('renders the compact RTL action order with accessible touch targets', () => {
    const screen = render(
      <RecommendationActionBar
        isLiked
        likeCount={12}
        commentsCount={4}
        onCommentPress={jest.fn()}
        onLikePress={jest.fn()}
        onLikesListPress={jest.fn()}
        onSharePress={jest.fn()}
        contentLabel="המסלול"
        reportTarget={{ type: 'route', id: 'route-1' }}
        ownerId="owner-1"
      />,
    );

    const bar = screen.getByTestId('recommendation-action-bar');
    expect(StyleSheet.flatten(bar.props.style)).toMatchObject({
      direction: 'ltr',
      backgroundColor: '#FFFFFF',
      paddingHorizontal: 16,
    });
    expect(StyleSheet.flatten(screen.getByTestId('recommendation-action-row').props.style)).toMatchObject({
      minHeight: 56,
      flexDirection: 'row-reverse',
      justifyContent: 'flex-start',
    });
    expect(StyleSheet.flatten(screen.getByTestId('recommendation-action-divider').props.style)).toMatchObject({
      height: StyleSheet.hairlineWidth,
    });
    expect(StyleSheet.flatten(screen.getByTestId('recommendation-action-like').props.style)).toMatchObject({
      width: 44,
      minHeight: 44,
    });
    expect(StyleSheet.flatten(screen.getByTestId('recommendation-action-likes').props.style)).toMatchObject({
      width: 44,
      minHeight: 44,
    });
    expect(StyleSheet.flatten(screen.getByTestId('recommendation-action-comments').props.style)).toMatchObject({
      width: 88,
      minHeight: 44,
    });
    expect(StyleSheet.flatten(screen.getByTestId('recommendation-action-share').props.style)).toMatchObject({
      minWidth: 44,
      minHeight: 44,
    });
    expect(screen.queryByTestId('report-button')).toBeNull();
    expect(screen.getByTestId('icon-heart').props['data-color']).toBe('#1E3A5F');
    expect(screen.getByTestId('icon-chatbubble-outline').props['data-color']).toBe('#1E3A5F');
    expect(screen.getByLabelText('ביטול לייק').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByLabelText('12 לייקים, הצגת הרשימה')).toBeTruthy();
    expect(screen.getByLabelText('4 תגובות')).toBeTruthy();
    expect(screen.getByLabelText('שיתוף המסלול')).toBeTruthy();
    expect(screen.getByText('שיתוף')).toBeTruthy();
    expect(screen.queryByLabelText('דיווח על המסלול')).toBeNull();
  });

  it('keeps zero counters visible and hides share without a callback', () => {
    const onLikesListPress = jest.fn();
    const screen = render(
      <RecommendationActionBar
        likeCount={0}
        commentsCount={0}
        onLikesListPress={onLikesListPress}
        reportTarget={{ type: 'recommendation', id: 'recommendation-1' }}
        ownerId="owner-1"
      />,
    );

    expect(screen.getAllByText('0')).toHaveLength(2);
    expect(screen.queryByTestId('recommendation-action-share')).toBeNull();

    fireEvent.press(screen.getByTestId('recommendation-action-likes'));
    expect(onLikesListPress).not.toHaveBeenCalled();
    expect(screen.getByTestId('recommendation-action-likes').props.accessibilityState).toEqual({ disabled: true });
  });

  it('forwards presses for like, likes list, comments, and share', () => {
    const handlers = {
      like: jest.fn(),
      likesList: jest.fn(),
      comments: jest.fn(),
      share: jest.fn(),
    };
    const screen = render(
      <RecommendationActionBar
        likeCount={2}
        commentsCount={1}
        onLikePress={handlers.like}
        onLikesListPress={handlers.likesList}
        onCommentPress={handlers.comments}
        onSharePress={handlers.share}
        reportTarget={{ type: 'recommendation', id: 'recommendation-1' }}
        ownerId="owner-1"
      />,
    );

    const stopPropagation = jest.fn();
    fireEvent.press(screen.getByTestId('recommendation-action-like'), { stopPropagation });
    fireEvent.press(screen.getByTestId('recommendation-action-likes'));
    fireEvent.press(screen.getByTestId('recommendation-action-comments'));
    fireEvent.press(screen.getByTestId('recommendation-action-share'));

    expect(handlers.like).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(handlers.likesList).toHaveBeenCalledTimes(1);
    expect(handlers.comments).toHaveBeenCalledTimes(1);
    expect(handlers.share).toHaveBeenCalledTimes(1);
  });
});
