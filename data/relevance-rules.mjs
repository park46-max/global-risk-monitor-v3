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
  dedupe: { similarity: 0.7, minWords: 4, windowHours: 48, maxVariants: 8 },
  // Score thresholds for the tiers shown on the page.
  tiers: { high: 3, medium: 1 }
};
