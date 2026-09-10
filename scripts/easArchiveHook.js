'use strict';

// Compatibility adapter for the pinned CLI's no-VCS mode. Supply only the
// verified Git archive commit and Metro concurrency; never change fingerprints.
const fs = require('node:fs');
const path = require('node:path');
if (process.argv[1]?.replace(/\\/g, '/').endsWith('/eas-cli/bin/run')) {
  const record = JSON.parse(fs.readFileSync(process.env.PLANLI_EAS_SOURCE_RECORD, 'utf8'));
  require('./easReleaseSource').verifySource(record);
  if (process.cwd() !== path.join(record.sourceRoot, 'client')
    || process.env.EAS_PROJECT_ROOT !== record.sourceRoot || process.env.EAS_NO_VCS !== '1') {
    throw new Error('EAS archive context mismatch.');
  }
  const cli = process.env.PLANLI_EAS_CLI_ROOT;
  if (JSON.parse(fs.readFileSync(path.join(cli, 'package.json'), 'utf8')).version !== '22.6.0') throw new Error('Unreviewed EAS CLI adapter version.');
  require(path.join(cli, 'build/vcs/clients/noVcs.js')).default.prototype.getCommitHashAsync = async () => record.commit;
  const expo = require(path.join(cli, 'build/utils/expoCli.js'));
  const original = expo.expoCommandAsync;
  expo.expoCommandAsync = (project, args, options) => original(project,
    args[0] === 'export' ? [...args, '--max-workers', '1'] : args, options);
}
