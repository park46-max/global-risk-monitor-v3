// PUBLISHER RSS SETTINGS. Read by scripts/fetch-rss.mjs only (the website never reads this file).
//
// EVERY PUBLISHER IS SWITCHED OFF. Nothing is fetched into the dashboard until you turn a publisher on yourself.
// To turn one on:
//   1. Run the "Update RSS news" workflow with mode = verify and read the result (is the feed reachable and valid?).
//   2. Read that publisher's own terms of use. Free access is not the same as permission to republish headlines.
//   3. Only then edit the publisher below:  enabled: true,  termsChecked: 'YYYY-MM-DD'  (the date you read the terms),
//      and write what you concluded in termsNote.
// The script refuses to fetch a publisher that is enabled without a termsChecked date.
//
// The feed addresses come from third-party feed directories (feeder.co, feedspot.com). They have NOT been confirmed as working
// by the author of this file. Verify mode is how you confirm them.

export const PUBLISHERS = [
  {
    id: 'bbc', name: 'BBC News', hosts: ['bbc.co.uk', 'bbc.com'],
    enabled: false, termsChecked: null,
    termsNote: 'Not yet reviewed by you. A third-party summary says BBC terms allow feeds on personal websites if unchanged, credited and linked, and require permission for business use. That is second-hand: read the BBC terms yourself.',
    feeds: [
      { id: 'bbc-world',  label: 'World',         url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
      { id: 'bbc-us',     label: 'US and Canada', url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml' },
      { id: 'bbc-asia',   label: 'Asia',          url: 'https://feeds.bbci.co.uk/news/world/asia/rss.xml' },
      { id: 'bbc-europe', label: 'Europe',        url: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml' }
    ]
  },
  {
    id: 'dw', name: 'DW (Deutsche Welle)', hosts: ['dw.com'],
    enabled: false, termsChecked: null,
    termsNote: 'Not yet reviewed. No terms text was found by the author.',
    feeds: [
      { id: 'dw-all',  label: 'All English news', url: 'https://rss.dw.com/rdf/rss-en-all' },
      { id: 'dw-asia', label: 'Asia',             url: 'https://rss.dw.com/rdf/rss-en-asia' },
      { id: 'dw-eu',   label: 'Europe',           url: 'https://rss.dw.com/rdf/rss-en-eu' }
    ]
  },
  {
    id: 'france24', name: 'France 24', hosts: ['france24.com'],
    enabled: false, termsChecked: null,
    termsNote: 'Not yet reviewed. No terms text was found by the author.',
    feeds: [
      { id: 'f24-main',     label: 'Top stories',  url: 'https://www.france24.com/en/rss' },
      { id: 'f24-europe',   label: 'Europe',       url: 'https://www.france24.com/en/europe/rss' },
      { id: 'f24-asia',     label: 'Asia-Pacific', url: 'https://www.france24.com/en/asia-pacific/rss' },
      { id: 'f24-americas', label: 'Americas',     url: 'https://www.france24.com/en/americas/rss' }
    ]
  },
  {
    id: 'aljazeera', name: 'Al Jazeera English', hosts: ['aljazeera.com'],
    enabled: false, termsChecked: null,
    termsNote: 'Not yet reviewed. Described as an official free feed by a directory site; no licence text was found by the author.',
    feeds: [
      { id: 'aj-all', label: 'All news', url: 'https://www.aljazeera.com/xml/rss/all.xml' }
    ]
  }
];

// How an article is matched to a country. This is plain text matching, not understanding:
//  * Whole words only. "China" matches "China's" but not "Chinatown".
//  * Case-insensitive, except terms written { t, cs: true }, which must match exactly (so "US" does not match the word "us").
//  * Looked for in the headline first. If the headline has no term, the feed's own summary is searched. The summary is used for
//    matching only and is never stored or shown.
//  * A headline match is shown as "Country named in headline". A summary-only match is shown as "Mentioned in summary only".
//    Neither proves the article is mainly about that country, and the page says so.
//  * Deliberately left out because they are ambiguous: "Washington" alone, "America", "Congress", "Georgia", "Hong Kong".
export const COUNTRY_TERMS = {
  USA: ['United States', 'White House', 'Pentagon', 'State Department', 'Treasury Department', 'Washington DC', 'Washington, D.C.',
        { t: 'U.S.', cs: true }, { t: 'US', cs: true }, { t: 'USA', cs: true }, { t: 'Trump', cs: true }],
  CHN: ['China', 'Chinese', 'Beijing', 'Xi Jinping', 'South China Sea', { t: 'PLA', cs: true }],
  RUS: ['Russia', 'Russian', 'Moscow', 'Kremlin', 'Putin'],
  UKR: ['Ukraine', 'Ukrainian', 'Kyiv', 'Kiev', 'Zelensky', 'Zelenskyy'],
  TWN: ['Taiwan', 'Taiwanese', 'Taipei', 'Taiwan Strait']
};

export const SETTINGS = {
  retentionDays: 7,      // articles older than this are dropped from the cache
  maxItems: 400,         // cache size limit (newest kept)
  timeoutMs: 15000,      // per request
  maxTries: 3,           // 1 try + 2 retries, only for network errors, 429 and 5xx
  retryBaseMs: 5000,     // first retry waits about this long (doubling, with jitter, never less than Retry-After, max 60 s)
  gapMs: 2000,           // pause between two feed requests (plus up to 1 s of jitter)
  maxBytes: 5 * 1024 * 1024
};
