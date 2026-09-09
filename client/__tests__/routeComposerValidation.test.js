import { validateRouteComposer } from '../src/features/roadtrip/utils/routeComposerValidation';

const base = () => ({ area: { countryId: 'GB', cityId: 'london' }, title: 'מסלול', description: 'תיאור',
  attributes: { budgetLevel: 'balanced' }, days: ['a', 'b'].map((id) => ({ id, stops: [{ id, title: 'תחנה',
    locationPrecision: 'general', destination: { countryId: 'GB', cityId: 'london' } }] })) });

it('does not require photos or optional route attributes', () => {
  expect(validateRouteComposer(base())).toBeNull();
});

it.each([
  [{ title: '' }, 'stopTitle'],
  [{ editorState: { locationIncomplete: true } }, 'location'],
  [{ editorState: { startTime: '9:' } }, 'time'],
  [{ editorState: { durationMinutes: '0' } }, 'duration'],
  [{ pendingMedia: [{ persistence: 'failed' }] }, 'photos'],
])('targets the specific day and stop for %s', (patch, field) => {
  const draft = base();
  Object.assign(draft.days[1].stops[0], patch);
  expect(validateRouteComposer(draft)).toEqual(expect.objectContaining({ field, dayIndex: 1, stopId: 'b' }));
});

it('preserves the minimum number of useful stops', () => {
  const draft = base();
  draft.days.pop();
  expect(validateRouteComposer(draft)).toEqual(expect.objectContaining({ field: 'day', dayIndex: 0 }));
});
