import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import DayEditorModal from '../src/features/roadtrip/components/DayEditorModal';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }) => <Text>{name}</Text> };
});
jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return { GestureHandlerRootView: View };
});
jest.mock('react-native-draggable-flatlist', () => {
  const React = require('react');
  const { ScrollView, View } = require('react-native');
  return {
    NestableScrollContainer: React.forwardRef(({ children, ...props }, ref) => (
      <ScrollView {...props} ref={ref}>{children}</ScrollView>
    )),
    NestableDraggableFlatList: ({ data, keyExtractor, renderItem, testID }) => (
      <View testID={testID}>{data.map((item, index) => (
        <React.Fragment key={keyExtractor(item, index)}>
          {renderItem({ item, index, drag: () => {}, isActive: false })}
        </React.Fragment>
      ))}</View>
    ),
    ScaleDecorator: ({ children }) => <>{children}</>,
  };
});
jest.mock('../src/features/roadtrip/components/StopEditorModal', () => {
  const { Pressable, Text, View } = require('react-native');
  return ({ visible, onSave, onClose, stopIndex }) => visible ? (
    <Pressable testID="stop-editor-save" onPress={() => {
      onSave({ id: 'inserted', title: 'עצירה חדשה', location: 'בין העצירות' }, stopIndex);
      onClose();
    }}><Text>שמירת עצירה</Text></Pressable>
  ) : <View testID="stop-editor" />;
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

  it('inserts a new stop between two existing stops', () => {
    const onSave = jest.fn();
    const screen = render(
      <DayEditorModal
        visible
        dayIndex={0}
        initialData={{
          description: '',
          stops: [{ id: 'one', title: 'ראשונה' }, { id: 'two', title: 'שנייה' }],
        }}
        onSave={onSave}
        onClose={jest.fn()}
      />
    );
    fireEvent.press(screen.getByTestId('day-insert-stop-1'));
    fireEvent.press(screen.getByTestId('stop-editor-save'));
    fireEvent.press(screen.getByText('שמירה'));
    expect(onSave.mock.calls[0][0].stops.map((stop) => stop.id)).toEqual(['one', 'inserted', 'two']);
  });

  it('supports an accessible order change from the drag handle', () => {
    const onSave = jest.fn();
    const screen = render(
      <DayEditorModal
        visible
        dayIndex={0}
        initialData={{
          description: '',
          stops: [{ id: 'one', title: 'ראשונה' }, { id: 'two', title: 'שנייה' }],
        }}
        onSave={onSave}
        onClose={jest.fn()}
      />
    );
    fireEvent(screen.getByTestId('day-stop-drag-handle-0'), 'accessibilityAction', {
      nativeEvent: { actionName: 'moveDown' },
    });
    fireEvent.press(screen.getByText('שמירה'));
    expect(onSave.mock.calls[0][0].stops.map((stop) => stop.id)).toEqual(['two', 'one']);
  });
});
