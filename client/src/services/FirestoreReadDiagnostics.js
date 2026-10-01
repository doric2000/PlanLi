import { captureDiagnosticException } from './ErrorReporting';

const reported = new Set();
const operations = new Set(['profile_content', 'notification_page', 'notification_listener']);
const codes = new Set([
  'cancelled', 'unknown', 'invalid-argument', 'deadline-exceeded', 'not-found',
  'already-exists', 'permission-denied', 'resource-exhausted', 'failed-precondition',
  'aborted', 'out-of-range', 'unimplemented', 'internal', 'unavailable', 'data-loss',
  'unauthenticated',
]);

// Report each operation/code once per app session, without document paths,
// query values, server error messages or account details.
export function reportFirestoreReadFailure(error, operation) {
  if (!operations.has(operation)) return;
  const rawCode = String(error?.code || '').replace(/^firestore\//, '');
  const code = codes.has(rawCode) ? rawCode : 'unknown';
  const key = `${operation}:${code}`;
  if (reported.has(key)) return;
  reported.add(key);
  try {
    captureDiagnosticException(new Error(`Firestore read failed: ${code}`), { operation, code });
  } catch {
    // Observability must not replace the original read error or break listeners.
  }
}
