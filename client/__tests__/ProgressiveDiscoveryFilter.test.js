import React, { useState } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import DiscoveryFilterContent from '../src/components/DiscoveryFilterContent';
import { createEmptyDiscoveryFilters } from '../src/utils/discoveryFilters';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  const MockIcon = ({ name }) => ReactModule.createElement(Text, null, name);
  return { Ionicons: MockIcon, MaterialIcons: MockIcon };
});

jest.mock('../src/hooks/useDestinationFilterOptions', () => ({
  useDestinationFilterOptions: () => ({
    loading: false,
    options: [
      {
        key: 'city:il:tlv', kind: 'city', countryId: 'il', cityId: 'tlv',
        name: 'תל אביב', countryName: 'ישראל', label: 'תל אביב · ישראל', popularity: 2,
      },
    ],
    popularOptions: [],
  }),
}));
jest.mock('../src/hooks/useFavoriteCityIds', () => ({
  useFavoriteCityIds: () => ({ favorites: [], loading: false }),
}));
jest.mock('../src/utils/recentDiscoveryDestinations', () => ({
  loadRecentDiscoveryDestinations: () => Promise.resolve([]),
  reconcileStoredRecentDiscoveryDestinations: () => Promise.resolve([]),
}));

function Harness({ surface = 'recommendations', withProfile = false }) {
  const [filters, setFilters] = useState(createEmptyDiscoveryFilters);
  return (
    <DiscoveryFilterContent
      filters={filters}
      onChange={setFilters}
      surface={surface}
      onUseProfile={withProfile ? () => setFilters((current) => ({
        ...current,
        audienceIds: ['couple'],
        budgetLevels: ['balanced'],
      })) : null}
    />
  );
}

describe('progressive discovery filter UI', () => {
  it('keeps punctuation-only destination input in the idle suggestion state', () => {
    const screen = render(<Harness />);
    fireEvent.changeText(screen.getByTestId('discovery-destination-search'), " !–' ");
    expect(screen.getByText('התחילו להקליד כדי למצוא יעד')).toBeTruthy();
    expect(screen.queryByText('הקלידו לפחות שני תווים')).toBeNull();
    expect(screen.queryByText('לא נמצא יעד פעיל ב־PlanLi')).toBeNull();
  });

  it('keeps optional values hidden until their independent section is expanded', () => {
    const screen = render(<Harness />);
    expect(screen.getByText('לאן?')).toBeTruthy();
    expect(screen.getByText('מה מחפשים?')).toBeTruthy();
    expect(screen.queryByTestId('discovery-audience-0')).toBeNull();

    fireEvent.press(screen.getByTestId('discovery-section-audience-budget'));
    expect(screen.getByTestId('discovery-audience-0')).toBeTruthy();
    expect(screen.getByTestId('discovery-section-audience-budget').props.accessibilityState.expanded).toBe(true);
  });

  it('reveals only the selected category branch and preserves stable test ids', () => {
    const screen = render(<Harness />);
    fireEvent.press(screen.getByTestId('discovery-category-1'));
    expect(screen.getByText('תתי־קטגוריות · טבע ומים')).toBeTruthy();
    expect(screen.getByTestId('discovery-subcategory-nature-0')).toBeTruthy();
    expect(screen.queryByText('מסעדה')).toBeNull();
  });

  it('shows route-specific details only on the route surface', () => {
    const recommendation = render(<Harness />);
    expect(recommendation.queryByTestId('discovery-section-route-details')).toBeNull();
	fireEvent.press(recommendation.getByTestId('discovery-section-atmosphere'));
	expect(recommendation.queryByTestId('discovery-style-0')).toBeNull();
	expect(recommendation.queryByTestId('discovery-season-0')).toBeNull();
	expect(recommendation.queryByTestId('discovery-interest-0')).toBeNull();
    recommendation.unmount();

    const route = render(<Harness surface="routes" />);
    fireEvent.press(route.getByTestId('discovery-section-route-details'));
    expect(route.getByTestId('discovery-difficulty-0')).toBeTruthy();
	expect(route.getByTestId('discovery-experience-0')).toBeTruthy();
    expect(route.getByText('טווח ימים')).toBeTruthy();
  });

  it('makes profile-filled hard filters visible in the collapsed section summary', () => {
    const screen = render(<Harness withProfile />);
    fireEvent.press(screen.getByTestId('discovery-use-profile'));
    expect(screen.getByText('זוג · ₪₪')).toBeTruthy();
  });
});
