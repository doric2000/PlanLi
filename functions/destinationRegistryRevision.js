const { randomUUID } = require('node:crypto');

// A commit token avoids a read/modify/write race and is shared across instances.
function touchRegistryRevision(transaction, db, countryCode) {
  const code = String(countryCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) throw new Error('Invalid registry country revision.');
  const revision = randomUUID();
  transaction.set(db.doc('system/destinationRegistry'), {
    countryRevisions: { [code]: revision },
  }, { merge: true });
  return revision;
}

module.exports = { touchRegistryRevision };
