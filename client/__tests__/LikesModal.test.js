import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import LikesModal from '../src/components/LikesModal';

const mockGetDoc = jest.fn();
const mockGetDocs = jest.fn();
const mockStartAfter = jest.fn((cursor) => ({ kind: 'startAfter', cursor }));
const mockLimit = jest.fn((value) => ({ kind: 'limit', value }));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((...args) => ({ kind: 'collection', args })),
  doc: jest.fn((...args) => ({ kind: 'doc', args })),
  getDoc: (...args) => mockGetDoc(...args),
  getDocs: (...args) => mockGetDocs(...args),
  limit: (...args) => mockLimit(...args),
  orderBy: jest.fn((...args) => ({ kind: 'orderBy', args })),
  query: jest.fn((...args) => ({ kind: 'query', args })),
  startAfter: (...args) => mockStartAfter(...args),
}));

jest.mock('../src/config/firebase', () => ({ db: { kind: 'db' } }));

jest.mock('@expo/vector-icons', () => {
  const ReactRuntime = require('react');
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, ...props }) => ReactRuntime.createElement(Text, props, name),
  };
});

jest.mock('../src/components/Avatar', () => {
  const ReactRuntime = require('react');
  const { View } = require('react-native');
  return {
    Avatar: ({ displayName }) => ReactRuntime.createElement(View, {
      accessibilityLabel: displayName,
    }),
  };
});

function likeEntry(id, displayName = `מטייל ${id}`) {
  return {
    id,
    data: () => ({ userPreview: { displayName, photoURL: null } }),
  };
}

function page(entries) {
  return { docs: entries };
}

function content(likeCount) {
  return { data: () => ({ stats: { likeCount } }) };
}

describe('LikesModal', () => {
  beforeEach(() => {
    mockGetDoc.mockReset();
    mockGetDocs.mockReset();
    mockStartAfter.mockClear();
    mockLimit.mockClear();
    mockGetDoc.mockResolvedValue(content(0));
  });

  it('uses the authoritative count and paginates 30 at a time with deduplication', async () => {
    const firstPage = Array.from({ length: 30 }, (_, index) => likeEntry(`user-${index}`));
    let finishNextPage;
    mockGetDocs
      .mockResolvedValueOnce(page(firstPage))
      .mockReturnValueOnce(new Promise((resolve) => { finishNextPage = resolve; }));
    mockGetDoc.mockResolvedValue(content(44));

    const screen = render(
      <LikesModal
        visible
        onClose={jest.fn()}
        collectionName="recommendations"
        itemId="post-1"
        likeCount={3}
      />
    );

    await waitFor(() => expect(screen.getByTestId('likes-modal-list').props.data).toHaveLength(30));
    expect(screen.getByText('44 לייקים')).toBeTruthy();
    expect(mockLimit).toHaveBeenCalledWith(30);

    fireEvent(screen.getByTestId('likes-modal-list'), 'onEndReached');
    expect(screen.getByTestId('likes-modal-loading-more')).toBeTruthy();

    finishNextPage(page([
      likeEntry('user-29', 'שם מעודכן'),
      likeEntry('user-30'),
    ]));

    await waitFor(() => expect(screen.getByTestId('likes-modal-list').props.data).toHaveLength(31));
    expect(screen.getByTestId('likes-modal-list').props.data.find(
      (user) => user.id === 'user-29'
    )?.displayName).toBe('שם מעודכן');
    expect(mockStartAfter).toHaveBeenCalledWith(firstPage[29]);
  });

  it('shows initial failure, retry, empty, and close states', async () => {
    const onClose = jest.fn();
    mockGetDocs
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page([]));

    const screen = render(
      <LikesModal
        visible
        onClose={onClose}
        collectionName="routes"
        itemId="route-1"
        likeCount={2}
      />
    );

    await waitFor(() => expect(screen.getByTestId('likes-modal-error')).toBeTruthy());
    fireEvent.press(screen.getByTestId('likes-modal-retry'));
    await waitFor(() => expect(screen.getByText('אין עדיין לייקים')).toBeTruthy());

    fireEvent.press(screen.getByTestId('likes-modal-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores stale results after switching targets', async () => {
    let finishFirstTarget;
    mockGetDocs
      .mockReturnValueOnce(new Promise((resolve) => { finishFirstTarget = resolve; }))
      .mockResolvedValueOnce(page([likeEntry('current-user')]));

    const screen = render(
      <LikesModal
        visible
        onClose={jest.fn()}
        collectionName="recommendations"
        itemId="old-post"
      />
    );
    screen.rerender(
      <LikesModal
        visible
        onClose={jest.fn()}
        collectionName="recommendations"
        itemId="new-post"
      />
    );

    await waitFor(() => expect(screen.getByTestId('likes-modal-list').props.data).toEqual([
      expect.objectContaining({ id: 'current-user' }),
    ]));

    finishFirstTarget(page([likeEntry('stale-user')]));
    await waitFor(() => expect(screen.getByTestId('likes-modal-list').props.data).toEqual([
      expect.objectContaining({ id: 'current-user' }),
    ]));
  });
});
