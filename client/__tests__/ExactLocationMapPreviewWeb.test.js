import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ExactLocationMapPreview from '../src/components/ExactLocationMapPreview.web';

test('web opens an interactive full map and closes it without changing the selected place', () => {
  const place = { name: 'HealthFit Gym & Yoga Center Hoi An', coordinates: { lat: 15.8863324, lng: 108.3341622 } };
  const screen = render(<ExactLocationMapPreview place={place} />);
  const preview = screen.UNSAFE_getByType('iframe');
  expect(preview.props.src).toContain('z=13');
  expect(preview.props.style.pointerEvents).toBe('none');
  fireEvent.press(screen.getByRole('button', { name: 'פתיחת מפה גדולה' }));
  const expanded = screen.UNSAFE_getAllByType('iframe').find((frame) => frame.props.allowFullScreen);
  expect(expanded.props.src).toBe(preview.props.src);
  expect(expanded.props.style.pointerEvents).toBeUndefined();
  expect(expanded.props.tabIndex).toBe(0);
  fireEvent.press(screen.getByRole('button', { name: 'סגירת המפה' }));
  expect(screen.UNSAFE_getAllByType('iframe')).toHaveLength(1);
});
