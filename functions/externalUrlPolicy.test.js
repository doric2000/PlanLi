const test = require('node:test');
const assert = require('node:assert/strict');

const { safeExactHttpsUrl } = require('./externalUrlPolicy');

test('exact HTTPS policy accepts the expected host and serialized URL', () => {
  assert.equal(
    safeExactHttpsUrl('https://commons.wikimedia.org/wiki/File:Example.jpg', 'commons.wikimedia.org'),
    'https://commons.wikimedia.org/wiki/File:Example.jpg'
  );
});

test('exact HTTPS policy rejects schemes, origin tricks, controls and encoded ambiguity', () => {
  const values = [
    'javascript:alert(1)',
    'http://commons.wikimedia.org/',
    'https://commons.wikimedia.org@evil.example/',
    'https://commons.wikimedia.org.evil.example/',
    'https://commons.wikimedia.org:443/',
    'https://commons.wikimedia.org\\@evil.example/',
    'https://commons.wikimedia.org/%not-encoded',
    'https://commons.wikimedia.org/%0Aattack',
    'https://commons.wikimedia.org/%C2%85attack',
    'https://commons.wikimedia.org/%E2%80%AEattack',
    'https://commons.wikimedia.org/%5C@evil.example',
    'https://commons.wikimedia.org/%250Aattack',
    'https://commons.wikimedia.org/%2525250Aattack',
  ];
  values.forEach((value) => assert.equal(
    safeExactHttpsUrl(value, 'commons.wikimedia.org'),
    null,
    value
  ));
});
