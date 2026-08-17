const fs = require('node:fs');
const path = require('node:path');

function ensureWritableDirectories(directory) {
  fs.chmodSync(directory, 0o755);

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || !entry.isDirectory() || entry.isSymbolicLink()) {
      continue;
    }

    ensureWritableDirectories(path.join(directory, entry.name));
  }
}

ensureWritableDirectories(process.cwd());
