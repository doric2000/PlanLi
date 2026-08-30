import { Linking } from 'react-native';

import {
  destinationSourceUrlPolicy,
  getSafeExternalUrl,
  openSafeExternalUrl,
} from '../src/utils/safeExternalUrl';

describe('safe external URL boundary', () => {
  afterEach(() => jest.restoreAllMocks());

  it('opens a normalized URL only under the caller-specific exact host policy', async () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue();

    await expect(openSafeExternalUrl('https://unsplash.com', 'unsplashProfile')).resolves.toBe(true);

    expect(openUrl).toHaveBeenCalledWith('https://unsplash.com/');
    expect(getSafeExternalUrl('https://creativecommons.org/licenses/by/4.0/', 'unsplashProfile')).toBeNull();
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,attack',
    'file:///etc/passwd',
    'intent://attack',
    'tel:+15551234',
    'http://unsplash.com/@traveler',
    '//unsplash.com/@traveler',
    'https://unsplash.com@evil.example/',
    'https://user:pass@unsplash.com/',
    'https://unsplash.com.evil.example/',
    'https://evil-unsplash.com/',
    'https://unsplash.com:444/',
    'https://unsplash.com:443/',
    'https://unsplash.com\\@evil.example/',
    'https://unsplash.com/%not-encoded',
    'https://unsplash.com/%0Aattack',
    'https://unsplash.com/%C2%85attack',
    'https://unsplash.com/%E2%80%AEattack',
    'https://unsplash.com/%5C@evil.example',
    'https://unsplash.com/%250Aattack',
    'https://unsplash.com/%2525250Aattack',
    'https://unsplаsh.com/',
    'https://unsplash.com/\nattack',
    'https://unsplash.com/\u202Eattack',
  ])('blocks unsafe or ambiguous URL %s', (value) => {
    expect(getSafeExternalUrl(value, 'unsplashProfile')).toBeNull();
  });

  it('maps destination source IDs to separate allowlists', () => {
    expect(destinationSourceUrlPolicy('weather')).toBe('destinationWeather');
    expect(destinationSourceUrlPolicy('closestAirport')).toBe('destinationAirport');
    expect(destinationSourceUrlPolicy('unknown')).toBeNull();
    expect(getSafeExternalUrl('https://openweathermap.org/', 'destinationWeather')).toBeTruthy();
    expect(getSafeExternalUrl('https://ourairports.com/', 'destinationWeather')).toBeNull();
  });

  it('does not invoke Linking for a rejected URL', async () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue();
    openUrl.mockClear();

    await expect(openSafeExternalUrl('https://commons.wikimedia.org.evil.example/', 'wikimediaSource'))
      .rejects.toThrow('Unsafe external URL');

    expect(openUrl).not.toHaveBeenCalled();
  });
});
