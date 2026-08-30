const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAttribution,
  candidateQualityScore,
  decodeHtml,
  resolveWikimediaDestinationImage,
  usableCommonsCandidate,
  variantFromImageInfo,
} = require('./wikimediaDestinationImageService');

const city = {
  googleCache: {
    names: { he: 'כפר סבא', en: 'Kefar Sava' },
    coordinates: { lat: 32.1782, lng: 34.9076 },
  },
};

function response(payload) {
  return { ok: true, json: async () => payload };
}

function imageInfo({
  title = 'File:Kfar Saba street.jpg',
  license = 'CC BY-SA 4.0',
  width = 1885,
  height = 1257,
  description = 'Kfar Saba city street',
} = {}) {
  return {
    title,
    index: 1,
    imageinfo: [{
      width,
      height,
      thumbwidth: Math.min(width, 1600),
      thumbheight: Math.round(Math.min(width, 1600) / (width / height)),
      url: 'https://upload.wikimedia.org/wikipedia/commons/2/24/Kfar_Saba_street.jpg',
      thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Kfar_Saba_street.jpg/1600px-Kfar_Saba_street.jpg',
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
      extmetadata: {
        LicenseShortName: { value: license },
        LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' },
        Artist: { value: '<a href="https://commons.wikimedia.org/wiki/User:Traveler">Traveler</a>' },
        ImageDescription: { value: description },
      },
    }],
  };
}

test('Wikimedia metadata decoding removes literal and encoded markup before publication', () => {
  assert.equal(decodeHtml('<b>Traveler</b> &amp; Co'), 'Traveler & Co');
  assert.equal(
    decodeHtml('&lt;script&gt;alert(1)&lt;/script&gt;Safe'),
    'alert(1) Safe',
  );
  assert.equal(
    decodeHtml('&amp;lt;img src=x onerror=alert(1)&amp;gt;Safe'),
    'Safe',
  );
  assert.equal(
    decodeHtml('&#x3c;script&#x3e;alert(1)&#60;/script&#62;Safe'),
    'alert(1) Safe',
  );
  assert.equal(decodeHtml('Bad: &#999999999999; Safe'), 'Bad: � Safe');
  assert.equal(decodeHtml('Before&#0;After'), 'Before After');
});

test('Commons candidates must be licensed landscape photos that name the exact city', () => {
  assert.equal(usableCommonsCandidate(imageInfo(), ['Kfar Saba']), true);
  assert.equal(usableCommonsCandidate(imageInfo({ title: 'File:Kfar Saba logo.svg' }), ['Kfar Saba']), false);
  assert.equal(usableCommonsCandidate(imageInfo({ license: 'All Rights Reserved' }), ['Kfar Saba']), false);
  assert.equal(usableCommonsCandidate(imageInfo({ width: 700, height: 1400 }), ['Kfar Saba']), false);
  assert.equal(usableCommonsCandidate(imageInfo({ title: 'File:Jerusalem.jpg', description: 'Jerusalem city street' }), ['Kfar Saba']), false);
  assert.equal(usableCommonsCandidate(imageInfo({ title: 'File:Kfar Saba (Unsplash).jpg' }), ['Kfar Saba']), false);
  assert.ok(candidateQualityScore(imageInfo({ description: 'Kfar Saba aerial city view' })) >
    candidateQualityScore(imageInfo({ description: 'Kfar Saba' })));
});

test('Commons candidates and attribution reject deceptive external origins', () => {
  const deceptiveSource = imageInfo();
  deceptiveSource.imageinfo[0].descriptionurl = 'https://commons.wikimedia.org.evil.example/wiki/File:Example.jpg';
  assert.equal(usableCommonsCandidate(deceptiveSource, ['Kfar Saba']), false);

  const deceptiveLicense = imageInfo().imageinfo[0];
  deceptiveLicense.extmetadata.LicenseUrl.value = 'javascript:alert(1)';
  assert.equal(buildAttribution(deceptiveLicense).licenseUrl, null);
  assert.equal(buildAttribution(deceptiveLicense).photoUrl, 'https://commons.wikimedia.org/wiki/File:Example.jpg');
});

test('Wikimedia fallback anchors aliases to an exact nearby Wikipedia city page', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(url);
    calls.push(parsed);
    if (parsed.hostname === 'he.wikipedia.org' && parsed.searchParams.get('list') === 'geosearch') {
      return response({ query: { geosearch: [
        { pageid: 15, title: 'כפר סבא', dist: 573 },
        { pageid: 16, title: 'רעננה', dist: 4000 },
      ] } });
    }
    if (parsed.hostname === 'he.wikipedia.org') {
      return response({ query: { pages: { 15: { pageid: 15, title: 'כפר סבא', langlinks: [{ lang: 'en', '*': 'Kfar Saba' }] } } } });
    }
    if (parsed.hostname === 'commons.wikimedia.org' && parsed.searchParams.get('generator') === 'search') {
      return response({ query: { pages: { 1: imageInfo() } } });
    }
    const width = Number(parsed.searchParams.get('iiurlwidth'));
    const page = imageInfo();
    page.imageinfo[0].thumburl = `https://upload.wikimedia.org/${width}.jpg`;
    page.imageinfo[0].thumbwidth = width;
    return response({ query: { pages: { 1: page } } });
  };

  const image = await resolveWikimediaDestinationImage({ city, fetchImpl });
  assert.equal(image.source.type, 'wikimedia');
  assert.equal(image.source.pageTitle, 'כפר סבא');
  assert.equal(image.source.fileName, 'Kfar Saba street.jpg');
  assert.equal(image.urls.large, 'https://upload.wikimedia.org/1600.jpg');
  assert.equal(image.urls.feed, 'https://upload.wikimedia.org/1080.jpg');
  assert.equal(image.urls.thumb, 'https://upload.wikimedia.org/400.jpg');
  assert.equal(image.attribution.photographerName, 'Traveler');
  assert.equal(image.attribution.providerName, 'Wikimedia Commons');
  assert.equal(image.selection.validation.distanceKm, 0.6);
  assert.ok(calls.every((url) => url.protocol === 'https:'));
});

test('Wikimedia fallback refuses a nearby page whose title is not the destination', async () => {
  const image = await resolveWikimediaDestinationImage({
    city,
    fetchImpl: async () => response({ query: { geosearch: [{ pageid: 16, title: 'רעננה', dist: 4000 }] } }),
  });
  assert.equal(image, null);
});

test('Wikimedia variants handle APIs that return the original URL for an unscaled thumbnail', () => {
  const info = imageInfo().imageinfo[0];
  info.thumburl = `${info.url}?utm_source=commons.wikimedia.org&utm_content=thumbnail_unscaled`;
  const variant = variantFromImageInfo(info, 400);
  assert.match(variant.url, /\/commons\/thumb\/2\/24\/Kfar_Saba_street\.jpg\/400px-Kfar_Saba_street\.jpg/);
  assert.equal(variant.width, 400);
});
