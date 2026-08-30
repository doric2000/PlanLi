import { Linking } from 'react-native';

const UNSAFE_URL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/u;
const MALFORMED_PERCENT_ENCODING = /%(?![0-9A-Fa-f]{2})/u;

function hasEncodedUnsafeCharacters(value) {
  let decoded = value;
  for (let attempt = 0; attempt <= value.length; attempt += 1) {
    let next;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return true;
    }
    if (next === decoded) return false;
    if (UNSAFE_URL_CHARACTERS.test(next) || next.includes('\\')) return true;
    decoded = next;
  }
  return false;
}

export const EXTERNAL_URL_POLICIES = Object.freeze({
  googleMaps: Object.freeze(['www.google.com']),
  waze: Object.freeze(['waze.com']),
  destinationWeather: Object.freeze(['openweathermap.org']),
  destinationAirport: Object.freeze(['ourairports.com']),
  destinationCurrency: Object.freeze(['www.exchangerate-api.com']),
  destinationCountry: Object.freeze(['www.npmjs.com']),
  unsplashProfile: Object.freeze(['unsplash.com']),
  wikimediaSource: Object.freeze(['commons.wikimedia.org']),
  creativeCommonsLicense: Object.freeze(['creativecommons.org']),
});

const DESTINATION_SOURCE_POLICIES = Object.freeze({
  weather: 'destinationWeather',
  closestAirport: 'destinationAirport',
  currency: 'destinationCurrency',
  country: 'destinationCountry',
});

export function destinationSourceUrlPolicy(sourceId) {
  return DESTINATION_SOURCE_POLICIES[String(sourceId || '').trim()] || null;
}

export function getSafeExternalUrl(value, policyName) {
  if (typeof value !== 'string' || !EXTERNAL_URL_POLICIES[policyName]) return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > 2048 || value !== candidate ||
      UNSAFE_URL_CHARACTERS.test(value) || candidate.includes('\\')) return null;
  if (MALFORMED_PERCENT_ENCODING.test(candidate)) return null;
  if (hasEncodedUnsafeCharacters(candidate)) return null;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    const authority = candidate.match(/^https:\/\/([^/?#]*)/iu)?.[1] || '';
    if (!authority || authority.toLowerCase() !== parsed.hostname.toLowerCase()) return null;
    if (!EXTERNAL_URL_POLICIES[policyName].includes(parsed.hostname.toLowerCase())) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export async function openSafeExternalUrl(value, policyName) {
  const safeUrl = getSafeExternalUrl(value, policyName);
  if (!safeUrl) throw new Error('Unsafe external URL was blocked.');
  await Linking.openURL(safeUrl);
  return true;
}
