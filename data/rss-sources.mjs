// PUBLISHER RSS SETTINGS. Read by scripts/fetch-rss.mjs only (the website never reads this file).
//
// EVERY PUBLISHER IS SWITCHED OFF. Nothing is fetched into the dashboard until you turn a publisher on yourself.
// To turn one on:
//   1. Run the "Update RSS news" workflow with mode = verify and read the result (is the feed reachable and valid?).
//   2. Read that publisher's own terms of use. Free access is not the same as permission to republish headlines.
//   3. Only then edit the publisher below:  enabled: true,  termsChecked: 'YYYY-MM-DD'  (the date you read the terms),
//      and write what you concluded in termsNote.
// The script refuses to fetch a publisher that is enabled without a termsChecked date, or that still has unresolved items in `blockers`.
//
// EACH PUBLISHER HAS A sourceType (see data/source-types.mjs): journalism, government, international-organisation or eu-institution.
// Official communications (everything except journalism) are labelled on the page, are never grouped with another publisher's headline as a
// duplicate, are kept out of the country briefs, and never feed the risk assessment.
//
// FIELDS THAT ONLY DOCUMENT THE DECISION (the script never reads them): evidence, readOn, reuse, attribution, automatedFetching, feedAddressSource.
// `blockers` is read: while it is not empty the publisher is refused even if enabled:true and termsChecked are set. Only you clear it,
// by deleting the lines you have resolved. Neither verify mode nor any workflow ever edits this file.
// Full write-up with links: docs/rss-source-permissions.md
//
// The feed addresses come from third-party feed directories (feeder.co, feedspot.com). They have NOT been confirmed as working
// by the author of this file. Verify mode is how you confirm them.

