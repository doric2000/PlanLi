import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import DayEditorModal from '../src/features/roadtrip/components/DayEditorModal';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }) => <Text>{name}</Text> };
});
jest.mock('../src/features/roadtrip/components/StopEditorModal', () => {
  const { View } = require('react-native');
  return () => <View testID="stop-editor" />;
});

describe('DayEditorModal', () => {
  it('keeps the optional day note collapsed until it is requested', () => {
    const screen = render(
      <DayEditorModal
        visible
        dayIndex={0}
        initialData={{ description: '', stops: [{ id: 'one', title: 'עצירה', location: 'מרכז העיר' }] }}
        onSave={jest.fn()}
        onClose={jest.fn()}
      />
    );
    expect(screen.queryByText('הערה ליום (רשות)')).toBeNull();
    fireEvent.press(screen.getByTestId('route-day-note-add'));
    expect(screen.getByText('הערה ליום (רשות)')).toBeTruthy();
  });

  it('opens an existing note without asking for it again', () => {
    const screen = render(
      <DayEditorModal
        visible
        dayIndex={0}
        initialData={{ description: 'מתחילים מוקדם', stops: [] }}
        onSave={jest.fn()}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByText('הערה ליום (רשות)')).toBeTruthy();
    expect(screen.queryByTestId('route-day-note-add')).toBeNull();
  });

  it('closes an unchanged existing day without a discard prompt', () => {
    const onClose = jest.fn();
    const screen = render(
      <DayEditorModal
        visible
        dayIndex={0}
        initialData={{
          description: '',
          stops: [{ id: 'one', title: 'עצירה', startTime: '08:30', durationMinutes: 90 }],
        }}
        onSave={jest.fn()}
        onClose={onClose}
      />
    );

    fireEvent.press(screen.getByText('ביטול'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('day-editor-unsaved-modal')).toBeNull();
  });
});
