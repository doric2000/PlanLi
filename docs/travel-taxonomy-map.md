# מפת ה־Travel Taxonomy

> נוצר אוטומטית מ־`shared/travelTaxonomy.json` (גרסה 5). אין לערוך ידנית.

הקטגוריות ותתי־הקטגוריות יוצרות עץ. תחומי עניין, אווירה, קהלים ושאר ה־facets הם צירים רוחביים, ולכן תת־קטגוריה יכולה להתחבר ליותר מתחום עניין אחד.

## קטגוריות ותתי־קטגוריות

- **אוכל ושתייה** (`food`)
  - מסעדה (`restaurant`) → תחומי עניין: אוכל וקולינריה (`food`)
  - בית קפה (`cafe`) → תחומי עניין: בתי קפה (`cafes`)
  - מאפייה וקינוחים (`bakery_desserts`) → תחומי עניין: אוכל וקולינריה (`food`), בתי קפה (`cafes`)
  - אוכל רחוב (`street_food`) → תחומי עניין: אוכל וקולינריה (`food`), חוויות מקומיות (`local_experiences`)
  - ברים וחיי לילה (`bar_nightlife`) → תחומי עניין: חיי לילה וברים (`nightlife`) · אווירה: תוססת (`lively`), חברתית (`social`)
  - סופרמרקט ומכולת (`grocery_supermarket`) → תחומי עניין: אוכל וקולינריה (`food`)
  - מטבח מקומי (`local_cuisine`) → תחומי עניין: אוכל וקולינריה (`food`), חוויות מקומיות (`local_experiences`)
- **טבע ומים** (`nature`)
  - מסלול הליכה (`hiking`) → תחומי עניין: מסלולי הליכה (`hiking`), טבע ונופים (`nature_scenery`)
  - ים וחוף (`beach`) → תחומי עניין: ים וחופים (`beaches_water`) · סביבה: בחוץ (`outdoor`)
  - אגם ונהר (`freshwater`) → תחומי עניין: אגמים, נהרות ומפלים (`freshwater_nature`), טבע ונופים (`nature_scenery`) · סביבה: בחוץ (`outdoor`)
  - מפל ומעיין (`waterfall_spring`) → תחומי עניין: אגמים, נהרות ומפלים (`freshwater_nature`), טבע ונופים (`nature_scenery`) · סביבה: בחוץ (`outdoor`)
  - שמורת טבע (`nature_reserve`) → תחומי עניין: טבע ונופים (`nature_scenery`), בעלי חיים וטבע פראי (`wildlife`)
  - בעלי חיים (`wildlife`) → תחומי עניין: בעלי חיים וטבע פראי (`wildlife`), טבע ונופים (`nature_scenery`)
  - נקודת תצפית (`viewpoint`) → תחומי עניין: צילום ותצפיות (`photography_viewpoints`), טבע ונופים (`nature_scenery`)
  - פיקניק (`picnic`) → תחומי עניין: טבע ונופים (`nature_scenery`), חוויות מקומיות (`local_experiences`)
  - שלג וספורט חורף (`winter_sports`) → תחומי עניין: שלג וספורט חורף (`winter_sports`), אקסטרים והרפתקאות (`adventure_extreme`) · עונה: חורף (`winter`) · סביבה: בחוץ (`outdoor`)
- **תרבות ואתרים** (`culture`)
  - מוזיאון (`museum`) → תחומי עניין: מוזיאונים ואמנות (`museums_art`), תרבות והיסטוריה (`culture_history`)
  - גלריה ואמנות (`art_gallery`) → תחומי עניין: מוזיאונים ואמנות (`museums_art`)
  - אתר היסטורי ומורשת (`historic_site`) → תחומי עניין: תרבות והיסטוריה (`culture_history`)
  - אתר דתי (`religious_site`) → תחומי עניין: תרבות והיסטוריה (`culture_history`), אדריכלות ושכונות (`architecture_neighborhoods`)
  - אדריכלות ואתר עירוני (`architecture_landmark`) → תחומי עניין: אדריכלות ושכונות (`architecture_neighborhoods`), צילום ותצפיות (`photography_viewpoints`)
  - שכונה מומלצת (`neighborhood`) → תחומי עניין: אדריכלות ושכונות (`architecture_neighborhoods`), חוויות מקומיות (`local_experiences`)
