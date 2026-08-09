import { getContentGridColumns } from '../src/components/ContentTile';

describe('responsive content grid', () => {
  it('uses the same phone, tablet, and web column rules everywhere', () => {
    expect(getContentGridColumns(390)).toBe(3);
    expect(getContentGridColumns(768)).toBe(4);
    expect(getContentGridColumns(1200)).toBe(5);
  });
});
