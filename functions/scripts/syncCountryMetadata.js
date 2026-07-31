/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { syncCountryMetadata } = require('../countryMetadata');

function readArgument(name) {
  const direct = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`)
  );
  if (direct) return direct.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function initializeAdmin() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    return;
  }

  const keyPath = path.join(__dirname, '..', 'serviceAccountKey.json');
  if (!fs.existsSync(keyPath)) {
    throw new Error(
      'Missing Admin credentials. Set GOOGLE_APPLICATION_CREDENTIALS or provide functions/serviceAccountKey.json.'
    );
  }
  // eslint-disable-next-line import/no-dynamic-require, global-require
  admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
}

async function main() {
  initializeAdmin();
  const apply = process.argv.includes('--apply');
  const countryCode = readArgument('code');
  const apiKey = process.env.REST_COUNTRIES_KEY || null;
  const result = await syncCountryMetadata({
    admin,
    apiKey,
    countryCode,
    apply,
  });

  console.log(
    `${apply ? 'APPLY' : 'DRY RUN'}: processed=${result.processed}, changed=${result.changed}, failed=${result.failed}`
  );
  result.results.forEach((entry) => {
    console.log(
      JSON.stringify({
        code: entry.code,
        countryPath: entry.countryPath,
        source: entry.source || null,
        changes: entry.changes,
        apiError: entry.apiError || null,
        error: entry.error || null,
      })
    );
  });
  if (result.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
