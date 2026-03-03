export interface CityGuideData {
  slug: string;
  name: string;
  state: string;
  heroImage: string;
  heroImageAlt: string;
  description: string;
  seoTitle: string;
  seoDescription: string;
  keywords: string[];
  intro: string;
  sakeScene: string;
  topVenues: Venue[];
  localTips: string[];
  events: string[];
}

interface Venue {
  name: string;
  type: "bar" | "restaurant" | "shop";
  neighborhood: string;
  description: string;
  highlight: string;
}

export const cityGuides: CityGuideData[] = [
  {
    slug: "new-york-city",
    name: "New York City",
    state: "New York",
    heroImage: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=1200&q=80",
    heroImageAlt: "New York City skyline at night with lights reflecting on the water",
    description: "Navigate NYC's world-class sake scene — from hidden Midtown bars to East Village izakayas.",
    seoTitle: "NYC Sake Guide: Best Sake Bars, Restaurants, and Shops",
    seoDescription: "Discover the best sake bars, Japanese restaurants, and sake shops in New York City. Expert guide to NYC's sake scene with top picks, neighborhood tips, and what to order.",
    keywords: ["sake bar nyc", "best sake new york", "japanese restaurant nyc", "sake shop nyc"],
    intro: "New York City has the most dynamic sake scene outside of Japan. With hundreds of Japanese restaurants, dedicated sake bars, and specialty retailers, NYC offers unparalleled access to premium sake from every region of Japan. Whether you're exploring the izakayas of the East Village, sipping rare Junmai Daiginjo in Midtown, or browsing the curated selection at a specialty shop, NYC rewards sake curiosity at every turn.",
    sakeScene: "NYC's sake culture has exploded over the past decade. The city now boasts more than a dozen dedicated sake bars, hundreds of Japanese restaurants with serious sake programs, and several specialty retailers with selections rivaling shops in Tokyo. The East Village and Lower East Side are the traditional heart of NYC's Japanese dining scene, but excellent sake can now be found in every borough. Manhattan's fine-dining establishments increasingly feature sake pairings alongside their wine programs, and Brooklyn's izakaya scene has brought casual sake drinking to a new audience.",
    topVenues: [
      { name: "Sakagura", type: "bar", neighborhood: "Midtown East", description: "Hidden in the basement of a Midtown office building, Sakagura is NYC's original sake bar with over 200 selections.", highlight: "Over 200 sake selections with knowledgeable staff" },
      { name: "Decibel", type: "bar", neighborhood: "East Village", description: "Underground sake bar with a punk-rock vibe and a carefully curated selection of premium sakes.", highlight: "Underground atmosphere, excellent curated sake list" },
      { name: "Sake Bar Hagi", type: "bar", neighborhood: "Midtown", description: "Cozy basement izakaya serving affordable sake and Japanese comfort food to a loyal following.", highlight: "Affordable sake flights and authentic izakaya food" },
      { name: "Masa", type: "restaurant", neighborhood: "Columbus Circle", description: "Three-Michelin-star sushi restaurant with one of the most prestigious sake programs in America.", highlight: "Rare sakes paired with world-class omakase" },
      { name: "TrueSake NYC", type: "shop", neighborhood: "Various", description: "Rotating pop-up sake shop from the famous San Francisco retailer, bringing curated selections to NYC.", highlight: "Expert-curated selection with tasting notes for every bottle" },
    ],
    localTips: [
      "The East Village and Lower East Side have the highest concentration of Japanese restaurants and sake bars within walking distance of each other — perfect for a sake crawl.",
      "Many high-end sushi restaurants have extensive sake menus but don't advertise them. Ask your server about the 'full sake list' rather than ordering from the printed menu.",
      "Astor Wines & Spirits has one of the best sake retail selections in Manhattan, with regular tasting events.",
      "Sake happy hours exist — several Midtown Japanese restaurants offer discounted sake flights during weekday afternoons.",
    ],
    events: [
      "Joy of Sake NYC — Annual tasting event featuring 400+ sakes from across Japan (usually held in June)",
      "Japan Society events — Regular sake tastings, cultural events, and educational workshops",
      "NYC Sake Week — Annual celebration featuring special menus at participating restaurants",
    ],
  },
  {
    slug: "los-angeles",
    name: "Los Angeles",
    state: "California",
    heroImage: "https://images.unsplash.com/photo-1534190239940-9ba8944ea261?w=1200&q=80",
    heroImageAlt: "Los Angeles city view with palm trees and mountains in the background",
    description: "Explore LA's sprawling sake scene across Little Tokyo, the Westside, and the San Fernando Valley.",
    seoTitle: "LA Sake Guide: Best Sake Bars and Japanese Restaurants in Los Angeles",
    seoDescription: "Your guide to sake in Los Angeles. Discover top sake bars, Japanese restaurants, and shops across Little Tokyo, the Westside, and the Valley. Expert picks and local tips.",
    keywords: ["sake los angeles", "sake bar la", "japanese restaurant los angeles", "sake tasting la"],
    intro: "Los Angeles is home to the largest Japanese population outside of Japan, and that cultural depth shows in its sake scene. From the historic izakayas of Little Tokyo to the omakase temples of Beverly Hills, LA offers a sake experience as diverse and sprawling as the city itself. The climate — warm days, cool evenings — also makes LA a natural market for the full range of sake temperatures, from refreshing chilled Ginjo to comforting warm Junmai.",
    sakeScene: "LA's sake culture is deeply rooted in Little Tokyo, the oldest Japantown in the US. Here you'll find everything from century-old family restaurants to cutting-edge sake bars. But LA's sake scene extends far beyond downtown — the Westside, Sawtelle Japantown, Torrance, and the San Fernando Valley all have thriving Japanese dining communities. LA also benefits from its proximity to California's craft sake breweries, including several producing award-winning sake from locally grown rice.",
    topVenues: [
      { name: "Ototo", type: "bar", neighborhood: "Echo Park", description: "Intimate sake bar with a thoughtful selection of 50+ sakes and excellent small plates.", highlight: "Rotating seasonal sake flights with expert guidance" },
      { name: "Shibumi", type: "restaurant", neighborhood: "Downtown LA", description: "Kappo-style Japanese fine dining with one of the best sake programs in California.", highlight: "Rare and allocated sakes paired with seasonal kappo cuisine" },
      { name: "Tsubaki", type: "restaurant", neighborhood: "Echo Park", description: "Izakaya with a focus on natural sake and craft Japanese beers.", highlight: "Natural and organic sake focus with small-producer emphasis" },
      { name: "Wally's", type: "shop", neighborhood: "Beverly Hills", description: "Upscale wine and spirits shop with a growing sake section curated by a certified sake sommelier.", highlight: "Sommelier-curated selection with luxury and rare bottles" },
      { name: "Marugame Monzo", type: "restaurant", neighborhood: "Little Tokyo", description: "Udon house with a solid sake list and an authentic Little Tokyo experience.", highlight: "Affordable sake alongside handmade udon in historic Little Tokyo" },
    ],
    localTips: [
      "Little Tokyo's sake selection has gotten significantly better in recent years — don't skip it as 'too touristy.'",
      "Sawtelle Japantown (near West LA) is a hidden gem for casual Japanese dining with better sake lists than you'd expect.",
      "LA's Japanese grocery stores (Mitsuwa, Nijiya, Marukai) often carry sake that you won't find at regular liquor stores, sometimes at better prices.",
      "Several LA restaurants offer omakase-style sake pairings — ask about 'sake pairing courses' at high-end spots.",
    ],
    events: [
      "LA Sake Festival — Annual outdoor tasting event in Little Tokyo (usually September)",
      "Japan House LA events — Regular sake seminars and cultural programs in Hollywood",
      "Sawtelle Sake Stroll — Neighborhood tasting event along Sawtelle Boulevard",
    ],
  },
  {
    slug: "san-francisco",
    name: "San Francisco",
    state: "California",
    heroImage: "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=1200&q=80",
    heroImageAlt: "Golden Gate Bridge with San Francisco Bay in the background",
    description: "Home to True Sake, America's first sake store — SF is a sake city with deep roots.",
    seoTitle: "San Francisco Sake Guide: Best Bars, Shops, and the True Sake Story",
    seoDescription: "San Francisco is home to True Sake, America's first dedicated sake store. Explore SF's sake bars, Japanese restaurants, and the city's unique sake culture.",
    keywords: ["sake san francisco", "true sake sf", "sake bar sf", "japanese restaurant san francisco"],
    intro: "San Francisco holds a special place in American sake history. It's home to True Sake — the first dedicated sake store in the United States, opened in 2003 — and has been at the forefront of sake culture ever since. The city's food-obsessed culture, strong Japanese community, and proximity to California's emerging sake breweries make SF one of the best cities in America for sake exploration.",
    sakeScene: "SF's sake culture runs deep and wide. Japantown (one of only three remaining Japantowns in the US) anchors the traditional Japanese dining scene, while the Mission, SoMa, and Hayes Valley neighborhoods are home to modern izakayas and sake-forward restaurants. The city's legendary food culture means that even non-Japanese restaurants often feature sake on their beverage programs. SF also benefits from its proximity to Sequoia Sake Company, one of America's most acclaimed domestic sake producers.",
    topVenues: [
      { name: "True Sake", type: "shop", neighborhood: "Hayes Valley", description: "America's first dedicated sake store, with 300+ selections and incredibly knowledgeable staff.", highlight: "The iconic American sake shop — every bottle hand-selected with tasting notes" },
      { name: "Nojo Ramen Tavern", type: "restaurant", neighborhood: "Hayes Valley", description: "Ramen and sake pairing in a stylish setting near True Sake.", highlight: "Excellent warm sake selection paired with rich, complex ramen" },
      { name: "Rintaro", type: "restaurant", neighborhood: "Mission", description: "Beautiful izakaya in a converted garage, with one of the city's best sake programs.", highlight: "Atmospheric izakaya with seasonal Japanese dishes and premium sake" },
      { name: "Sequoia Sake Company", type: "shop", neighborhood: "Bayview", description: "San Francisco's own sake brewery, producing craft sake from California rice.", highlight: "Taste locally brewed sake straight from the source" },
      { name: "Kusakabe", type: "restaurant", neighborhood: "Financial District", description: "Omakase sushi with an exceptional sake pairing program.", highlight: "Premium omakase with sake pairings curated by a certified sake sommelier" },
    ],
    localTips: [
      "Visit True Sake first — the staff will educate you more in 20 minutes than most people learn in years. They'll match you with sakes based on your flavor preferences.",
      "Japantown's Nijiya Market carries an excellent selection of everyday-drinking sake at grocery store prices.",
      "Book a tour at Sequoia Sake Company to see how sake is made outside of Japan.",
      "Many SF restaurants participate in 'Sake Week' events — follow @SakeSF on Instagram for announcements.",
    ],
    events: [
      "SF Sake Festival — Annual tasting event at the Japan Center in Japantown",
      "True Sake Anniversary Party — Annual celebration with rare sake tastings",
      "Sake Day — Annual industry and consumer event featuring 200+ sakes",
    ],
  },
  {
    slug: "chicago",
    name: "Chicago",
    state: "Illinois",
    heroImage: "https://images.unsplash.com/photo-1494522855154-9297ac14b55f?w=1200&q=80",
    heroImageAlt: "Chicago skyline and river at sunset",
    description: "Chicago's sake scene punches above its weight — discover the Midwest's best sake bars and izakayas.",
    seoTitle: "Chicago Sake Guide: Best Sake Bars and Japanese Restaurants",
    seoDescription: "Explore Chicago's growing sake scene. From River North sake bars to Wicker Park izakayas, find the best places to drink sake in the Windy City.",
    keywords: ["sake chicago", "sake bar chicago", "japanese restaurant chicago", "sake tasting chicago"],
    intro: "Chicago may not be the first city that comes to mind for sake, but the Windy City has quietly built one of the strongest sake scenes in the Midwest. A combination of excellent Japanese fine dining, creative izakayas, and a food culture that embraces global flavors has made Chicago a genuine sake destination. Cold winters also make Chicago an ideal city for warm sake — there's nothing better than a flask of heated Junmai on a February evening.",
    sakeScene: "Chicago's Japanese dining scene has matured significantly. The city now has multiple Michelin-starred Japanese restaurants with serious sake programs, several dedicated sake-focused bars, and a growing community of enthusiasts. The Arlington Heights area, northwest of the city, has a notable Japanese community with authentic dining options. Downtown and the near-north neighborhoods offer the highest concentration of premium sake experiences.",
    topVenues: [
      { name: "Momotaro", type: "restaurant", neighborhood: "West Loop", description: "Stylish Japanese restaurant with a sake menu that spans 80+ selections across every category.", highlight: "Extensive sake menu with knowledgeable sommeliers" },
      { name: "Kyoten", type: "restaurant", neighborhood: "Logan Square", description: "Intimate omakase counter with a carefully curated sake pairing program.", highlight: "Personalized sake pairing with 10+ course omakase" },
      { name: "Izakaya Mita", type: "restaurant", neighborhood: "Wicker Park", description: "Casual izakaya with an approachable sake list and excellent comfort food.", highlight: "Warm sake and yakitori in a relaxed neighborhood setting" },
      { name: "Tensuke Market", type: "shop", neighborhood: "Elk Grove Village", description: "Japanese grocery with one of the best retail sake selections in the greater Chicago area.", highlight: "Hard-to-find sakes at reasonable retail prices" },
      { name: "Kai Zan", type: "restaurant", neighborhood: "Humboldt Park", description: "BYOB-friendly sushi spot — bring your own sake and enjoy without restaurant markup.", highlight: "BYOB policy means you can bring premium sake at retail prices" },
    ],
    localTips: [
      "Chicago's BYOB restaurant culture is a sake advantage — buy a great bottle at retail and bring it to a BYOB sushi spot for the best value.",
      "The West Loop and River North neighborhoods have the highest concentration of upscale Japanese restaurants.",
      "Mitsuwa Marketplace in Arlington Heights is worth the drive — excellent sake selection and Japanese food court.",
      "Chicago gets cold — embrace warm sake culture from October through April. Many restaurants have excellent atsukan and nurukan selections.",
    ],
    events: [
      "Chicago Sake Festival — Annual tasting event featuring Japanese breweries",
      "Japan Culture Festival — Summer event at Mitsuwa Marketplace with sake sampling",
    ],
  },
  {
    slug: "seattle",
    name: "Seattle",
    state: "Washington",
    heroImage: "https://images.unsplash.com/photo-1502175353174-a7a70e73b4c3?w=1200&q=80",
    heroImageAlt: "Seattle skyline with Space Needle and Mount Rainier in the background",
    description: "Pacific Northwest sake culture — where local craft meets Japanese tradition.",
    seoTitle: "Seattle Sake Guide: Best Bars, Restaurants, and Local Breweries",
    seoDescription: "Seattle's sake scene blends Pacific Northwest craft culture with deep Japanese roots. Discover the best sake bars, restaurants, and local breweries in the Emerald City.",
    keywords: ["sake seattle", "sake bar seattle", "japanese food seattle", "sake brewery seattle"],
    intro: "Seattle's deep cultural ties to Japan — forged through trade, immigration, and the Pacific Northwest's proximity to Asia — have cultivated a sake scene that feels both authentic and distinctly Northwest. The city's craft beverage culture has also spawned several local sake producers, adding an exciting domestic dimension to the Japanese imports.",
    sakeScene: "The International District (historically Japantown) remains a hub for Japanese dining and sake, but the broader Seattle area offers sake experiences across many neighborhoods. Capitol Hill, Ballard, and Fremont all have excellent Japanese restaurants with thoughtful sake programs. Seattle's emphasis on local, sustainable food and drink has also made it a natural home for craft sake production.",
    topVenues: [
      { name: "Taneda Sushi", type: "restaurant", neighborhood: "South Lake Union", description: "Omakase-only counter with a sake collection curated by a certified sommelier.", highlight: "Intimate omakase with expert sake pairings" },
      { name: "Kamonegi", type: "restaurant", neighborhood: "Fremont", description: "Handmade soba and sake in a beautiful setting. James Beard-recognized.", highlight: "Soba-sake pairing experience — unique and delightful" },
      { name: "Sake Nomi", type: "shop", neighborhood: "Pioneer Square", description: "Sake-focused wine bar and shop with regular tasting events and classes.", highlight: "Sake education through regular classes and guided tastings" },
      { name: "Uwajimaya", type: "shop", neighborhood: "International District", description: "Asian supermarket with one of the best sake retail selections in the Pacific Northwest.", highlight: "Massive sake selection at competitive retail prices" },
      { name: "SakéOne", type: "shop", neighborhood: "Oregon (day trip)", description: "One of America's premier sake breweries, just a few hours south in Forest Grove, Oregon.", highlight: "Tour an American sake brewery and taste locally crafted sake" },
    ],
    localTips: [
      "Uwajimaya in the International District has an enormous sake selection — it's worth a trip even just to browse and learn.",
      "Seattle's rainy climate makes it ideal warm sake territory — ask for kanzake at restaurants during the colder months.",
      "The Pike Place Market area has several shops that carry curated sake selections alongside wine and spirits.",
      "Consider a day trip to SakéOne in Forest Grove, Oregon — one of America's best sake breweries.",
    ],
    events: [
      "Seattle Sake Fest — Annual tasting event at the Seattle Center",
      "Uwajimaya Sake Tasting — Regular in-store tastings with brewery representatives",
    ],
  },
  {
    slug: "houston",
    name: "Houston",
    state: "Texas",
    heroImage: "https://images.unsplash.com/photo-1530089711124-9ca31fb9e863?w=1200&q=80",
    heroImageAlt: "Houston skyline at dusk with dramatic clouds",
    description: "Texas-sized sake scene — Houston's Japanese dining community delivers authentic experiences.",
    seoTitle: "Houston Sake Guide: Best Japanese Restaurants and Sake Bars",
    seoDescription: "Houston's diverse food scene includes a vibrant Japanese dining community. Discover the best sake bars, restaurants, and shops in Space City.",
    keywords: ["sake houston", "japanese restaurant houston", "sake bar houston", "sake texas"],
    intro: "Houston's remarkable cultural diversity extends to its Japanese dining scene, which has grown significantly over the past decade. The city's large Japanese expatriate community supports authentic izakayas, sushi restaurants, and sake bars that would feel at home in Tokyo. Combined with Houston's overall food-obsessed culture, sake enthusiasts will find more quality options here than in most American cities.",
    sakeScene: "Houston's Japanese dining scene is concentrated in several key areas: the Galleria/Uptown area, the Heights, Midtown, and the Katy Asian Town corridor west of the city. The city benefits from a strong Japanese business community that demands authentic dining, resulting in restaurants with serious sake programs catering to knowledgeable drinkers.",
    topVenues: [
      { name: "MF Sushi", type: "restaurant", neighborhood: "Midtown", description: "High-end omakase with a sake pairing program that rivals the best in the country.", highlight: "Premium omakase with 30+ premium sake selections" },
      { name: "Roka Akor", type: "restaurant", neighborhood: "Galleria", description: "Upscale Japanese steakhouse with an impressive sake and whisky bar.", highlight: "Robata grill with extensive sake by the glass" },
      { name: "Kata Robata", type: "restaurant", neighborhood: "Upper Kirby", description: "Creative Japanese cuisine with a well-curated sake list and knowledgeable staff.", highlight: "Innovative sake cocktails alongside traditional service" },
      { name: "H Mart", type: "shop", neighborhood: "Various", description: "Korean-Japanese market chain with a reliable sake selection at competitive prices.", highlight: "Affordable everyday sakes alongside some premium selections" },
      { name: "Nippon Daido", type: "shop", neighborhood: "Katy Fwy", description: "Authentic Japanese grocery with an impressive sake aisle.", highlight: "Hard-to-find Japanese imports at reasonable prices" },
    ],
    localTips: [
      "Houston's heat makes chilled sake particularly refreshing — lean into Ginjo and sparkling sake during the warm months (which is most of the year).",
      "Katy Asian Town, west of the city, has several authentic Japanese restaurants with better sake selections than their unassuming exteriors suggest.",
      "Ask about sake at Houston's upscale steakhouses — many have quietly built impressive Japanese beverage programs.",
      "Total Wine & More locations in Houston have expanded their sake sections significantly.",
    ],
    events: [
      "Houston Japan Festival — Annual cultural event with sake tasting area",
      "Houston Sake Social — Periodic tasting events at various restaurants",
    ],
  },
  {
    slug: "miami",
    name: "Miami",
    state: "Florida",
    heroImage: "https://images.unsplash.com/photo-1506966953602-c20cc11f75e3?w=1200&q=80",
    heroImageAlt: "Miami Beach oceanfront with art deco buildings and palm trees",
    description: "Sake meets South Beach — Miami's high-energy nightlife has embraced premium sake culture.",
    seoTitle: "Miami Sake Guide: Best Sake Bars and Japanese Restaurants in South Florida",
    seoDescription: "Miami's vibrant nightlife and dining scene has embraced sake culture. Find the best sake bars, Nikkei restaurants, and Japanese spots in South Florida.",
    keywords: ["sake miami", "sake bar miami beach", "japanese restaurant miami", "sake south florida"],
    intro: "Miami might seem like an unlikely sake city, but its intersection of luxury dining, nightlife culture, and Latin-Japanese (Nikkei) fusion has created a unique and exciting sake scene. The city's emphasis on premium experiences and its international clientele have attracted serious Japanese restaurants and sake programs, while the Nikkei culinary movement adds a distinctly Miami flavor to sake culture.",
    sakeScene: "Miami's sake scene is concentrated in three areas: South Beach (high-end Japanese restaurants and nightlife), Brickell/Downtown (business dining with premium sake), and Wynwood (creative, casual izakayas). The Nikkei movement — blending Japanese and Peruvian cuisines — has become a defining feature of Miami's food identity, and many Nikkei restaurants feature innovative sake pairings.",
    topVenues: [
      { name: "Zuma", type: "restaurant", neighborhood: "Downtown/Brickell", description: "International izakaya chain with one of Miami's most comprehensive sake programs.", highlight: "50+ sakes with a stunning waterfront setting" },
      { name: "Makoto", type: "restaurant", neighborhood: "Bal Harbour", description: "Upscale Japanese restaurant by chef Makoto Okuwa with a curated sake selection.", highlight: "Premium sake paired with refined Japanese cuisine" },
      { name: "Hiden", type: "restaurant", neighborhood: "Wynwood", description: "Hidden speakeasy-style Japanese bar with creative sake cocktails and small plates.", highlight: "Sake cocktails and omakase in an intimate setting" },
      { name: "Naiyara", type: "restaurant", neighborhood: "Miami Beach", description: "Thai-Japanese fusion with an unexpected but excellent sake selection.", highlight: "Sake paired with bold Thai-Japanese flavors" },
      { name: "Total Wine", type: "shop", neighborhood: "Various", description: "Multiple Miami locations with growing sake sections and regular tasting events.", highlight: "Accessible retail sake selection with periodic tastings" },
    ],
    localTips: [
      "Miami's warm climate makes sparkling sake and chilled Ginjo natural choices year-round.",
      "South Beach Japanese restaurants often have premium sake that doesn't appear on the main menu — ask your server about the 'reserve sake list.'",
      "Nikkei restaurants offer unique sake pairing opportunities that you won't find anywhere else — sake with ceviche is a revelation.",
      "The Design District and Wynwood have become hubs for creative Japanese dining with adventurous sake programs.",
    ],
    events: [
      "SoBe Sake Festival — Annual South Beach tasting event",
      "Art Basel sake events — Several Japanese restaurants host special sake dinners during Art Basel week",
    ],
  },
  {
    slug: "portland",
    name: "Portland",
    state: "Oregon",
    heroImage: "https://images.unsplash.com/photo-1507245338956-b04a87e5e344?w=1200&q=80",
    heroImageAlt: "Portland Oregon skyline with Mount Hood in the background",
    description: "Craft sake pioneers — Portland is home to SakéOne and a thriving izakaya scene.",
    seoTitle: "Portland Sake Guide: Home of SakéOne and Oregon's Best Sake Bars",
    seoDescription: "Portland is home to SakéOne, one of America's premier sake breweries. Explore Portland's craft sake scene, izakayas, and Japanese restaurants.",
    keywords: ["sake portland", "sake bar portland", "SakéOne portland", "sake tasting portland"],
    intro: "Portland's relationship with sake is unique among American cities. As home to SakéOne — one of the oldest and most respected sake breweries outside of Japan — Portland has a legitimate claim to being the craft sake capital of America. Combined with the city's passionate food culture, thriving izakaya scene, and love of all things artisanal, Portland offers a sake experience that's both authentic and distinctly Pacific Northwest.",
    sakeScene: "Portland's sake culture benefits from the cross-pollination between its craft beer scene and Japanese dining community. The city's emphasis on local, sustainable, and artisanal products has made craft sake a natural fit. SakéOne, located in nearby Forest Grove, has been brewing sake since 1998 and produces both traditional Japanese-style and innovative American-style sakes. The city's restaurant scene features numerous izakayas and Japanese restaurants with thoughtful sake programs.",
    topVenues: [
      { name: "SakéOne", type: "shop", neighborhood: "Forest Grove", description: "One of America's premier sake breweries, producing award-winning sake from Pacific Northwest water and California rice.", highlight: "Tour the brewery, taste the lineup, and buy direct" },
      { name: "Nodoguro", type: "restaurant", neighborhood: "Various (pop-up)", description: "Acclaimed pop-up omakase experience with creative sake pairings.", highlight: "Multi-course omakase with expert sake pairings" },
      { name: "Afuri Izakaya", type: "restaurant", neighborhood: "Pearl District", description: "Portland outpost of the Tokyo ramen chain with a solid sake selection.", highlight: "Authentic ramen paired with sake in a modern setting" },
      { name: "Shigezo", type: "restaurant", neighborhood: "Downtown/Pearl", description: "Izakaya and ramen spot with an approachable sake menu and late-night service.", highlight: "Affordable sake and izakaya fare until late" },
      { name: "Uwajimaya", type: "shop", neighborhood: "Beaverton", description: "Pacific Northwest Asian market chain with an excellent sake retail selection.", highlight: "Wide range of imports alongside local SakéOne products" },
    ],
    localTips: [
      "A trip to SakéOne in Forest Grove (30 minutes from downtown) is a must — call ahead to arrange a tour.",
      "Portland's food cart culture occasionally includes Japanese carts — keep an eye out for sake pairings at unexpected spots.",
      "The Pearl District and inner Southeast have the highest concentration of Japanese restaurants with quality sake programs.",
      "Portland's craft cocktail bars have embraced sake as a cocktail ingredient — look for sake-based cocktails at creative bars.",
    ],
    events: [
      "SakéOne Open House — Annual event at the Forest Grove brewery",
      "Portland Sake Festival — Growing annual tasting event",
    ],
  },
  {
    slug: "boston",
    name: "Boston",
    state: "Massachusetts",
    heroImage: "https://images.unsplash.com/photo-1501979376754-00170d5765c1?w=1200&q=80",
    heroImageAlt: "Boston skyline from the harbor with historic buildings",
    description: "Academic and culinary — Boston's sake scene combines education with excellent dining.",
    seoTitle: "Boston Sake Guide: Best Sake Bars, Restaurants, and Where to Learn",
    seoDescription: "Boston's sake scene blends academic curiosity with culinary excellence. Discover top sake bars, Japanese restaurants, and educational tasting events in Boston.",
    keywords: ["sake boston", "sake bar boston", "japanese restaurant boston", "sake tasting boston"],
    intro: "Boston's sake scene reflects the city's dual personality: intellectually curious and culinarily ambitious. Home to some of the country's best universities and a thriving food scene, Boston attracts diners who want to understand what they're drinking, not just consume it. This has fostered a sake culture that emphasizes education alongside enjoyment — many of the city's best sake experiences include a learning component.",
    sakeScene: "Boston's Japanese dining scene is concentrated in several key areas: the Back Bay and South End for upscale options, Cambridge/Somerville for creative casual dining, and the Seaport for modern Japanese concepts. The city's strong seafood tradition also creates natural synergies with sake — few cities offer better opportunities for the classic sake-and-sashimi pairing.",
    topVenues: [
      { name: "O Ya", type: "restaurant", neighborhood: "Leather District", description: "Acclaimed omakase restaurant with a meticulously curated sake pairing program.", highlight: "One of the country's best omakase experiences with expert pairings" },
      { name: "Uni", type: "restaurant", neighborhood: "Back Bay", description: "Japanese-inspired tapas and sashimi bar with an impressive sake selection.", highlight: "Creative Japanese-inspired dishes paired with premium sake" },
      { name: "Ittoku", type: "restaurant", neighborhood: "Boston", description: "Authentic izakaya with a focused sake menu and late-night service.", highlight: "Real izakaya atmosphere with well-chosen sake selections" },
      { name: "Federal Wine & Spirits", type: "shop", neighborhood: "Financial District", description: "Well-stocked wine shop with an expanding sake section and knowledgeable staff.", highlight: "Curated sake selection with helpful recommendations" },
      { name: "Café Sushi", type: "restaurant", neighborhood: "Cambridge", description: "Beloved Cambridge sushi institution with a surprisingly deep sake list.", highlight: "Neighborhood gem with sake selections that punch above its weight" },
    ],
    localTips: [
      "Boston's seafood quality makes it one of the best cities in America for sake-and-fish pairing. Take advantage of the local oysters and lobster with premium Junmai Ginjo.",
      "Harvard Square and Central Square in Cambridge have several Japanese restaurants with good sake programs at more reasonable prices than downtown Boston.",
      "Winter in Boston is ideal for exploring warm sake — many restaurants offer kanzake (warmed sake) service from November through March.",
      "The Boston Wine Expo often includes sake exhibitors — check the annual event schedule.",
    ],
    events: [
      "Boston Sake Summit — Annual educational tasting event",
      "Japan Festival Boston — Cultural event with sake tasting component",
    ],
  },
  {
    slug: "washington-dc",
    name: "Washington DC",
    state: "District of Columbia",
    heroImage: "https://images.unsplash.com/photo-1501466044931-62695aada8e9?w=1200&q=80",
    heroImageAlt: "Washington DC monuments with cherry blossoms in bloom",
    description: "Where diplomacy meets sake — DC's cosmopolitan dining scene embraces Japanese craft.",
    seoTitle: "DC Sake Guide: Best Sake Bars and Japanese Restaurants in Washington",
    seoDescription: "Washington DC's cosmopolitan dining scene includes excellent sake bars and Japanese restaurants. Discover the best places to drink sake in the nation's capital.",
    keywords: ["sake dc", "sake bar washington dc", "japanese restaurant dc", "sake tasting washington"],
    intro: "Washington DC's sake scene benefits from the city's cosmopolitan character. Diplomats, international professionals, and a food-savvy population create demand for authentic Japanese dining, and DC's restaurants have responded with increasingly sophisticated sake programs. The annual cherry blossom season — when the city celebrates its deep cultural ties to Japan — brings an extra wave of sake-related events and promotions.",
    sakeScene: "DC's Japanese dining is concentrated in several areas: Penn Quarter and Chinatown for high-end options, 14th Street for trendy izakayas, and the broader DMV area (including Bethesda and Arlington) for authentic neighborhood spots. The city's diplomatic community supports restaurants that cater to knowledgeable Japanese diners, which means quality is consistently high.",
    topVenues: [
      { name: "Sushi Nakazawa", type: "restaurant", neighborhood: "Penn Quarter", description: "Michelin-starred omakase from a Jiro Dreams of Sushi alumnus, with excellent sake pairings.", highlight: "World-class omakase with premium sake pairing option" },
      { name: "Izakaya Seki", type: "restaurant", neighborhood: "V Street NW", description: "Authentic izakaya with over 30 sake selections and genuine Japanese atmosphere.", highlight: "30+ sakes in a cozy, authentic izakaya setting" },
      { name: "Daikaya", type: "restaurant", neighborhood: "Chinatown", description: "Two-floor concept: ramen downstairs, izakaya upstairs with a thoughtful sake menu.", highlight: "Upstairs izakaya with sake flights and creative small plates" },
      { name: "Sushiko", type: "restaurant", neighborhood: "Chevy Chase", description: "One of DC's oldest Japanese restaurants with a deep, well-aged sake cellar.", highlight: "Vintage and aged sakes available alongside current releases" },
      { name: "Hana Market", type: "shop", neighborhood: "Various", description: "Japanese grocery stores in the DC area with retail sake selections.", highlight: "Import sakes at grocery prices" },
    ],
    localTips: [
      "Cherry blossom season (late March-early April) brings special sake menus and events across the city — it's the best time for sake exploration in DC.",
      "The Japanese Embassy occasionally hosts cultural events with sake tastings — check the Embassy's public events calendar.",
      "Bethesda, Maryland (just outside DC) has a strong Japanese dining scene with lower prices than downtown DC.",
      "Penn Quarter and 14th Street NW have the highest concentration of quality Japanese restaurants within walking distance.",
    ],
    events: [
      "National Cherry Blossom Festival — Multiple sake-related events throughout the festival period",
      "DC Sake Experience — Annual tasting event featuring Japanese breweries",
      "Japan-America Society events — Regular sake education and tasting programs",
    ],
  },
];

export function getCityBySlug(slug: string): CityGuideData | undefined {
  return cityGuides.find((c) => c.slug === slug);
}
