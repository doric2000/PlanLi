import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import HomeRefreshDashboard, { HomeRegionHero, HomeSavedDestinations } from '../src/features/home/components/HomeRefreshDashboard';

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return { Ionicons: ({ name, ...props }) => ReactModule.createElement(Text, props, name) };
});

describe('refreshed Home discovery', () => {
  it('opens global recommendations without choosing a region or changing the saved scope', () => {
    const explore = jest.fn();
    const change = jest.fn();
    const screen = render(<HomeRegionHero mode="global" regionId={null} onExplore={explore} onChangeRegion={change} />);
    fireEvent.press(screen.getByText('גלו המלצות מכל העולם'));
    expect(explore).toHaveBeenCalledTimes(1);
    expect(change).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('החלפת אזור'));
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('requires selection when no discovery scope exists', () => {
    const explore = jest.fn();
    const change = jest.fn();
    const screen = render(<HomeRegionHero mode={null} regionId={null} onExplore={explore} onChangeRegion={change} />);
    fireEvent.press(screen.getByTestId('home-region-explore'));
    expect(change).toHaveBeenCalledTimes(1);
    expect(explore).not.toHaveBeenCalled();
  });

  it('opens a real saved destination and caps the preview at two cards', () => {
    const onOpen = jest.fn();
    const favorites = [1, 2, 3].map((id) => ({ id: String(id), countryId: 'LK', name: `יעד ${id}` }));
    const screen = render(<HomeSavedDestinations favorites={favorites} onOpenDestination={onOpen} />);
    fireEvent.press(screen.getByTestId('home-saved-2'));
    expect(onOpen).toHaveBeenCalledWith(favorites[1]);
    expect(screen.queryByTestId('home-saved-3')).toBeNull();
  });

  it('keeps saved cards visible during refresh and gives guests an actionable empty state', () => {
    const screen = render(<HomeSavedDestinations loading favorites={[{ id: 'one', countryId: 'LK', name: 'ארוגם באי' }]} />);
    expect(screen.getByTestId('home-saved-one')).toBeTruthy();
    expect(screen.queryByTestId('home-saved-loading')).toBeNull();
    const login = jest.fn();
    screen.rerender(<HomeSavedDestinations isGuest favorites={[]} onOpenFavorites={login} />);
    fireEvent.press(screen.getByTestId('home-saved-empty'));
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('retries a saved-destination failure while keeping any cached cards usable', () => {
    const retry = jest.fn();
    const open = jest.fn();
    const city = { id: 'cached', countryId: 'IT', name: 'אגם' };
    const screen = render(<HomeSavedDestinations error={new Error('offline')} reload={retry} />);
    fireEvent.press(screen.getByTestId('home-saved-error'));
    expect(retry).toHaveBeenCalledTimes(1);
    screen.rerender(<HomeSavedDestinations error={new Error('offline')} favorites={[city]} onOpenDestination={open} />);
    expect(screen.queryByTestId('home-saved-error')).toBeNull();
    fireEvent.press(screen.getByTestId('home-saved-cached'));
    expect(open).toHaveBeenCalledWith(city);
  });

  it('keeps the three shortcuts and existing draft continuation independent', () => {
    const profile = jest.fn();
    const favorites = jest.fn();
    const community = jest.fn();
    const resume = jest.fn();
    const create = jest.fn();
    const screen = render(<HomeRefreshDashboard
      favoriteCities={{ favorites: [] }}
      continuation={{ draft: { title: 'הטיוטה שלי', days: [{ stops: [] }] }, onPress: resume }}
      routes={{ items: [] }} recommendations={{ items: [] }}
      onOpenProfile={profile} onOpenFavorites={favorites} onOpenCommunity={community} onCreateRoute={create}
    />);
    fireEvent.press(screen.getByTestId('home-quick-action-profile'));
    fireEvent.press(screen.getByTestId('home-quick-action-favorites'));
    fireEvent.press(screen.getByTestId('home-quick-action-community'));
    fireEvent.press(screen.getByTestId('home-continuation-action'));
    fireEvent.press(screen.getByTestId('home-quick-action-route'));
    [profile, favorites, community, resume, create].forEach((callback) => expect(callback).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('תכנון מסלול אישי')).toBeNull();
    expect(screen.queryByText('חזרה לעיצוב הקודם')).toBeNull();
  });
});