- **פעילויות ובידור** (`activities`)
  - אטרקציה למשפחה (`family_attraction`) → תחומי עניין: אטרקציות למשפחות (`family_attractions`)
  - פארק שעשועים (`theme_park`) → תחומי עניין: פארקי שעשועים (`entertainment_parks`), אטרקציות למשפחות (`family_attractions`)
  - פעילות אתגרית (`adventure`) → תחומי עניין: אקסטרים והרפתקאות (`adventure_extreme`) · אווירה: הרפתקנית (`adventurous`)
  - פעילות מים (`water_activity`) → תחומי עניין: אקסטרים והרפתקאות (`adventure_extreme`), ים וחופים (`beaches_water`), אגמים, נהרות ומפלים (`freshwater_nature`)
  - הופעה ואירוע (`performance_event`) → תחומי עניין: מוזיקה ואירועים (`music_events`) · אווירה: תוססת (`lively`), חברתית (`social`)
  - סדנה וחוויה מקומית (`workshop`) → תחומי עניין: חוויות מקומיות (`local_experiences`)
  - פעילות במקום סגור (`indoor_venue_activity`) → תחומי עניין: אטרקציות למשפחות (`family_attractions`) · סביבה: במקום סגור (`indoor`)
  - ספא ו-Wellness (`wellness`) → תחומי עניין: Wellness וספא (`wellness`) · אווירה: רגועה (`relaxed`)
  - ספורט ואצטדיונים (`sports_stadium`) → תחומי עניין: ספורט ואצטדיונים (`sports_stadiums`)
  - נקודת צילום (`photography_spot`) → תחומי עניין: צילום ותצפיות (`photography_viewpoints`)
- **קניות ושווקים** (`shopping`)
  - שוק (`market`) → תחומי עניין: קניות ושווקים (`shopping_markets`), חוויות מקומיות (`local_experiences`)
  - מרכז קניות וחנויות (`shopping_center`) → תחומי עניין: קניות ושווקים (`shopping_markets`)
  - עבודות יד ומוצרים מקומיים (`local_crafts`) → תחומי עניין: קניות ושווקים (`shopping_markets`), חוויות מקומיות (`local_experiences`)
- **לינה** (`stay`)
  - מלון (`hotel`) → תחומי עניין: לינה ואירוח (`stays_accommodation`)
  - ריזורט (`resort`) → תחומי עניין: לינה ואירוח (`stays_accommodation`), Wellness וספא (`wellness`)
  - הוסטל (`hostel`) → תחומי עניין: לינה ואירוח (`stays_accommodation`)
  - בית הארחה (`guesthouse`) → תחומי עניין: לינה ואירוח (`stays_accommodation`), חוויות מקומיות (`local_experiences`)
  - דירה (`apartment`) → תחומי עניין: לינה ואירוח (`stays_accommodation`)
  - קמפינג (`camping`) → תחומי עניין: לינה ואירוח (`stays_accommodation`), טבע ונופים (`nature_scenery`)
- **תחבורה והתניידות** (`transportation`)
  - תחבורה ציבורית (`public_transit`) → תחומי עניין: תחבורה והתניידות (`transportation_mobility`)
  - השכרת רכב (`car_rental`) → תחומי עניין: תחבורה והתניידות (`transportation_mobility`)
  - השכרת אופניים או קטנוע (`two_wheel_rental`) → תחומי עניין: תחבורה והתניידות (`transportation_mobility`)
  - מונית או נהג (`taxi_driver`) → תחומי עניין: תחבורה והתניידות (`transportation_mobility`)
  - הסעה משדה התעופה (`airport_transfer`) → תחומי עניין: תחבורה והתניידות (`transportation_mobility`)
  - מעבורת או סירה תחבורתית (`ferry`) → תחומי עניין: תחבורה והתניידות (`transportation_mobility`)
