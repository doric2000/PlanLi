export const isDisplayableImageUri = (value) =>
  typeof value === 'string' &&
  /^(https?:|file:|blob:|data:image\/|content:|ph:|assets-library:)/i.test(
    value
  );

export function getMediaVariantUrl(asset, variant = 'large', fallback = null) {
  const candidate = asset?.[variant]?.url;
  if (isDisplayableImageUri(candidate)) return candidate;
  return isDisplayableImageUri(fallback) ? fallback : null;
}

export function getMediaPlaceholder(asset) {
  if (typeof asset?.placeholder?.thumbhash === 'string') {
    return { thumbhash: asset.placeholder.thumbhash };
  }
  if (typeof asset?.placeholder?.color === 'string') {
    return asset.placeholder.color;
  }
  return null;
}

export function getMediaSrcSet(asset) {
  return ['thumb', 'feed', 'large']
    .map((variant) => asset?.[variant])
    .filter(
      (descriptor) =>
        isDisplayableImageUri(descriptor?.url) &&
        Number.isFinite(descriptor?.width)
    )
    .map((descriptor) => `${descriptor.url} ${descriptor.width}w`)
    .join(', ');
}

export function getRecommendationImageUrls(item, variant = 'large') {
  const media = Array.isArray(item?.media) ? item.media : [];
  return Array.from(
    new Set(
      media
        .map((asset) => getMediaVariantUrl(asset, variant))
        .filter(Boolean)
    )
  );
}

export function getRouteImageUrls(route, variant = 'large') {
  const urls = [];
  const add = (asset, fallback = null) => {
    const url = getMediaVariantUrl(asset, variant, fallback);
    if (url) urls.push(url);
  };

  if (Array.isArray(route?.media)) route.media.forEach((asset) => add(asset));
  return Array.from(new Set(urls));
}

export function findMediaAssetByUrl(media, url) {
  if (!isDisplayableImageUri(url) || !Array.isArray(media)) return null;
  return (
    media.find((asset) =>
      ['large', 'feed', 'thumb'].some(
        (variant) => asset?.[variant]?.url === url
      )
    ) || null
  );
}
