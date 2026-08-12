export const LEGACY_GENERIC_DESTINATION_IMAGE =
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800';

function isUsableLegacyUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  if (value === LEGACY_GENERIC_DESTINATION_IMAGE) return false;
  return !value.includes('/maps/api/place/photo') &&
    !value.includes('maps.googleapis.com/maps/api/place/photo');
}

export function getDestinationImageUrl(destination, variant = 'feed') {
  const urls = destination?.destinationImage?.urls;
  const preferred = urls?.[variant] || urls?.feed || urls?.large || urls?.thumb;
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
  const image = destination?.destinationImage;
  return ['unsplash', 'wikimedia'].includes(image?.source?.type) ? image.attribution || null : null;
}
