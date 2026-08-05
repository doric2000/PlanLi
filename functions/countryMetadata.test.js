const test = require('node:test');
const assert = require('node:assert/strict');

const {
  chooseCurrency,
  getLocalCountryMetadata,
  parseRestCountriesMetadata,
  resolveCountryMetadata,
  syncCountryMetadata,
} = require('./countryMetadata');

const MYANMAR_TRAVEL_FACTS = {
  languages: [{ code: 'my', labelHe: 'בורמזית' }],
  callingCodes: ['+95'],
};

test('local metadata supplies Myanmar currency and region without network defaults', () => {
  assert.deepEqual(getLocalCountryMetadata('MM'), {
    region: 'Asia',
    currencyCode: 'MMK',
    ...MYANMAR_TRAVEL_FACTS,
  });
});

test('REST Countries v5 parser validates the requested ISO code', () => {
  const payload = {
    data: {
      objects: [{
        codes: { alpha_2: 'MM' },
        region: 'Asia',
        currencies: [{ code: 'MMK' }],
      }],
    },
  };
  assert.deepEqual(parseRestCountriesMetadata(payload, 'MM'), {
    region: 'Asia',
    currencyCode: 'MMK',
    ...MYANMAR_TRAVEL_FACTS,
  });
  assert.throws(
    () => parseRestCountriesMetadata(payload, 'IL'),
    /did not return IL/
  );
});

test('current official currency is preserved when a country has multiple currencies', () => {
  assert.equal(chooseCurrency(['USD', 'EUR'], 'EUR'), 'EUR');
  assert.equal(chooseCurrency(['USD', 'EUR'], 'GBP'), 'USD');
});

test('a country with no official currency keeps an explicit null currency', () => {
  const payload = {
    data: {
      objects: [{
        codes: { alpha_2: 'AQ' },
        region: 'Antarctica',
        currencies: [],
      }],
    },
  };
  assert.deepEqual(parseRestCountriesMetadata(payload, 'AQ'), {
    region: 'Antarctica',
    currencyCode: null,
    languages: [],
    callingCodes: ['+672'],
  });
  assert.deepEqual(getLocalCountryMetadata('AQ'), {
    region: 'Antarctica',
    currencyCode: null,
    languages: [],
    callingCodes: ['+672'],
  });
});

test('live API metadata is preferred when valid', async () => {
  const fetchImpl = async (url, options) => {
    assert.match(String(url), /codes\.alpha_2\/MM/);
    assert.equal(options.headers.Authorization, 'Bearer secret');
    return {
      ok: true,
      json: async () => ({
        data: {
          objects: [{
            codes: { alpha_2: 'MM' },
            region: 'Updated Asia',
            currencies: [{ code: 'MMK' }],
          }],
        },
      }),
    };
  };

  assert.deepEqual(
    await resolveCountryMetadata({
      countryCode: 'MM',
      apiKey: 'secret',
      fetchImpl,
    }),
    {
      region: 'Updated Asia',
      currencyCode: 'MMK',
      ...MYANMAR_TRAVEL_FACTS,
      source: 'rest-countries-v5',
    }
  );
});

test('timeout, HTTP failure and invalid API data fall back locally', async () => {
  const failureCases = [
    async () => ({ ok: false, status: 429 }),
    async () => ({
      ok: true,
      json: async () => ({ data: { objects: [] } }),
    }),
  ];

  for (const fetchImpl of failureCases) {
    // eslint-disable-next-line no-await-in-loop
    const result = await resolveCountryMetadata({
      countryCode: 'MM',
      apiKey: 'secret',
      fetchImpl,
    });
    assert.equal(result.region, 'Asia');
    assert.equal(result.currencyCode, 'MMK');
    assert.equal(result.source, 'countries-list');
    assert.ok(result.apiError);
  }
});

function createSyncAdmin(seed) {
  const documents = new Map(Object.entries(seed));
  let autoId = 0;
  const makeRef = (path) => ({
    path,
    id: path.split('/').at(-1),
  });
  const db = {
    doc: makeRef,
    collection: (path) => ({
      get: async () => ({
        docs: [...documents.entries()]
          .filter(([documentPath]) => {
            const prefix = `${path}/`;
            return (
              documentPath.startsWith(prefix) &&
              !documentPath.slice(prefix.length).includes('/')
            );
          })
          .map(([documentPath]) => ({
            id: documentPath.split('/').at(-1),
            ref: makeRef(documentPath),
            data: () => documents.get(documentPath),
          })),
      }),
      doc: () => makeRef(`${path}/auto-${++autoId}`),
    }),
    batch: () => {
      const operations = [];
      return {
        update: (ref, data) => operations.push(['update', ref, data]),
        create: (ref, data) => operations.push(['create', ref, data]),
        set: (ref, data, options) =>
          operations.push(['set', ref, data, options]),
        commit: async () => {
          operations.forEach(([type, ref, data, options]) => {
            if (type === 'create' && documents.has(ref.path)) {
              throw new Error('already exists');
            }
            const previous =
              type === 'set' && !options?.merge
                ? {}
                : documents.get(ref.path) || {};
            documents.set(ref.path, { ...previous, ...data });
          });
        },
      };
    },
  };
  return {
    documents,
    firestore: Object.assign(() => db, {
      FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP' },
    }),
  };
}

test('scheduled sync changes only country metadata without support collections', async () => {
  const admin = createSyncAdmin({
    'countries/מיאנמר (בורמה)': {
      name: 'מיאנמר (בורמה)',
      code: 'MM',
      region: 'Global',
      currencyCode: 'USD',
    },
  });
  const result = await syncCountryMetadata({
    admin,
    apiKey: 'secret',
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        data: {
          objects: [{
            codes: { alpha_2: 'MM' },
            region: 'Asia',
            currencies: [{ code: 'MMK' }],
          }],
        },
      }),
    }),
  });

  assert.equal(result.changed, 1);
  const stored = admin.documents.get('countries/מיאנמר (בורמה)');
  assert.equal(stored.region, 'Asia');
  assert.equal(stored.currencyCode, 'MMK');
  assert.deepEqual(stored.travelFacts.languages, MYANMAR_TRAVEL_FACTS.languages);
  assert.deepEqual(stored.travelFacts.callingCodes, MYANMAR_TRAVEL_FACTS.callingCodes);
  assert.equal(stored.travelFacts.source, 'countries-list');
  assert.match(stored.travelFacts.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(
    [...admin.documents.keys()].some(
      (path) =>
        path.startsWith('_countryMetadataSync/') ||
        path.startsWith('_countryMetadataHistory/')
    ),
    false
  );
});
