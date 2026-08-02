/* eslint-disable no-console */
const admin = require('firebase-admin');
const { syncCountryMetadata } = require('../countryMetadata');
const { initializeAdmin } = require('./localCredentials');

function readArgument(name) {
  const direct = process.argv.find((argument) =>
    argument.startsWith(`--${name}=`)
  );
  if (direct) return direct.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  initializeAdmin(admin);
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
