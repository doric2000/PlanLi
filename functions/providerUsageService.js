'use strict';

const { HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { COLLECTION, billingMonth, classifyProviderRequest, validUsageRecord } = require('./providerUsagePolicy');

function budgetError(reason, resetsAt) {
  return new HttpsError(reason === 'provider_monthly_limit_reached' ? 'resource-exhausted' : 'unavailable',
    reason === 'provider_monthly_limit_reached' ? 'Monthly location capacity has been reached.' : 'Location usage control is unavailable.',
    { reason, retryable: false, ...(resetsAt ? { resetsAt } : {}) });
}

function safeLog(log, event, fields = {}) {
  try { log('provider_usage_control', { event, ...fields }); } catch { /* Logging cannot refund or repeat a reservation. */ }
}

async function reserveProviderUsage({ url, options, projectId, db, now, clock = Date.now, log = logger.warn }) {
  let month;
  try {
    const currentTime = () => now === undefined ? clock() : Number(new Date(now));
    now = now === undefined ? undefined : Number(new Date(now));
    const startedAt = currentTime();
    if (projectId !== 'planli-f0b12' && !/^demo-planli-[a-z0-9-]+$/.test(projectId || '')) throw new Error('Unreviewed billing project.');
    month = billingMonth(startedAt);
    // A short boundary pause keeps in-flight provider attempts in their reserved
    // billing month (provider transports have at most a 12-second timeout).
    const assertSameWindow = () => {
      const time = currentTime();
      if (time < Date.parse(month.startsAt) || time >= Date.parse(month.resetsAt) - 60000) {
        throw budgetError('provider_budget_unavailable', month.resetsAt);
      }
    };
    assertSameWindow();
    const skus = classifyProviderRequest(url, options);
    const firestore = db || require('firebase-admin').firestore();
    const outcome = await firestore.runTransaction(async (transaction) => {
      const refs = skus.map((sku) => firestore.doc(`${COLLECTION}/${month.period}_${sku}`));
      const snapshots = await transaction.getAll(...refs);
      const records = snapshots.map((snapshot) => snapshot.data());
      if (records.some((record, index) => !validUsageRecord(record, { sku: skus[index], period: month.period, projectId }))) {
        throw budgetError('provider_budget_unavailable', month.resetsAt);
      }
      const blocked = records.findIndex((record) => record.baselineUsed + record.reserved >= record.limit);
      if (blocked !== -1) return { blocked: skus[blocked], events: [] };
      const events = [];
      records.forEach((record, index) => {
        const before = record.baselineUsed + record.reserved;
        const after = before + 1;
        const thresholdPatch = {};
        for (const threshold of [80, 95]) {
          if (record[`alerted${threshold}`] !== true && after * 100 >= record.limit * threshold) {
            events.push({ event: `threshold_${threshold}`, sku: skus[index] });
            thresholdPatch[`alerted${threshold}`] = true;
          }
        }
        transaction.update(refs[index], { reserved: record.reserved + 1, lastReservedAt: new Date(startedAt), ...thresholdPatch });
      });
      return { events };
    });
    if (outcome.blocked) {
      safeLog(log, 'exhausted', { sku: outcome.blocked, period: month.period });
      throw budgetError('provider_monthly_limit_reached', month.resetsAt);
    }
    for (const { event, sku } of outcome.events) safeLog(log, event, { sku, period: month.period });
    assertSameWindow();
    return { period: month.period, resetsAt: month.resetsAt };
  } catch (error) {
    if (error?.details?.reason === 'provider_monthly_limit_reached') throw error;
    // Do not log SDK errors, request URLs/bodies, auth headers or user data.
    safeLog(log, 'unavailable', month ? { period: month.period } : {});
    throw budgetError('provider_budget_unavailable', month?.resetsAt);
  }
}

module.exports = { reserveProviderUsage, budgetError };
