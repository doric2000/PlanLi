import { NOYA_TOUR_IDS } from './services/NoyaProductTourStorage';

export const NOYA_MAIN_TAB_TARGETS = Object.freeze({
  Home: 'main-tab-home',
  Community: 'main-tab-community',
  Routes: 'main-tab-routes',
  Favorites: 'main-tab-favorites',
});

export const NOYA_MAIN_TARGETS = Object.freeze({
  homeSearch: 'main-home-search',
  communitySearch: 'main-community-search',
  communityFilter: 'main-community-filter',
  communitySort: 'main-community-sort',
  communityMap: 'main-community-map',
  communityAdd: 'main-community-add',
  routesSearch: 'main-routes-search',
  routesFilter: 'main-routes-filter',
  routesSort: 'main-routes-sort',
  routesAdd: 'main-routes-add',
  favoritesCategories: 'main-favorites-categories',
});

export const NOYA_CREATOR_TARGETS = Object.freeze({
  recommendationPhotos: 'recommendation-photos',
  recommendationLocation: 'recommendation-location',
  recommendationTaxonomy: 'recommendation-taxonomy',
  recommendationStory: 'recommendation-story',
  recommendationFallback: 'recommendation-composer',
  routeBase: 'route-base',
  routeStop: 'route-stop-location',
  routePublish: 'route-publish-details',
});

const spotlight = (id, options = {}) => Object.freeze({
  id,
  padding: 3,
  radius: 16,
  ...options,
});

const MAIN_TOUR_CONTENT_STEPS = [
  {
    id: 'home-search',
    tabName: 'Home',
    anchorTargetId: NOYA_MAIN_TARGETS.homeSearch,
    targets: [
      spotlight(NOYA_MAIN_TAB_TARGETS.Home, { radius: 28 }),
      spotlight(NOYA_MAIN_TARGETS.homeSearch, { anchor: true }),
    ],
    title: 'מתחילים מהיעד',
    message: 'בשדה הזה מחפשים עיר או יעד ופותחים את כל המידע שיעזור להתחיל לתכנן.',
  },
  {
    id: 'community-search',
    tabName: 'Community',
    anchorTargetId: NOYA_MAIN_TARGETS.communitySearch,
    targets: [
      spotlight(NOYA_MAIN_TAB_TARGETS.Community, { radius: 28 }),
      spotlight(NOYA_MAIN_TARGETS.communitySearch, { anchor: true }),
    ],
    title: 'המלצות מהקהילה',
    message: 'עברנו לקהילה. כאן מחפשים המלצה לפי שם, מקום או מה שמתחשק לעשות.',
  },
  {
    id: 'community-filter',
    tabName: 'Community',
    anchorTargetId: NOYA_MAIN_TARGETS.communityFilter,
    targets: [spotlight(NOYA_MAIN_TARGETS.communityFilter, { anchor: true, radius: 24 })],
    title: 'מסננים את ההמלצות',
    message: 'כאן מסננים לפי יעד, קטגוריה, קהל, רמת מחיר, אווירה וצרכים חשובים. אפשר גם למלא את הבחירות מההעדפות האישיות.',
  },
  {
    id: 'community-sort',
    tabName: 'Community',
    anchorTargetId: NOYA_MAIN_TARGETS.communitySort,
    targets: [spotlight(NOYA_MAIN_TARGETS.communitySort, { anchor: true, radius: 14 })],
    title: 'מסדרים בדרך שנוחה לך',
    message: 'כאן משנים את סדר ההמלצות: בשבילך כשזמין, הכי פופולרי, הכי חדש או הכי קרוב אליי.',
  },
  {
    id: 'community-map',
    tabName: 'Community',
    anchorTargetId: NOYA_MAIN_TARGETS.communityMap,
    targets: [spotlight(NOYA_MAIN_TARGETS.communityMap, { anchor: true, radius: 24 })],
    title: 'פותחים את ההמלצות במפה',
    message: 'הכפתור הזה מחליף בין הרשימה למפה, כדי לראות מה נמצא באזור שמעניין אותך.',
  },
  {
    id: 'community-add',
    tabName: 'Community',
    anchorTargetId: NOYA_MAIN_TARGETS.communityAdd,
    targets: [spotlight(NOYA_MAIN_TARGETS.communityAdd, { anchor: true, radius: 32 })],
    title: 'מוסיפים המלצה משלך',
    message: 'כפתור הפלוס פותח יצירת המלצה. אם צריך נבקש להתחבר, ובטופס אני אלווה אותך בתמונות, במיקום, בקטגוריה ובסיפור.',
  },
  {
    id: 'routes-search',
    tabName: 'Routes',
    anchorTargetId: NOYA_MAIN_TARGETS.routesSearch,
    targets: [
      spotlight(NOYA_MAIN_TAB_TARGETS.Routes, { radius: 28 }),
      spotlight(NOYA_MAIN_TARGETS.routesSearch, { anchor: true }),
    ],
    title: 'מחפשים מסלול',
    message: 'עברנו למסלולים. כאן מחפשים מסלול לפי מקום, שם או תחום עניין.',
  },
  {
    id: 'routes-filter',
    tabName: 'Routes',
    anchorTargetId: NOYA_MAIN_TARGETS.routesFilter,
    targets: [spotlight(NOYA_MAIN_TARGETS.routesFilter, { anchor: true, radius: 24 })],
    title: 'מסננים מסלולים',
    message: 'כאן מצמצמים לפי יעד, קטגוריה, מספר ימים, מרחק, קושי, התניידות, תקציב והעדפות נוספות.',
  },
  {
    id: 'routes-sort',
    tabName: 'Routes',
    anchorTargetId: NOYA_MAIN_TARGETS.routesSort,
    targets: [spotlight(NOYA_MAIN_TARGETS.routesSort, { anchor: true, radius: 14 })],
    title: 'מסדרים את המסלולים',
    message: 'כאן בוחרים אם לראות קודם מסלולים בשבילך, את הפופולריים ביותר או את החדשים ביותר.',
  },
  {
    id: 'routes-add',
    tabName: 'Routes',
    anchorTargetId: NOYA_MAIN_TARGETS.routesAdd,
    targets: [spotlight(NOYA_MAIN_TARGETS.routesAdd, { anchor: true, radius: 32 })],
    title: 'בונים מסלול חדש',
    message: 'כפתור הפלוס פותח בניית מסלול. אם צריך נבקש להתחבר, ואחר כך נועה תלווה אותך בבחירת האזור, הימים והעצירות.',
  },
  {
    id: 'favorites',
    tabName: 'Favorites',
    anchorTargetId: NOYA_MAIN_TARGETS.favoritesCategories,
    targets: [
      spotlight(NOYA_MAIN_TAB_TARGETS.Favorites, { radius: 28 }),
      spotlight(NOYA_MAIN_TARGETS.favoritesCategories, { anchor: true, radius: 24 }),
    ],
    title: 'כל מה ששמרנו',
    message: 'במועדפים עוברים בין יעדים, המלצות ומסלולים ששמרת, והכול נשאר מסודר במקום אחד.',
  },
];

