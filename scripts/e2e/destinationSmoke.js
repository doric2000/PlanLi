'use strict';
// Focused callable proof against an already running demo suite. It does not
// reseed data, publish content, restart services, or control the shared device.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { ROOT, PROJECT, DIRECTORY, assertLocalEnvironment } = require('./environment');
const { LOCAL_APP_CHECK_TOKEN } = require('../../client/src/config/localEmulators');

async function destinationSmoke({ functionsPort = 5001 } = {}) {
  assertLocalEnvironment();
  assert.ok([5001, 5012].includes(functionsPort), 'Only the local demo Functions ports are supported');
  const fromClient = createRequire(path.join(ROOT, 'client/package.json'));
  const { initializeApp, deleteApp } = fromClient('firebase/app');
  const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = fromClient('firebase/auth');
  const app = initializeApp({ apiKey: 'local', projectId: PROJECT }, 'destination-smoke');
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  try {
    const fixture = JSON.parse(fs.readFileSync(path.join(DIRECTORY, 'fixture.json')));
    const login = await signInWithEmailAndPassword(auth, fixture.email, fixture.password);
    const idToken = await login.user.getIdToken();
    const call = async (name, data) => {
      const response = await fetch(`http://127.0.0.1:${functionsPort}/${PROJECT}/europe-west1/${name}`, {
        method: 'POST', headers: { 'content-type': 'application/json',
          'X-Firebase-AppCheck': LOCAL_APP_CHECK_TOKEN, Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ data }), signal: AbortSignal.timeout(60000),
      });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(`${name}: ${result.error?.status} ${result.error?.message}`);
      return result.result ?? result.data;
    };
    const preview = await call('resolveRecommendationDestination', { placeId: 'local-london',
      supportsDestinationChoice: true, supportsDestinationSearch: true });
    assert.equal(preview.status, 'resolved');
    assert.ok(preview.resolvedPlaceToken, 'Raw Place-ID recovery must return a reusable token');
    const choice = await call('resolveRecommendationDestination', { requestDestinationChoice: true,
      placeId: 'local-london', resolvedPlaceToken: preview.resolvedPlaceToken });
    assert.equal(choice.status, 'destination_choice_required');
    assert.equal(choice.destinationCountryCode, 'GB');
    assert.equal(choice.place.placeId, preview.place.placeId);
    assert.equal(choice.allowDestinationSearch, true);
    const selected = await call('resolvePlaceSelection', { resolutionId: choice.resolutionId,
      destinationRef: { countryId: 'GB', cityId: fixture.cityId } });
    assert.equal(selected.status, 'resolved');
    assert.equal(selected.resolutionSource, 'user_confirmed_destination_binding');
    assert.equal(selected.destination.city.id, fixture.cityId);
    assert.equal(selected.place.placeId, 'local-london');
    assert.equal(selected.resolvedPlaceToken, choice.resolvedPlaceToken);
    assert.notEqual(selected.resolvedPlaceToken, preview.resolvedPlaceToken);
    const original = await call('resolveRecommendationDestination', { resolvedPlaceToken: preview.resolvedPlaceToken });
    assert.equal(original.resolutionSource, preview.resolutionSource, 'Cancelling a change must preserve the committed binding');
    await assert.rejects(call('resolveRecommendationDestination', { requestDestinationChoice: true,
      placeId: 'different-exact-place', resolvedPlaceToken: selected.resolvedPlaceToken }), /does not match/);
    console.log('PASS demo callable flow: verified raw selection, token recovery, change destination, explicit catalog binding, exact-place preservation and mismatched-token rejection. No content was published.');
  } finally { await deleteApp(app); }
}
if (require.main === module) destinationSmoke().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { destinationSmoke };
