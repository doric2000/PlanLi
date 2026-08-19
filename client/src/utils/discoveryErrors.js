export function isDiscoveryRateLimitError(error) {
  const code = String(error?.code || error?.details?.code || '')
    .trim()
    .toLowerCase()
    .replace(/^functions\//, '');
  return code === 'resource-exhausted';
}
