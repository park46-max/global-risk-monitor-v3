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
    // OFFICIAL SOURCE WITH A STATED PERMISSION. Read on 2026-11-20 at https://www.ungeneva.org/en/rss : "You can also use our RSS feeds to display
    // the latest news from UN Geneva on your own website or personal page." The page lists no copyright or attribution conditions and no feed addresses.
    // UN Geneva's separate newsroom site (unognewsroom.org) has its own terms (editorial use, acknowledge the United Nations as provider), which are a
    // different site's terms and are not assumed to apply here. This dashboard shows only headline, date and a link back, credits UN Geneva, and uses no images.
    // The feed addresses are NOT known yet: run verify and copy the candidates it prints into `feeds` below.
    id: 'ungeneva', name: 'UN Geneva', hosts: ['ungeneva.org'], feedHosts: ['ungeneva.org'], discoverUrl: 'https://www.ungeneva.org/en/rss',
    enabled: false, termsChecked: null,
    termsNote: 'PERMISSION STATED, CONDITIONS PARTLY UNKNOWN. UN Geneva RSS page (read 2026-11-20): feeds may be used "to display the latest news from UN Geneva on your own website or personal page". No copyright/attribution text found for ungeneva.org itself. Shown with attribution, headline and link only. Enable after you have copied verified feed addresses below and are content with this wording.',
    feeds: []
  },
  {
    id: 'bbc', name: 'BBC News', hosts: ['bbc.co.uk', 'bbc.com'], feedHosts: ['bbci.co.uk'],
    enabled: false, termsChecked: null,
    termsNote: 'NOT ESTABLISHED. Review of 2026-11-20: BBC\'s own RSS terms page could not be read. A third-party summary says feeds are allowed on personal sites if unchanged, credited and linked, with permission needed for business use. An unofficial, undated copy of the BBC terms says content from bbc.co.uk needs permission (clause 8a), making money from BBC content is prohibited (7d) and business use needs permission first (9). Whether a free public portfolio site counts as business use is unclear. Read the BBC page yourself, or ask the BBC, before enabling.',
    feeds: [
      { id: 'bbc-world',  label: 'World',         url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
      { id: 'bbc-us',     label: 'US and Canada', url: 'https://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml' },
      { id: 'bbc-asia',   label: 'Asia',          url: 'https://feeds.bbci.co.uk/news/world/asia/rss.xml' },
      { id: 'bbc-europe', label: 'Europe',        url: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml' }
    ]
  },
  {
    id: 'dw', name: 'DW (Deutsche Welle)', hosts: ['dw.com'], feedHosts: ['dw.com'],
    enabled: false, termsChecked: null,
    termsNote: 'NOT ESTABLISHED. Review of 2026-11-20: no DW terms of use or RSS licence text could be found. Feeds are publicly available and verified reachable, but that is not permission. Read DW\'s terms, or ask DW, before enabling.',
    feeds: [
      { id: 'dw-all',  label: 'All English news', url: 'https://rss.dw.com/rdf/rss-en-all' },
      { id: 'dw-asia', label: 'Asia',             url: 'https://rss.dw.com/rdf/rss-en-asia' },
      { id: 'dw-eu',   label: 'Europe',           url: 'https://rss.dw.com/rdf/rss-en-eu' }
    ]
  },
  {
    id: 'france24', name: 'France 24', hosts: ['france24.com'], feedHosts: ['france24.com'],
    enabled: false, termsChecked: null,
    termsNote: 'NOT ESTABLISHED. Review of 2026-11-20 of the France Medias Monde legal notice (covers france24.com): art. 6.1 grants only "personal and private" use and forbids reproducing or collecting content without authorisation; art. 7 says that creating hyperlinks to the sites implies you have obtained the necessary authorisations. It says nothing specific about RSS. Written permission is the safe route.',
    feeds: [
      { id: 'f24-main',     label: 'Top stories',  url: 'https://www.france24.com/en/rss', skip: 'answered HTTP 403 to the GitHub verification run of 2026-11-20; not requested again until the cause is known' },
      { id: 'f24-europe',   label: 'Europe',       url: 'https://www.france24.com/en/europe/rss' },
      { id: 'f24-asia',     label: 'Asia-Pacific', url: 'https://www.france24.com/en/asia-pacific/rss' },
      { id: 'f24-americas', label: 'Americas',     url: 'https://www.france24.com/en/americas/rss' }
    ]
  },
  {
    id: 'aljazeera', name: 'Al Jazeera English', hosts: ['aljazeera.com'], feedHosts: ['aljazeera.com'],
    enabled: false, termsChecked: null,
    termsNote: 'NOT ESTABLISHED. Review of 2026-11-20 of aljazeera.com/terms-and-conditions: site use is "only for your own personal, non-commercial use"; copying or distributing needs "the express prior written permission of an authorised officer"; web scraping is prohibited; links must go to full content pages and must not be framed. It says nothing about RSS. Written permission is needed.',
    feeds: [
      { id: 'aj-all', label: 'All news', url: 'https://www.aljazeera.com/xml/rss/all.xml' }
    ]
  }
];

// How an article is matched to a country (names and capitals only, never people) is defined in data/country-terms.mjs.
export { COUNTRY_TERMS } from './country-terms.mjs';

export const SETTINGS = {
  retentionDays: 7,      // articles older than this are dropped from the cache
  maxItems: 400,         // cache size limit (newest kept)
  timeoutMs: 15000,      // per request
  maxTries: 3,           // 1 try + 2 retries, only for network errors, 429 and 5xx
  retryBaseMs: 5000,     // first retry waits about this long (doubling, with jitter, never less than Retry-After, max 60 s)
  gapMs: 2000,           // pause between two feed requests (plus up to 1 s of jitter)
  maxBytes: 5 * 1024 * 1024
};
