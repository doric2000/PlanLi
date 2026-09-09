// Identity and travel membership are separate: a trail's Place ID is not a
// second identity for its destination. These reviewed links repair the reported
// Sri Lanka cases without extending city or province boundaries.
module.exports = Object.freeze([
  {
    id: 'lk-ella', countryCode: 'LK',
    names: { he: 'אלה', en: 'Ella' }, aliases: ['Ella', 'אלה'],
    kind: 'city_hub', groupingPolicy: 'self',
    center: { lat: 6.8731332, lng: 81.0491074 },
    providerRefs: { googlePlaceId: 'ChIJJZrAW5Vl5DoR-4fE3trc-r0' },
    googleTypes: ['locality', 'political'],
    membership: {
      reviewed: true,
      googlePlaceIds: [
        'ChIJO9eppsRl5DoRFtLkLnZEP0k',
        'ChIJFeqM3nll5DoRBG4AC5Pl9Aw',
        'ChIJy23OVQBl5DoRa8ALKjn79i8',
      ],
      sources: ['https://www.sltda.gov.lk/index.php/en/tourist-attractions'],
    },
  },
  {
    id: 'lk-udawalawe-national-park', countryCode: 'LK',
    names: { he: 'שמורת אודוואלווה', en: 'Udawalawe National Park' },
    aliases: ['Udawalawe National Park', 'Udawalawa National Park', 'Uda Walawe National Park', 'שמורת אודוואלווה', 'שמורת אודלאוולה'],
    kind: 'natural_feature', groupingPolicy: 'self',
    center: { lat: 6.4746288, lng: 80.876319 },
    providerRefs: { googlePlaceId: 'ChIJeX6IiP8I5DoR14DZ-5_nEq8' },
    googleTypes: ['national_park', 'park', 'point_of_interest', 'establishment'],
    providerIdentity: { reviewedOverride: true },
    researchSources: [
      { title: 'Sri Lanka Ministry of Environment — Udawalawe National Park', url: 'https://env.gov.lk/web/images/WFRCD/9_-_Udawalawe_National_Park.pdf' },
      { title: 'Sri Lanka Tourism Development Authority', url: 'https://www.sltda.gov.lk/index.php/en/tourist-attractions' },
    ],
  },
  {
    id: 'lk-sri-lanka-south-coast', countryCode: 'LK',
    names: { he: 'חופי הדרום', en: 'Sri Lanka South Coast' },
    aliases: ['Sri Lanka South Coast', 'חופי הדרום'],
    kind: 'tourism_region', groupingPolicy: 'self',
    // Southern Province is not the coastal tourism region. Keep the stable
    // registry ID while requiring reviewed membership before using this area.
    providerIdentity: { allowExactProviderMatch: false },
    geometryPolicy: { autoMatchEligible: false, aliasAutoMatchEligible: false, source: 'identity_requires_review', version: 4 },
  },
]);
