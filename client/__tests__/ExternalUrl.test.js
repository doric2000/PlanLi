import { isValidExternalUrl, normalizeExternalUrl } from '../src/utils/externalUrl';

describe('external URL normalization', () => {
  it('removes invisible RTL formatting around a valid HTTPS URL', () => {
    expect(normalizeExternalUrl('\u200f https://example.com/place')).toBe('https://example.com/place');
    expect(normalizeExternalUrl('\u2067https://example.com/place\u2069')).toBe('https://example.com/place');
    expect(isValidExternalUrl('\u200e https://example.com/place')).toBe(true);
  });

  it('keeps the HTTP(S)-only contract', () => {
    expect(isValidExternalUrl('')).toBe(true);
    expect(isValidExternalUrl('https://example.com/place')).toBe(true);
    expect(isValidExternalUrl('ftp://example.com/place')).toBe(false);
    expect(isValidExternalUrl('example.com/place')).toBe(false);
    expect(isValidExternalUrl('not a link')).toBe(false);
  });
});
