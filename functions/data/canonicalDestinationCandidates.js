// Researched candidate catalog. Provider identity and geometry are intentionally
// enriched by the dry-run seed tool; unresolved candidates can never be applied.
const RESEARCH = Object.freeze({
  europe: [
    { title: 'למטייל — יעדים באירופה', url: 'https://www.lametayel.co.il/destinations/europe-66' },
    { title: 'מסע אחר — אירופה', url: 'https://www.masa.co.il/continent/europe/' },
  ],
  asia: [
    { title: 'למטייל — יעדים באסיה', url: 'https://www.lametayel.co.il/destinations/asia-58' },
    { title: 'מסע אחר — אסיה', url: 'https://www.masa.co.il/continent/asia/' },
  ],
  central_america: [
    { title: 'למטייל — יעדים במרכז אמריקה', url: 'https://www.lametayel.co.il/destinations/central-america-55' },
    { title: 'מסע אחר — מרכז אמריקה', url: 'https://www.masa.co.il/continent/central-america/' },
  ],
  south_america: [
    { title: 'למטייל — יעדים בדרום אמריקה', url: 'https://www.lametayel.co.il/destinations/south-america-88' },
    { title: 'מסע אחר — דרום אמריקה', url: 'https://www.masa.co.il/continent/south-america/' },
  ],
});

// [country code, approved Hebrew, approved English, tourism kind]
const EUROPE = [
  ['PT','ליסבון','Lisbon','city_hub'],['PT','פורטו','Porto','city_hub'],['PT','אלגרבה','Algarve','tourism_region'],['PT','מדיירה','Madeira','island'],['PT','האיים האזוריים','Azores','island'],
  ['ES','מדריד','Madrid','city_hub'],['ES','ברצלונה','Barcelona','city_hub'],['ES','ולנסיה','Valencia','city_hub'],['ES','סביליה','Seville','city_hub'],['ES','אנדלוסיה','Andalusia','tourism_region'],['ES','קוסטה בראווה','Costa Brava','tourism_region'],['ES','מיורקה','Mallorca','island'],['ES','איביזה','Ibiza','island'],['ES','טנריף','Tenerife','island'],['ES','גראן קנריה','Gran Canaria','island'],
  ['FR','פריז','Paris','city_hub'],['FR','ניס','Nice','city_hub'],['FR','פרובאנס','Provence','tourism_region'],['FR','הריביירה הצרפתית','French Riviera','tourism_region'],['FR','אלזס','Alsace','tourism_region'],['FR','עמק הלואר','Loire Valley','tourism_region'],['FR','קורסיקה','Corsica','island'],
  ['IT','רומא','Rome','city_hub'],['IT','מילאנו','Milan','city_hub'],['IT','ונציה','Venice','city_hub'],['IT','פירנצה','Florence','city_hub'],['IT','נאפולי','Naples','city_hub'],['IT','טוסקנה','Tuscany','tourism_region'],['IT','חוף אמלפי','Amalfi Coast','tourism_region'],['IT','אגם גארדה','Lake Garda','tourism_region'],['IT','אגם קומו','Lake Como','tourism_region'],['IT','הדולומיטים','Dolomites','tourism_region'],['IT','סיציליה','Sicily','island'],['IT','סרדיניה','Sardinia','island'],
  ['GR','אתונה','Athens','city_hub'],['GR','סלוניקי','Thessaloniki','city_hub'],['GR','קורפו','Corfu','island'],['GR','כרתים','Crete','island'],['GR','רודוס','Rhodes','island'],['GR','קוס','Kos','island'],['GR','סנטוריני','Santorini','island'],['GR','מיקונוס','Mykonos','island'],['GR','זקינתוס','Zakynthos','island'],['GR','לפקדה','Lefkada','island'],['GR','פיליון','Pelion','tourism_region'],['GR','מטאורה','Meteora','tourism_region'],
  ['CY','קפריסין','Cyprus','island'],['CY','פאפוס','Paphos','city_hub'],['CY','לרנקה','Larnaca','city_hub'],['CY','איה נאפה','Ayia Napa','city_hub'],
  ['GB','לונדון','London','city_hub'],['GB','אדינבורו','Edinburgh','city_hub'],['GB','ההיילנדס הסקוטיים','Scottish Highlands','tourism_region'],['IE','דבלין','Dublin','city_hub'],['IE','מערב אירלנד','West of Ireland','tourism_region'],
  ['NL','אמסטרדם','Amsterdam','city_hub'],['BE','בריסל','Brussels','city_hub'],['BE','ברוז׳','Bruges','city_hub'],['DE','ברלין','Berlin','city_hub'],['DE','מינכן','Munich','city_hub'],['DE','היער השחור','Black Forest','tourism_region'],['AT','וינה','Vienna','city_hub'],['AT','זלצבורג','Salzburg','city_hub'],['AT','טירול','Tyrol','tourism_region'],['CH','ציריך','Zurich','city_hub'],['CH','אזור אינטרלאקן','Interlaken Region','tourism_region'],['CH','צרמט','Zermatt','city_hub'],
  ['CZ','פראג','Prague','city_hub'],['HU','בודפשט','Budapest','city_hub'],['PL','קרקוב','Krakow','city_hub'],['PL','ורשה','Warsaw','city_hub'],['SK','הרי הטטרה','High Tatras','tourism_region'],['SI','לובליאנה','Ljubljana','city_hub'],['SI','אגם בלד','Lake Bled','tourism_region'],['HR','דוברובניק','Dubrovnik','city_hub'],['HR','ספליט','Split','city_hub'],['HR','איסטריה','Istria','tourism_region'],['ME','קוטור','Kotor','city_hub'],['AL','הריביירה האלבנית','Albanian Riviera','tourism_region'],
  ['RO','בוקרשט','Bucharest','city_hub'],['RO','טרנסילבניה','Transylvania','tourism_region'],['BG','סופיה','Sofia','city_hub'],['BG','בנסקו','Bansko','city_hub'],['RS','בלגרד','Belgrade','city_hub'],['BA','סרייבו','Sarajevo','city_hub'],
  ['DK','קופנהגן','Copenhagen','city_hub'],['SE','סטוקהולם','Stockholm','city_hub'],['NO','אוסלו','Oslo','city_hub'],['NO','הפיורדים הנורווגיים','Norwegian Fjords','tourism_region'],['FI','הלסינקי','Helsinki','city_hub'],['FI','לפלנד הפינית','Finnish Lapland','tourism_region'],['IS','רייקיאוויק','Reykjavik','city_hub'],['IS','דרום איסלנד','South Iceland','tourism_region'],
  ['MT','מלטה','Malta','island'],['TR','איסטנבול','Istanbul','city_hub'],['TR','קפדוקיה','Cappadocia','tourism_region'],['TR','אנטליה','Antalya','city_hub'],['GE','טביליסי','Tbilisi','city_hub'],['GE','קזבגי','Kazbegi','tourism_region'],['GE','סוואנטי','Svaneti','tourism_region'],['AM','ירוואן','Yerevan','city_hub'],
];

