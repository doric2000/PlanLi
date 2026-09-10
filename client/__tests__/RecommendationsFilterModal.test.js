import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import RecommendationsFilterModal from '../src/components/RecommendationsFilterModal';
import RoutesFilterModal from '../src/components/RoutesFilterModal';
import { createEmptyDiscoveryFilters } from '../src/utils/discoveryFilters';

jest.mock('../src/components/FilterModal', () => function MockFilterModal({
  children, onApply, onClear, onClose,
}) {
  const { Text: MockText, TouchableOpacity: MockTouchableOpacity, View: MockView } = require('react-native');
  return (
    <MockView>
      {children}
      <MockTouchableOpacity testID="mock-clear" onPress={onClear}><MockText>נקה</MockText></MockTouchableOpacity>
      <MockTouchableOpacity testID="mock-apply" onPress={onApply}><MockText>החל</MockText></MockTouchableOpacity>
      <MockTouchableOpacity testID="mock-close" onPress={onClose}><MockText>סגור</MockText></MockTouchableOpacity>
    </MockView>
  );
});

jest.mock('../src/components/DiscoveryFilterContent', () => function MockContent({ filters, onChange, onUseProfile }) {
  const { Text: MockText, TouchableOpacity: MockTouchableOpacity, View: MockView } = require('react-native');
  return (
    <MockView>
      <MockText testID="draft-category-count">{filters.categoryIds?.length || 0}</MockText>
      <MockTouchableOpacity testID="mock-set-draft"
        onPress={() => onChange({ ...filters, categoryIds: ['nature'] })}><MockText>בחר</MockText></MockTouchableOpacity>
      {!!onUseProfile && <MockTouchableOpacity testID="mock-profile" onPress={onUseProfile}><MockText>פרופיל</MockText></MockTouchableOpacity>}
    </MockView>
  );
});

jest.mock('../src/utils/recentDiscoveryDestinations', () => ({
  rememberDiscoveryDestinations: () => Promise.resolve(),
}));

describe('RecommendationsFilterModal draft behavior', () => {
  it.each([
    ['recommendations', RecommendationsFilterModal],
    ['routes', RoutesFilterModal],
  ])('clears only the %s filter draft and preserves the independent search', (_, Component) => {
    const onApply = jest.fn();
    const filters = {
      ...createEmptyDiscoveryFilters(),
      query: 'קפה',
      destinations: [{ countryId: 'IT', label: 'איטליה' }],
      categoryIds: ['food'],
      budgetLevels: ['balanced'],
      needsIds: ['kosher'],
    };
    const screen = render(<Component visible filters={filters} onApply={onApply} onClose={jest.fn()} />);
    fireEvent.press(screen.getByTestId('mock-clear'));
    expect(onApply).not.toHaveBeenCalled();
    expect(filters.destinations).toHaveLength(1);
    fireEvent.press(screen.getByTestId('mock-apply'));
    expect(onApply).toHaveBeenCalledWith({ ...createEmptyDiscoveryFilters(), query: 'קפה' });
  });

  it('keeps changes in a draft, clears without closing, and applies only on demand', () => {
    const onApply = jest.fn();
    const onClose = jest.fn();
    const screen = render(
      <RecommendationsFilterModal visible filters={createEmptyDiscoveryFilters()}
        onApply={onApply} onClose={onClose} />
    );

    fireEvent.press(screen.getByTestId('mock-set-draft'));
    expect(screen.getByTestId('draft-category-count').props.children).toBe(1);
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('mock-clear'));
    expect(screen.getByTestId('draft-category-count').props.children).toBe(0);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('mock-apply'));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].categoryIds).toEqual([]);
  });

  it('does not apply the draft when the modal is closed', () => {
    const onApply = jest.fn();
    const onClose = jest.fn();
    const screen = render(
      <RecommendationsFilterModal visible filters={createEmptyDiscoveryFilters()}
        onApply={onApply} onClose={onClose} />
    );
    fireEvent.press(screen.getByTestId('mock-set-draft'));
    fireEvent.press(screen.getByTestId('mock-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });
});
