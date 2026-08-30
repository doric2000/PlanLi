const { normalize } = require('./destinationIdentityService');
const { safeExactHttpsUrl } = require('./externalUrlPolicy');

const PROVIDER_NAME = 'Wikimedia Commons';
const PROVIDER_URL = 'https://commons.wikimedia.org/';
const USER_AGENT = process.env.WIKIMEDIA_USER_AGENT || 'PlanLi destination image resolver/1.0';
const SEARCH_LANGUAGES = ['he', 'en'];
const SEARCH_RADIUS_METERS = 10000;
const SEARCH_RESULT_LIMIT = 12;
const MIN_IMAGE_WIDTH = 1200;
const MIN_IMAGE_HEIGHT = 700;
const MIN_LANDSCAPE_RATIO = 1.15;
const VARIANT_WIDTHS = Object.freeze({ large: 1600, feed: 1080, thumb: 400 });
const UNSUITABLE_CITY_IMAGE_TERMS = [
  'unsplash', 'cemetery', 'grave', 'tomb', 'memorial', 'attack', 'war',
  'portrait', 'selfie', 'children', 'stadium', 'interchange', 'logo', 'flag',
  'coat of arms', 'map', 'בית קברות', 'אנדרטה', 'פיגוע', 'אצטדיון', 'לוגו', 'דגל',
];
const REPRESENTATIVE_CITY_IMAGE_TERMS = [
  'aerial', 'skyline', 'panorama', 'city view', 'town square', 'street', 'promenade',
  'municipality', 'city hall', 'town hall', 'science park', 'park', 'city center',
  'נוף', 'תצפית', 'כיכר', 'רחוב', 'מדרחוב', 'עירייה', 'פארק', 'מרכז העיר',
];
const MEDIAWIKI_MIN_REQUEST_INTERVAL_MS = Math.max(
  250,
  Number(process.env.MEDIAWIKI_MIN_REQUEST_INTERVAL_MS || 1000)
);
let mediaWikiRequestTail = Promise.resolve();
let lastMediaWikiRequestAt = 0;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function metadataValue(imageInfo, name) {
  return decodeHtml(imageInfo?.extmetadata?.[name]?.value);
}

