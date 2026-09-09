import { normalizeRouteTimeInput } from './routeTime';
import { getStopCoordinates } from './routeStops';
import { CONTENT_COMPOSER_COPY } from '../../../constants/contentComposerCopy';

export function validateRouteComposer(draft) {
  const fail = (message, field, target = {}) => ({ message, field, ...target });
  if (!draft.area?.countryId || !draft.area?.cityId) return fail('כדאי לבחור עיר או אזור.', 'area');
  if (!draft.title?.trim()) return fail('כדאי להוסיף שם למסלול.', 'title');
  if (!draft.description?.trim()) return fail('כדאי להוסיף תיאור למסלול.', 'description');
  if (!draft.attributes?.budgetLevel) return fail(CONTENT_COMPOSER_COPY.budgetRequired, 'budget');
  let stopCount = 0;
  for (const [dayIndex, day] of draft.days.entries()) {
    if (!day.stops?.length) return fail('כדאי להוסיף לפחות עצירה אחת לכל יום.', 'day', { dayIndex });
    for (const stop of day.stops) {
      stopCount += 1;
      const target = { dayIndex, stopId: stop.id };
      if (!stop.title?.trim()) return fail('כדאי להוסיף שם קצר לעצירה.', 'stopTitle', target);
      if (stop.editorState?.locationIncomplete ||
        (stop.locationPrecision === 'general'
          ? !stop.destination?.countryId || !stop.destination?.cityId
          : !getStopCoordinates(stop))) {
        return fail('כדאי להשלים את בחירת המיקום לעצירה.', 'location', target);
      }
      if (normalizeRouteTimeInput(stop.editorState?.startTime ?? stop.startTime ?? '') === null) {
        return fail('השעה אינה תקינה. אפשר לכתוב למשל 09:30.', 'time', target);
      }
      const rawDuration = stop.editorState?.durationMinutes ?? stop.durationMinutes;
      const duration = Number(rawDuration);
      if (rawDuration && (!Number.isSafeInteger(duration) || duration < 1 || duration > 1440)) {
        return fail('משך הביקור יכול להיות דקה ועד 24 שעות.', 'duration', target);
      }
      if (stop.pendingMedia?.some((item) => item.persistence === 'failed' || item.persistence === 'materializing')) {
        return fail('כדאי להשלים את טעינת התמונות או להסיר תמונה שאינה זמינה.', 'photos', target);
      }
    }
  }
  if (stopCount < 2) return fail('כדאי להוסיף לפחות שתי עצירות שימושיות.', 'day', { dayIndex: 0 });
  return null;
}
