export const COMMUNITY_FILTERS = {
  all: { id: 'all', label: 'הכול' },
  transportation: { id: 'transportation', label: 'תחבורה' },
  sim: { id: 'sim', label: 'SIM וגלישה' },
};

function recommendationTagIds(recommendation) {
  return (Array.isArray(recommendation?.tags) ? recommendation.tags : [])
    .map((tag) => typeof tag === 'string' ? tag : tag?.id)
    .filter(Boolean);
}

export function isTransportationRecommendation(recommendation) {
  return recommendation?.categoryId === 'transportation';
}

export function isSimRecommendation(recommendation) {
  return recommendation?.categoryId === 'services' &&
    recommendationTagIds(recommendation).includes('sim_esim');
}

export function availableCommunityFilters(recommendations = []) {
  return [
    COMMUNITY_FILTERS.all,
    ...(recommendations.some(isTransportationRecommendation)
      ? [COMMUNITY_FILTERS.transportation]
      : []),
    ...(recommendations.some(isSimRecommendation)
      ? [COMMUNITY_FILTERS.sim]
      : []),
  ];
}

export function filterCommunityRecommendations(recommendations = [], filterId = 'all') {
  if (filterId === 'transportation') {
    return recommendations.filter(isTransportationRecommendation);
  }
  if (filterId === 'sim') return recommendations.filter(isSimRecommendation);
  return recommendations;
}

function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

export function buildQuickFacts(quickFacts = {}) {
  const facts = [];
  const weather = quickFacts.weather;
  if (weather && (Number.isFinite(Number(weather.temperatureC)) || present(weather.description))) {
    facts.push({
      id: 'weather',
      title: 'מזג אוויר',
      value: Number.isFinite(Number(weather.temperatureC))
        ? `${Math.round(Number(weather.temperatureC))}°`
        : weather.description,
      detail: weather.description || '',
      icon: 'partly-sunny-outline',
      iconLibrary: 'Ionicons',
      conditionCode: weather.conditionCode || '',
    });
  }

  const airport = quickFacts.closestAirport;
  if (airport && (present(airport.name) || present(airport.iataCode))) {
    const distance = Number(airport.distanceKm);
    const detail = [
      present(airport.iataCode) ? airport.iataCode : null,
      Number.isFinite(distance) ? `כ־${Math.round(distance)} ק״מ` : null,
    ].filter(Boolean).join(' · ');
    facts.push({
      id: 'airport',
      title: 'שדה תעופה',
      value: airport.name || airport.iataCode,
      detail,
      icon: 'airplane',
      iconLibrary: 'MaterialCommunityIcons',
    });
  }

  const currency = quickFacts.currency;
  if (currency && present(currency.code)) {
    const rate = Number(currency.ilsRate);
    facts.push({
      id: 'currency',
      title: 'מטבע',
      value: [currency.code, currency.symbol].filter(present).join(' · '),
      detail: Number.isFinite(rate) && currency.code !== 'ILS'
        ? `1 ₪ ≈ ${rate.toFixed(rate < 1 ? 2 : 1)} ${currency.code}`
        : currency.code === 'ILS' ? 'שקל ישראלי' : '',
      icon: 'cash-multiple',
      iconLibrary: 'MaterialCommunityIcons',
    });
  }
  return facts;
}

export function buildEssentialRows(essentialFacts = {}) {
  const rows = [];
  const languages = (Array.isArray(essentialFacts.languages)
    ? essentialFacts.languages
    : []).map((language) => language?.labelHe || language?.label || language?.code)
    .filter(present);
  if (languages.length) {
    rows.push({
      id: 'languages',
      label: languages.length > 1 ? 'שפות' : 'שפה',
      value: languages.join(', '),
      icon: 'translate',
    });
  }
  const callingCodes = (Array.isArray(essentialFacts.callingCodes)
    ? essentialFacts.callingCodes
    : []).filter(present);
  if (callingCodes.length) {
    rows.push({
      id: 'callingCodes',
      label: 'קידומת חיוג',
      value: callingCodes.join(', '),
      icon: 'phone-outline',
    });
  }
  return rows;
}

const SOURCE_LABELS = {
  weather: 'מזג אוויר',
  closestAirport: 'שדה תעופה',
  currency: 'שער מטבע',
  country: 'מידע מדינתי',
};

export function buildSourceRows(sources = {}) {
  return Object.entries(sources).map(([id, source]) => ({
    id,
    label: SOURCE_LABELS[id] || id,
    value: source?.name || '',
    updatedAt: source?.updatedAt || null,
    ...(source?.url ? { url: source.url } : {}),
  })).filter((row) => present(row.value));
}
