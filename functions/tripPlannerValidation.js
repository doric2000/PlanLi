const { HttpsError } = require('firebase-functions/v2/https');

const TRIP_SCHEMA_VERSION = 1;
const TRIP_KIND = 'private_planner';
const MAX_TRIP_DAYS = 14;
const MAX_TRIP_STOPS = 150;
const MAX_DAY_STOPS = 40;
const MAX_OPERATIONS = 50;
const MAX_RECOMMENDATIONS_PER_OPERATION = 30;
const TRAVEL_MODES = new Set(['DRIVE', 'WALK']);
const LOCATION_MODES = new Set(['exact', 'pin', 'general']);
const OPERATION_TYPES = new Set([
  'set_title',
  'add_day',
  'update_day',
  'delete_day',
  'add_recommendation_stops',
  'add_custom_stop',
  'update_custom_stop',
  'delete_stop',
  'move_stop',
  'reorder_stops',
]);

function plannerError(code, message, reason) {
  return new HttpsError(code, message, reason ? { reason } : undefined);
}

function assertPlanner(condition, code, message, reason) {
  if (!condition) throw plannerError(code, message, reason);
}

function cleanString(value, field, maximum, { minimum = 1, optional = false } = {}) {
  if (optional && (value == null || value === '')) return '';
  assertPlanner(typeof value === 'string', 'invalid-argument', `${field} is invalid.`, 'INVALID_FIELD');
  const text = value.trim();
  assertPlanner(
    text.length >= minimum && text.length <= maximum,
    'invalid-argument',
    `${field} is invalid.`,
    'INVALID_FIELD'
  );
  return text;
}

function cleanId(value, field) {
  const id = cleanString(value, field, 180);
  assertPlanner(
    /^[A-Za-z0-9_-]+$/.test(id),
    'invalid-argument',
    `${field} is invalid.`,
    'INVALID_ID'
  );
  return id;
}

function cleanOperationId(value) {
  const id = cleanString(value, 'operationId', 180);
  assertPlanner(
    /^[A-Za-z0-9:_-]+$/.test(id),
    'invalid-argument',
    'operationId is invalid.',
    'INVALID_OPERATION_ID'
  );
  return id;
}

function cleanDate(value) {
  if (value == null || value === '') return null;
  const date = cleanString(value, 'date', 10);
  assertPlanner(/^\d{4}-\d{2}-\d{2}$/.test(date), 'invalid-argument', 'date is invalid.', 'INVALID_DATE');
  const parsed = new Date(`${date}T00:00:00.000Z`);
  assertPlanner(
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date,
    'invalid-argument',
    'date is invalid.',
    'INVALID_DATE'
  );
  return date;
}

function cleanTravelMode(value, fallback = 'DRIVE') {
  const mode = String(value || fallback).toUpperCase();
  assertPlanner(TRAVEL_MODES.has(mode), 'invalid-argument', 'travelMode is invalid.', 'INVALID_TRAVEL_MODE');
  return mode;
}

function cleanCoordinates(value, { optional = false } = {}) {
  if (optional && value == null) return null;
  assertPlanner(value && typeof value === 'object' && !Array.isArray(value),
    'invalid-argument', 'coordinates are invalid.', 'INVALID_COORDINATES');
  const lat = Number(value.lat ?? value.latitude);
  const lng = Number(value.lng ?? value.longitude);
  assertPlanner(
    Number.isFinite(lat) && Number.isFinite(lng)
      && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180,
    'invalid-argument',
    'coordinates are invalid.',
    'INVALID_COORDINATES'
  );
  return { lat, lng };
}

function cleanCustomStop(value) {
  assertPlanner(value && typeof value === 'object' && !Array.isArray(value),
    'invalid-argument', 'stop is invalid.', 'INVALID_STOP');
  const locationMode = String(value.locationMode || 'pin');
  assertPlanner(LOCATION_MODES.has(locationMode),
    'invalid-argument', 'locationMode is invalid.', 'INVALID_LOCATION_MODE');
  const coordinates = cleanCoordinates(value.coordinates, { optional: locationMode === 'general' });
  assertPlanner(locationMode === 'general' || coordinates,
    'invalid-argument', 'An exact location is required.', 'ROUTABLE_LOCATION_REQUIRED');
  return {
    sourceType: 'custom',
    title: cleanString(value.title, 'stop.title', 120),
    subtitle: cleanString(value.subtitle || value.address || '', 'stop.subtitle', 240, { optional: true, minimum: 0 }),
    note: cleanString(value.note || '', 'stop.note', 500, { optional: true, minimum: 0 }),
    locationMode,
    coordinates,
    ...(value.placeId ? { placeId: cleanId(value.placeId, 'stop.placeId') } : {}),
  };
}

