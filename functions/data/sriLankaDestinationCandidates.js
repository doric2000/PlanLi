// Hebrew travel labels; provider identity must still be verified before use.
const sources = [
  { title: 'למטייל — סרי לנקה', url: 'https://www.lametayel.co.il/destinations/sri-lanka-299/articles' },
  { title: 'Sri Lanka Tourism Development Authority — coastal destinations',
    url: 'https://www.sltda.gov.lk/storage/common_media/Marine_tourism_FullReport.pdf' },
];
module.exports = [
  ['weligama', 'ווליגמה', 'Weligama', ['Weligaama', 'וליגמה']],
  ['mirissa', 'מיריסה', 'Mirissa', ['Mirisa', 'מירסה']],
  ['unawatuna', 'אונוואטונה', 'Unawatuna', ['Unawatunna', 'אונוואטונה']],
  ['hikkaduwa', 'היקדואה', 'Hikkaduwa', ['Hikaduwa', 'היקאדווה']],
  ['tangalle', 'טנגאלה', 'Tangalle', ['Tangalla', 'טנגול']],
  ['ahangama', 'אהנגמה', 'Ahangama', []],
  ['hiriketiya', 'היריקטייה', 'Hiriketiya', ['Hiriketiya Beach', 'היריקטיה']],
  ['arugam-bay', 'ארוגם ביי', 'Arugam Bay', ['Arugam', 'Arugambay', 'אגרום ביי']],
  ['nuwara-eliya', 'נוארה אליה', 'Nuwara Eliya', ['Nuwaraeliya', 'נוארה אלייה']],
].map(([slug, he, en, aliases]) => ({ id: `lk-${slug}`, countryCode: 'LK',
  names: { he, en }, aliases: [en, he, ...aliases], kind: 'city_hub', groupingPolicy: 'self',
  providerQuery: `${en}, LK`, researchRegion: 'south_central_asia',
  researchSources: sources, status: 'candidate' }));
