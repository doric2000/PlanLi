const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const links = require('../functions/publicLinks');
const { synchronize } = require('./syncPublicLinks');
const root = path.resolve(__dirname, '..');

test('native, server and browser use the same public-link contract', () => {
  assert.deepEqual(synchronize({ check: true }), []);
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(path.join(root, 'hosting/assets/public-links.generated.js'), 'utf8'), sandbox);
  for (const kind of Object.keys(links.paths)) {
    const id = kind === 'trip' ? 'a'.repeat(43) : 'content-1';
    const url = links.shareUrl(kind, id);
    assert.equal(url, `https://planli.cc/${kind}/${id}`);
    assert.equal(sandbox.PlanLiLinks.shareUrl(kind, id), url);
    assert.deepEqual(links.parseUrl(url), { kind, id });
    assert.deepEqual(links.parseUrl(links.deepLink(kind, id)), { kind, id });
    for (const origin of links.legacyOrigins) assert.deepEqual(links.parseUrl(`${origin}/${kind}/${id}`), { kind, id });
  }
});

test('external links cannot inject routes, hosts, query parameters or malformed identifiers', () => {
  for (const url of ['https://planli.cc.evil.test/route/a', 'https://planli.cc@evil.test/route/a',
    'http://planli.cc/route/a', 'https://planli.cc:443/route/a', 'https://planli.cc//route/a',
    'https://planli.cc/route/a/extra', 'https://planli.cc/route/a?screen=AdminPanel',
    'https://planli.cc/route/a#x', 'https://planli.cc/route/%2e%2e', 'https://planli.cc/route/a\n',
    'https://planli.cc/__/auth/action', 'https://planli.cc/admin', 'javascript:alert(1)',
    'https://planli.cc/route/' + 'x'.repeat(181), null, {}]) assert.equal(links.parseUrl(url), null, String(url));
  for (const id of ['', 'a/b', 'a\n', '../x', '%2F', '<script>', 'a?x=1']) {
    assert.throws(() => links.shareUrl('route', id));
  }
});

function landing({ pathname, origin = links.origin, search = '', hash = '' }) {
  const elements = Object.fromEntries(['open-app', 'status', 'ios-store', 'android-store', 'title', 'eyebrow', 'description']
    .map(id => [id, { disabled: true, textContent: '', addEventListener(event, listener) { this[event] = listener; } }]));
  const redirects = []; const launches = [];
  const window = { PlanLiLinks: links, location: { pathname, origin, search, hash,
    replace: url => redirects.push(url), assign: url => launches.push(url) } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'hosting/trip/app.js'), 'utf8'), {
    window, document: { getElementById: id => elements[id] },
  });
  return { elements, redirects, launches };
}

test('landing page preserves legacy trip tokens and handles public content without fetching data', () => {
  const token = 'x'.repeat(43);
  for (const [kind, id] of [['trip', token], ['route', 'route-1'], ['recommendation', 'rec-1']]) {
    const result = landing({ pathname: `/${kind}/${id}` });
    assert.equal(result.elements['open-app'].disabled, false);
    result.elements['open-app'].click();
    assert.deepEqual(result.launches, [links.deepLink(kind, id)]);
    assert.equal(result.elements['ios-store'].href, links.stores.ios);
    assert.equal(result.elements['android-store'].href, links.stores.android);
    const old = landing({ pathname: `/${kind}/${id}`, origin: links.legacyOrigins[0] });
    assert.deepEqual(old.redirects, [links.shareUrl(kind, id)]);
  }
  for (const value of [{ pathname: '/trip/invalid' }, { pathname: '/route/a/extra' },
    { pathname: '/route/a', search: '?redirect=https://evil.test' }]) {
    const result = landing(value);
    assert.equal(result.elements['open-app'].disabled, true);
    assert.equal(result.redirects.length, 0);
    assert.equal(result.launches.length, 0);
  }
});

test('association files limit app entry to share paths and Hosting includes them', () => {
  const ios = JSON.parse(fs.readFileSync(path.join(root, 'hosting/.well-known/apple-app-site-association')));
  assert.deepEqual(ios.applinks.details[0].paths, ['/trip/*', '/route/*', '/recommendation/*']);
  const android = JSON.parse(fs.readFileSync(path.join(root, 'hosting/.well-known/assetlinks.json')));
  assert.equal(android[0].target.package_name, 'com.planli.planlitravels');
  assert.ok(android[0].target.sha256_cert_fingerprints.every(value => /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value)));
  const hosting = require('../firebase.json').hosting;
  assert.equal(hosting.appAssociation, 'NONE');
  assert.ok(hosting.ignore.includes('!**/.well-known/**'));
  for (const kind of Object.keys(links.paths)) assert.ok(hosting.rewrites.some(r => r.source === `/${kind}/**`));
});

test('public support pages and store fallback links agree with the shared contract', () => {
  for (const page of ['support', 'privacy', 'terms', 'account-deletion', 'community-guidelines']) {
    const html = fs.readFileSync(path.join(root, `hosting/${page}/index.html`), 'utf8');
    assert.ok(html.includes(links.supportEmail), page);
    assert.ok(!html.includes('planli.travel.il@gmail.com'), page);
  }
  const landingHtml = fs.readFileSync(path.join(root, 'hosting/trip/index.html'), 'utf8');
  for (const store of Object.values(links.stores)) assert.ok(landingHtml.includes(store));
});
