import React from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import CommunityNavigator from '../src/features/community/navigation/CommunityNavigator';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('react-native-screens', () => {
  const { View } = require('react-native');
  return { Screen: View, ScreenContainer: View, screensEnabled: () => false, enableScreens: jest.fn() };
});
jest.mock('../src/features/community/screens/CommunityScreen', () => {
  const React = require('react');
  const { Text, TextInput, View, Pressable } = require('react-native');
  const Switch = require('../src/features/community/components/CommunityContentSwitch').default;
  return function Feed({ navigation }) {
    const [query, setQuery] = React.useState(''); const [map, setMap] = React.useState(false);
    return <View><Switch selected="CommunityFeed" navigation={navigation} />
      <TextInput testID="recommendation-query" value={query} onChangeText={setQuery} />
      <Pressable testID="map-toggle" onPress={() => setMap(!map)}><Text>{map ? 'Map open' : 'List open'}</Text></Pressable>
    </View>;
  };
});
jest.mock('../src/features/roadtrip/screens/RoutesScreen', () => {
  const React = require('react'); const { TextInput, View } = require('react-native');
  const Switch = require('../src/features/community/components/CommunityContentSwitch').default;
  return function Routes({ navigation }) {
    const [query, setQuery] = React.useState('');
    return <View><Switch selected="Routes" navigation={navigation} /><TextInput testID="route-query" value={query} onChangeText={setQuery} /></View>;
  };
});
it('keeps each visited feed state across real navigator mode changes', async () => {
  const ref = createNavigationContainerRef();
  const s = render(<NavigationContainer ref={ref}><CommunityNavigator navigation={{ navigate: jest.fn() }} /></NavigationContainer>);
  fireEvent.changeText(s.getByTestId('recommendation-query'), 'קפה'); fireEvent.press(s.getByTestId('map-toggle'));
  fireEvent.press(s.getByTestId('community-mode-routes'));
  await waitFor(() => expect(ref.getCurrentRoute().name).toBe('Routes'));
  fireEvent.changeText(s.getByTestId('route-query'), 'הרים');
  act(() => ref.navigate('CommunityFeed'));
  expect(s.getByTestId('recommendation-query').props.value).toBe('קפה'); expect(s.getByText('Map open')).toBeTruthy();
  act(() => ref.navigate('Routes')); expect(s.getByTestId('route-query').props.value).toBe('הרים');
});
it('consumes legacy map links and selects recommendations', () => {
  const navigate = jest.fn(); const mapFocus = { requestId: 'open-1', recommendationId: 'r1', coordinates: { lat: 1, lng: 2 } };
  render(<NavigationContainer><CommunityNavigator navigation={{ navigate }} route={{ params: { mapFocus } }} /></NavigationContainer>);
  expect(navigate).toHaveBeenCalledWith('Community', { screen: 'CommunityFeed', params: { mapFocus }, mapFocus: undefined });
});
