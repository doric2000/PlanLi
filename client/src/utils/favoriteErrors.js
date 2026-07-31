export function getFavoriteErrorAlert(error, action = 'add') {
  const code = String(error?.code || '');
  if (
    action === 'add' &&
    (code === 'permission-denied' || code.endsWith('/permission-denied'))
  ) {
    return {
      title: '\u05d4\u05ea\u05d5\u05db\u05df \u05d0\u05d9\u05e0\u05d5 \u05d6\u05de\u05d9\u05df',
      message:
        '\u05d4\u05e4\u05e8\u05d9\u05d8 \u05db\u05d1\u05e8 \u05e0\u05de\u05d7\u05e7 \u05d5\u05dc\u05d0 \u05e0\u05d9\u05ea\u05df \u05dc\u05e9\u05de\u05d5\u05e8 \u05d0\u05d5\u05ea\u05d5 \u05d1\u05de\u05d5\u05e2\u05d3\u05e4\u05d9\u05dd.',
    };
  }

  return {
    title: '\u05e9\u05d2\u05d9\u05d0\u05d4',
    message:
      error?.message ||
      '\u05dc\u05d0 \u05d4\u05e6\u05dc\u05d7\u05e0\u05d5 \u05dc\u05e2\u05d3\u05db\u05df \u05d0\u05ea \u05d4\u05de\u05d5\u05e2\u05d3\u05e4\u05d9\u05dd.',
  };
}
