const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');

test('notification mutations are exposed with channel data and authenticated device callables', () => {
  assert.match(source, /exports\.markAllNotificationsRead\s*=\s*callable\(\{ access: 'signedIn' \}/u);
  assert.match(source, /clearNotifications\(\{ admin, auth: request\.auth, data: request\.data \}\)/u);
  for (const name of [
    'getPushPreferences',
    'updateNotificationPreferences',
    'registerNotificationDevice',
    'unregisterNotificationDevice',
  ]) {
    assert.match(source, new RegExp(`exports\\.${name}\\s*=\\s*callable\\(\\{ access: 'signedIn' \\}`));
  }
  assert.match(source, /getPushPreferences\(\{ admin, auth: request\.auth \}\)/u);
});

test('push wiring claims inbox versions and binds the Expo secret to immediate and scheduled workers', () => {
  assert.match(source, /defineSecret\('EXPO_PUSH_ACCESS_TOKEN'\)/u);
  assert.match(source, /'users\/\{userId\}\/notifications\/\{notificationId\}'/u);
  assert.match(source, /notificationDeliveryDescriptor\(\{/u);
  assert.match(source, /handleNotificationPushWriteEvent\(\{/u);
  assert.match(source, /exports\.retryNotificationPushScheduled\s*=\s*onSchedule/u);
  assert.match(source, /exports\.checkNotificationPushReceiptsScheduled\s*=\s*onSchedule/u);
});

test('moderation projections use retry-enabled written triggers for admin and owner delivery', () => {
  assert.match(source, /'system\/moderation\/cases\/\{caseId\}'/u);
  assert.match(source, /handleModerationCaseNotificationWrite\(\{[\s\S]*?mediaBucket: mediaStorageBucket\.value\(\)/u);
  assert.match(source, /onModerationCaseNotificationWritten[\s\S]*?serviceAccount: MEDIA_SERVICE_ACCOUNT/u);
  assert.match(source, /'system\/moderation\/ownerNotifications\/\{outboxId\}'/u);
  assert.match(source, /handleOwnerNotificationOutboxWrite\(\{ admin, event \}\)/u);
});

test('notification cleanup jobs have a retry-enabled written trigger', () => {
  assert.match(source, /onNotificationCleanupJobWritten/u);
  assert.match(source, /system\/runtime\/notificationCleanupJobs\/\{jobId\}/u);
  assert.match(source, /handleNotificationCleanupJobWrite/u);
});

test('comment thread deletion jobs have a bounded retry trigger', () => {
  assert.match(source, /onCommentThreadDeletionJobWritten/u);
  assert.match(source, /system\/runtime\/commentThreadDeletionJobs\/\{jobId\}/u);
  assert.match(source, /handleCommentThreadDeletionJobWrite/u);
  assert.match(source, /onCommentThreadDeletionJobWritten[\s\S]*?timeoutSeconds: 300/u);
});
