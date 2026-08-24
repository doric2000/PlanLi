import { NOYA_TOUR_IDS } from './services/NoyaProductTourStorage';

export const NOYA_MAIN_TARGETS = Object.freeze({
  Home: 'main-home',
  Community: 'main-community',
  Routes: 'main-routes',
  Favorites: 'main-favorites',
});

export const NOYA_CREATOR_TARGETS = Object.freeze({
  recommendationLocation: 'recommendation-location',
  recommendationTaxonomy: 'recommendation-taxonomy',
  recommendationStory: 'recommendation-story',
  recommendationFallback: 'recommendation-composer',
  routeBase: 'route-base',
  routeStop: 'route-stop-location',
  routePublish: 'route-publish-details',
});

export const MAIN_TOUR_STEPS = Object.freeze([
  {
    id: 'intro',
    title: 'סיור קצר עם נועה',
    message: 'זה עוד לא הטיול האמיתי. אפילו לא צריך לארוז. אראה לך בארבעה צעדים איפה מוצאים כל דבר.',
    primaryLabel: 'יאללה, מתחילים',
  },
  {
    id: 'home',
    tabName: 'Home',
    targetId: NOYA_MAIN_TARGETS.Home,
    title: 'הבית של הטיול הבא',
    message: 'כאן מחפשים יעד ומתחילים לגלות מקומות שמתאימים לטיול הבא.',
    progress: { current: 1, total: 4 },
  },
  {
    id: 'community',
    tabName: 'Community',
    targetId: NOYA_MAIN_TARGETS.Community,
    title: 'המלצות מהקהילה',
    message: 'כאן מחכות המלצות של מטיילים. אפשר לחפש, לסנן ולפתוח אותן במפה.',
    progress: { current: 2, total: 4 },
  },
  {
    id: 'routes',
    tabName: 'Routes',
    targetId: NOYA_MAIN_TARGETS.Routes,
    title: 'מסלולים לפי הסדר',
    message: 'כאן מוצאים מסלולים ליום אחד או לכמה ימים, עם העצירות לפי הסדר.',
    progress: { current: 3, total: 4 },
  },
  {
    id: 'favorites',
    tabName: 'Favorites',
    targetId: NOYA_MAIN_TARGETS.Favorites,
    title: 'כל מה ששמרנו',
    message: 'כל יעד, המלצה או מסלול ששומרים מחכה כאן.',
    progress: { current: 4, total: 4 },
  },
  {
    id: 'complete',
    tabName: 'Home',
    title: 'מוכנים לצאת לדרך',
    message: 'זהו, הסיור נגמר. עכשיו אפשר להתחיל לתכנן את הטיול האמיתי.',
    primaryLabel: 'לדרך',
  },
]);

export const CREATOR_GUIDE_STEPS = Object.freeze({
  [NOYA_TOUR_IDS.recommendation]: [
    {
      targetId: NOYA_CREATOR_TARGETS.recommendationLocation,
      title: 'מתחילים מהמיקום',
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
      message: 'כותרת קצרה, תיאור ותמונה טובה עושים את רוב העבודה. אפשר לבחור עד חמש תמונות, להזיז ולקרב כל תמונה ולבדוק בדיוק מה יופיע. לפני הפרסום תתבקש גם רמת מחיר. הבחירה והחיתוך נשמרים, והכנת התמונות לפרסום ממשיכה ברקע.',
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
