const addError = (errors, field, section, message) => {
  if (!errors.fields[field]) errors.fields[field] = message;
  if (!errors.sections[section]) errors.sections[section] = [];
  if (!errors.sections[section].includes(field)) errors.sections[section].push(field);
};

export const emptyValidation = () => ({ fields: {}, sections: {} });

export const sectionErrorCount = (errors, sectionId) => errors?.sections?.[sectionId]?.length || 0;

export const firstInvalidSection = (errors, sectionOrder) => (
  sectionOrder.find((sectionId) => sectionErrorCount(errors, sectionId) > 0) || null
);

export function validateRecommendationForm(values, onlySection = null) {
  const errors = emptyValidation();
  const include = (section) => !onlySection || onlySection === section;

  if (include('place')) {
    if (!values.title?.trim()) addError(errors, 'title', 'place', 'כתבו כותרת קצרה וברורה.');
    if (values.locationResolveError) addError(errors, 'location', 'place', 'בחרו מיקום תקין מהרשימה.');
    else if (values.resolvingLocation) addError(errors, 'location', 'place', 'המתינו לסיום טעינת המיקום.');
    else if (!values.selectedCountry?.id || !values.selectedCity?.id) addError(errors, 'location', 'place', 'בחרו מקום או עיר מהרשימה.');
  }

  if (include('story') && !values.description?.trim()) {
    addError(errors, 'description', 'story', 'ספרו בקצרה למה המקום מומלץ.');
  }

  if (include('category')) {
    if (!values.category) addError(errors, 'category', 'category', 'בחרו קטגוריה.');
    if (!values.selectedTags?.length) addError(errors, 'selectedTags', 'category', 'בחרו לפחות תת־קטגוריה אחת.');
  }

  if (include('fit')) {
    if (!values.budget) addError(errors, 'budget', 'fit', 'בחרו רמת מחיר.');
    if (values.audienceScope === 'selected' && !values.audiences?.length) {
      addError(errors, 'audiences', 'fit', 'בחרו לפחות קהל אחד או סמנו שמתאים לכולם.');
    }
    if (values.attributeRequirements?.vibes && !values.recommendationVibes?.length) {
      addError(errors, 'vibes', 'fit', 'בחרו לפחות אווירה אחת.');
    }
    if (values.attributeRequirements?.environment && !values.recommendationEnvironment) {
      addError(errors, 'environment', 'fit', 'בחרו סביבה.');
    }
    if (values.recommendationNeeds?.length && !values.needsConfirmed) {
      addError(errors, 'needsConfirmed', 'fit', 'אשרו שהמידע המעשי נבדק במפורש.');
    }
  }

  return errors;
}

export function validateRouteForm(values, onlySection = null) {
  const errors = emptyValidation();
  const include = (section) => !onlySection || onlySection === section;
  const parsedDays = Number.parseInt(values.days, 10);
  const parsedDistance = Number.parseFloat(values.distance);

  if (include('basics')) {
    if (!values.title?.trim()) addError(errors, 'title', 'basics', 'כתבו כותרת למסלול.');
    if (!Number.isFinite(parsedDays) || parsedDays < 1) addError(errors, 'days', 'basics', 'הזינו מספר ימים גדול מאפס.');
    if (!Number.isFinite(parsedDistance)) addError(errors, 'distance', 'basics', 'הזינו מרחק תקין בקילומטרים.');
    if (!values.desc?.trim()) addError(errors, 'desc', 'basics', 'הוסיפו תיאור קצר למסלול.');
  }

  if (include('days') && !values.validStops?.length) {
    addError(errors, 'stops', 'days', 'הוסיפו לפחות תחנה מדויקת אחת למסלול.');
  }

  if (include('category')) {
    if (!values.categoryIds?.length) addError(errors, 'categoryIds', 'category', 'בחרו לפחות קטגוריה אחת.');
    const missingSubcategory = (values.categoryIds || []).some((categoryId) => (
      !(values.tagOptionsByCategory?.[categoryId] || []).some((tag) => values.subcategoryIds?.includes(tag.id))
    ));
    if (values.categoryIds?.length && missingSubcategory) {
      addError(errors, 'subcategoryIds', 'category', 'בחרו תת־קטגוריה לכל קטגוריה שסומנה.');
    }
  }

  if (include('fit')) {
    if (values.audienceScope === 'selected' && !values.audiences?.length) addError(errors, 'audiences', 'fit', 'בחרו לפחות קהל אחד או סמנו שמתאים לכולם.');
    if (!values.budgetLevel) addError(errors, 'budgetLevel', 'fit', 'בחרו תקציב.');
    if (!values.difficulty) addError(errors, 'difficulty', 'fit', 'בחרו רמת קושי.');
    if (!values.transportModes?.length) addError(errors, 'transportModes', 'fit', 'בחרו לפחות אמצעי התניידות אחד.');
    if (!values.pace) addError(errors, 'pace', 'fit', 'בחרו קצב.');
    if (!values.seasons?.length) addError(errors, 'seasons', 'fit', 'בחרו לפחות עונה אחת.');
    if (!values.environment) addError(errors, 'environment', 'fit', 'בחרו סביבה עיקרית.');
    if (values.needs?.length && !values.needsCoverageConfirmed) addError(errors, 'needsCoverageConfirmed', 'fit', 'אשרו שהמידע נכון לכל המסלול.');
  }

  return errors;
}