function cleanOperation(raw) {
  assertPlanner(raw && typeof raw === 'object' && !Array.isArray(raw),
    'invalid-argument', 'operation is invalid.', 'INVALID_OPERATION');
  const type = cleanString(raw.type, 'operation.type', 48);
  assertPlanner(OPERATION_TYPES.has(type),
    'invalid-argument', 'operation.type is invalid.', 'INVALID_OPERATION');
  if (type === 'set_title') return { type, title: cleanString(raw.title, 'title', 120) };
  if (type === 'add_day') return {
    type,
    clientId: raw.clientId ? cleanId(raw.clientId, 'clientId') : null,
    title: cleanString(raw.title || 'יום חדש', 'day.title', 80),
    date: cleanDate(raw.date),
    travelMode: cleanTravelMode(raw.travelMode),
  };
  const dayId = cleanId(raw.dayId, 'dayId');
  if (type === 'update_day') return {
    type,
    dayId,
    ...(raw.title !== undefined ? { title: cleanString(raw.title, 'day.title', 80) } : {}),
    ...(raw.date !== undefined ? { date: cleanDate(raw.date) } : {}),
    ...(raw.travelMode !== undefined ? { travelMode: cleanTravelMode(raw.travelMode) } : {}),
  };
  if (type === 'delete_day') return { type, dayId };
  if (type === 'add_recommendation_stops') {
    assertPlanner(Array.isArray(raw.recommendationIds)
      && raw.recommendationIds.length >= 1
      && raw.recommendationIds.length <= MAX_RECOMMENDATIONS_PER_OPERATION,
    'invalid-argument', 'recommendationIds is invalid.', 'INVALID_RECOMMENDATIONS');
    const recommendationIds = raw.recommendationIds.map((id) => cleanId(id, 'recommendationId'));
    assertPlanner(new Set(recommendationIds).size === recommendationIds.length,
      'invalid-argument', 'recommendationIds contains duplicates.', 'DUPLICATE_RECOMMENDATION');
    let clientStopIds;
    if (raw.clientStopIds !== undefined) {
      assertPlanner(Array.isArray(raw.clientStopIds)
        && raw.clientStopIds.length === recommendationIds.length,
      'invalid-argument', 'clientStopIds is invalid.', 'INVALID_STOP_IDS');
      clientStopIds = raw.clientStopIds.map((id) => cleanId(id, 'clientStopId'));
      assertPlanner(new Set(clientStopIds).size === clientStopIds.length,
        'invalid-argument', 'clientStopIds contains duplicates.', 'INVALID_STOP_IDS');
    }
    return { type, dayId, recommendationIds, ...(clientStopIds ? { clientStopIds } : {}) };
  }
  if (type === 'add_custom_stop') return {
    type,
    dayId,
    clientId: raw.clientId ? cleanId(raw.clientId, 'clientId') : null,
    stop: cleanCustomStop(raw.stop),
  };
  const stopId = type === 'reorder_stops' ? null : cleanId(raw.stopId, 'stopId');
  if (type === 'update_custom_stop') return { type, dayId, stopId, stop: cleanCustomStop(raw.stop) };
  if (type === 'delete_stop') return { type, dayId, stopId };
  if (type === 'move_stop') {
    const targetDayId = cleanId(raw.targetDayId, 'targetDayId');
    assertPlanner(targetDayId !== dayId,
      'invalid-argument', 'targetDayId must be different.', 'INVALID_TARGET_DAY');
    return { type, dayId, targetDayId, stopId };
  }
  assertPlanner(Array.isArray(raw.stopIds) && raw.stopIds.length <= MAX_DAY_STOPS,
    'invalid-argument', 'stopIds is invalid.', 'INVALID_STOP_ORDER');
  const stopIds = raw.stopIds.map((id) => cleanId(id, 'stopId'));
  assertPlanner(new Set(stopIds).size === stopIds.length,
    'invalid-argument', 'stopIds contains duplicates.', 'INVALID_STOP_ORDER');
  return { type, dayId, stopIds };
}

function cleanOperations(value) {
  assertPlanner(Array.isArray(value) && value.length >= 1 && value.length <= MAX_OPERATIONS,
    'invalid-argument', 'operations is invalid.', 'INVALID_OPERATIONS');
  const operations = value.map(cleanOperation);
  const createdStopPaths = operations.flatMap((operation) => {
    if (operation.type === 'add_recommendation_stops' && operation.clientStopIds) {
      return operation.clientStopIds.map((id) => `${operation.dayId}/${id}`);
    }
    if (operation.type === 'add_custom_stop' && operation.clientId) {
      return [`${operation.dayId}/${operation.clientId}`];
    }
    return [];
  });
  assertPlanner(new Set(createdStopPaths).size === createdStopPaths.length,
    'invalid-argument', 'Client stop ids must be unique within the request.', 'INVALID_STOP_IDS');
  return operations;
}

function normalizeLimit(value, fallback = 30, maximum = 50) {
  if (value == null) return fallback;
  const limit = Number(value);
  assertPlanner(Number.isInteger(limit) && limit >= 1 && limit <= maximum,
    'invalid-argument', 'limit is invalid.', 'INVALID_LIMIT');
  return limit;
}

module.exports = {
  LOCATION_MODES,
  MAX_DAY_STOPS,
  MAX_OPERATIONS,
  MAX_RECOMMENDATIONS_PER_OPERATION,
  MAX_TRIP_DAYS,
  MAX_TRIP_STOPS,
  OPERATION_TYPES,
  TRAVEL_MODES,
  TRIP_KIND,
  TRIP_SCHEMA_VERSION,
  assertPlanner,
  cleanCoordinates,
  cleanCustomStop,
  cleanDate,
  cleanId,
  cleanOperationId,
  cleanOperations,
  cleanString,
  cleanTravelMode,
  normalizeLimit,
  plannerError,
};
