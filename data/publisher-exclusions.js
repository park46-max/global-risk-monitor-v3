// PUBLISHER EXCLUSION LIST (Stage 10.2). One file, read by BOTH the Node scripts and the browser, so the two can never disagree.
//
// WHAT IT DOES: an article whose address, publisher, domain or headline credit matches an entry below is dropped BEFORE it is written to any
// public cache (news.json, news-gdelt.json, news-rss.json, briefs.json, risk.json) and again when the page displays the cached files.
// WHAT IT DOES NOT DO: it is not an approval list. A publisher that is NOT listed here is NOT necessarily licensed, approved or checked.
// The right to show publisher headlines has not been established (see docs/LICENSING-AND-ATTRIBUTION.md). This list only removes publishers
// the owner has chosen to exclude, and publishers whose terms were found restrictive or could not be read.
// It does not, and cannot, detect a listed publisher's story republished on an unlisted domain unless the headline carries the credit
// (the "titleSuffixes" below).
//
// HOW TO ADD A PUBLISHER: add an object to "publishers" (valid JSON only: double quotes, no comments inside the braces), then run the three
// update workflows once (see README, "Refreshing the public caches"). To remove a publisher from the list, delete its object: do this only
// after reading that publisher's terms yourself.
// Matching is case-insensitive. A domain also matches its subdomains (example.com matches news.example.com).
window.PUBLISHER_EXCLUSIONS = {
  "version": 1,
  "updated": "2026-11-28",
  "publishers": [
    {
      "id": "aljazeera",
      "name": "Al Jazeera",
      "domains": ["aljazeera.com", "aljazeera.net", "aje.io", "ajplus.net"],
      "names": ["al jazeera", "al jazeera english", "aljazeera"],
      "titleSuffixes": ["al jazeera", "al jazeera english"],
      "rssIds": ["aljazeera"],
      "reason": "Precaution chosen by the project owner. The project's own earlier review (docs/rss-source-permissions.md and the README) recorded that Al Jazeera's terms prohibit non-personal use without permission. The extra domains (aljazeera.net, aje.io, ajplus.net) are Al Jazeera properties believed by the author but not independently verified.",
      "decided": "2026-11-28"
    },
    {
      "id": "dw",
      "name": "DW (Deutsche Welle)",
      "domains": ["dw.com", "dw.de"],
      "names": ["dw", "dw.com", "deutsche welle", "dw news"],
      "titleSuffixes": ["dw", "dw.com", "dw news"],
      "rssIds": ["dw"],
      "reason": "Excluded as a precaution because DW's terms of use could not be retrieved or read (the earlier permissions review also lists them as not fetched). To be reviewed by the owner; do not remove this entry until DW's terms have been read.",
      "decided": "2026-11-28"
    }
  ]
};