const ASIA = [
  ['TH','בנגקוק','Bangkok','city_hub'],['TH','צ׳יאנג מאי','Chiang Mai','province'],['TH','צ׳יאנג ראי','Chiang Rai','province'],['TH','פוקט','Phuket','island'],['TH','קוסמוי','Koh Samui','island'],['TH','קופנגן','Koh Phangan','island'],['TH','קוטאו','Koh Tao','island'],['TH','קראבי','Krabi','tourism_region'],['TH','קופיפי','Koh Phi Phi','island'],['TH','פאי','Pai','city_hub'],['TH','קוצ׳אנג','Koh Chang','island'],['TH','קולנטה','Koh Lanta','island'],
  ['VN','האנוי','Hanoi','city_hub'],['VN','הו צ׳י מין סיטי','Ho Chi Minh City','city_hub'],['VN','האלונג ביי','Ha Long Bay','tourism_region'],['VN','סאפה','Sapa','tourism_region'],['VN','הוי אן','Hoi An','city_hub'],['VN','דה נאנג','Da Nang','city_hub'],['VN','נין בין','Ninh Binh','tourism_region'],['VN','הואה','Hue','city_hub'],['VN','פו קווק','Phu Quoc','island'],
  ['KH','סיאם ריפ','Siem Reap','city_hub'],['KH','פנום פן','Phnom Penh','city_hub'],['KH','קופ רונג','Koh Rong','island'],['LA','לואנג פרבאנג','Luang Prabang','city_hub'],['LA','ואנג ויאנג','Vang Vieng','city_hub'],['LA','ארבעת אלפים האיים','Si Phan Don','tourism_region'],
  ['ID','באלי','Bali','island'],['ID','איי גילי','Gili Islands','island'],['ID','לומבוק','Lombok','island'],['ID','ג׳אווה','Java','island'],['ID','קומודו','Komodo','tourism_region'],
  ['PH','מנילה','Manila','city_hub'],['PH','פלאוון','Palawan','island'],['PH','אל נידו','El Nido','city_hub'],['PH','קורון','Coron','city_hub'],['PH','בורקאי','Boracay','island'],['PH','סבו','Cebu','island'],['PH','בוהול','Bohol','island'],['MY','קואלה לומפור','Kuala Lumpur','city_hub'],['MY','פננג','Penang','island'],['MY','לנגקאווי','Langkawi','island'],['MY','בורנאו המלזית','Malaysian Borneo','tourism_region'],['SG','סינגפור','Singapore','city_hub'],
  ['IN','דלהי','Delhi','city_hub'],['IN','מומבאי','Mumbai','city_hub'],['IN','גואה','Goa','tourism_region'],['IN','מונאר','Munnar','tourism_region'],['IN','דרמסלה','Dharamshala','city_hub'],['IN','מנאלי','Manali','city_hub'],['IN','רישיקש','Rishikesh','city_hub'],['IN','עמק פרוואטי','Parvati Valley','tourism_region'],['IN','וראנסי','Varanasi','city_hub'],['IN','ג׳איפור','Jaipur','city_hub'],['IN','אגרה','Agra','city_hub'],['IN','אודייפור','Udaipur','city_hub'],['IN','האמפי','Hampi','tourism_region'],['IN','קרלה','Kerala','tourism_region'],['IN','אנדמן','Andaman Islands','island'],['IN','לה ולדאק','Leh and Ladakh','tourism_region'],
  ['NP','קטמנדו','Kathmandu','city_hub'],['NP','פוקרה','Pokhara','city_hub'],['NP','אזור האוורסט','Everest Region','tourism_region'],['NP','אזור האנאפורנה','Annapurna Region','tourism_region'],['LK','קולומבו','Colombo','city_hub'],['LK','קנדי','Kandy','city_hub'],['LK','אלה','Ella','city_hub'],['LK','חופי הדרום','Sri Lanka South Coast','tourism_region'],
  ['JP','טוקיו','Tokyo','city_hub'],['JP','קיוטו','Kyoto','city_hub'],['JP','אוסקה','Osaka','city_hub'],['JP','הוקאידו','Hokkaido','island'],['JP','אוקינאווה','Okinawa','island'],['KR','סיאול','Seoul','city_hub'],['KR','בוסאן','Busan','city_hub'],['TW','טאיפיי','Taipei','city_hub'],['HK','הונג קונג','Hong Kong','city_hub'],['CN','בייג׳ינג','Beijing','city_hub'],['CN','שנגחאי','Shanghai','city_hub'],['MN','אולן בטור','Ulaanbaatar','city_hub'],
];

