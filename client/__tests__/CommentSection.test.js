import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((...segments) => ({ kind: 'collection', segments })),
  doc: jest.fn((...segments) => ({ kind: 'doc', segments })),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  limit: jest.fn((value) => ({ kind: 'limit', value })),
  onSnapshot: jest.fn(),
  orderBy: jest.fn((...args) => ({ kind: 'orderBy', args })),
  query: jest.fn((...args) => ({ kind: 'query', args })),
  startAfter: jest.fn((cursor) => ({ kind: 'startAfter', cursor })),
  where: jest.fn((...args) => ({ kind: 'where', args })),
}));
jest.mock('../src/config/firebase', () => ({ db: { kind: 'db' } }));
jest.mock('../src/components/AppText', () => {
  const { Text } = require('react-native');
  return ({ children, ...props }) => <Text {...props}>{children}</Text>;
});
jest.mock('../src/components/AppTextInput', () => {
  const MockReact = require('react');
  const { TextInput } = require('react-native');
  return MockReact.forwardRef((props, ref) => <TextInput ref={ref} {...props} />);
});
jest.mock('../src/components/Avatar', () => {
  const { View } = require('react-native');
  return { Avatar: () => <View testID="avatar" /> };
});
jest.mock('../src/features/moderation/components/ReportButton', () => () => null);
const mockIsBlocked = jest.fn(() => false);
jest.mock('../src/features/moderation/BlockedUsersContext', () => ({
  useBlockedUsers: () => ({ isBlocked: mockIsBlocked }),
}));

const mockEnsureCapability = jest.fn(async () => true);
const mockHandleCallableAuthError = jest.fn(() => false);
jest.mock('../src/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'viewer-1', displayName: 'דנה' },
    status: 'ready',
    isActive: true,
    ensureCapability: mockEnsureCapability,
    handleCallableAuthError: mockHandleCallableAuthError,
  }),
}));

const mockSaveComment = jest.fn(async () => ({ comment: { id: 'new-comment' } }));
const mockDeleteComment = jest.fn(async () => ({ deleted: true }));
jest.mock('../src/services/SocialService', () => ({
  saveComment: (...args) => mockSaveComment(...args),
  deleteComment: (...args) => mockDeleteComment(...args),
}));

import * as mockFirestore from 'firebase/firestore';
import {
  CommentsSection,
  commentWasEdited,
  mergeUniqueComments,
  sortRepliesAscending,
} from '../src/components/CommentSection';

jest.useFakeTimers();

function snapshot(docs) {
  return {
    size: docs.length,
    docs: docs.map((value) => ({
      id: value.id,
      data: () => value,
    })),
  };
}

describe('threaded comment presentation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFirestore.getDocs.mockResolvedValue(snapshot([]));
    mockFirestore.onSnapshot.mockImplementation((builtQuery, onValue) => {
      const isReplyQuery = builtQuery.args.some((constraint) => (
        constraint?.kind === 'where' && constraint.args.join('|') === 'threadType|==|reply'
      ));
      onValue(snapshot(isReplyQuery ? [{
        id: 'reply-1',
        authorId: 'author-2',
        authorPreview: { displayName: 'רון' },
        text: 'תשובה',
        status: 'active',
        threadType: 'reply',
        threadRootId: 'root-1',
        replyToCommentId: 'root-1',
        createdAt: { seconds: 2 },
        updatedAt: { seconds: 2 },
      }] : [{
        id: 'root-1',
        authorId: 'author-1',
        authorPreview: { displayName: 'נועה' },
        text: 'תגובה ראשית',
        status: 'active',
        threadType: 'root',
        threadRootId: 'root-1',
        replyToCommentId: null,
        replyCount: 1,
        createdAt: { seconds: 1 },
        updatedAt: { seconds: 1 },
      }]));
      return jest.fn();
    });
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('keeps replies collapsed and submits a direct reply through the fixed composer', async () => {
    const screen = render(
      <CommentsSection collectionName="recommendations" postId="post-1" bottomInset={12} />
    );

    expect(screen.getByTestId('comment-composer')).toBeTruthy();
    expect(screen.getByTestId('comment-root-1')).toBeTruthy();
    expect(screen.queryByTestId('replies-root-1')).toBeNull();

    await act(async () => fireEvent.press(screen.getByTestId('reply-comment-root-1')));
    expect(screen.getByTestId('comment-composer-context')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('comment-input'), 'תשובה חדשה');
    await act(async () => fireEvent.press(screen.getByTestId('comment-send')));

    await waitFor(() => expect(mockSaveComment).toHaveBeenCalledWith(
      { type: 'recommendation', id: 'post-1' },
      'תשובה חדשה',
      { replyToCommentId: 'root-1' }
    ));
  });

  it('expands a thread and renders replies chronologically', async () => {
    const screen = render(<CommentsSection collectionName="recommendations" postId="post-1" />);
    await act(async () => fireEvent.press(screen.getByTestId('toggle-replies-root-1')));
    expect(await screen.findByTestId('replies-root-1')).toBeTruthy();
    expect(screen.getByText('בתגובה לנועה')).toBeTruthy();
  });

  it('deduplicates pages and identifies edit timestamps', () => {
    expect(mergeUniqueComments([{ id: 'a', text: 'old' }], [{ id: 'a', text: 'new' }]))
      .toEqual([{ id: 'a', text: 'new' }]);
    expect(sortRepliesAscending([
      { id: 'late', createdAt: { seconds: 2 } },
      { id: 'early', createdAt: { seconds: 1 } },
    ]).map((item) => item.id)).toEqual(['early', 'late']);
    expect(commentWasEdited({ createdAt: { seconds: 1 }, updatedAt: { seconds: 3 } })).toBe(true);
  });
});
