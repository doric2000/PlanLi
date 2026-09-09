import { parseAtlasMessage } from '../src/features/region/globe/bridge';
const message = (body) => JSON.stringify({ channel: 'atlas-1', ...body });
it('accepts only known messages from its own renderer', () => {
  expect(parseAtlasMessage(message({ type: 'select', regionId: 'europe' }), 'atlas-1')).toEqual({ type: 'select', regionId: 'europe' });
  expect(parseAtlasMessage(message({ type: 'ready' }), 'atlas-1')).toEqual({ type: 'ready' });
  for (const invalid of ['invalid JSON', message({ type: 'select', regionId: 'global' }), message({ type: 'navigate', url: 'https://example.com' }), 'x'.repeat(1025)]) {
    expect(parseAtlasMessage(invalid, 'atlas-1')).toBeNull();
  }
  expect(parseAtlasMessage(message({ type: 'select', regionId: 'europe' }), 'other-atlas')).toBeNull();
});
