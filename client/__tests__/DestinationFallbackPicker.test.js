import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import DestinationFallbackPicker from '../src/components/DestinationFallbackPicker';

const mockSearchCities = jest.fn();
const mockResolve = jest.fn();
const mockConfirmName = jest.fn();

jest.mock('../src/services/LocationService', () => ({
  confirmProvisionalDestinationName: (...args) => mockConfirmName(...args),
  finalizeDestinationChoice: jest.fn(),
  resolveDestinationForPlacePreview: (...args) => mockResolve(...args),
  searchCities: (...args) => mockSearchCities(...args),
}));

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

beforeEach(() => jest.clearAllMocks());

test('fallback destination search lets the user correct a provisional Hebrew name', async () => {
  const selection = {
    selectionId: 'sel_dolomites',
    sessionId: 'session_dolomites',
    providerPlaceId: 'google-dolomites',
    structured_formatting: { main_text: 'Dolomites', secondary_text: 'Italy' },
  };
  mockSearchCities.mockResolvedValue([selection]);
  mockResolve.mockResolvedValue({
    status: 'destination_name_confirmation_required',
    resolvedPlaceToken: 'destination-token',
    incidentId: 'loc_dolomites1',
    nameConfirmation: { englishName: 'Dolomites', suggestedHebrewName: 'דולומיטס' },
  });
  mockConfirmName.mockResolvedValue({
    status: 'resolved',
    resolvedPlaceToken: 'destination-token',
    destination: {
      country: { id: 'IT', name: 'איטליה' },
      city: { id: 'dolomites', name: 'הדולומיטים' },
    },
  });
  const onSelect = jest.fn();
  const screen = render(<DestinationFallbackPicker onSelect={onSelect} />);

  fireEvent.changeText(screen.getByTestId('destination-fallback-search'), 'Dolomites');
  fireEvent.press(screen.getByTestId('destination-fallback-search-button'));
  await waitFor(() => expect(screen.getByTestId('destination-fallback-result-0')).toBeTruthy());
  fireEvent.press(screen.getByTestId('destination-fallback-result-0'));
  await waitFor(() => expect(screen.getByTestId('destination-fallback-hebrew-name')).toBeTruthy());

  fireEvent.changeText(screen.getByTestId('destination-fallback-hebrew-name'), 'הדולומיטים');
  fireEvent.press(screen.getByTestId('destination-fallback-confirm-name'));

  await waitFor(() => expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
    countryId: 'IT', cityId: 'dolomites', name: 'הדולומיטים', resolvedPlaceToken: 'destination-token',
  })));
  expect(mockResolve).toHaveBeenCalledWith(selection, { selectionIntent: 'destination' });
  expect(mockConfirmName).toHaveBeenCalledWith({
    resolvedPlaceToken: 'destination-token',
    incidentId: 'loc_dolomites1',
    confirmedHebrewName: 'הדולומיטים',
  });
});

test('fallback destination search clears results as soon as the query changes', async () => {
  mockSearchCities.mockResolvedValue([{
    selectionId: 'sel_dolomites',
    structured_formatting: { main_text: 'Dolomites', secondary_text: 'Italy' },
  }]);
  const screen = render(<DestinationFallbackPicker onSelect={jest.fn()} />);

  fireEvent.changeText(screen.getByTestId('destination-fallback-search'), 'Dolomites');
  fireEvent.press(screen.getByTestId('destination-fallback-search-button'));
  await screen.findByText('Dolomites');

  fireEvent.changeText(screen.getByTestId('destination-fallback-search'), 'Rome');
  expect(screen.queryByText('Dolomites')).toBeNull();
});

test('fallback destination search ignores an older response that arrives last', async () => {
  const oldSearch = deferred();
  mockSearchCities.mockImplementation((query) => (
    query === 'Dolomites'
      ? oldSearch.promise
      : Promise.resolve([{
          selectionId: 'sel_rome',
          structured_formatting: { main_text: 'Rome', secondary_text: 'Italy' },
        }])
  ));
  const screen = render(<DestinationFallbackPicker onSelect={jest.fn()} />);

  fireEvent.changeText(screen.getByTestId('destination-fallback-search'), 'Dolomites');
  fireEvent.press(screen.getByTestId('destination-fallback-search-button'));
  fireEvent.changeText(screen.getByTestId('destination-fallback-search'), 'Rome');
  fireEvent.press(screen.getByTestId('destination-fallback-search-button'));
  await screen.findByText('Rome');

  await act(async () => {
    oldSearch.resolve([{
      selectionId: 'sel_dolomites',
      structured_formatting: { main_text: 'Dolomites', secondary_text: 'Italy' },
    }]);
    await oldSearch.promise;
  });

  expect(screen.getByText('Rome')).toBeTruthy();
  expect(screen.queryByText('Dolomites')).toBeNull();
});
