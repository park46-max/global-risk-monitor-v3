# RSS source permissions: evidence and open items

**Audit date: 2026-11-27.** This file records what was read, where, and what is still unresolved for each official candidate.
It is documentation, not legal advice. **Technical verification is not legal permission: a feed that answers and parses says nothing about whether you may republish it.**
Nothing in this file, and nothing in the verify run, sets `enabled` or `termsChecked`. Only you edit `data/rss-sources.mjs`.

How to read the status column:

- **Not cleared**: switched off, with unresolved items in the publisher's `blockers` list. The script refuses it even if you set `enabled: true` and a `termsChecked` date, until you delete the blockers you have resolved.
- Evidence links marked *third party* are directories or mirrors, not the publisher. They show that an address exists, not that you may use it.

## What may be displayed once a source is enabled (all candidates)

Original headline, source name, source classification, publication date if the feed gives one, and a direct link to the original publication.
No article body, description, image, logo or government seal is stored or shown (`tests/test-official-sources.mjs` checks the stored fields).
Existing country matching, relevance filtering and duplicate rules still apply. Official items are labelled, listed apart from publisher reporting, never grouped with another publisher's headline (so never shown as "also reported by"), kept out of the country briefs for now, and the risk assessment does not read the RSS cache at all.

## Source classification used on the page

| Type (`sourceType`) | Label on the page | Used for |
|---|---|---|
| `government` | Government communications | U.S. Department of State |
| `international-organisation` | International organization communications | UN News (and UN Geneva, which has no feed addresses yet) |
| `eu-institution` | EU institutional communications | EEAS |
| `journalism` | Publisher reporting | BBC, DW, France 24, Al Jazeera (all still disabled) |

An official communication states that body's own position or account. It is not independently verified here and is not independent corroboration of other reports.

## U.S. Department of State (government communications)

| Item | Finding |
|---|---|
| Config id / status | `state`, **not cleared**, disabled |
| Feed candidate | `https://www.state.gov/rss-feed/press-releases/feed/` |
| Where the address comes from | Third-party directory ([feeder.co](https://feeder.co/discover/42270d2058/state-gov), shown as working). The official state.gov RSS page could not be read during the audit. |
| Reuse conditions | Copyright text: "Unless a copyright is indicated, information on the Department of State Web Site is in the public domain and may be copied and distributed without permission." Citation of the Department as the source is "appreciated". Copyrighted photos and graphics need the original source's permission. An archived copy of the policy (URL not recorded) says seals and logos need written permission; this dashboard shows none. |
| Evidence | [Copyright text](https://ceac.state.gov/ceac/Common/Copyright.aspx), read 2026-11-27. It is hosted on a State Department site other than www.state.gov and shows no date. |
| Attribution | "Source: U.S. Department of State (press release)" plus the link. |
| Automated fetching | **Unresolved.** Not addressed in the text read. The script reads robots.txt before every run and does not request a disallowed address. |
| Auth / cost | None seen. |
| Open items | Confirm the feed address with a verify run; read state.gov's own terms on automated access; confirm the same copyright wording applies on www.state.gov. |

## UN News (international organization communications)

| Item | Finding |
|---|---|
| Config id / status | `unnews`, **not cleared**, disabled |
| Feed candidates | `https://news.un.org/feed/subscribe/en/news/all/rss.xml`; `.../news/topic/peace-and-security/feed/rss.xml`; `.../news/region/{europe, asia-pacific, americas, middle-east}/feed/rss.xml` (full addresses in the config) |
| Where the addresses come from | Third-party listings ([feedbagel.com](https://feedbagel.com/site/un.org), [feeder.co](https://feeder.co/ja/discover/ffc94cf9d0/news-un-org-en)). The [official UN News RSS page](https://news.un.org/en/rss-feeds) showed no feed addresses or usage terms to the audit. |
| Reuse conditions | [UN News](https://news.un.org/en/content/navigate-news): "We are very happy for you to use, feature and repurpose our content", with attribution to UN News and a link back; observe copyright on photos, graphics, audio and video; contact unnews@un.org with doubts. The UN-wide terms of use (read as copied on a UN OCHA site; official copy not fetched) are narrower: personal, non-commercial use, no resale or redistribution, no derivative works. A search snippet of the UN copyright page says news material may be used with credit "and the United Nations is advised". |
| Attribution | "Source: UN News" plus the link. |
| Automated fetching | **Unresolved.** Neither text mentions RSS or automated retrieval. |
| Auth / cost | None seen. |
| Open items | Written confirmation from UN News; resolve the broader-versus-narrower terms; confirm feed addresses; check whether the UN must be advised. |

## EEAS (EU institutional communications)

| Item | Finding |
|---|---|
| Config id / status | `eeas`, **not cleared**, disabled, **no feed address yet** |
| Feed candidate | None. Verify mode reads `https://www.eeas.europa.eu/` once (after robots.txt) and prints feed addresses the page declares. Those are candidates only. |
| Reuse conditions | [Legal notice](https://www.eeas.europa.eu/eeas/legal-notice_en), read 2026-11-27: "Reuse is authorised, provided the source is acknowledged." Conditions in individual notices may apply; documents under third-party intellectual property rights are excluded. |
| Attribution | "Source: European External Action Service" plus the link. |
| Automated fetching | **Unresolved.** The notice does not mention RSS, bots, crawlers or scraping. |
| Auth / cost | None seen. |
| Open items | Find and confirm an official feed address; check robots.txt (verify prints it); ask the EEAS if unsure about automated use. |

## Sources that stay disabled

Reuters (no official public feed since 2020; archived terms forbid copying, scraping and caching), BBC News, DW, France 24 and Al Jazeera. Their terms are unclear or point against this use; see the notes in `data/rss-sources.mjs`. No change was made to them except adding `sourceType: 'journalism'`.

## What the verify run reports (and what it does not do)

For every feed: HTTP status, requested and final address (redirects only within the publisher's own hosts), RSS 1.0 / RSS 2.0 / Atom, number of valid entries, how many entries have a headline, an address on the publisher's own site and a publication date, newest and oldest date, the robots.txt result, any `X-Robots-Tag` header, and any access restriction or error. It also prints the source type and, for a source with unresolved items, only counts: **no headline text** is printed or put in the run summary.

It does not: write the public cache, enable a source, fill in `termsChecked`, retry around a 403 or 401, request a feed that robots.txt disallows or whose robots.txt cannot be read, or follow a redirect to another host.

## Limits of the checks

- robots.txt is checked for the configured address, not for each redirect hop.
- The reading of robots.txt follows the useful part of RFC 9309; unreadable files are treated as restrictive (the feed is not requested).
- Pages that could not be fetched during the audit (official state.gov and UN feed pages, DW terms, BBC terms) are listed above as such. Re-read them yourself before approving a source.
- An official site reached through GDELT (a state.gov or un.org article) is not given a source type, because GDELT items are left as they were; it keeps its existing outlet label and can still be grouped with other headlines.