- **שירותים שימושיים בחו״ל** (`services`)
  - **תקשורת וכספים** (`communications_finance`)
    - SIM/eSIM (`sim_esim`) → תחומי עניין: שירותים שימושיים למטיילים (`travel_tips_services`)
    - המרת כספים (`currency_exchange`) → תחומי עניין: שירותים שימושיים למטיילים (`travel_tips_services`)
  - **תכנון והדרכה** (`planning_guidance`)
    - מדריך (`tour_guide`) → תחומי עניין: שירותים שימושיים למטיילים (`travel_tips_services`), חוויות מקומיות (`local_experiences`)
    - סוכן נסיעות או טיסות (`travel_agent`) → תחומי עניין: שירותים שימושיים למטיילים (`travel_tips_services`)
    - טיפים מקומיים (`local_tips`) → תחומי עניין: שירותים שימושיים למטיילים (`travel_tips_services`), חוויות מקומיות (`local_experiences`)
  - **בריאות ורפואה** (`health_medical`)
    - בית מרקחת (`pharmacy`) → תחומי עניין: שירותים שימושיים למטיילים (`travel_tips_services`)
    - מרפאה או רופא (`clinic_doctor`) → תחומי עניין: שירותים שימושיים למטיילים (`travel_tips_services`)
    - רפואת חירום (`urgent_care`) → תחומי עניין: שירותים שימושיים למטיילים (`travel_tips_services`)
    - רופא שיניים (`dentist`) → תחומי עניין: שירותים שימושיים למטיילים (`travel_tips_services`)
    - אופטיקה (`optician`) → תחומי עניין: שירותים שימושיים למטיילים (`travel_tips_services`)
  - **טיפוח ורווחה** (`personal_care`)
    - מספרה (`hairdresser`) → תחומי עניין: שירותים שימושיים למטיילים (`travel_tips_services`)
    - יופי וקוסמטיקה (`beauty_care`) → תחומי עניין: שירותים שימושיים למטיילים (`travel_tips_services`)
    - עיסוי או טיפול (`massage_service`) → תחומי עניין: שירותים שימושיים למטיילים (`travel_tips_services`), Wellness וספא (`wellness`)
  - **כביסה וביגוד** (`laundry_clothing`)
    - מכבסה וניקוי יבש (`laundry`) → תחומי עניין: שירותים שימושיים למטיילים (`travel_tips_services`)
    - חייט או מתפרה (`tailor`) → תחומי עניין: שירותים שימושיים למטיילים (`travel_tips_services`)
    - סנדלר (`shoemaker`) → תחומי עניין: שירותים שימושיים למטיילים (`travel_tips_services`)
  - **טכנולוגיה ותיקונים** (`technology_repairs`)
    - תיקון טלפון או מחשב (`device_repair`) → תחומי עניין: שירותים שימושיים למטיילים (`travel_tips_services`)
    - תיקון שעונים (`watch_repair`) → תחומי עניין: שירותים שימושיים למטיילים (`travel_tips_services`)
  - **מסמכים וציוד** (`documents_equipment`)
    - הדפסה וצילום מסמכים (`printing_documents`) → תחומי עניין: שירותים שימושיים למטיילים (`travel_tips_services`)
    - ציוד משרדי (`office_supplies`) → תחומי עניין: שירותים שימושיים למטיילים (`travel_tips_services`)
    - השכרת ציוד (`equipment_rental`) → תחומי עניין: שירותים שימושיים למטיילים (`travel_tips_services`)

## קטלוג ההמלצות

> גרסת סכימה 1; הפעלה בזמן ריצה: `true`. הקטלוג מחובר לזרימת יצירת ההמלצות הקצרה.

- **אוכל ושתייה** (`food`)
  - מסעדה (`restaurant`) — נפוץ → אוכל ושתייה
  - בית קפה (`cafe`) — נפוץ → אוכל ושתייה
  - מאפייה (`bakery`) — נפוץ → אוכל ושתייה
  - קינוחים וגלידה (`desserts_ice_cream`) — נפוץ → אוכל ושתייה
  - אוכל רחוב ודוכנים (`street_food`) — נפוץ → אוכל ושתייה
  - מזון מהיר (`fast_food`) → אוכל ושתייה
  - שוק אוכל (`food_market`) — נפוץ → אוכל ושתייה
  - מתחם אוכל (`food_hall`) → אוכל ושתייה
  - יקב (`winery`) → אוכל ושתייה
  - מבשלת בירה (`brewery`) → אוכל ושתייה
  - מזקקה (`distillery`) → אוכל ושתייה
  - מעדנייה וחנות אוכל (`deli_food_shop`) → אוכל ושתייה
  - סופרמרקט ומכולת (`grocery_supermarket`) → אוכל ושתייה
  - משהו אחר (`food_other`) → אוכל ושתייה