async function mediaWikiRequest(host, params, fetchImpl = global.fetch) {
  const url = new URL(`https://${host}/w/api.php`);
  Object.entries({ action: 'query', format: 'json', origin: '*', ...params })
    .forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const request = async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (fetchImpl === global.fetch) {
        const waitMs = Math.max(0, MEDIAWIKI_MIN_REQUEST_INTERVAL_MS - (Date.now() - lastMediaWikiRequestAt));
        if (waitMs) await sleep(waitMs);
        lastMediaWikiRequestAt = Date.now();
      }
      const result = await fetchImpl(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      });
      if (result.status !== 429 || attempt > 0) return result;
      const retryAfter = Number(result.headers?.get?.('retry-after'));
      await sleep(Math.max(MEDIAWIKI_MIN_REQUEST_INTERVAL_MS, Number.isFinite(retryAfter) ? retryAfter * 1000 : 5000));
    }
    return null;
  };
  const response = fetchImpl === global.fetch
    ? await (mediaWikiRequestTail = mediaWikiRequestTail.catch(() => {}).then(request))
    : await request();
  if (!response.ok) {
    const error = new Error(`${host} request failed with HTTP ${response.status}.`);
    error.status = response.status;
    const retryAfter = Number(response.headers?.get?.('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfterMs = retryAfter * 1000;
    throw error;
  }
  return response.json();
}

function cityCoordinates(city) {
  const value = city?.googleCache?.coordinates || city?.identity?.coordinates || city?.coordinates;
  const lat = Number(value?.lat ?? value?.latitude);
  const lng = Number(value?.lng ?? value?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function cityNames(city) {
  const google = city?.googleCache?.names || {};
  const identity = city?.identity?.names || {};
  return {
    he: String(google.he || identity.he || '').trim() || null,
    en: String(identity.en || google.en || '').trim() || null,
  };
}

async function exactNearbyWikipediaPage(city, fetchImpl = global.fetch) {
  const coordinates = cityCoordinates(city);
  const names = cityNames(city);
  if (!coordinates) return null;

  for (const language of SEARCH_LANGUAGES) {
    const expectedName = names[language];
    if (!expectedName) continue;
    const payload = await mediaWikiRequest(`${language}.wikipedia.org`, {
      list: 'geosearch',
      gscoord: `${coordinates.lat}|${coordinates.lng}`,
      gsradius: SEARCH_RADIUS_METERS,
      gslimit: 20,
      gsnamespace: 0,
    }, fetchImpl);
    const match = (payload?.query?.geosearch || []).find((page) =>
      normalize(page?.title) === normalize(expectedName)
    );
    if (!match) continue;

    const details = await mediaWikiRequest(`${language}.wikipedia.org`, {
      pageids: match.pageid,
      prop: 'langlinks',
      lllang: 'en',
      lllimit: 1,
    }, fetchImpl);
    const page = details?.query?.pages?.[match.pageid] || {};
    const aliases = [...new Set([
      names.en,
      names.he,
      match.title,
      ...(page.langlinks || []).map((entry) => entry['*']),
    ].filter(Boolean))];
    return {
      language,
      pageId: match.pageid,
      pageTitle: match.title,
      distanceKm: Number((Number(match.dist || 0) / 1000).toFixed(1)),
      aliases,
    };
  }
  return null;
}

function isAllowedLicense(imageInfo) {
  const license = metadataValue(imageInfo, 'LicenseShortName').toLowerCase();
  return license === 'public domain' || license === 'cc0' ||
    license.startsWith('cc by ') || license.startsWith('cc by-sa ');
}

function imageText(page, imageInfo) {
  return [
    page?.title,
    metadataValue(imageInfo, 'ObjectName'),
    metadataValue(imageInfo, 'ImageDescription'),
  ].filter(Boolean).join(' ');
}

function usableCommonsCandidate(page, aliases) {
  const imageInfo = page?.imageinfo?.[0];
  if (!imageInfo ||
    !safeExactHttpsUrl(imageInfo.thumburl, 'upload.wikimedia.org') ||
    !safeExactHttpsUrl(imageInfo.descriptionurl, 'commons.wikimedia.org')) return false;
  if (!/\.(?:jpe?g|webp)$/i.test(String(page.title || ''))) return false;
  if (Number(imageInfo.width || 0) < MIN_IMAGE_WIDTH || Number(imageInfo.height || 0) < MIN_IMAGE_HEIGHT) return false;
  const ratio = Number(imageInfo.width || 0) / Number(imageInfo.height || 1);
  if (!Number.isFinite(ratio) || ratio < MIN_LANDSCAPE_RATIO) return false;
  if (!isAllowedLicense(imageInfo)) return false;
  const haystack = normalize(imageText(page, imageInfo));
  if (UNSUITABLE_CITY_IMAGE_TERMS.some((term) => haystack.includes(normalize(term)))) return false;
  return aliases.some((alias) => {
    const needle = normalize(alias);
    return needle && ` ${haystack} `.includes(` ${needle} `);
  });
}

function candidateQualityScore(page) {
  const imageInfo = page?.imageinfo?.[0];
  const haystack = normalize(imageText(page, imageInfo));
  const representativeTerms = REPRESENTATIVE_CITY_IMAGE_TERMS
    .filter((term) => haystack.includes(normalize(term))).length;
  const ratio = Number(imageInfo?.width || 0) / Number(imageInfo?.height || 1);
  const ratioScore = ratio >= 1.35 && ratio <= 2.4 ? 12 : 0;
  return representativeTerms * 30 + ratioScore - Math.max(0, Number(page?.index || 1) - 1);
}

function preferredSearchAliases(aliases) {
  const unique = [...new Set((aliases || []).map((value) => String(value || '').trim()).filter(Boolean))];
  return unique.sort((left, right) => {
    const leftAscii = /^[\x00-\x7F]+$/.test(left) ? 0 : 1;
    const rightAscii = /^[\x00-\x7F]+$/.test(right) ? 0 : 1;
    return leftAscii - rightAscii;
  }).slice(0, 3);
}

async function searchCommonsImage(aliases, fetchImpl = global.fetch) {
  let fallback = null;
  for (const alias of preferredSearchAliases(aliases)) {
    const payload = await mediaWikiRequest('commons.wikimedia.org', {
      generator: 'search',
      gsrsearch: alias,
      gsrnamespace: 6,
      gsrlimit: SEARCH_RESULT_LIMIT,
      prop: 'imageinfo',
      iiprop: 'url|size|extmetadata',
      iiurlwidth: VARIANT_WIDTHS.large,
    }, fetchImpl);
    const pages = Object.values(payload?.query?.pages || {}).sort((left, right) =>
      Number(left.index || 0) - Number(right.index || 0)
    );
    const candidates = pages.filter((page) => usableCommonsCandidate(page, aliases))
      .sort((left, right) => candidateQualityScore(right) - candidateQualityScore(left));
    const selected = candidates[0];
    if (!selected) continue;
    const result = { alias, page: selected };
    if (candidateQualityScore(selected) >= 20) return result;
    if (!fallback || candidateQualityScore(selected) > candidateQualityScore(fallback.page)) fallback = result;
  }
  return fallback;
}

async function imageVariant(fileTitle, width, fetchImpl = global.fetch) {
  const payload = await mediaWikiRequest('commons.wikimedia.org', {
    titles: fileTitle,
    prop: 'imageinfo',
    iiprop: 'url|size|extmetadata',
    iiurlwidth: width,
  }, fetchImpl);
  const page = Object.values(payload?.query?.pages || {})[0];
  const imageInfo = page?.imageinfo?.[0];
  const url = imageInfo?.thumburl || imageInfo?.url;
  const safeUrl = safeExactHttpsUrl(url, 'upload.wikimedia.org');
  return safeUrl ? {
    url: safeUrl,
    width: Number(imageInfo.thumbwidth || imageInfo.width || 0),
    height: Number(imageInfo.thumbheight || imageInfo.height || 0),
    imageInfo,
  } : null;
}

function variantFromImageInfo(imageInfo, width) {
  const originalWidth = Number(imageInfo?.width || 0);
  const originalHeight = Number(imageInfo?.height || 0);
  if (!originalWidth || !originalHeight) return null;
  const targetWidth = Math.min(width, originalWidth);
  const originalUrl = safeExactHttpsUrl(imageInfo?.url, 'upload.wikimedia.org');
  const thumbnailUrl = safeExactHttpsUrl(imageInfo?.thumburl, 'upload.wikimedia.org');
  if (targetWidth === originalWidth && originalUrl) {
    return { url: originalUrl, width: originalWidth, height: originalHeight };
  }
  if (!thumbnailUrl || !originalUrl) return null;
  const url = new URL(thumbnailUrl);
  const segments = url.pathname.split('/');
  const fileName = segments.at(-1);
  if (/^\d+px-/.test(fileName || '')) {
    segments[segments.length - 1] = fileName.replace(/^\d+px-/, `${targetWidth}px-`);
    url.pathname = segments.join('/');
  } else {
    const original = new URL(originalUrl);
    const originalSegments = original.pathname.split('/');
    const commonsIndex = originalSegments.indexOf('commons');
    const originalFileName = originalSegments.at(-1);
    if (commonsIndex < 0 || !originalFileName) return null;
    originalSegments.splice(commonsIndex + 1, 0, 'thumb');
    originalSegments.push(`${targetWidth}px-${originalFileName}`);
    original.pathname = originalSegments.join('/');
    return {
      url: original.toString(),
      width: targetWidth,
      height: Math.round(targetWidth * originalHeight / originalWidth),
    };
  }
  return {
    url: url.toString(),
    width: targetWidth,
    height: Math.round(targetWidth * originalHeight / originalWidth),
  };
}

function buildAttribution(imageInfo) {
  const creator = metadataValue(imageInfo, 'Artist') || 'Wikimedia Commons contributor';
  const photoUrl = safeExactHttpsUrl(imageInfo.descriptionurl, 'commons.wikimedia.org');
  return {
    photographerName: creator,
    photographerProfileUrl: photoUrl,
    photoUrl,
    providerName: PROVIDER_NAME,
    providerUrl: PROVIDER_URL,
    licenseName: metadataValue(imageInfo, 'LicenseShortName') || null,
    licenseUrl: safeExactHttpsUrl(metadataValue(imageInfo, 'LicenseUrl'), 'creativecommons.org'),
  };
}

async function resolveWikimediaDestinationImage({ city, fetchImpl = global.fetch }) {
  const wikipedia = await exactNearbyWikipediaPage(city, fetchImpl);
  if (!wikipedia) return null;
  const selected = await searchCommonsImage(wikipedia.aliases, fetchImpl);
  if (!selected) return null;
  const variantMap = {};
  for (const [name, width] of Object.entries(VARIANT_WIDTHS)) {
    variantMap[name] = await imageVariant(selected.page.title, width, fetchImpl);
  }
  if (!variantMap.large || !variantMap.feed || !variantMap.thumb) return null;
  const imageInfo = variantMap.large.imageInfo || selected.page.imageinfo?.[0];
  return {
    source: {
      type: 'wikimedia',
      pageId: String(wikipedia.pageId),
      pageTitle: wikipedia.pageTitle,
      fileName: String(selected.page.title || '').replace(/^File:/, ''),
    },
    urls: {
      large: variantMap.large.url,
      feed: variantMap.feed.url,
      thumb: variantMap.thumb.url,
    },
    width: variantMap.large.width,
    height: variantMap.large.height,
    color: null,
    blurHash: null,
    alt: metadataValue(imageInfo, 'ImageDescription') || wikipedia.pageTitle,
    attribution: buildAttribution(imageInfo),
    selection: {
      strategy: 'verified_wikipedia_commons',
      query: selected.alias,
      rank: Number(selected.page.index || 1),
      validation: {
        version: 1,
        status: 'text_verified',
        method: 'exact_nearby_wikipedia_page_and_commons_metadata',
        distanceKm: wikipedia.distanceKm,
      },
    },
  };
}

module.exports = {
  buildAttribution,
  candidateQualityScore,
  cityCoordinates,
  cityNames,
  decodeHtml,
  exactNearbyWikipediaPage,
  imageVariant,
  isAllowedLicense,
  mediaWikiRequest,
  preferredSearchAliases,
  resolveWikimediaDestinationImage,
  searchCommonsImage,
  usableCommonsCandidate,
  variantFromImageInfo,
};
