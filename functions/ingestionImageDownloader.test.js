const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');

const { allowedImageUrl, downloadSourceImage } = require('./ingestionImageDownloader');
const apify = require('./apifyFacebookGroupsProvider');

const CDN = 'https://scontent.xx.fbcdn.net/v/photo.jpg';

function response(status, body = Buffer.alloc(0), headers = {}) {
  return new Response(status >= 300 && status < 400 ? null : body, {
    status,
    headers: { 'content-type': 'image/jpeg', ...headers },
  });
}

async function syntheticJpeg(width = 800, height = 600) {
  return sharp({ create: { width, height, channels: 3, background: '#336699' } }).jpeg().withMetadata({
    exif: { IFD0: { Copyright: 'synthetic' } },
  }).toBuffer();
}

test('only https Facebook CDN hosts are downloadable', () => {
  assert.ok(allowedImageUrl(CDN));
  for (const url of ['http://scontent.xx.fbcdn.net/a.jpg', 'https://fbcdn.net.evil.example/a.jpg',
    'https://evil.example/a.jpg', 'https://user:pass@scontent.fbcdn.net/a.jpg', 'https://scontent.fbcdn.net:8443/a.jpg',
    'https://169.254.169.254/latest']) {
    assert.equal(allowedImageUrl(url), null, url);
  }
});

test('a valid image becomes a metadata-free JPEG', async () => {
  const source = await syntheticJpeg();
  const result = await downloadSourceImage(CDN, { fetchImpl: async () => response(200, source) });
  const metadata = await sharp(result.buffer).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.exif, undefined);
  assert.equal(result.width, 800);
});

test('downloads reject expiry, wrong type, oversize, tiny images, and off-host redirects', async () => {
  const reason = async (fetchImpl, options = {}) => {
    try {
      await downloadSourceImage(CDN, { fetchImpl, ...options });
      return 'ok';
    } catch (error) {
      return error.reason;
    }
  };
  assert.equal(await reason(async () => response(403)), 'image_expired');
  assert.equal(await reason(async () => response(200, Buffer.from('<html>'), { 'content-type': 'text/html' })), 'image_type_invalid');
  assert.equal(await reason(async () => response(200, await syntheticJpeg()), { maxBytes: 100 }), 'image_too_large');
  assert.equal(await reason(async () => response(200, await syntheticJpeg(200, 200))), 'image_too_small');
  assert.equal(await reason(async () => response(200, Buffer.from('not an image'))), 'image_invalid');
  assert.equal(await reason(async () => response(302, undefined, { location: 'https://evil.example/x.jpg' })), 'image_redirect_refused');
  assert.equal(await reason(async (_url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }), { timeoutMs: 10 }), 'image_download_timeout');
});

test('provider runs carry provider-side item and charge caps', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: new URL(url), options });
    return new Response(JSON.stringify({ data: { id: 'run-1', status: 'RUNNING', defaultDatasetId: 'ds-1' } }), { status: 201 });
  };
  const run = await apify.startGroupRun({
    token: 'synthetic-token', fetchImpl, groupUrl: 'https://www.facebook.com/groups/123/',
    resultsLimit: 10, onlyPostsNewerThan: '2026-04-01', maxTotalChargeUsd: 0.25,
  });
  assert.equal(run.providerRunId, 'run-1');
  const { url, options } = requests[0];
  assert.equal(url.pathname, '/v2/acts/apify~facebook-groups-scraper/runs');
  assert.equal(url.searchParams.get('maxItems'), '10');
  assert.equal(url.searchParams.get('maxTotalChargeUsd'), '0.25');
  assert.equal(options.redirect, 'error');
  assert.equal(url.searchParams.has('token'), false, 'the token is sent only in a header');
  const body = JSON.parse(options.body);
  assert.deepEqual(body, {
    startUrls: [{ url: 'https://www.facebook.com/groups/123/' }], resultsLimit: 10,
    viewOption: 'CHRONOLOGICAL', onlyPostsNewerThan: '2026-04-01',
  });
  await assert.rejects(apify.startGroupRun({ token: 't', fetchImpl: async () => { throw new Error('reset'); },
    groupUrl: 'https://www.facebook.com/groups/123/', resultsLimit: 1, onlyPostsNewerThan: '2026-04-01', maxTotalChargeUsd: 0.1 }),
  (error) => error.details?.uncertain === true);
  await assert.rejects(apify.startGroupRun({ token: 't', fetchImpl: async () => new Response('{}', { status: 402 }),
    groupUrl: 'https://www.facebook.com/groups/123/', resultsLimit: 1, onlyPostsNewerThan: '2026-04-01', maxTotalChargeUsd: 0.1 }),
  (error) => error.details?.uncertain === false);
});
