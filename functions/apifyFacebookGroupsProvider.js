const { HttpsError } = require('firebase-functions/v2/https');

const APIFY_API = 'https://api.apify.com/v2';
const ACTOR_ID = 'apify~facebook-groups-scraper';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_DATASET_ITEMS = 200;
const TERMINAL_RUN_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED']);

function providerError(reason, message, { retryable = false, uncertain = false } = {}) {
  return new HttpsError(retryable ? 'unavailable' : 'failed-precondition', message, {
    reason, retryable, uncertain,
  });
}

async function apifyRequest(path, { token, fetchImpl = global.fetch, method = 'GET', body, query } = {}) {
  if (!token) throw providerError('apify_not_configured', 'The collection provider is not configured.');
  const url = new URL(`${APIFY_API}${path}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value != null) url.searchParams.set(key, String(value));
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      redirect: 'error',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    // The provider may have accepted a request whose response was lost.
    throw providerError('apify_unreachable', 'The collection provider did not respond.', {
      retryable: true, uncertain: true,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    throw providerError(`apify_http_${response.status}`, 'The collection provider rejected the request.', {
      retryable, uncertain: response.status >= 500,
    });
  }
  return response.json();
}

function runSummary(run) {
  const data = run?.data || run || {};
  const usage = Number(data.usageTotalUsd);
  return {
    providerRunId: String(data.id || ''),
    status: String(data.status || ''),
    datasetId: String(data.defaultDatasetId || ''),
    usageTotalUsd: Number.isFinite(usage) ? usage : null,
    terminal: TERMINAL_RUN_STATUSES.has(String(data.status || '')),
  };
}

// Starts one bounded provider run. maxItems and maxTotalChargeUsd are the
// provider-side spending caps; the application ledger reserves them first.
async function startGroupRun({
  token, fetchImpl, groupUrl, resultsLimit, onlyPostsNewerThan, maxTotalChargeUsd, viewOption = 'TOP_POSTS',
  timeoutSeconds = 600,
}) {
  const run = await apifyRequest(`/acts/${ACTOR_ID}/runs`, {
    token,
    fetchImpl,
    method: 'POST',
    query: { maxItems: resultsLimit, maxTotalChargeUsd: maxTotalChargeUsd.toFixed(2), timeout: timeoutSeconds },
    body: {
      startUrls: [{ url: groupUrl }],
      resultsLimit,
      viewOption,
      onlyPostsNewerThan,
    },
  });
  const summary = runSummary(run);
  if (!summary.providerRunId) throw providerError('apify_run_missing', 'The provider returned no run.', { uncertain: true });
  return summary;
}

async function getRun({ token, fetchImpl, providerRunId }) {
  return runSummary(await apifyRequest(`/actor-runs/${encodeURIComponent(providerRunId)}`, { token, fetchImpl }));
}

async function listDatasetItems({ token, fetchImpl, datasetId, limit }) {
  const items = await apifyRequest(`/datasets/${encodeURIComponent(datasetId)}/items`, {
    token,
    fetchImpl,
    query: { clean: 1, format: 'json', limit: Math.min(MAX_DATASET_ITEMS, Math.max(1, limit)) },
  });
  return Array.isArray(items) ? items.slice(0, MAX_DATASET_ITEMS) : [];
}

module.exports = {
  ACTOR_ID,
  MAX_DATASET_ITEMS,
  TERMINAL_RUN_STATUSES,
  getRun,
  listDatasetItems,
  runSummary,
  startGroupRun,
};
