const sharp = require('sharp');

const { MAX_SOURCE_BYTES, MAX_SOURCE_DIMENSION, MAX_SOURCE_PIXELS } = require('./mediaProcessor');

const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 2;
const MIN_IMAGE_EDGE = 400;
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
// Facebook post images are served from its CDN. Any other host is refused.
const ALLOWED_HOST_SUFFIXES = Object.freeze(['.fbcdn.net']);

class ImageDownloadError extends Error {
  constructor(reason, message) {
    super(message || reason);
    this.reason = reason;
  }
}

function allowedImageUrl(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    return null;
  }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (!ALLOWED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix) && hostname.length > suffix.length)) {
    return null;
  }
  return url;
}

async function readBounded(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new ImageDownloadError('image_too_large');
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new ImageDownloadError('image_too_large');
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ImageDownloadError('image_too_large');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

// Downloads one source image and returns a metadata-free JPEG suitable for the
// canonical media pipeline. Expired provider URLs surface as image_expired.
async function downloadSourceImage(rawUrl, {
  fetchImpl = global.fetch,
  timeoutMs = DOWNLOAD_TIMEOUT_MS,
  maxBytes = MAX_SOURCE_BYTES,
} = {}) {
  let url = allowedImageUrl(rawUrl);
  if (!url) throw new ImageDownloadError('image_host_not_allowed');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    for (let redirects = 0; ; redirects += 1) {
      // eslint-disable-next-line no-await-in-loop
      response = await fetchImpl(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { Accept: 'image/jpeg,image/png,image/webp' },
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      if (redirects >= MAX_REDIRECTS) throw new ImageDownloadError('image_redirect_refused');
      url = allowedImageUrl(new URL(response.headers.get('location') || '', url).toString());
      if (!url) throw new ImageDownloadError('image_redirect_refused');
    }
    if ([403, 404, 410].includes(response.status)) throw new ImageDownloadError('image_expired');
    if (!response.ok) throw new ImageDownloadError('image_download_failed');
    const contentType = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) throw new ImageDownloadError('image_type_invalid');
    const source = await readBounded(response, maxBytes);
    let metadata;
    try {
      metadata = await sharp(source, { failOn: 'warning', limitInputPixels: MAX_SOURCE_PIXELS }).metadata();
    } catch {
      throw new ImageDownloadError('image_invalid');
    }
    if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw new ImageDownloadError('image_type_invalid');
    const width = Number(metadata.width);
    const height = Number(metadata.height);
    if (!(width >= MIN_IMAGE_EDGE && height >= MIN_IMAGE_EDGE)) throw new ImageDownloadError('image_too_small');
    if (width > MAX_SOURCE_DIMENSION || height > MAX_SOURCE_DIMENSION) throw new ImageDownloadError('image_too_large');
    const jpeg = await sharp(source, { failOn: 'warning', limitInputPixels: MAX_SOURCE_PIXELS })
      .rotate()
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    if (jpeg.length > maxBytes) throw new ImageDownloadError('image_too_large');
    return { buffer: jpeg, width, height, sourceBytes: source.length };
  } catch (error) {
    if (error instanceof ImageDownloadError) throw error;
    if (error?.name === 'AbortError') throw new ImageDownloadError('image_download_timeout');
    throw new ImageDownloadError('image_download_failed');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  ALLOWED_HOST_SUFFIXES,
  ImageDownloadError,
  MIN_IMAGE_EDGE,
  allowedImageUrl,
  downloadSourceImage,
};
