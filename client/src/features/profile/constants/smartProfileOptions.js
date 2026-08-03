export const INTERESTS = [
  { value: 'nature_scenery', label: 'טבע ונופים' },
  { value: 'hiking', label: 'מסלולי הליכה' },
  { value: 'beaches_water', label: 'ים וחופים' },
  { value: 'food', label: 'אוכל וקולינריה' },
  { value: 'cafes', label: 'בתי קפה' },
  { value: 'nightlife', label: 'חיי לילה וברים' },
  { value: 'culture_history', label: 'תרבות והיסטוריה' },
  { value: 'museums_art', label: 'מוזיאונים ואמנות' },
  { value: 'architecture_neighborhoods', label: 'אדריכלות ושכונות' },
  { value: 'shopping_markets', label: 'קניות ושווקים' },
  { value: 'family_attractions', label: 'אטרקציות למשפחות' },
  { value: 'entertainment_parks', label: 'פארקים ובידור' },
  { value: 'adventure_extreme', label: 'אקסטרים והרפתקאות' },
  { value: 'wildlife', label: 'בעלי חיים וטבע פראי' },
  { value: 'wellness', label: 'ספא ובריאות' },
  { value: 'local_experiences', label: 'חוויות מקומיות' },
  { value: 'photography_viewpoints', label: 'צילום ותצפיות' },
  { value: 'music_events', label: 'הופעות ואירועים' },
  { value: 'winter_sports', label: 'שלג וספורט חורף' },
  { value: 'scenic_roadtrips', label: 'רואדטריפים ונסיעות נוף' },
];

export const BUDGETS = [
  { value: 'economy', label: 'חסכוני', helper: 'חינמי–₪' },
  { value: 'balanced', label: 'מאוזן', helper: '₪₪' },
  { value: 'comfort', label: 'נוח', helper: '₪₪₪' },
  { value: 'premium', label: 'מפנק', helper: '₪₪₪₪' },
  { value: 'flexible', label: 'לא משנה', helper: 'פתוח/ה להצעות' },
];

export const TRAVEL_PARTIES = [
  { value: 'solo', label: 'לבד' },
  { value: 'couple', label: 'זוג' },
  { value: 'friends', label: 'חברים' },
  { value: 'family_young_children', label: 'משפחה עם ילדים קטנים' },
  { value: 'family_older_children', label: 'משפחה עם ילדים גדולים' },
  { value: 'multigenerational_group', label: 'משפחה רב־דורית / קבוצה' },
];

export const VIBES = [
  { value: 'relaxed', label: 'רגוע' },
  { value: 'romantic', label: 'רומנטי' },
  { value: 'adventurous', label: 'הרפתקני' },
  { value: 'cultural', label: 'תרבותי' },
  { value: 'social', label: 'חברתי' },
  { value: 'local', label: 'מקומי ואותנטי' },
  { value: 'backpacker', label: 'תרמילאי' },
  { value: 'digital_nomad', label: 'נוודות דיגיטלית' },
];

export const PACES = [
  { value: 'relaxed', label: 'רגוע' },
  { value: 'balanced', label: 'מאוזן' },
  { value: 'packed', label: 'מלא חוויות' },
];

export const NEEDS = [
  { value: 'kosher', label: 'כשר' },
  { value: 'shabbat_friendly', label: 'ידידותי לשומרי שבת' },
  { value: 'vegetarian', label: 'צמחוני' },
  { value: 'vegan', label: 'טבעוני' },
  { value: 'wheelchair_accessible', label: 'נגישות לכיסא גלגלים' },
  { value: 'reduced_walking', label: 'מעט הליכה' },
];

export const TRAVEL_STYLES = BUDGETS;
export const TRIP_TYPES = TRAVEL_PARTIES;
export const CONSTRAINTS = NEEDS;

export const labelMapFromOptions = (options) => Object.fromEntries(
  options.map((option) => [option.value, option.label])
);

export const INTEREST_LABELS = labelMapFromOptions(INTERESTS);
export const BUDGET_LABELS = labelMapFromOptions(BUDGETS);
export const PARTY_LABELS = labelMapFromOptions(TRAVEL_PARTIES);
export const VIBE_LABELS = labelMapFromOptions(VIBES);
export const PACE_LABELS = labelMapFromOptions(PACES);
export const NEED_LABELS = labelMapFromOptions(NEEDS);

export function getPersonalizationReasonLabel(reasonCode) {
  if (typeof reasonCode !== 'string') return '';
  if (reasonCode === 'budget') return 'מתאים לתקציב שלך';
  const [kind, value] = reasonCode.split(':');
  if (kind === 'interest' && INTEREST_LABELS[value]) return `מתאים ל${INTEREST_LABELS[value]}`;
  if (kind === 'party' && PARTY_LABELS[value]) return `מתאים ל${PARTY_LABELS[value]}`;
  return '';
}
