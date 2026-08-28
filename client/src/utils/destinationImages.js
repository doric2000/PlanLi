export const LEGACY_GENERIC_DESTINATION_IMAGE =
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800';

const ATTRIBUTION_FREE_WIKIMEDIA_LICENSES = ['public domain', 'cc0'];

function normalizedLicenseName(value) {
  return String(value || '').trim().toLowerCase();
}

function isAttributionFreeWikimediaLicense(value) {
  const license = normalizedLicenseName(value);
  return ATTRIBUTION_FREE_WIKIMEDIA_LICENSES.some((allowed) =>
    license === allowed || license.startsWith(`${allowed} `)
  );
}

export function getDestinationCreditPolicy(destination) {
  const image = destination?.destinationImage;
  const sourceType = image?.source?.type;
  const attribution = image?.attribution || null;

  if (sourceType === 'unsplash') {
    const complete = Boolean(
      attribution?.photographerName &&
      attribution?.photographerProfileUrl &&
      attribution?.providerName
    );
    return { mode: complete ? 'inline' : 'blocked', attribution, sourceType };
  }

  if (sourceType === 'wikimedia') {
    if (isAttributionFreeWikimediaLicense(attribution?.licenseName)) {
      return { mode: 'none', attribution, sourceType };
    }
    const complete = Boolean(
      attribution?.photographerName &&
      attribution?.photoUrl &&
      attribution?.licenseName
    );
    return { mode: complete ? 'details' : 'blocked', attribution, sourceType };
  }

  return { mode: 'none', attribution: null, sourceType: sourceType || null };
}

export function canDisplayDestinationImageWithoutCredit(destination) {
  return getDestinationCreditPolicy(destination).mode === 'none';
}

function isUsableLegacyUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (value === LEGACY_GENERIC_DESTINATION_IMAGE) return false;
  return !value.includes('/maps/api/place/photo') &&
    !value.includes('maps.googleapis.com/maps/api/place/photo');
}

export function getDestinationImageUrl(destination, variant = 'feed') {
  const urls = destination?.destinationImage?.urls;
  const blocked = getDestinationCreditPolicy(destination).mode === 'blocked';
  const preferred = blocked ? null : (urls?.[variant] || urls?.feed || urls?.large || urls?.thumb);
  if (preferred) return preferred;
  const legacy = variant === 'thumb'
    ? [destination?.thumbnailUrl, destination?.externalImageUrl, destination?.imageUrl, destination?.heroImageUrl]
    : [destination?.heroImageUrl, destination?.externalImageUrl, destination?.imageUrl, destination?.thumbnailUrl];
  return legacy.find(isUsableLegacyUrl) || null;
}

export function getDestinationPlaceholderColor(destination) {
  return destination?.destinationImage?.color || destination?.placeholderColor || '#E8ECF3';
}

export function getDestinationAttribution(destination) {
  const policy = getDestinationCreditPolicy(destination);
  return ['inline', 'details'].includes(policy.mode) ? policy.attribution : null;
}
