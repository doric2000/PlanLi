/* eslint-disable no-console */
const admin = require('firebase-admin');
const { syncAirportFacts } = require('../airportFacts');
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
  const countryId = readArgument('country-id');
  const result = await syncAirportFacts({ admin, apply, countryId });
  console.log(
    `${apply ? 'APPLY' : 'DRY RUN'}: airports=${result.airports}, processed=${result.processed}, changed=${result.changed}`
  );
  result.results.forEach((entry) => console.log(JSON.stringify(entry)));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