const CENTRAL_AMERICA = [
  ['MX','מקסיקו סיטי','Mexico City','city_hub'],['MX','קנקון','Cancun','city_hub'],['MX','ריביירה מאיה','Riviera Maya','tourism_region'],['MX','טולום','Tulum','city_hub'],['MX','איסלה מוחרס','Isla Mujeres','island'],['MX','אואחאקה','Oaxaca','city_hub'],['MX','סן קריסטובל','San Cristobal de las Casas','city_hub'],['MX','פוארטו אסקונדידו','Puerto Escondido','city_hub'],
  ['GT','אנטיגואה גואטמלה','Antigua Guatemala','city_hub'],['GT','אגם אטיטלן','Lake Atitlan','tourism_region'],['GT','פלורס וטיקאל','Flores and Tikal','tourism_region'],['BZ','קיי קולקר','Caye Caulker','island'],['BZ','אמברגריס קיי','Ambergris Caye','island'],
  ['CR','סן חוזה','San Jose','city_hub'],['CR','לה פורטונה','La Fortuna','city_hub'],['CR','מונטוורדה','Monteverde','tourism_region'],['CR','מנואל אנטוניו','Manuel Antonio','tourism_region'],['CR','טמרינדו','Tamarindo','city_hub'],['CR','פוארטו וייחו','Puerto Viejo de Talamanca','city_hub'],
  ['NI','אומטפה','Ometepe','island'],['NI','גרנדה','Granada Nicaragua','city_hub'],['NI','לאון','Leon Nicaragua','city_hub'],['NI','סן חואן דל סור','San Juan del Sur','city_hub'],['PA','פנמה סיטי','Panama City','city_hub'],['PA','בוקאס דל טורו','Bocas del Toro','island'],['PA','בוקטה','Boquete','city_hub'],['HN','רואטן','Roatan','island'],['HN','קופאן','Copan Ruinas','city_hub'],['SV','אל טונקו','El Tunco','city_hub'],['CU','הוואנה','Havana','city_hub'],
];