- **טבע ונופים** (`nature`)
  - ים וחופים (`beach`) — נפוץ → טבע ונופים, ים וחופים
  - מעיינות ומפלים (`waterfall_spring`) — נפוץ → טבע ונופים
  - אגמים, נהרות ונחלים (`freshwater`) — נפוץ → טבע ונופים
  - הרים ופסגות (`mountain_peak`) → טבע ונופים
  - תצפיות (`viewpoint`) — נפוץ → טבע ונופים
  - מסלולי הליכה (`hiking`) — נפוץ → טבע ונופים
  - פארקים וגנים (`park_garden`) — נפוץ → טבע ונופים
  - שמורות טבע (`nature_reserve`) → טבע ונופים
  - יערות (`forest`) → טבע ונופים
  - מדבר (`desert`) → טבע ונופים
  - מערות (`cave`) → טבע ונופים
  - קניונים ונקיקים (`canyon_gorge`) → טבע ונופים
  - איים (`island`) → טבע ונופים, ים וחופים
  - שוניות ואלמוגים (`reef_coral`) → טבע ונופים, ים וחופים
  - חיות בר (`wildlife`) → טבע ונופים
  - מקומות לפיקניק (`picnic`) → טבע ונופים
  - משהו אחר (`nature_other`) → טבע ונופים
- **תרבות והיסטוריה** (`culture`)
  - מוזיאון (`museum`) — נפוץ → תרבות והיסטוריה
  - גלריה (`art_gallery`) — נפוץ → תרבות והיסטוריה
  - אמנות רחוב (`street_art`) — נפוץ → תרבות והיסטוריה
  - אתר היסטורי (`historic_site`) — נפוץ → תרבות והיסטוריה
  - עתיקות / ארכאולוגיה (`archaeology`) → תרבות והיסטוריה
  - טירה / ארמון / מבצר (`castle_palace_fortress`) → תרבות והיסטוריה
  - אתר דתי (`religious_site`) — נפוץ → תרבות והיסטוריה
  - אדריכלות / מבנים (`architecture_building`) → תרבות והיסטוריה
  - אנדרטה / אתר הנצחה (`memorial`) → תרבות והיסטוריה
  - שכונה (`neighborhood`) → תרבות והיסטוריה
  - עיר עתיקה (`old_town`) — נפוץ → תרבות והיסטוריה
  - כיכר / רחוב (`square_street`) → תרבות והיסטוריה
  - תיאטרון / בית אופרה (`theater_opera_house`) → תרבות והיסטוריה
  - מרכז תרבות / ספרייה (`cultural_center_library`) → תרבות והיסטוריה
  - משהו אחר (`culture_other`) → תרבות והיסטוריה
- **אטרקציות ופעילויות** (`activities`)
  - פארק שעשועים (`theme_park`) — נפוץ → אטרקציות ופעילויות
  - פארק מים (`water_park`) → אטרקציות ופעילויות, ים וחופים
  - גן חיות (`zoo`) → אטרקציות ופעילויות
  - אקווריום (`aquarium`) → אטרקציות ופעילויות, ים וחופים
  - סיור מודרך (`guided_tour`) — נפוץ → אטרקציות ופעילויות
  - טיול יום (`day_trip`) — נפוץ → אטרקציות ופעילויות
  - סדנה / שיעור (`workshop_class`) — נפוץ → אטרקציות ופעילויות
  - פעילות אתגרית (`adventure`) → אטרקציות ופעילויות
  - ספורט ימי (`water_sports`) — נפוץ → אטרקציות ופעילויות, ים וחופים
  - שיט / סירה (`boat_tour`) → אטרקציות ופעילויות, ים וחופים
  - סקי / ספורט חורף (`winter_sports`) → אטרקציות ופעילויות
  - אופניים (`cycling`) → אטרקציות ופעילויות
  - רכיבה על סוסים (`horse_riding`) → אטרקציות ופעילויות
  - ספורט / כושר (`sports_fitness`) → אטרקציות ופעילויות
  - חדר בריחה (`escape_room`) → אטרקציות ופעילויות
  - באולינג (`bowling`) → אטרקציות ופעילויות
  - משחקייה / ארקייד (`playground_arcade`) → אטרקציות ופעילויות
  - ספא / מרחצאות (`spa_baths`) — נפוץ → ספא ורוגע
  - טיסה חווייתית (`scenic_flight`) → אטרקציות ופעילויות
  - קולנוע (`cinema`) → אטרקציות ופעילויות
  - משהו אחר (`activities_other`) → אטרקציות ופעילויות
