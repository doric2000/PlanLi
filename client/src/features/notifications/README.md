# Notification Center

Hebrew-first, RTL-first notification inbox for personal and administrative work.

## Integration

Wrap authenticated navigation once with `NotificationCenterProvider`, then register:

- `NotificationScreen`
- `NotificationSettingsScreen` as `NotificationSettings`

The center uses the authenticated user from `useAuthUser` and shows the admin channel only when
`useAdminClaim` resolves to an active admin claim. Navigation can be integrated through normal
React Navigation bubbling or the screen's `onOpenAction(action, notification)` callback.

Push taps enter `NotificationScreen` with only:

```js
{ notificationId, channel: 'personal' | 'admin' }
```

The screen performs an owned direct read, validates schema/channel/admin access, marks the row read
through the normal callable path, and then resolves the allowlisted intent. Missing, held, deleted,
legacy, or unsupported content stays in a contextual status sheet.

## Data contract

Inbox pages query `users/{uid}/notifications` with:

```text
schemaVersion == 2
channel == personal|admin
orderBy createdAt desc
limit 25
```

All mutations use callable Functions. Personal and admin bulk actions are always separate.
Denormalized counters and push preferences come from
`users/{uid}/notificationState/state`.

## Public exports

`features/notifications/index.js` exports the provider/hooks, both screens, presentation components,
model helpers (including `buildNotificationRouteAction`), list services, and the coordinator-aware
settings service.
