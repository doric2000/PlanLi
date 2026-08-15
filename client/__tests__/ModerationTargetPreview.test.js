import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import ModerationTargetPreview from '../src/features/admin/components/ModerationTargetPreview';

describe('ModerationTargetPreview', () => {
  it('renders a recognizable post preview and expands long text', () => {
    const text = 'תיאור ארוך '.repeat(40);
    const screen = render(<ModerationTargetPreview preview={{
      available: true,
      title: 'המלצה על מסעדה',
      text,
      imageUrl: 'https://img.example/post.webp',
      mediaCount: 3,
      author: { displayName: 'מטיילת' },
      destination: { cityName: 'ירושלים', countryName: 'ישראל' },
    }} />);

    expect(screen.getByText('המלצה על מסעדה')).toBeTruthy();
    expect(screen.getByText('מטיילת · ירושלים, ישראל')).toBeTruthy();
    expect(screen.getByTestId('moderation-target-preview-image').props.source.uri)
      .toBe('https://img.example/post.webp');
    expect(screen.getByText('בפוסט יש 3 פריטי מדיה')).toBeTruthy();
    expect(screen.getByTestId('moderation-target-preview-text').props.numberOfLines).toBe(3);

    fireEvent.press(screen.getByTestId('moderation-target-preview-toggle'));
    expect(screen.getByTestId('moderation-target-preview-text').props.numberOfLines).toBeUndefined();
    expect(screen.getByText('צמצום')).toBeTruthy();
  });

  it('handles missing images and unavailable content without crashing', () => {
    const available = render(<ModerationTargetPreview preview={{ available: true, title: 'ללא תמונה', text: 'טקסט קצר' }} />);
    expect(available.queryByTestId('moderation-target-preview-image')).toBeNull();

    const unavailable = render(<ModerationTargetPreview preview={{ available: false, type: 'route', status: 'missing' }} />);
    expect(unavailable.getByTestId('moderation-target-preview-unavailable')).toBeTruthy();
    expect(unavailable.getByText('התוכן אינו זמין יותר')).toBeTruthy();
  });

  it('keeps a stored report snapshot visible after the original target is deleted', () => {
    const screen = render(<ModerationTargetPreview preview={{
      available: false,
      title: 'הגרסה שדווחה',
      text: 'הטקסט המקורי',
    }} />);
    expect(screen.getByText('הגרסה שדווחה')).toBeTruthy();
    expect(screen.getByText('הטקסט המקורי')).toBeTruthy();
    expect(screen.getByTestId('moderation-target-preview-missing-notice')).toBeTruthy();
  });
});