const MAIN_TOUR_TOTAL = MAIN_TOUR_CONTENT_STEPS.length;

export const MAIN_TOUR_STEPS = Object.freeze([
  Object.freeze({
    id: 'intro',
    tabName: 'Home',
    title: 'סיור קצר עם נועה',
    message: 'זה עוד לא הטיול האמיתי. אפילו לא צריך לארוז. אראה לך איפה מחפשים, מסננים, ממיינים, שומרים ומוסיפים תוכן.',
    primaryLabel: 'יאללה, מתחילים',
  }),
  ...MAIN_TOUR_CONTENT_STEPS.map((step, index) => Object.freeze({
    ...step,
    progress: Object.freeze({ current: index + 1, total: MAIN_TOUR_TOTAL }),
  })),
  Object.freeze({
    id: 'complete',
    tabName: 'Home',
    title: 'מוכנים לצאת לדרך',
    message: 'זהו, הסיור נגמר. עכשיו אפשר לחפש יעד, למצוא המלצה או להתחיל לבנות מסלול משלך.',
    primaryLabel: 'לדרך',
  }),
]);

export const CREATOR_GUIDE_STEPS = Object.freeze({
  [NOYA_TOUR_IDS.recommendation]: [
    {
      targetId: NOYA_CREATOR_TARGETS.recommendationPhotos,
      title: 'מתחילים מהתמונות',
      message: 'בוחרים בין תמונה אחת לחמש. אפשר לעבור בין התמונות, להזיז, לקרב ולחתוך כל אחת בנפרד. צריך לפחות תמונה אחת כדי להמשיך.',
    },
    {
      targetId: NOYA_CREATOR_TARGETS.recommendationLocation,
      title: 'ממשיכים למיקום',
      message: 'אפשר לבחור מקום מדויק, נקודה במפה, או עיר ואזור.',
    },
    {
      targetId: NOYA_CREATOR_TARGETS.recommendationTaxonomy,
      title: 'עוזרים למצוא את ההמלצה',
      message: 'קטגוריה ועוד עד שלוש אפשרויות יעזרו למצוא את ההמלצה בלי להעמיס בתגיות.',
    },
    {
      targetId: NOYA_CREATOR_TARGETS.recommendationStory,
      title: 'מספרים למה כדאי להגיע',
      message: 'מוסיפים כותרת קצרה, תיאור ורמת מחיר, בודקים את התצוגה המקדימה ומשלימים רק פרטים נוספים שרלוונטיים. הכנת התמונות לפרסום ממשיכה ברקע.',
    },
  ],
  [NOYA_TOUR_IDS.route]: [
    {
      targetId: NOYA_CREATOR_TARGETS.routeBase,
      title: 'פותחים מסלול',
      message: 'מתחילים מעיר או אזור וממספר הימים. אפשר לשנות ולהוסיף פרטים אחר כך.',
    },
    {
      targetId: NOYA_CREATOR_TARGETS.routeStop,
      title: 'העצירה הראשונה',
      message: 'בכל עצירה בוחרים מיקום ומוסיפים רק את מה ששימושי. אפשר לציין תיאור, שעה, משך ועד שלוש תמונות. הבחירה והחיתוך נשמרים בטיוטה.',
      scope: 'route-stop-editor',
    },
    {
      targetId: NOYA_CREATOR_TARGETS.routePublish,
      title: 'לפני הפרסום',
      message: 'לפני הפרסום משלימים תיאור מסלול ורמת מחיר כוללת. שאר הפרטים נשארים לבחירה.',
    },
  ],
});
