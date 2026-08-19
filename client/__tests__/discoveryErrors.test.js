import { isDiscoveryRateLimitError } from '../src/utils/discoveryErrors';

describe('discovery errors', () => {
  it('recognizes callable resource exhaustion without matching unrelated errors', () => {
    expect(isDiscoveryRateLimitError({ code: 'functions/resource-exhausted' })).toBe(true);
    expect(isDiscoveryRateLimitError({ details: { code: 'resource-exhausted' } })).toBe(true);
    expect(isDiscoveryRateLimitError({ code: 'functions/unavailable' })).toBe(false);
  });
});