- **חיי לילה** (`nightlife`)
  - בר (`bar`) — נפוץ → חיי לילה
  - פאב (`pub`) — נפוץ → חיי לילה
  - בר יין (`wine_bar`) — נפוץ → חיי לילה
  - בר קוקטיילים (`cocktail_bar`) — נפוץ → חיי לילה
  - מועדון (`nightclub`) — נפוץ → חיי לילה
  - לאונג׳ (`lounge`) → חיי לילה
  - קריוקי (`karaoke`) → חיי לילה
  - מועדון הופעות / מוזיקה חיה (`live_music_venue`) — נפוץ → חיי לילה
  - מועדון סטנדאפ (`comedy_club`) → חיי לילה
  - קזינו (`casino`) → חיי לילה
  - משהו אחר (`nightlife_other`) → חיי לילה
- **קניות ושווקים** (`shopping`)
  - שוק (`market`) — נפוץ → קניות ושווקים
  - שוק פשפשים (`flea_market`) → קניות ושווקים
  - קניון / מרכז קניות (`shopping_center`) — נפוץ → קניות ושווקים
  - אאוטלט (`outlet`) — נפוץ → קניות ושווקים
  - בגדים / הנעלה (`clothing_footwear`) — נפוץ → קניות ושווקים
  - עבודות יד / מזכרות (`crafts_souvenirs`) — נפוץ → קניות ושווקים
  - וינטג׳ / יד שנייה (`vintage_secondhand`) → קניות ושווקים
  - עתיקות (`antiques`) → קניות ושווקים
  - תכשיטים / שעונים (`jewelry_watches`) → קניות ושווקים
  - קוסמטיקה / בשמים (`beauty_perfume`) → קניות ושווקים
  - אלקטרוניקה (`electronics`) → קניות ושווקים
  - ספרים / מוזיקה (`books_music`) → קניות ושווקים
  - ציוד ספורט / טיולים (`outdoor_sports_gear`) → קניות ושווקים
  - צעצועים / משחקים (`toys_games`) → קניות ושווקים
  - דיוטי פרי (`duty_free`) → קניות ושווקים
  - חנות מתמחה (`specialty_store`) — נפוץ → קניות ושווקים
  - משהו אחר (`shopping_other`) → קניות ושווקים
- **אירועים** (`events`)
  - הופעה / קונצרט (`concert`) — נפוץ → חיי לילה
  - פסטיבל מוזיקה (`music_festival`) — נפוץ → חיי לילה
  - מסיבה (`party_event`) — נפוץ → חיי לילה
  - הצגה / מחול (`theater_dance_event`) — נפוץ → תרבות והיסטוריה
  - סטנדאפ (`standup_event`) → חיי לילה
  - משחק / תחרות ספורט (`sports_event`) — נפוץ → אטרקציות ופעילויות
  - סרט / פסטיבל קולנוע (`film_event`) → תרבות והיסטוריה
  - תערוכה (`exhibition_event`) → תרבות והיסטוריה
  - פסטיבל אוכל / שתייה (`food_drink_festival`) — נפוץ → אוכל ושתייה
  - שוק / יריד (`market_fair_event`) → קניות ושווקים
  - כנס (`conference`)
  - סדנה / שיעור (`workshop_event`) → אטרקציות ופעילויות
  - אירוע לילדים / משפחות (`family_event`) → אטרקציות ופעילויות
  - חג / אירוע (`holiday_event`) → תרבות והיסטוריה
  - אירוע קהילתי (`community_event`) → תרבות והיסטוריה
  - משהו אחר (`events_other`)
- **לינה** (`stay`)
  - מלון (`hotel`) — נפוץ
  - מלון בוטיק (`boutique_hotel`) — נפוץ
  - ריזורט / כפר נופש (`resort`) — נפוץ
  - הוסטל / אכסניה (`hostel`) — נפוץ
  - בית הארחה (`guesthouse`)
  - לינה וארוחת בוקר (`bed_breakfast`)
  - דירה / Airbnb (`vacation_rental`) — נפוץ
  - בית נופש / וילה (`vacation_home_villa`) — נפוץ
  - צימר / בקתה (`cabin`)
  - חווה / לינה כפרית (`farm_rural_stay`)
  - קמפינג (`camping`)
  - גלמפינג (`glamping`)
  - חניון קרוואנים (`rv_park`)
  - מוטל (`motel`)
  - משהו אחר (`stay_other`)
