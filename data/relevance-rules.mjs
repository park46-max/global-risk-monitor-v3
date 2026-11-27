// RELEVANCE RULES: which headlines are shown first, and which routine notices are filtered out. Plain word lists, no AI, no paid service.
// Edit here, then run: node tests/test-relevance.mjs   (and try one headline: node scripts/explain-headline.mjs "your headline")
//
// How a headline is judged (title only; nothing is read from the article):
//  1. TOPICS. Each topic below that has at least one word in the headline adds its weight to the score (a topic counts once however many words match).
//     Two or more topics add 1 more. A headline that names two different monitored countries (for example US and China) adds 1 more.
//     Score 3 or more = "high", 1-2 = "medium", 0 = "other" (still listed, but in a collapsed section).
//  2. ROUTINE FINANCIAL NOTICES. Headlines about fund prices, ETF values, dividends, stock ratings and similar are filtered out when they carry no
//     geopolitical signal:
//        "strong" product words (net asset value, dividend, price target ...) are filtered unless a topic of weight 3 or more is also present;
//        "weak" words (ETF, earnings, shares jump ...) are filtered unless any topic is present.
//     So "iShares China ETF net asset value update" is filtered, while "Sanctions on Russia hit energy ETF" and "China ETF inflows jump after
//     Beijing unveils stimulus" are kept. Filtered headlines are NOT deleted silently: the page lists them in a "Filtered out" section with the reason.
//  3. DUPLICATES. Headlines with the same words (ignoring a trailing " - Publisher" and word order), published within 48 hours, are grouped: one is
//     shown and the others are listed as "Also reported by", each with its own link.
//
//  4. COUNTRY ROLE (new). A country named in a headline is not always what the story is about. For each matched country the headline gets a role:
//        "shared"     two or more monitored countries are named (US-China, Russia-Ukraine, Taiwan Strait ...), or another country is named first
//                     but the headline carries a security, diplomacy or sanctions/trade signal (an interstate story);
//        "incidental" another country (list `role.foreign`) is named BEFORE this one, this one is not among the first `role.earlyWords` words, and there is
//                     no such signal; or the name is only a company/person descriptor ("US-based", "China-born");
//        "primary"    everything else.
//     Incidental items are not deleted: the page lists them under "Mentioned in passing" and the country briefs leave them out.
//     Word position is a rough proxy for "what the story is about", so it can be wrong; the label is always shown.
//  5. OFF-TOPIC. Headlines with sport, entertainment or local-crime wording (`offTopic`) and NO security, diplomacy or sanctions/trade topic
//     are filtered into the same "Filtered out" list with the reason, so nothing disappears silently.
//  6. SOURCE AND STYLE. See data/source-quality.mjs (outlet label, sensational-style flag). Labels never hide an article.
//
// Matching is whole-word and case-insensitive unless cs:true. Add a plain string, or { t:'word', cs:true }.
export const RULES = {
  topics: {
    security: { label: 'Security', weight: 3, terms: [
      'war', 'warfare', 'invasion', 'invade', 'invades', 'invaded', 'offensive', 'ceasefire', 'cease-fire', 'truce', 'missile', 'missiles', 'drone strike',
      'drone strikes', 'drone attack', 'drone attacks', 'airstrike', 'airstrikes', 'air strike', 'air strikes', 'shelling', 'bombing', 'troops', 'military',
      'army', 'navy', 'naval', 'air force', 'warship', 'warships', 'fighter jet', 'fighter jets', 'nuclear', 'defense ministry', 'defence ministry',
      'defense minister', 'defence minister', 'armed forces', { t: 'NATO', cs: true }, 'espionage', 'cyberattack', 'cyberattacks', 'cyber attack',
      'blockade', 'border clash', 'border clashes', 'martial law', 'mobilization', 'mobilisation', 'conscription', 'coup', 'hostage', 'hostages',
      'weapons', 'arms deal', 'arms deliveries', 'frontline', 'front line', 'live-fire', 'military drills', 'war games' ] },
    diplomacy: { label: 'Diplomacy', weight: 3, terms: [
      'peace talks', 'nuclear talks', 'summit', 'treaty', 'envoy', 'ambassador', 'ambassadors', 'diplomat', 'diplomats', 'diplomatic', 'diplomacy',
      'negotiation', 'negotiations', 'negotiators', 'foreign minister', 'foreign ministry', 'foreign policy', 'embassy', 'consulate', 'united nations',
      'security council', 'general assembly', { t: 'G7', cs: true }, { t: 'G20', cs: true }, { t: 'BRICS', cs: true }, 'alliance', 'peace deal',
      'peace plan', 'state visit', 'bilateral', 'accord', 'pact', 'summons ambassador' ] },
    sanctionsTrade: { label: 'Sanctions and trade', weight: 3, terms: [
      'sanction', 'sanctions', 'sanctioned', 'sanctioning', 'embargo', 'tariff', 'tariffs', 'trade war', 'trade deal', 'trade talks', 'trade ban',
      'export control', 'export controls', 'export ban', 'import ban', 'price cap', 'frozen assets', 'asset freeze', 'blacklist', 'blacklisted',
      'entity list', 'rare earth', 'rare earths', 'supply chain', 'supply chains', 'semiconductor', 'semiconductors', 'trade surplus', 'trade deficit',
      { t: 'WTO', cs: true }, 'customs duties', 'boycott' ] },
    economicPolicy: { label: 'Economic policy', weight: 2, terms: [
      'central bank', 'interest rate', 'interest rates', 'rate cut', 'rate cuts', 'rate hike', 'rate hikes', 'monetary policy', 'fiscal policy', 'stimulus',
      'sovereign debt', 'debt crisis', 'debt default', 'devaluation', 'yuan', 'inflation', 'recession', { t: 'IMF', cs: true }, 'International Monetary Fund',
      'World Bank', { t: 'OPEC', cs: true }, 'oil price', 'oil prices', 'energy security', 'gas supplies', 'gas pipeline', 'economic growth', 'economic policy',
      'economic slowdown', 'economy', 'subsidies', 'nationalization', { t: 'GDP', cs: true } ] }
  },
  // Routine financial notices. "strong" words mark a product notice on their own; "weak" words only count when no topic is present (see rule 2 above).
  noise: {
    strong: [
      'net asset value', { t: 'NAV', cs: true }, 'dividend', 'dividends', 'ex-dividend', 'price target', 'analyst rating', 'buy rating', 'sell rating',
      'shares of', 'stake in', 'acquires shares', 'sells shares', 'buys shares', 'increases position', 'reduces position', 'trims position', { t: '13F', cs: true },
      'sec filing', 'earnings per share', { t: 'EPS', cs: true }, 'market capitalization', 'stock quote', 'penny stock', 'unusual options', 'short interest',
      'trading volume', 'technical analysis', 'stocks to buy', 'best stocks', 'top stocks', 'iShares', 'SPDR', 'ProShares', 'Direxion', 'WisdomTree',
      'KraneShares', 'Invesco', 'index fund', 'mutual fund', 'exchange-traded fund', 'exchange traded fund', 'exchange-traded funds' ],
    weak: [
      { t: 'ETF', cs: true }, { t: 'ETFs', cs: true }, 'portfolio', 'stock price', 'share price', 'earnings', 'quarterly results',
      'shares rise', 'shares fall', 'shares jump', 'shares slump', 'shares surge', 'stock market today', 'stocks to watch', { t: 'IPO', cs: true }, 'market cap' ]
  },
  // Country role (rule 4). Other countries and blocs, so that "Iran says ... in the US" can be told apart from "US imposes ...". Demonyms included.
  role: {
    earlyWords: 3,
    descriptors: ['based', 'listed', 'headquartered', 'born', 'owned'],
    foreign: [ 'Iran', 'Iranian', 'Israel', 'Israeli', 'India', 'Indian', 'Japan', 'Japanese', 'North Korea', 'North Korean', 'South Korea', 'South Korean', 'Korea', 'Korean',
      'Germany', 'German', 'France', 'French', 'Britain', 'British', { t: 'UK', cs: true }, 'Italy', 'Italian', 'Spain', 'Spanish', 'Poland', 'Polish', 'Canada', 'Canadian',
      'Mexico', 'Mexican', 'Brazil', 'Brazilian', 'Argentina', 'Venezuela', 'Venezuelan', 'Cuba', 'Cuban', 'Australia', 'Australian', 'Turkey', 'Turkish', 'Saudi', 'Egypt', 'Egyptian',
      'Syria', 'Syrian', 'Iraq', 'Iraqi', 'Lebanon', 'Lebanese', 'Gaza', 'Palestinian', 'Pakistan', 'Pakistani', 'Afghanistan', 'Afghan', 'Belarus', 'Belarusian',
      'Philippines', 'Philippine', 'Vietnam', 'Vietnamese', 'Indonesia', 'Indonesian', 'Thailand', 'Thai', 'Nigeria', 'Nigerian', 'Kenya', 'Ethiopia', 'South Africa', 'African',
      'Kenyan', 'Ethiopian', 'Ghanaian', 'Moroccan', 'Qatar', 'Qatari', 'Emirati', { t: 'UAE', cs: true }, 'Switzerland', 'Swiss', 'Sweden', 'Swedish', 'Norway', 'Norwegian', 'Finland', 'Finnish',
      'Netherlands', 'Dutch', 'Greece', 'Greek', 'Portugal', 'Portuguese', 'Ireland', 'Irish', 'Hungary', 'Hungarian', 'Serbia', 'Serbian', 'Romania', 'Romanian', 'Bulgaria', 'Bulgarian', 'Czech',
      'Colombia', 'Colombian', 'Chile', 'Chilean', 'Peru', 'Peruvian', 'Singapore', 'Singaporean', 'Malaysia', 'Malaysian', 'Bangladesh', 'Bangladeshi', 'Myanmar', 'Cambodia', 'Cambodian',
      'Europe', 'European', { t: 'EU', cs: true }, 'European Union', 'Asia', 'Africa', 'Middle East', 'Latin America' ]
  },
  // Off-topic wording (rule 5). Applied only when the headline has no security, diplomacy or sanctions/trade topic.
  offTopic: {
    sport: [ { t: 'NFL', cs: true }, { t: 'NBA', cs: true }, { t: 'MLB', cs: true }, { t: 'NHL', cs: true }, { t: 'NCAA', cs: true }, { t: 'PGA', cs: true }, 'Super Bowl', 'World Series',
      'Premier League', 'La Liga', 'touchdown', 'quarterback', 'home run', 'playoffs', 'playoff', 'Grand Slam', 'Wimbledon', 'golf tournament', 'soccer', 'basketball', 'baseball',
      'football match', 'football game', 'transfer window', 'fantasy football' ],
    entertainment: [ 'celebrity', 'celebrities', 'box office', 'red carpet', 'Grammy', 'Grammys', 'Oscars', 'Emmy', 'Emmys', 'Golden Globes', 'movie review', 'film review', 'album',
      'concert tour', 'singer', 'actress', 'reality TV', 'horoscope', 'royal family', 'wedding', 'influencer', 'viral video', 'fashion week', 'recipe', 'lottery', 'Powerball', 'Mega Millions' ],
    local: [ 'mass shooting', 'shot dead', 'stabbing', 'stabbed', 'car crash', 'house fire', 'missing child', 'Amber Alert', 'police say', 'arrested for', 'murder trial',
      'high school', 'school board', 'city council', 'homicide', 'robbery', 'burglary', 'road rage', 'sinkhole', 'weather forecast', 'snowstorm' ]
  },
  dedupe: { similarity: 0.7, minWords: 4, windowHours: 48, maxVariants: 8, containment: 0.85, containmentMinWords: 5 },
  // Score thresholds for the tiers shown on the page.
  tiers: { high: 3, medium: 1 }
};