const SOUTH_AMERICA = [
  ['CO','בוגוטה','Bogota','city_hub'],['CO','מדיין','Medellin','city_hub'],['CO','קרטחנה','Cartagena Colombia','city_hub'],['CO','אזור הקפה','Colombia Coffee Region','tourism_region'],['CO','סנטה מרתה וטיירונה','Santa Marta and Tayrona','tourism_region'],['CO','סן אנדרס','San Andres','island'],
  ['EC','קיטו','Quito','city_hub'],['EC','באנוס','Banos Ecuador','city_hub'],['EC','קואנקה','Cuenca Ecuador','city_hub'],['EC','איי גלאפגוס','Galapagos Islands','island'],
  ['PE','לימה','Lima','city_hub'],['PE','קוסקו','Cusco','city_hub'],['PE','העמק הקדוש','Sacred Valley Peru','tourism_region'],['PE','ארקיפה','Arequipa','city_hub'],['PE','הוארז','Huaraz','city_hub'],['PE','איקיטוס','Iquitos','city_hub'],['PE','פוארטו מלדונדו','Puerto Maldonado','city_hub'],['PE','אגם טיטיקקה','Lake Titicaca Peru','tourism_region'],
  ['BO','לה פאס','La Paz Bolivia','city_hub'],['BO','אויוני','Uyuni','tourism_region'],['BO','סוקרה','Sucre Bolivia','city_hub'],['BO','רורנבאקה','Rurrenabaque','city_hub'],
  ['CL','סנטיאגו','Santiago Chile','city_hub'],['CL','סן פדרו דה אטקמה','San Pedro de Atacama','city_hub'],['CL','ולפראיסו','Valparaiso','city_hub'],['CL','פטגוניה הצ׳יליאנית','Chilean Patagonia','tourism_region'],['CL','אי הפסחא','Easter Island','island'],
  ['AR','בואנוס איירס','Buenos Aires','city_hub'],['AR','ברילוצ׳ה','Bariloche','city_hub'],['AR','אל קלפטה','El Calafate','city_hub'],['AR','אל צ׳לטן','El Chalten','city_hub'],['AR','אושואיה','Ushuaia','city_hub'],['AR','מנדוסה','Mendoza','city_hub'],['AR','סלטה וחוחוי','Salta and Jujuy','tourism_region'],['AR','פטגוניה הארגנטינאית','Argentine Patagonia','tourism_region'],
  ['BR','ריו דה ז׳ניירו','Rio de Janeiro','city_hub'],['BR','סאו פאולו','Sao Paulo','city_hub'],['BR','איגואסו','Foz do Iguacu','city_hub'],['BR','פלוריאנופוליס','Florianopolis','island'],['BR','סלבדור ובאהיה','Salvador and Bahia','tourism_region'],
];

function slug(value) {
  return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildRegion(region, rows) {
  return rows.map(([countryCode, he, en, kind]) => ({
    id: `${countryCode.toLowerCase()}-${slug(en)}`,
    countryCode,
    names: { he, en },
    aliases: [en],
    kind,
    groupingPolicy: 'self',
    providerQuery: `${en}, ${countryCode}`,
    researchRegion: region,
    researchSources: RESEARCH[region],
    status: 'candidate',
  }));
}

const CANDIDATES = Object.freeze([
  ...buildRegion('europe', EUROPE),
  ...buildRegion('asia', ASIA),
  ...buildRegion('central_america', CENTRAL_AMERICA),
  ...buildRegion('south_america', SOUTH_AMERICA),
]);

module.exports = {
  CANDIDATES,
  RESEARCH,
  REGIONAL_COUNTS: Object.freeze({
    europe: EUROPE.length,
    asia: ASIA.length,
    central_america: CENTRAL_AMERICA.length,
    south_america: SOUTH_AMERICA.length,
  }),
};