- **תחבורה** (`transportation`)
  - תחבורה ציבורית (`public_transit`) — נפוץ
  - רכבת / אוטובוס בין־עירוני (`intercity_rail_bus`) — נפוץ
  - מונית / נהג (`taxi_driver`) — נפוץ
  - הסעה / שאטל (`shuttle`) — נפוץ
  - השכרת רכב / קרוואן (`car_rv_rental`) — נפוץ
  - השכרת אופניים / קטנוע / אופנוע (`two_wheel_rental`)
  - מעבורת (`ferry`)
  - קרוז / הפלגת נופש (`cruise`)
  - טיסה / שדה תעופה (`flight_airport`) — נפוץ
  - רכבל / פוניקולר (`cable_car_funicular`)
  - שירותי רכב (`vehicle_services`)
  - משהו אחר (`transportation_other`)
- **שירותים למטיילים** (`services`)
  - **מידע ותכנון** (`info_planning`)
    - טיפ מקומי (`local_tip`) — נפוץ
    - מרכז מידע לתיירים (`tourist_information`) — נפוץ
    - הדרכת טיולים (`tour_guide`)
    - סוכנות נסיעות / תכנון טיול (`travel_planning_agency`)
    - הזמנות / כרטיסים (`booking_tickets`)
    - תרגום (`translation`)
  - **תקשורת וכסף** (`connectivity_finance`)
    - סים / אינטרנט (`sim_internet`) — נפוץ
    - כספומט / המרת מטבע (`atm_currency_exchange`) — נפוץ
  - **בריאות וסיוע** (`health_assistance`)
    - בית מרקחת (`pharmacy`) — נפוץ
    - מרפאה / רופא (`clinic_doctor`)
    - בית חולים / מוקד חירום (`hospital_emergency`)
    - שגרירות / קונסוליה (`embassy_consulate`)
    - משטרה / סיוע רשמי (`police_official_help`)
    - ביטוח נסיעות (`travel_insurance`)
    - סיוע משפטי (`legal_help`)
  - **צרכים במהלך הטיול** (`trip_needs`)
    - שמירת חפצים / משלוחים (`luggage_delivery`) — נפוץ
    - מכבסה / ניקוי יבש (`laundry`)
    - מתפרה / תיקוני בגדים (`tailor_clothing_repair`)
    - מספרה / טיפוח (`hair_beauty`)
    - תיקון טלפון / מחשב (`device_repair`)
    - הדפסה / מסמכים (`printing_documents`)
    - השכרת ציוד (`equipment_rental`)
    - שירותים ציבוריים (`public_toilets`)
  - **עבודה, משפחה וקהילה** (`work_family_community`)
    - חלל עבודה (`coworking`)
    - בית חב״ד / שירותי דת (`chabad_religious_services`)
    - שמרטפות / שירות למשפחה (`childcare_family_help`)
    - וטרינר / שירות לחיות (`veterinary_pet_services`)
    - משהו אחר (`services_other`)

### מעבר מהקטלוג הפעיל

- מיפוי ישיר: 57
- בדיקה ידנית: 10
- מעבר למאפיין: 1

## תחומי עניין

- טבע ונופים (`nature_scenery`)
- מסלולי הליכה (`hiking`)
- ים וחופים (`beaches_water`)
- אגמים, נהרות ומפלים (`freshwater_nature`)
- אוכל וקולינריה (`food`)
- בתי קפה (`cafes`)
- חיי לילה וברים (`nightlife`)
- תרבות והיסטוריה (`culture_history`)
- מוזיאונים ואמנות (`museums_art`)
- אדריכלות ושכונות (`architecture_neighborhoods`)
- קניות ושווקים (`shopping_markets`)
- אטרקציות למשפחות (`family_attractions`)
- פארקי שעשועים (`entertainment_parks`)
- אקסטרים והרפתקאות (`adventure_extreme`)
- בעלי חיים וטבע פראי (`wildlife`)
- Wellness וספא (`wellness`)
- חוויות מקומיות (`local_experiences`)
- צילום ותצפיות (`photography_viewpoints`)
- מוזיקה ואירועים (`music_events`)
- שלג וספורט חורף (`winter_sports`)
- Roadtrips נופיים (`scenic_roadtrips`)
- ספורט ואצטדיונים (`sports_stadiums`)
- לינה ואירוח (`stays_accommodation`)
- תחבורה והתניידות (`transportation_mobility`)
- שירותים שימושיים למטיילים (`travel_tips_services`)