export const PUBLISHERS = [
  {
    // UN GENEVA (UNOG / UN Information Service). A STATED PERMISSION EXISTS BUT IT IS NOT A LICENCE: read 2026-11-27 on the official page
    // https://www.ungeneva.org/en/news-media/rss : "You can also use our RSS feeds to display the latest news from UN Geneva on your own website or
    // personal page." That page gives no copyright, attribution, redistribution or automated-access conditions and shows no feed addresses in its text.
    // UN Geneva's separate sites have their OWN terms and are NOT assumed to apply here: unognewsroom.org (editorial use, 2 months) and archives.ungeneva.org
    // (web scraping and automated downloads not permitted without approval). UN Geneva is not assumed to have UN News's permissions either.
    // The five feed addresses below were found by this script's discovery step on the official RSS page during the live Stage 7B verification run
    // (11 candidates were found; the project owner supplied these five). They are VERIFY-ONLY candidates: nothing is enabled and nothing is shown on the page.
    id: 'ungeneva', sourceType: 'international-organisation', name: 'UN Geneva', hosts: ['ungeneva.org'], feedHosts: ['ungeneva.org'], discoverUrl: 'https://www.ungeneva.org/en/rss',
    enabled: false, termsChecked: null,
    attribution: 'Source: UN Geneva (United Nations Office at Geneva). No image, logo, audio, video or text is copied.',
    readOn: '2026-11-27',
    termsNote: 'CANDIDATE, NOT CLEARED. International organization communications: what UN Geneva publishes about its own press activity (press releases, meeting summaries, briefings), labelled as such. UN Geneva RSS page (read 2026-11-27): feeds may be used "to display the latest news from UN Geneva on your own website or personal page"; no conditions are stated there. No ungeneva.org copyright, attribution or automated-access page was found. The UN-wide wording is narrower and the UN News permission does not transfer: UN-wide copyright page: "News-related material can be used as long as the appropriate credit is given and the United Nations is advised"; UN-wide terms: personal, non-commercial use, no redistribution, no derivative works. Whether a public portfolio dashboard that stores headlines counts as "display on your own website or personal page" is a question for UN Geneva. Written confirmation is the safe route.',
    reuse: 'RSS page: feeds may be used to display the latest news from UN Geneva on your own website or personal page (no conditions stated). UN-wide copyright page: news-related material may be used with appropriate credit and the United Nations advised. UN-wide terms (secondary copy): personal non-commercial use, no redistribution or derivative works. Not assumed to apply: unognewsroom.org terms, archives.ungeneva.org terms.',
    automatedFetching: 'UNRESOLVED. The RSS page invites subscription and display but says nothing about automated retrieval by a server-side job, rate limits or caching. robots.txt for ungeneva.org was not readable during the research (the tool could not fetch it): the verify run reads and obeys it for every feed.',
    feedAddressSource: 'Discovered by this script on the official UN Geneva RSS page (live run 2026-11-27, 11 candidates found, five supplied by the project owner). The page text itself shows no addresses to a reader, so the exact addresses are not independently confirmed here. Each is on ungeneva.org under a news-media section that exists on the site.',
    evidence: [
      { url: 'https://www.ungeneva.org/en/news-media/rss', what: 'Official UN Geneva RSS page: "You can also use our RSS feeds to display the latest news from UN Geneva on your own website or personal page."' },
      { url: 'https://www.ungeneva.org/en/rss', what: 'Same RSS page (discovery address); explains RSS, shows no conditions and no feed addresses in its text' },
      { url: 'https://www.ungeneva.org/en/news-media/press-centre', what: 'Official press centre: UN Information Service Geneva issues press releases and meeting summaries' },
      { url: 'https://www.un.org/en/sections/about-website/copyright/', what: 'UN-wide copyright page (search snippet): news-related material may be used with credit and the United Nations advised' },
      { url: 'https://unoceans.un.org/www.un.org/en/about-us/terms-of-use.html', what: 'UN-wide terms of use (mirror on a UN site; official copy not fetched)' },
      { url: 'https://www.unognewsroom.org/terms-of-use', what: 'DIFFERENT SITE (UN Geneva Multimedia Newsroom): editorial use, 2 months. Shown only to record that it is not assumed to apply' },
      { url: 'https://archives.ungeneva.org/saverne/download', what: 'DIFFERENT SITE (UN Archives Geneva): web scraping and automated downloads need approval. Shown only to record that UN Geneva sites differ' }
    ],
    blockers: [
      'Ask UN Geneva (through the contact page on ungeneva.org; no address is assumed here) whether a public non-commercial dashboard may fetch these feeds automatically and display headline, date and link, and under what attribution.',
      'The RSS page states a permission without conditions; the UN-wide pages are narrower ("United Nations is advised", personal non-commercial use, no redistribution). Resolve which applies.',
      'The feed addresses were found by discovery on the official page but are not independently confirmed: run verify and confirm each address on the page.',
      'robots.txt for ungeneva.org has not been read for these feeds yet: the verify run must show it allows them. If it disallows or answers 403, the source stays unverifiable.',
      'No ungeneva.org copyright or terms page was found. Look for one in the site footer.'
    ],
    feeds: [
      { id: 'ungeneva-press-releases',     label: 'Press releases',     url: 'https://www.ungeneva.org/news-media/press-releases-list/rss.xml' },
      { id: 'ungeneva-meeting-summaries',  label: 'Meeting summaries',  url: 'https://www.ungeneva.org/news-media/meeting-summaries-list/rss.xml' },
      { id: 'ungeneva-press-conferences',  label: 'Press conferences',  url: 'https://www.ungeneva.org/news-media/press-conferences-list/rss.xml' },
      { id: 'ungeneva-briefings',          label: 'Briefings',          url: 'https://www.ungeneva.org/news-media/briefings-list/rss.xml' },
      { id: 'ungeneva-press-items',        label: 'All press items',    url: 'https://www.ungeneva.org/news-media/press-items-list/rss.xml' }
    ]
  },
  {
    id: 'bbc', sourceType: 'journalism', name: 'BBC News', hosts: ['bbc.co.uk', 'bbc.com'], feedHosts: ['bbci.co.uk'],
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
    id: 'dw', sourceType: 'journalism', name: 'DW (Deutsche Welle)', hosts: ['dw.com'], feedHosts: ['dw.com'],
    enabled: false, termsChecked: null,
    termsNote: 'NOT ESTABLISHED. Review of 2026-11-20: no DW terms of use or RSS licence text could be found. Feeds are publicly available and verified reachable, but that is not permission. Read DW\'s terms, or ask DW, before enabling.',
    feeds: [
      { id: 'dw-all',  label: 'All English news', url: 'https://rss.dw.com/rdf/rss-en-all' },
      { id: 'dw-asia', label: 'Asia',             url: 'https://rss.dw.com/rdf/rss-en-asia' },
      { id: 'dw-eu',   label: 'Europe',           url: 'https://rss.dw.com/rdf/rss-en-eu' }
    ]
  },
  {
    id: 'france24', sourceType: 'journalism', name: 'France 24', hosts: ['france24.com'], feedHosts: ['france24.com'],
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
    id: 'aljazeera', sourceType: 'journalism', name: 'Al Jazeera English', hosts: ['aljazeera.com'], feedHosts: ['aljazeera.com'],
    enabled: false, termsChecked: null,
    termsNote: 'NOT ESTABLISHED. Review of 2026-11-20 of aljazeera.com/terms-and-conditions: site use is "only for your own personal, non-commercial use"; copying or distributing needs "the express prior written permission of an authorised officer"; web scraping is prohibited; links must go to full content pages and must not be framed. It says nothing about RSS. Written permission is needed.',
    feeds: [
      { id: 'aj-all', label: 'All news', url: 'https://www.aljazeera.com/xml/rss/all.xml' }
    ]
  },
  // ======================= OFFICIAL CANDIDATES (added in Stage 7B, audit of 2026-11-27) =======================
  // All three are SWITCHED OFF and carry unresolved items in `blockers`. Verify mode may check them technically; nothing is shown on the page.
  {
    id: 'state', name: 'U.S. Department of State', sourceType: 'government', hosts: ['state.gov'], feedHosts: ['state.gov'],
    enabled: false, termsChecked: null,
    attribution: 'Source: U.S. Department of State (press release). No seal, logo, image or text is copied.',
    readOn: '2026-11-27',
    termsNote: 'CANDIDATE, NOT CLEARED. Government communications: shows what the U.S. government says, labelled as such, never presented as independently verified. Copyright text read 2026-11-27: "Unless a copyright is indicated, information on the Department of State Web Site is in the public domain and may be copied and distributed without permission"; citation of the Department as the source is "appreciated". Copyrighted photos and graphics need the original source\'s permission, and an archived copy of the policy says seals and logos need written permission: this dashboard copies neither. The text read says nothing about RSS or automated fetching.',
    reuse: 'Public domain unless a copyright is indicated; may be copied and distributed without permission; citation appreciated. Not covered: copyrighted photos/graphics, seals and logos.',
    automatedFetching: 'UNRESOLVED. Not addressed in the copyright text. The host\'s robots.txt is checked by the script at every run; the site\'s own terms were not readable during the audit.',
    feedAddressSource: 'Third-party feed directory (feeder.co listing, shown as working). Not confirmed on the official state.gov RSS page, which could not be read during the audit.',
    evidence: [
      { url: 'https://ceac.state.gov/ceac/Common/Copyright.aspx', what: 'Department copyright text (hosted on a State Department site other than www.state.gov; page shows no date)' },
      { url: 'https://feeder.co/discover/42270d2058/state-gov', what: 'Third-party listing of the feed address' }
    ],
    liveVerification: { date: '2026-11-27', source: 'GitHub Actions verify run reported by the project owner', result: 'robots.txt returned HTTP 403, so the feed was NOT requested. This is an access restriction and is not worked around.' },
    blockers: [
      'LIVE RESULT 2026-11-27: robots.txt on state.gov answered HTTP 403, so the feed was not requested. The script treats that as restricted. Do not enable until a later verify run shows robots.txt readable and the feed allowed (or the Department grants access in writing).',
      'Confirm the feed address with a verify run (it comes from a third-party directory, not from state.gov).',
      'Automated fetching is not addressed in the copyright text; read state.gov\'s own terms and the verify run\'s robots.txt result before deciding.',
      'The copyright text was read on ceac.state.gov, not www.state.gov: confirm the same wording applies to www.state.gov.'
    ],
    feeds: [
      { id: 'state-press', label: 'Press releases', url: 'https://www.state.gov/rss-feed/press-releases/feed/' }
    ]
  },
  {
    id: 'unnews', name: 'UN News', sourceType: 'international-organisation', hosts: ['news.un.org'], feedHosts: ['news.un.org'],
    enabled: false, termsChecked: null,
    attribution: 'Source: UN News. No image, audio, video or text is copied.',
    readOn: '2026-11-27',
    termsNote: 'CANDIDATE, NOT CLEARED. International organization communications: shows what the United Nations reports about itself and world events, labelled as such. UN News page read 2026-11-27: "We are very happy for you to use, feature and repurpose our content", asking for attribution to UN News and a link back, and for users to observe copyright on photos, graphics, audio and video; questions to unnews@un.org. The UN-wide terms of use (read as copied on a UN OCHA site, official copy not fetched) are narrower: personal, non-commercial use, no resale or redistribution, no derivative works. Neither text mentions RSS or automated fetching. Written confirmation from UN News is the safe route.',
    reuse: 'UN News page: use, feature and repurpose with attribution to UN News and a link back; observe copyright on photos, graphics, audio and video. UN-wide terms (secondary copy): personal non-commercial use, no redistribution or derivative works.',
    automatedFetching: 'UNRESOLVED. Neither the UN News page nor the UN-wide terms address RSS or automated retrieval.',
    feedAddressSource: 'Third-party listings (feedbagel.com, feeder.co). The official UN News RSS page (news.un.org/en/rss-feeds) was readable but exposed no feed addresses or usage terms to the audit.',
    evidence: [
      { url: 'https://news.un.org/en/content/navigate-news', what: 'UN News reuse statement and attribution request' },
      { url: 'https://news.un.org/en/rss-feeds', what: 'Official RSS page (no feed addresses or terms visible to the audit)' },
      { url: 'https://feedbagel.com/site/un.org', what: 'Third-party listing of feed addresses' },
      { url: 'https://feeder.co/ja/discover/ffc94cf9d0/news-un-org-en', what: 'Third-party listing of feed addresses' }
    ],
    liveVerification: { date: '2026-11-27', source: 'GitHub Actions verify run reported by the project owner', result: 'robots.txt disallowed all 6 configured feed addresses; none was requested and no bypass was attempted.' },
    blockers: [
      'LIVE RESULT 2026-11-27: UN News robots.txt disallowed all six configured feed addresses, so none was requested. The reuse wording on the UN News page does not override a robots.txt Disallow: only written permission from UN News, or an allowed address, could change this.',
      'Written confirmation from UN News (unnews@un.org) that automated RSS use on a public non-commercial dashboard is acceptable.',
      'The UN-wide terms are narrower than the UN News page (personal, non-commercial, no redistribution): resolve which applies.',
      'Feed addresses come from third-party listings: confirm them with a verify run and on the official UN News RSS page.',
      'The UN copyright wording "the United Nations is advised" (seen in a search snippet) may require notifying the UN: check it.'
    ],
    feeds: [
      { id: 'unnews-all',   label: 'All news',           url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml' },
      { id: 'unnews-peace', label: 'Peace and Security', url: 'https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml' },
      { id: 'unnews-eur',   label: 'Europe',             url: 'https://news.un.org/feed/subscribe/en/news/region/europe/feed/rss.xml' },
      { id: 'unnews-asia',  label: 'Asia Pacific',       url: 'https://news.un.org/feed/subscribe/en/news/region/asia-pacific/feed/rss.xml' },
      { id: 'unnews-amer',  label: 'Americas',           url: 'https://news.un.org/feed/subscribe/en/news/region/americas/feed/rss.xml' },
      { id: 'unnews-me',    label: 'Middle East',        url: 'https://news.un.org/feed/subscribe/en/news/region/middle-east/feed/rss.xml' }
    ]
  },
  {
    // The feed address is NOT known. Verify mode reads the EEAS home page once (after robots.txt) and prints any feed addresses it declares.
    // Those are only candidates: copy a verified one into `feeds` yourself. No EEAS feeds-page address is assumed here.
    id: 'eeas', name: 'EEAS (European External Action Service)', sourceType: 'eu-institution', hosts: ['eeas.europa.eu'], feedHosts: ['eeas.europa.eu'], discoverUrl: 'https://www.eeas.europa.eu/',
    enabled: false, termsChecked: null,
    attribution: 'Source: European External Action Service. No image, logo or text is copied.',
    readOn: '2026-11-27',
    termsNote: 'CANDIDATE, NOT CLEARED, NO FEED ADDRESS YET. EU institutional communications: shows what the EU\'s diplomatic service says, labelled as such. Legal notice read 2026-11-27: "Reuse is authorised, provided the source is acknowledged"; individual notices may add conditions, and documents under third-party intellectual property rights are excluded. The notice says nothing about RSS, crawlers or automated fetching.',
    reuse: 'Reuse authorised provided the source is acknowledged; third-party IP excluded; conditions in individual notices may apply.',
    automatedFetching: 'UNRESOLVED. The legal notice does not mention RSS, bots, crawlers or scraping.',
    feedAddressSource: 'None established. Only old-style "EEAS RSS Feeds" pages turned up in the audit; no current official feed address was confirmed.',
    evidence: [
      { url: 'https://www.eeas.europa.eu/eeas/legal-notice_en', what: 'EEAS legal notice (reuse statement)' }
    ],
    liveVerification: { date: '2026-11-27', source: 'GitHub Actions verify run reported by the project owner', result: 'Home-page discovery found zero candidate feeds. robots.txt asked for a 10-second crawl delay, which was respected.' },
    blockers: [
      'LIVE RESULT 2026-11-27: discovery on the EEAS home page found zero candidate feed addresses (the 10 s Crawl-delay in robots.txt was respected). No feed exists to test.',
      'No official feed address is known: run verify, read the candidates it prints from the EEAS home page, and confirm one on an official EEAS page before adding it to feeds.',
      'Automated fetching is not addressed in the legal notice; check robots.txt (verify prints it) and ask the EEAS if unsure.'
    ],
    feeds: []
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
