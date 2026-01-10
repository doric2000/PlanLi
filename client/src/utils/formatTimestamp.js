/**
 * formatTimestamp - Utility to format Firestore or JS Date to a Hebrew relative time string
 * @param {object|number|Date} timestamp - Firestore Timestamp, JS Date, or ms
 * @returns {string} Relative time string in Hebrew (e.g. 'לפני 2 שעות')
 */
export function formatTimestamp(timestamp) {
  if (!timestamp) return '';
  let date;
  if (timestamp.toDate) {
    date = timestamp.toDate();
  } else if (typeof timestamp === 'number') {
    date = new Date(timestamp);
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else {
    date = new Date(timestamp);
  }
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  const pluralize = (n, singular, plural) => (n === 1 ? singular : plural);

  // Defensive: if the timestamp is in the future (clock skew), treat as "just now".
  if (diffMins < 1) return 'הרגע';
  if (diffMins < 60) return `לפני ${diffMins} ${pluralize(diffMins, 'דקה', 'דקות')}`;
  if (diffHours < 24) return `לפני ${diffHours} ${pluralize(diffHours, 'שעה', 'שעות')}`;
  return `לפני ${diffDays} ${pluralize(diffDays, 'יום', 'ימים')}`;
}
