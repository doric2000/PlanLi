import React, { useState } from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import CommunitySearch from '../src/features/community/components/CommunitySearch';

const mockHook = jest.fn();
const mockSubmit = jest.fn();
const mockDestinations = jest.fn();
const city = { key: 'city:lk:bay', countryId: 'lk', cityId: 'bay', name: 'ארוגם באי', countryName: 'סרי לנקה', label: 'ארוגם באי · סרי לנקה' };
const country = { key: 'country:lk', countryId: 'lk', name: 'סרי לנקה', label: 'סרי לנקה' };
jest.mock('../src/hooks/useDestinationFilterOptions', () => ({ useDestinationFilterOptions: (...args) => mockHook(...args) }));
jest.mock('../src/utils/recentDiscoveryDestinations', () => ({ rememberDiscoveryDestinations: jest.fn(async () => {}) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

function Harness({ selected = [], initialQuery = '', navigation }) {
  const [query, setQuery] = useState(initialQuery);
  const [destinations, setDestinations] = useState(selected);
  return <><Text testID="applied-query">{query}</Text><Text testID="destination-count">{destinations.length}</Text>
    <CommunitySearch prefix="community" navigation={navigation} query={query} destinations={destinations}
      onSubmit={(value) => { mockSubmit(value); setQuery(value); }}
      onDestinationsChange={(value) => { mockDestinations(value); setDestinations(value); }}>{() => null}</CommunitySearch>
  </>;
}
const open = (s) => fireEvent.press(s.getByTestId('community-search-open'));
const type = (s, value) => fireEvent.changeText(s.getByTestId('community-search-input'), value);
const settle = () => act(() => jest.advanceTimersByTime(260));
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); mockHook.mockReturnValue({ options: [country, city], loading: false, searchError: '', retrySearch: jest.fn() }); });
afterEach(() => jest.useRealTimers());

it('debounces suggestions and only commits free text on explicit submission', () => {
  const s = render(<Harness />); open(s); type(s, 'סרי');
  expect(mockSubmit).not.toHaveBeenCalled();
  expect(s.queryByTestId('community-suggestion-country:lk')).toBeNull();
  settle(); expect(mockHook).toHaveBeenLastCalledWith(true, 'סרי');
  expect(s.getByTestId('community-suggestion-country:lk')).toBeTruthy();
  fireEvent.press(s.getByTestId('community-submit-search'));
  expect(mockSubmit).toHaveBeenCalledWith('סרי');
  expect(s.queryByTestId('community-search-input')).toBeNull();
});
it('selects a destination without overwriting an existing text constraint', () => {
  const s = render(<Harness initialQuery="קפה" />); open(s); type(s, 'סרי'); settle();
  fireEvent.press(s.getByTestId('community-suggestion-city:lk:bay'));
  expect(mockDestinations.mock.calls[0][0]).toEqual([{ countryId: 'lk', cityId: 'bay', label: city.label }]);
  expect(s.getByTestId('applied-query').props.children).toBe('קפה');
  fireEvent.press(s.getByLabelText('נקה חיפוש'));
  expect(s.getByTestId('destination-count').props.children).toBe(1);
});
it('discards an unsubmitted search when closing and preserves the applied query', () => {
  const s = render(<Harness initialQuery="קפה" />); open(s); type(s, 'טיוטה');
  fireEvent.press(s.getByLabelText('סגירה')); open(s);
  expect(s.getByTestId('community-search-input').props.value).toBe('קפה');
  expect(mockSubmit).not.toHaveBeenCalled();
});
it('keeps the five-destination limit and does not silently discard a selection', () => {
  const selected = Array.from({ length: 5 }, (_, i) => ({ countryId: `c${i}`, label: `c${i}` }));
  const s = render(<Harness selected={selected} />); open(s); type(s, 'סרי'); settle();
  fireEvent.press(s.getByTestId('community-suggestion-country:lk'));
  expect(mockDestinations).not.toHaveBeenCalled(); expect(s.getByText(/אפשר לבחור עד חמישה/)).toBeTruthy();
});
it('hides old suggestions while typing a different query and disables lookup on close', () => {
  const s = render(<Harness />); open(s); type(s, 'סרי'); settle();
  type(s, 'איטליה'); expect(s.queryByTestId('community-suggestion-country:lk')).toBeNull();
  fireEvent.press(s.getByLabelText('סגירה')); settle();
  expect(mockHook.mock.calls.at(-1)[0]).toBe(false); expect(mockSubmit).not.toHaveBeenCalled();
});
it('allows free-text submission even if destination suggestions fail', () => {
  const retry = jest.fn(); mockHook.mockReturnValue({ options: [], searchError: 'failed', loading: false, retrySearch: retry });
  const s = render(<Harness />); open(s); type(s, 'קפה'); settle();
  fireEvent.press(s.getByText('לא הצלחנו לטעון הצעות. נסו שוב')); expect(retry).toHaveBeenCalledTimes(1);
  fireEvent.press(s.getByTestId('community-submit-search')); expect(mockSubmit).toHaveBeenCalledWith('קפה');
});

it('allows choosing valid search matches even when the initial catalog failed', () => {
  mockHook.mockReturnValue({ options: [city], optionsError: 'catalog failed', searchError: '', loading: false, retrySearch: jest.fn() });
  const s = render(<Harness />); open(s); type(s, 'ארוגם'); settle();
  expect(s.queryByText('לא הצלחנו לטעון הצעות. נסו שוב')).toBeNull();
  fireEvent.press(s.getByTestId('community-suggestion-city:lk:bay'));
  expect(mockDestinations).toHaveBeenCalledTimes(1);
});

it('offers a catalog retry when no matching destinations are available', () => {
  const retry = jest.fn();
  mockHook.mockReturnValue({ options: [], optionsError: 'catalog failed', searchError: '', loading: false, retrySearch: retry });
  const s = render(<Harness />); open(s); type(s, 'ארוגם'); settle();
  fireEvent.press(s.getByText('לא הצלחנו לטעון הצעות. נסו שוב'));
  expect(retry).toHaveBeenCalledTimes(1);
});
