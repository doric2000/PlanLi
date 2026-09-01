const APP_CHECK_MARKERS = ['appcheck', 'app-check', 'app attest', 'appattest', 'devicecheck'];

export function isAppCheckDeletionFailure(error) {
  const diagnostic = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  return APP_CHECK_MARKERS.some((marker) => diagnostic.includes(marker));
}

export function contentDeletionFailureMessage(error, contentType = 'recommendation') {
  if (isAppCheckDeletionFailure(error)) {
    return 'לא הצלחנו לאמת את האפליקציה. עדכנו לגרסה החדשה ביותר ונסו שוב.';
  }
  return contentType === 'route'
    ? 'לא הצלחנו למחוק את המסלול.'
    : 'לא הצלחנו למחוק את ההמלצה.';
}
