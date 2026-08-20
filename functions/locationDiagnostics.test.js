const test = require('node:test');
const assert = require('node:assert/strict');
const { HttpsError } = require('firebase-functions/v2/https');

const {
  createIncidentId,
  decorateLocationError,
  locationLog,
} = require('./locationDiagnostics');

test('location callable errors expose only a stable reason, incident ID and retry flag', () => {
  const incidentId = createIncidentId('loc_1234567890ab');
  const decorated = decorateLocationError(
    new HttpsError('deadline-exceeded', 'Google Places took too long to respond.'),
    incidentId,
    'selection_failed'
  );

  assert.equal(decorated.code, 'deadline-exceeded');
  assert.deepEqual(decorated.details, {
    reason: 'provider_timeout',
    incidentId,
    retryable: true,
  });
});

test('expired sessions remain distinct from provider timeouts', () => {
  const decorated = decorateLocationError(
    new HttpsError('deadline-exceeded', 'The place search has expired. Search again.'),
    'loc_1234567890ab',
    'selection_failed'
  );
  assert.equal(decorated.details.reason, 'selection_expired');
  assert.equal(decorated.details.retryable, false);
});

test('daily quota and provider request ceilings are non-retryable', () => {
  const daily = decorateLocationError(
    new HttpsError('resource-exhausted', 'The daily location limit has been reached.'),
    'loc_1234567890ab',
    'selection_failed'
  );
  const ceiling = decorateLocationError(
    new HttpsError('resource-exhausted', 'Location resolution reached its safe Google request limit.'),
    'loc_1234567890ab',
    'selection_failed'
  );
  assert.deepEqual(daily.details, {
    reason: 'daily_limit_reached', incidentId: 'loc_1234567890ab', retryable: false,
  });
  assert.equal(ceiling.details.reason, 'provider_call_limit_reached');
  assert.equal(ceiling.details.retryable, false);
});

test('temporary minute quota remains retryable', () => {
  const decorated = decorateLocationError(
    new HttpsError('resource-exhausted', 'The minute location limit has been reached.'),
    'loc_1234567890ab',
    'selection_failed'
  );
  assert.equal(decorated.details.reason, 'temporary_limit_reached');
  assert.equal(decorated.details.retryable, true);
});

test('location logs discard query, identity and coordinate fields', () => {
  const originalInfo = console.info;
  let captured;
  console.info = (_message, payload) => { captured = payload; };
  try {
    locationLog('search', {
      incidentId: 'loc_1234567890ab',
      outcome: 'succeeded',
      durationMs: 12,
      providerCalls: 1,
      query: 'private query',
      placeId: 'private-place-id',
      uid: 'private-user',
      coordinates: { lat: 1, lng: 2 },
    });
  } finally {
    console.info = originalInfo;
  }

  assert.deepEqual(Object.keys(captured).sort(), [
    'durationMs', 'functionRevision', 'incidentId', 'outcome', 'providerCalls', 'stage',
  ]);
});

test('provider diagnostics allow only a classified endpoint and status', () => {
  const originalInfo = console.info;
  let captured;
  console.info = (_message, payload) => { captured = payload; };
  try {
    locationLog('provider', {
      incidentId: 'loc_1234567890ab',
      outcome: 'succeeded',
      durationMs: 18,
      providerCalls: 2,
      providerEndpoint: 'places_details',
      providerStatus: 200,
      url: 'https://provider/private-place-id',
    });
  } finally {
    console.info = originalInfo;
  }

  assert.equal(captured.providerEndpoint, 'places_details');
  assert.equal(captured.providerStatus, 200);
  assert.equal(Object.hasOwn(captured, 'url'), false);
});
