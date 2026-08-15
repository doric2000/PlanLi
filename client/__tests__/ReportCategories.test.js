import { REPORT_CATEGORIES } from '../src/features/moderation/constants/reportCategories';

describe('report categories', () => {
  it('uses stable unique ids and requires details for ambiguous reports', () => {
    expect(REPORT_CATEGORIES).toHaveLength(10);
    expect(new Set(REPORT_CATEGORIES.map((item) => item.id)).size).toBe(10);
    expect(REPORT_CATEGORIES.filter((item) => item.detailsRequired).map((item) => item.id)).toEqual([
      'inaccurate_or_unsafe_travel_info',
      'copyright_image_rights',
      'other',
    ]);
  });
});