## אווירה

- רגועה (`relaxed`)
- רומנטית (`romantic`)
- הרפתקנית (`adventurous`)
- תרבותית (`cultural`)
- חברתית (`social`)
- מקומית ואותנטית (`local`)
- תוססת (`lively`)
- שקטה ומבודדת (`quiet_secluded`)

## סגנון טיול

- תרמילאות (`backpacker`) — קשור ל: מסלולי הליכה (`hiking`), חוויות מקומיות (`local_experiences`)
- נוודות דיגיטלית (`digital_nomad`) — קשור ל: בתי קפה (`cafes`), שירותים שימושיים למטיילים (`travel_tips_services`)
- Roadtrip (`roadtrip`) — קשור ל: Roadtrips נופיים (`scenic_roadtrips`)
- חופשה עירונית (`city_break`) — קשור ל: אדריכלות ושכונות (`architecture_neighborhoods`), תרבות והיסטוריה (`culture_history`)
- חופשת ריזורט (`resort_vacation`) — קשור ל: לינה ואירוח (`stays_accommodation`), Wellness וספא (`wellness`)
- טיול איטי (`slow_travel`) — קשור ל: חוויות מקומיות (`local_experiences`), אוכל וקולינריה (`food`)

## הרכב מטיילים

- לבד (`solo`)
- זוג (`couple`)
- חברים (`friends`)
- משפחה עם ילדים קטנים (`family_young_children`)
- משפחה עם ילדים גדולים (`family_older_children`)
- משפחה מורחבת / טיול בקבוצה (`multigenerational_group`)

## תקציב

- חינם (`free`)
- חסכוני (`economy`)
- בינוני (`balanced`)
- יקר (`comfort`)
- יוקרתי (`premium`)
- לא משנה (`flexible`)

## קצב

- רגוע (`relaxed`)
- מאוזן (`balanced`)
- עמוס (`packed`)

## צרכים מעשיים

- כשר (`kosher`)
- ידידותי לשומרי שבת (`shabbat_friendly`)
- צמחוני (`vegetarian`)
- טבעוני (`vegan`)
- ללא גלוטן (`gluten_free`)
- חלאל (`halal`)
- נגישות לכיסא גלגלים (`wheelchair_accessible`)
- מעט הליכה (`reduced_walking`)
- נגיש לעגלות (`stroller_accessible`)

## עונות

- כל השנה (`all_year`)
- אביב (`spring`)
- קיץ (`summer`)
- סתיו (`autumn`)
- חורף (`winter`)
- עונת הגשמים (`rainy`)

## סביבה

- במקום סגור (`indoor`)
- בחוץ (`outdoor`)
- משולב (`mixed`)

## קושי במסלול

- קל (`easy`)
- בינוני (`moderate`)
- מאתגר (`challenging`)

## ניסיון במסלול

- מתחילים (`beginner`)
- מנוסים (`intermediate`)
- מתקדמים (`advanced`)

## אמצעי התניידות

- הליכה (`walking`)
- תחבורה ציבורית (`public_transit`)
- רכב (`car`)
- אופניים (`bicycle`)
- אופנוע או קטנוע (`motorcycle`)
- משולב (`mixed`)

## כללי התאמה

- המלצה שומרת קטגוריה אחת וכמה תתי־קטגוריות.
- מסלול יכול לשמור כמה קטגוריות ותתי־קטגוריות.
- תחומי העניין נגזרים מהקטגוריות ומתתי־הקטגוריות ואינם שדה עריכה או מסנן ידני נוסף.
- בהמלצה נשמרים כמאפייני תוכן מפורשים רק קהל, מחיר, אווירה וסביבה כאשר הם רלוונטיים לסוג המקום.
- סגנון טיול, עונה, קצב, קושי, ניסיון ואמצעי התניידות הם מאפייני מסלול ולא מאפייני המלצה נקודתית.
- קהל יכול להיות רשימה מפורשת או `audienceScope: all`; אין להסיק קהל חסר.
- צרכים מעשיים מתווספים רק כעובדות מפורשות. במסלול הם תקפים רק עם `needsScope: entire_route`; מידע חסר אינו נחשב להתאמה.
- בתוך ממד סינון פועל OR, ובין ממדים שונים פועל AND.
