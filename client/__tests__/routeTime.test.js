import { normalizeRouteTimeInput } from '../src/features/roadtrip/utils/routeTime';

describe('normalizeRouteTimeInput', () => {
  it('accepts one or two hour digits and stores a canonical time', () => {
    expect(normalizeRouteTimeInput('8:30')).toBe('08:30');
    expect(normalizeRouteTimeInput('08:30')).toBe('08:30');
    expect(normalizeRouteTimeInput(' 8:30 ')).toBe('08:30');
  });

  it('rejects impossible times and keeps an empty optional value', () => {
    expect(normalizeRouteTimeInput('24:00')).toBeNull();
    expect(normalizeRouteTimeInput('8:75')).toBeNull();
    expect(normalizeRouteTimeInput('')).toBe('');
  });
});
