export const OPERATION_HISTORY_KEY = '@planli/operation-history';
export const SUCCESS_VISIBLE_MS = 8000;
export const HISTORY_LIMIT = 200;
export const HISTORY_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const TERMINAL_STATES = new Set(['success', 'review', 'failed', 'uncertain']);
export const RESOLVED_STATES = new Set(['success', 'review']);

const LABELS = {
  avatar: 'תמונת הפרופיל', profile: 'הפרופיל', preferences: 'ההעדפות',
  trip: 'הטיול', recommendation: 'ההמלצה', route: 'המסלול', comment: 'התגובה',
  favorite: 'המועדפים', reaction: 'הלייק', notifications: 'ההתראות',
  report: 'הדיווח', block: 'החסימה', deletion: 'המחיקה', draft: 'הטיוטה',
  password: 'הסיסמה', personalization: 'ההתאמה האישית',
};
export function operationLabel(operation) { return LABELS[operation?.kind] || 'הפעולה'; }
export function operationCopy(operation) {
  const label = operationLabel(operation);
  if (operation.status === 'failed') return `לא הצלחנו להשלים את עדכון ${label}`;
  if (operation.status === 'uncertain') return 'עדיין לא התקבל אישור לשמירה';
  if (operation.status === 'review') return `${label} נשלח${['recommendation'].includes(operation.kind) ? 'ה' : ''} לבדיקה`;
  if (operation.status === 'success') {
    if (['recommendation', 'route'].includes(operation.kind)) {
      return operation.kind === 'route' ? 'המסלול פורסם בהצלחה' : 'ההמלצה פורסמה בהצלחה';
    }
    return ({ avatar: 'תמונת הפרופיל עודכנה בהצלחה', profile: 'הפרופיל עודכן בהצלחה',
      preferences: 'ההעדפות נשמרו בהצלחה', comment: 'התגובה נשמרה בהצלחה',
      notifications: 'ההתראות עודכנו בהצלחה', report: 'הדיווח נשלח בהצלחה',
      block: 'החסימה עודכנה בהצלחה', deletion: 'המחיקה הושלמה בהצלחה',
      trip: 'הטיול נשמר בהצלחה', draft: 'הטיוטה נשמרה בהצלחה', password: 'הסיסמה שונתה בהצלחה',
    })[operation.kind] || 'הפעולה הושלמה בהצלחה';
  }
  return ({
    queued: 'הפעולה ממתינה להתחלה', preparing: 'מכינים את התמונות…',
    uploading: 'מעלים את התמונות…', processing: 'מעבדים את התמונות…',
    saving: `שומרים את ${label}…`, retrying: 'מנסים שוב…',
    waiting: 'הפעולה ממתינה לחיבור או לחזרה לאפליקציה',
  })[operation.stage || operation.status] || 'הפעולה מתבצעת…';
}

export function safeOperationError(error) {
  const code = String(error?.code || 'unknown').slice(0, 80);
  const uncertain = /deadline-exceeded|timeout|persistence-mismatch/.test(code);
  return {
    code,
    message: uncertain
      ? 'ייתכן שהשמירה הושלמה. כדאי לבדוק את הפריט לפני ניסיון נוסף.'
      : /unauthenticated|permission-denied/.test(code)
        ? 'צריך לבדוק את ההתחברות וההרשאות לפני ניסיון נוסף.'
        : /upload-stalled|network|unavailable|retry-limit/.test(code)
          ? 'החיבור נקטע או שההעלאה נעצרה. בדקו את החיבור ונסו שוב.'
          : 'הפעולה לא הושלמה. אפשר לחזור לפריט ולנסות שוב.',
    uncertain,
  };
}

// Explicit allowlist: history must never serialize callable payloads or errors.
export function sanitizeOperation(value) {
  const text = (v, max = 180) => typeof v === 'string' ? v.slice(0, max) : null;
  const id = text(value?.id);
  const ownerUid = text(value?.ownerUid);
  if (!id || !ownerUid) return null;
  return {
    id, ownerUid, kind: LABELS[value.kind] ? value.kind : 'profile',
    source: text(value.source, 30) || 'action',
    status: text(value.status, 30) || 'uncertain', stage: text(value.stage, 30),
    targetId: text(value.targetId), targetType: text(value.targetType, 30),
    discoveryRegionIds: (Array.isArray(value.discoveryRegionIds) ? value.discoveryRegionIds : []).filter((id) => typeof id === 'string').slice(0, 8).map((id) => id.slice(0, 40)),
    serverOperationId: text(value.serverOperationId),
    recoveryRoute: text(value.recoveryRoute, 60),
    legacyEditor: value.legacyEditor === true,
    createdAt: Number(value.createdAt) || Date.now(), updatedAt: Number(value.updatedAt) || Date.now(),
    acknowledged: value.acknowledged === true,
    visibleMs: Math.max(0, Math.min(SUCCESS_VISIBLE_MS, Number(value.visibleMs) || 0)),
    quiet: value.quiet === true, dismissed: value.dismissed === true,
    progress: Number.isFinite(value.progress) ? Math.max(0, Math.min(1, value.progress)) : null,
    message: text(value.message, 300), code: text(value.code, 80),
    retryable: value.retryable === true,
    refreshNeeded: value.refreshNeeded === true,
  };
}

export function pruneOperations(operations, now = Date.now()) {
  const resolvedCounts = new Map();
  return [...operations].sort((a, b) => b.createdAt - a.createdAt).filter((operation) => {
    if (!RESOLVED_STATES.has(operation.status) || !operation.acknowledged) return true;
    const count = (resolvedCounts.get(operation.ownerUid) || 0) + 1;
    resolvedCounts.set(operation.ownerUid, count);
    return count <= HISTORY_LIMIT && now - operation.updatedAt <= HISTORY_AGE_MS;
  });
}

export function selectBanner(operations) {
  const visible = operations.filter((entry) => !entry.dismissed && (!entry.quiet || ['failed', 'uncertain'].includes(entry.status)));
  // Every unseen outcome gets foreground time, even when another upload is running.
  return visible.filter((entry) => TERMINAL_STATES.has(entry.status) && !entry.acknowledged)
    .sort((a, b) => a.updatedAt - b.updatedAt)[0]
    || visible.find((entry) => !TERMINAL_STATES.has(entry.status))
    || null;
}
