# Global Risk Monitor v3 (Stage 2: real data integration)

A free, static website for GitHub Pages. No servers, no paid services, no API keys, no AI services.

| Stage | What it adds | Status |
|---|---|---|
| 1 | 3D globe, country search and buttons | Built, design approved |
| 2 | GitHub Action that fetches GDELT news and World Bank indicators on a schedule and saves them as JSON in `data/cache/` | **Built, not yet run against the real APIs** (see "What has and has not been tested") |
| 3 | Sourced country briefs (facts, reported events, analysis kept separate) | Not started |

Until the Action has run once, the News and Country data panels say **Unavailable** because `data/cache/news.json` and `indicators.json` do not exist yet. That is intentional: nothing is faked.

## How the data flows
```
GDELT API ----\                                   (every 6 hours: news; weekly: indicators)
               >  GitHub Action  ->  data/cache/*.json committed to your repo  ->  GitHub Pages  ->  your browser
World Bank ---/   scripts/fetch-data.mjs
```
Your browser only ever reads the JSON files from your own site. It never calls GDELT or the World Bank.

## Folder map
```
index.html, css/, js/               the website (globe design is unchanged since Stage 1)
data/rss-sources.mjs                publisher RSS feeds and country-matching words (every publisher is OFF)
data/countries.js                   the five countries: colours, camera, GDELT search queries, sourced entries
data/cache/                         JSON written by the Action (starts empty)
scripts/fetch-data.mjs              the GDELT + World Bank fetcher (Node 18+, no packages to install)
scripts/fetch-rss.mjs               the official/publisher RSS fetcher, with verify mode and feed discovery
scripts/fetch-gdelt-files.mjs       reads GDELT's open 15-minute data files (verify mode too)
scripts/http-lib.mjs                the safe download code shared by both (https only, host allowlist, every redirect checked)
scripts/zip-lib.mjs                 tiny ZIP reader (no packages)
scripts/rss-lib.mjs                 RSS parsing, dates, duplicates, country matching
tests/test-fetch.mjs                SIMULATED tests for the GDELT/World Bank fetcher (no internet needed)
tests/test-rss.mjs                  SIMULATED tests for the RSS pipeline (no internet needed)
tests/test-gdelt-files.mjs          SIMULATED tests for the GDELT file pipeline (no internet needed)
.github/workflows/update-data.yml   GDELT + World Bank schedule
.github/workflows/update-rss.yml    official RSS + GDELT files (manual only until you enable its schedule)
.nojekyll                           tells GitHub Pages to serve files as they are
vendor/                             optional: your own copy of globe.gl
```
Keep your older `global-risk-monitor` (v1) and `global-risk-monitor-v2` folders as backups. v3 never touches them.

## Part 1: Put it on GitHub (free, no credit card)
GitHub Pages and Actions are free for **public** repositories. Everything here is public data, so that is fine.

1. Create a free account at github.com.
2. Click **New repository**. Name it `global-risk-monitor`, choose **Public**, click **Create repository**.
3. Unzip the project on your Mac. Click **uploading an existing file** on the new repository page and drag in everything **inside** the unzipped folder, **except the `.github` folder** (Finder hides it; press Cmd+Shift+. to show hidden files). Click **Commit changes**.
4. Add the workflow file in the browser, because the web uploader often skips hidden folders:
   1. Click **Add file > Create new file**.
   2. In the name box type exactly `.github/workflows/update-data.yml` (typing each `/` creates a folder).
   3. Open `update-data.yml` from the unzipped folder in a text editor, copy everything, paste it into the big box, and click **Commit changes**.
5. Also make sure `.nojekyll` and `data/cache/.gitkeep` exist in the repository. If not, use **Add file > Create new file** and create each (empty content is fine; for the second, type the name `data/cache/.gitkeep`).
6. Go to **Settings > Pages**. Under **Build and deployment** choose **Deploy from a branch**, branch **main**, folder **/ (root)**, **Save**.
7. Go to **Settings > Actions > General**, scroll to **Workflow permissions**, choose **Read and write permissions**, **Save**.

Your site will be at `https://YOUR-USERNAME.github.io/global-risk-monitor/` after one to three minutes.

## Part 2: Run the Action for the first time
1. Click the **Actions** tab. If GitHub asks you to enable workflows, click the green button.
2. Click **Update data cache** in the left list, then **Run workflow**, choose `all`, and click the green **Run workflow** button.
3. Wait about two to five minutes. (Indicators take about a minute. News asks GDELT for one country at a time with an 8-second pause. If GDELT is refusing requests the script gives up early; see "GDELT rate limits and reliability" below.) The optional **force** box makes the script ask GDELT even when the cached news is less than 5 hours old; leave it unticked normally.
4. Refresh the page after Pages rebuilds (one to two minutes after the run finishes).

## Part 3: How to check the data is real (do all of these once)
1. **Run result.** On the Actions tab open the latest run. A green tick means at least some data was fetched. A red cross means a whole dataset failed (the run is deliberately marked failed so you notice). Either way open the run, click the **Summary** at the top, and you will see lines like `USA: ok (18 articles)` or `TWN: error - ...`. Open the **Fetch data** step to see the full log.
2. **Taiwan.** In the same run, open the step **Check World Bank country codes**. It prints the World Bank's own answer for each code, including `TWN`. This is the real answer to "does the World Bank publish Taiwan data". I could not check it myself (see below). The site shows whatever this step reports: either values, or an explicit "not published" message. It never substitutes China or any other country.
3. **The files.** In your repository open `data/cache/news.json`. You should see `"source": "GDELT DOC 2.0 API"`, a recent `lastSuccessAt`, and per country a list of articles with `title`, `url`, `domain`, `seendate`. The commit that wrote it is made by `github-actions[bot]`.
4. **Click through.** Open the site, select a country, click three headlines. Each should open the real article on the publisher's site, and the publisher shown should match.
5. **Cross-check one number.** Open `data/cache/indicators.json`, find USA `NY.GDP.MKTP.CD` and note `value` and `year`. Then open https://data.worldbank.org/indicator/NY.GDP.MKTP.CD?locations=US and compare the value for that same year.
6. **Cross-check GDELT (optional).** Paste this into your browser (it works for a human, it just may be refused by your browser if you ask too often): `https://api.gdeltproject.org/api/v2/doc/doc?query=Taiwan%20sourcelang:english&mode=artlist&maxrecords=5&format=json&sort=datedesc&timespan=7d`. You should see recent articles, similar to those on the site.
7. **Header pills on the site.** Green "Updated" means the latest fetch succeeded. Amber means stale or a failed refresh. Red means unavailable. Hover a pill to see exact UTC times.

## What the site shows in each state
| State | What you see |
|---|---|
| **Fresh** (latest fetch succeeded) | Green "Updated 2 h ago"; times in tooltips and under the panels |
| **Cached** (refresh failed or was skipped, older data kept) | Amber "Cached, last success X ago" plus red "Latest refresh failed" or "Refresh skipped", the reason, and the earlier articles/values |
| **Unavailable** (nothing ever fetched successfully) | Red "No successful update yet" and the reason; no content, nothing invented |
| Refresh not attempted (circuit breaker or time budget) | Red "Refresh skipped" with the reason, e.g. "GDELT kept refusing or timing out" |
| Older than the threshold | Amber "Stale" (news after 24 h, indicators after 10 days; change in `js/config.js`) |
| GDELT found nothing | "GDELT returned no articles..." (a valid result, not an error) |
| No indicator published | "No value published" for that row |
| Unsupported country code (expected for Taiwan) | Red "Not published by the World Bank", explicit message, nothing substituted |
| Cache files missing | "Unavailable" with the reason (before the first Action run) |

## GDELT rate limits and reliability
**What happened on your first real run:** all five GDELT requests failed (four rate-limit replies and one connection timeout), even though the script spaced requests 6 seconds apart. The requests themselves look correctly formed: GDELT answers a malformed query with a different message (for example "The specified phrase is too short"), and it answered these with its rate-limit message instead. GDELT's own blog says the DOC API is rate limited to protect its search servers, which see heavy load around major events, but it does not publish exact limits. Whether GitHub's shared network addresses are being throttled is my hypothesis; I cannot confirm it.

**What the script does now**
- Asks for each country only if its last successful fetch is older than 5 hours (`GDELT_MIN_AGE_HOURS`) or was for a different query. Normal runs make 5 requests, not 15.
- Retries at most twice, waiting about 20 s, then about 40 s (doubling, with random jitter, capped at 90 s), and never less than a `Retry-After` header asks for.
- Stops asking after 2 countries in a row end in rate-limit, timeout or network errors, so a throttled run makes at most 6 requests instead of 15. The skipped countries are marked "Refresh skipped" with the reason.
- Never spends more than 8 minutes on news, and tries the stalest countries first.
- Fetches World Bank indicators first, so GDELT trouble cannot delay or block them.
- A failed country keeps its earlier articles (labelled cached) or shows nothing. The run still ends red so you notice.

**Is GDELT reliable enough?** For this project, as the *only* news source, probably not: it is a free research service with no uptime guarantee and no published limits, and a failed refresh just means older or no headlines. It is acceptable as an optional source if you accept stale or missing news on some days. I cannot judge its long-run reliability from one failed run; watch the Actions history for a week or two.

**Practical alternative (not built yet):** publisher RSS feeds (for example BBC World, Al Jazeera, DW, France 24). They need no key or card, give a real headline, link, date and publisher, and are stable. Trade-offs: you get each outlet's general world feed, so the script would filter by country keywords rather than run a country search, coverage is limited to the outlets you choose, and I have not verified the feed addresses or each outlet's terms of use. Keyed free-tier news APIs (such as GNews or NewsData.io) are another option, but they need a free signup and a key stored as a GitHub secret, and I have not verified their current free-tier terms. I can add RSS as a second labelled source next to GDELT if you want it.

## Where the news comes from (read this first)
The dashboard has three separate news sections. Each has its own cache file, its own status pill, and its own failure handling, so one failing never hides or erases another. Risk assessments are a different panel and are never mixed with news; no risk score is generated anywhere.

| Section | How it works | Permission (read 2026-11-20) | Status |
|---|---|---|---|
| **Official and publisher feeds (RSS)**: UN Geneva first | `update-rss.yml` reads RSS feeds from sources you have switched on | **UN Geneva: stated.** Its RSS page says: "You can also use our RSS feeds to display the latest news from UN Geneva on your own website or personal page." That page lists no copyright or attribution conditions and no feed addresses. The separate UN Geneva *newsroom* site has its own terms (editorial use; acknowledge the United Nations as provider); I did not assume they apply to ungeneva.org. The dashboard shows headline, date and link only, credits UN Geneva, and uses no images. | OFF. Feed addresses unknown until you run verify (it discovers candidates). |
| **GDELT open data files** | `update-rss.yml` downloads the newest few 15-minute GKG files, keeps articles whose headline names a country | **Verified quote** from gdeltproject.org/about: datasets are "available for unlimited and unrestricted use ... without fee", may be redistributed, and "any use or redistribution of the data must include a citation to the GDELT Project and a link to this website". The page shows that citation and link. These terms cover GDELT's datasets; the headlines inside were written by publishers, so each article shows its publisher's domain and links straight to the original. | Not yet run. The file layout is assumed (see below); verify mode checks it. |
| **GDELT search API (secondary)** | `update-data.yml`, unchanged | Same GDELT terms. | Failing from GitHub earlier (rate limits); kept as a fallback. |
| ReliefWeb | **Not built.** | Needs a pre-approved `appname` ("Every API URL needs a pre-approved appname"; you request it with a form and ReliefWeb replies by email). Its terms say materials may be owned by their original sources, and I could not read the full Terms & Conditions. I will not assume permission. | Action needed from you (below). |
| BBC, DW, France 24, Al Jazeera | RSS code exists | Reuse rights **not established** (see the permissions review below). | OFF. |

**Why the GDELT files may be more reliable than the search API (a hypothesis, untested):** the search API runs a query on GDELT's search servers and is rate limited. The file route downloads a few static files from a different host and does the matching itself, so it sends no search queries. Real behaviour from GitHub is unknown until you run verify. Be aware that each file is large (the script limits a file to 80 MB zipped) and a run reads up to 12 of them.

**What is assumed about the GDELT files and checked only by verify:** that `https://data.gdeltproject.org/gdeltv2/lastupdate.txt` and `<timestamp>.gkg.csv.zip` exist under that path, that each record has 27 tab-separated columns, and that the last column contains a `<PAGE_TITLE>` tag. The tag was not documented in the pages I could read. If it is absent, verify says so and the route shows nothing (it never invents a headline).

### ReliefWeb: what you would need to do
1. Request an appname with the form linked from https://apidoc.reliefweb.int/ and wait for ReliefWeb's email.
2. Read the ReliefWeb Terms & Conditions, especially the limits on reusing content, and decide whether a public portfolio dashboard is allowed.
3. If both are fine, tell me the approved appname and the conditions, and I will add it as another switched-off source with the same verify step.

## Publisher RSS feeds (optional news source, OFF until you switch it on)
Four publishers are supported: BBC News, DW, France 24 and Al Jazeera English. **All four are switched off.** Nothing is copied from any publisher until you have (1) verified the feeds work and (2) read that publisher's terms and decided you are allowed to show their headlines and links. Free access does not by itself mean permission to republish.

**What is copied:** headline, link, publisher name, publication date. Never summaries or article text. A feed's summary is read only to look for country names and is not stored.

**It is separate from GDELT.** It has its own workflow (`update-rss.yml`) and its own file (`data/cache/news-rss.json`). A GDELT failure cannot block or erase RSS news, and an RSS failure cannot affect GDELT or the World Bank data. The page shows each source in its own section with its own status.

### Permissions review (2026-11-20): nothing is established, so everything stays OFF
This is what I could actually read, and what I could not. It is not legal advice.

| Publisher | Feed reachable from GitHub (your verify run) | What the terms say (source) | Permission for a public non-commercial dashboard |
|---|---|---|---|
| BBC News | Was blocked by my own host check (fixed, see below); not yet re-verified | BBC's official RSS terms page could not be read (blocked from my environment). Second-hand only: a directory site says feeds are allowed on personal sites if unchanged, credited and linked, with permission needed for business use. An unofficial, undated copy of BBC terms says content from bbc.co.uk needs permission, making money from BBC content is prohibited and business use needs permission first. | **Not established.** Unclear whether a public portfolio counts as "business use". |
| DW | Yes (3/3) | No DW terms or RSS licence text found. | **Not established.** Reachable is not permitted. |
| France 24 | 3 of 4 (main feed HTTP 403) | France Medias Monde legal notice (covers france24.com), read on 2026-11-20: use limited to "personal and private"; reproducing or collecting content without authorisation forbidden; creating hyperlinks to the sites implies you hold the necessary authorisations. Nothing specific on RSS. | **Not established**, and the wording leans against it without written permission. |
| Al Jazeera English | Yes (1/1) | aljazeera.com/terms-and-conditions, read on 2026-11-20: "only for your own personal, non-commercial use"; copying or distributing needs "express prior written permission"; web scraping prohibited; links must go to full content pages and must not be framed. Nothing on RSS. | **Not established.** Written permission needed. |

**Verified:** which feeds were reachable (your run), and the quoted terms above for France 24 and Al Jazeera (I read those pages). **Assumptions/unverified:** everything about BBC's RSS terms, and the existence of any DW terms. "Free to access" and "personal, non-commercial site" do not by themselves give permission to show a publisher's headlines and links. Your options: read the BBC and DW pages yourself, email each publisher and ask for written permission (keep the reply), or use a source with an explicit reuse licence. Only after one of those, set `enabled: true` and `termsChecked`.

### BBC redirect fix, and redirect safety
Cause: the config only allowed BBC's *article* host (`bbc.co.uk`), but BBC serves its *feeds* from `feeds.bbci.co.uk`, so my check refused BBC's own feed host. I could not test against the real BBC; the fix is only simulated. The config now has a separate `feedHosts` list for each publisher (BBC: `bbci.co.uk`). Article links are still accepted only on `hosts`.

The redirect handling is stricter than before, not looser. The script used to let the library follow redirects and only check the final address afterwards, which meant it had already contacted the target. Now it follows redirects by hand, at most 3, and checks **every address before requesting it**: https only, no user name or password, no port other than 443, no IP addresses, and the host must be one of that publisher's `feedHosts`. A publisher without `feedHosts` is refused. I did not add any wildcard or "allow all redirects" setting.

### France 24 main feed (HTTP 403)
I could not reach France 24 from my environment, so I cannot see the cause. A third-party monitor (feeder.co) lists the same address as working, and your other three France 24 feeds returned 200 with the same request headers, so a global block of the script's identity is unlikely. A bot-protection rule on that path or address range is plausible but unconfirmed. I did **not** disguise the script as a browser to get around it, since a 403 is the site refusing the request. That feed is set to `skip` (not requested in fetch mode; verify still tries it once). If you ever enable France 24, re-run verify later; if it is still 403, leave it skipped.

### Step 1: verify (nothing is switched on, nothing is written)
The one workflow now checks both the RSS sources and the GDELT files. Choose mode = **verify**, sources = **all**. For UN Geneva it also prints "feed discovery" candidates: addresses found on its RSS page. Copy the ones that look like news feeds into the `feeds: []` list of the `ungeneva` entry in `data/rss-sources.mjs` (same format as the others), commit, and run verify again to confirm they read correctly.
1. Upload the new files (see "Files to add or replace" in the update instructions) and commit.
2. **Actions → Update RSS news → Run workflow**, keep mode = **verify**, click **Run workflow**. (The button only appears once the file is on your main branch.)
3. Open the run and read the **Run the RSS script** step and the **Summary** page. Each feed shows `OK` or `FAIL` with a reason, how many entries it has, its newest item date, how many items have no date, how many point outside the publisher's own website, and how many headlines matched each country, plus two sample headlines to eyeball.
4. If it says **"NONE of the feeds could be verified"** the run turns red. That is the honest answer: the RSS system is not operational and you should tell me the error text.
Verify mode proves only that a feed is reachable and readable from GitHub's servers. It does **not** check usage terms.

### Step 2: terms
For each publisher you want, read their terms of use yourself. Then edit `data/rss-sources.mjs` (on GitHub: open the file, pencil icon) and for that publisher change
```
enabled: false, termsChecked: null,
```
to
```
enabled: true, termsChecked: '2026-11-21',
```
(use the date you read the terms) and rewrite `termsNote` with what you concluded. The script **refuses** a publisher that is enabled without a `termsChecked` date. The BBC note in the file is a second-hand summary of their terms (feeds allowed on personal sites if unchanged, credited and linked; permission needed for business use). Please read the BBC's own terms before relying on it. I found no terms text for the other three.

### Step 3: first real fetch
Run the workflow again with mode = **fetch**. Check the Summary page (feeds updated, new articles, duplicates ignored), then open `data/cache/news-rss.json` in the repository and confirm the headlines and links are real by clicking a few. Reload your site.

### Step 4: turn on the schedule (only after step 3 looks right)
In `.github/workflows/update-rss.yml`, remove the `# ` in front of the two `schedule:` lines (`schedule:` and the `- cron:` line under it) and commit. It then runs every 3 hours.

### How articles are matched to a country
Plain word matching on the **headline only**, not understanding. The word lists are in `data/country-terms.mjs` and are shown on the page under each list. Whole words only (so "Chinatown" does not match China), case-insensitive except short terms like "US" that must be upper case (so "let us talk" does not match).
- **Country named in headline**: the headline contains the country's name or demonym (China, Chinese, United States, U.S., US, USA ...).
- **Capital or government body named in headline**: no country name, but a capital or a body such as Beijing, Kremlin, White House, Pentagon. Labelled separately because it is a weaker signal.
- **Mentioned in feed summary only** (RSS only): collapsed and labelled weaker; the summary is read but never stored.
- **People are never matching words.** "Trump", "Putin", "Xi Jinping" and "Zelensky" are not terms, so a headline naming only a leader matches no country. A test (`tests/test-relevance.mjs`) fails if a person's name is added. "Washington" alone, "America", "Congress", "Georgia" and "Hong Kong" are also not used because they are ambiguous or contested.
The page never says an article is "about" a country, only what matched.

### How headlines are ranked, filtered and grouped
Rules are plain word lists in `data/relevance-rules.mjs`; no AI and no paid service. To see exactly how one headline is judged: `node scripts/explain-headline.mjs "your headline"`.
- **Ranking:** security (3), diplomacy (3), sanctions and trade (3) and economic policy (2) each add their weight once if a word from that topic is in the headline; +1 for two or more topics; +1 for two monitored countries in one geopolitical headline. 3 or more is "high", 1-2 "medium". Headlines with no topic word are listed in a collapsed "Other headlines" section. Each shown article lists its topic words.
- **Routine financial notices** (fund NAV updates, ETF holdings, dividends, price targets, earnings and similar) are filtered unless a geopolitical signal is present: "strong" product words are filtered unless a security, diplomacy or sanctions/trade word is also present; "weak" words (ETF, earnings, shares jump) are filtered only when there is no topic word at all. So "iShares China ETF net asset value update" is filtered, while "Sanctions on Russia hit energy ETF" and "China ETF inflows jump after Beijing unveils stimulus" stay. Filtered headlines are not deleted: they are listed in a collapsed "Filtered out" section with the reason (the newest 30 are kept for this audit).
- **Duplicates:** headlines that share most of their words (a trailing " - Publisher" and word order are ignored; at least 4 words; published within 48 hours; same country) are grouped. One is shown, the others appear as "Also reported by", each with its own original link.
- Every run re-judges all cached articles with the current rules, so changing a rule also corrects articles cached earlier.
- **Trade-offs:** word lists can be wrong ("war" in "price war", "China" in "Bank of China"); a story that names a leader but no country is not matched; the noise filter can hide a genuine item (hence the audit list); grouping can occasionally merge two different stories or miss a paraphrase. Edit the lists and run `node tests/test-relevance.mjs`.

### Duplicates, dates and freshness
- The same article (same link after removing tracking parameters, or same headline at the same publisher) is kept once. The same story at different publishers is grouped (see above), each source still credited and linked.
- Dates come only from the feed. A missing, unreadable or future-dated value is shown as "Publication date not provided by the feed". Nothing is guessed.
- Articles older than 7 days are dropped. If a feed fails, its earlier articles stay and are labelled **Cached: feed refresh failed**; one failing feed never stops the others. If every feed fails the run turns red.
- Feeds only keep their latest items, so each country may often show few or no articles. "No headline names this country" only describes these feeds, not the world.

## News quality rules (Stage 5)

Everything here is fixed word rules on the headline. No AI, no paid service, nothing is fact-checked. Rules live in `data/relevance-rules.mjs` and `data/source-quality.mjs`; try one headline with `node scripts/explain-headline.mjs "headline" [article link]`.

- **Primary, shared or incidental country.** A country named in a headline is not always what the story is about. *Shared* = two or more monitored countries are named (US-China, Russia-Ukraine, Taiwan Strait), or another country is named first but the headline has a security, diplomacy or sanctions/trade word. *Incidental* = another country is named first, the monitored one is not among the first three words and there is no such word, or the name is only a descriptor ("US-based"). Everything else is *primary*. Incidental items are not deleted: the page lists them under "Mentioned in passing", and the briefs leave them out and say how many.
- **Off-topic filtering.** Sport, entertainment and local-crime words filter a headline only when it has no security, diplomacy or sanctions/trade topic. Filtered items stay visible in the "Filtered out" list with the words that caused it.
- **Duplicates.** Same-word grouping as before, plus: demonyms and plurals are normalised ("Russian strikes" = "Russia strike"); a headline that is another one plus a few words is grouped; headlines with different numbers, or that each name a different country, are never merged. The representative is the highest-scoring article, then an established outlet, then the earliest. Every other source stays listed with its link.
- **Source labels (conservative, not a blacklist).** *Established outlet*, *state-owned or government-run outlet* (an ownership label that applies to every country alike) or *not assessed* (the default; it does not mean unreliable). A label describes the outlet from its domain, never a headline, and a headline is **not** thereby fact-checked. Labels never hide an article and never change a score; they only break ties between otherwise equal duplicates. The lists are short, were compiled from general knowledge and are not checked against any registry, so review them. Criteria and limits are written at the top of `data/source-quality.mjs`.
- **Sensational wording.** Clickbait phrases, "!" or mostly capital letters lower a headline's score by 1 and are shown on the page. The headline is still listed.
- **Limits.** Word position is a rough proxy, so some roles will be wrong; a mixed headline can slip past the off-topic filter; paraphrased duplicates ("kills five" / "kills 5") are not caught. Old cached articles are re-judged on the next fetch.
- **Not changed:** risk scoring and caches, World Bank and UCDP fetching, workflows, RSS settings, the GDELT search API fallback, the globe and the styles.
- **Tests:** `node tests/test-news-quality.mjs` (88 simulated checks across all five countries). No real feed was contacted and nothing was run on GitHub or the live site.

## The secondary GDELT search-API section (Stage 6)

The open-data section stays the primary, expanded news source. The older GDELT search-API section (cache `data/cache/news.json`, written by `scripts/fetch-data.mjs`) is now secondary:

- **Collapsed by default.** The header line is always visible and shows three chips: *Last success* (green only when the latest refresh succeeded and the data is under 24 hours old), *Latest refresh* (all OK, or how many countries failed or were not attempted) and *Cached data in use* (countries whose articles come from an earlier run). Your open/closed choice is kept while you switch countries.
- **Compact warning.** When a refresh failed or the data is stale, a one-line warning stays visible under the header, even when collapsed, with an "Error details" list of the real error text per country. It says whether cached articles are being shown and when the last success was. If there is no cached data it says that and shows nothing instead.
- **Same rules as the open-data section.** The page loads the project's own rule files (`data/country-terms.mjs`, `data/relevance-rules.mjs`, `data/source-quality.mjs`, `scripts/relevance-lib.mjs` through `scripts/secondary-lib.mjs`), so country matching and role, topic scoring, off-topic and financial filtering, duplicate grouping and outlet labels are the same code, not a copy. Filtered and "in passing" items stay in labelled folds, and a headline that names none of the five countries (the search matches words anywhere in the article) is listed separately as "not matched", never dropped. Links, publishers and the GDELT first-seen time are kept; a missing date is shown as missing.
- **If those rule files cannot be loaded** (for example the host serves `.mjs` files with the wrong content type), the section says so and shows the articles unfiltered. The status chips and warning do not depend on the rule files.
- **Not changed:** what is requested from GDELT, how often, retries, workflows, RSS, World Bank, UCDP, risk, briefs, the globe and the stylesheet. The section's small styles are added by `js/app.js` at run time.
- **Limitations:** "cached data in use" for a country that was not re-requested is inferred from its check time being older than the file's (the file has no explicit flag); search results are matched on the whole article but judged on the headline only; the outlet lists are short (see `data/source-quality.mjs`).
- **Tests:** `node tests/test-secondary-news.mjs` (36 checks, simulated). Optional browser test: `PUPPETEER=/path/to/puppeteer node tests/render-secondary.cjs` (81 checks over the states successful, stale, partly failed, failed with and without cache, empty, reused, unreadable, missing and rules-not-loadable; needs puppeteer and Chrome; prints "skipped" without them).

## Country intelligence briefs (Stage 3)
Each country page has a brief with four parts: Overview, Key developments, Why it matters, Sources. It is built automatically by `scripts/build-briefs.mjs` from the cached news (`news-gdelt.json`, and `news-rss.json` if you ever enable RSS) and saved to `data/cache/briefs.json`. **No AI, no paid service, no API key, no network request**: fixed rules only (`data/brief-rules.mjs`, `scripts/brief-lib.mjs`).

What each part contains (and nothing else):
- **Overview** (labelled "Factual data"): counts of cached headlines that name the country in the last 72 hours, the time span, the number of outlets and topic-keyword counts.
- **Key developments** (labelled "Reported event"): up to 5 of the highest-ranked headlines, copied word for word, each with publisher, time (publication time, or clearly marked "first seen by GDELT"/"first cached" when the source gave none), matched words, topic words, and the other outlets that carried the same headline. They are reports, not verified facts.
- **Why it matters** (labelled "Analysis"): only these narrow sentences, each showing its numbered evidence and rule name: "N of the M listed reports use security/diplomacy/sanctions and trade/economic policy wording", "N listed reports with topic keywords also name another monitored country", "N listed headlines were carried by more than one outlet". Each says what it does not show. With fewer than 2 reports, or when no rule has enough support, the section says Unavailable and why. Words that claim cause, proof or prediction are banned and a test enforces it. No risk scores are ever generated.
- **Sources**: every listed report with a numbered link, publisher and time, plus duplicates. Anything without a headline, publisher, http(s) link or time is never used (the run log counts what was dropped).
- **Limitations** and a standing note are shown under the brief (stale or missing inputs, failed feeds, too few reports).

Country attribution, relevance ranking, routine-notice filtering and duplicate grouping reuse the existing logic (`data/country-terms.mjs`, `data/relevance-rules.mjs`, `scripts/relevance-lib.mjs`), so people's names never attribute a report to a country, and a headline appears in a brief only if the headline names the country or its capital/government.

**When it runs:** in the "Update RSS news" workflow, after the news steps, in fetch mode, and its file is committed with the other caches. You can also run the workflow with sources = `briefs` to rebuild only the briefs from the existing caches. In verify mode it shows what it would build and writes nothing. If building fails (no readable news cache) the previous `briefs.json` is kept and marked `status: "error"`; the page shows it as stale ("Latest regeneration failed: earlier brief kept") with the reason. If a country has no usable report in the latest cache but had a brief within the last 168 hours, that brief is kept and marked stale; after 168 hours it becomes Unavailable. If there is no earlier file, nothing is written and the page says briefs have not been generated yet.

**Trade-offs:** a brief only reflects the headlines that GDELT/RSS happened to cache in 72 hours, so it can miss important events and over-represent whatever was heavily reported; keyword rules can mis-score a headline; the topic counts describe the listed reports, which are chosen by keyword rank, so they are not a share of all coverage; hand-written entries in `data/countries.js` still override the automatic text per section.

Run on your computer: `node scripts/build-briefs.mjs --verify` (preview) or `node scripts/build-briefs.mjs` (write). Tests: `node tests/test-briefs.mjs`.

## Risk assessments (Stage 4)
The three Risk Assessment cards (Security, Economic, Diplomatic) are generated by `scripts/build-risk.mjs` into `data/cache/risk.json`, from public datasets and **fixed, documented rules**. No AI, no paid service, no API key, no external server. All thresholds are in `data/risk-methodology.mjs`; the rules are pure functions in `scripts/risk-lib.mjs`. A hand-written entry in `data/countries.js` still overrides a card.

### Principles
- A level (Low, Moderate, High, Critical) is shown only when the evidence below supports one. Otherwise the card says **Insufficient data** and why. Not every country gets a level in every category.
- **Missing data is never treated as low risk.** "No recorded armed conflict" is not "low risk".
- Observed facts (a value from a named source and year) are listed separately from the rule-based interpretation (the level).
- **News headlines and article counts never set a level.** Headlines appear only as "Reported context, not used for the level".
- Thresholds are analyst-chosen conventions for a transparent screening rule. They are not an academic standard, not a forecast and not a verdict. Change them in `data/risk-methodology.mjs` and run `node tests/test-risk.mjs`.

### Security (needs the UCDP file)
1. Look at the newest year in the UCDP/PRIO Armed Conflict Dataset. **Critical**: the country is the location of, or a primary party (side A or B) in, a state-based conflict of intensity 2 (war, at least 1,000 battle-related deaths that year). **High**: the same at intensity 1 (25 to 999). **Moderate**: only a supporting (secondary) party.
2. If no involvement is recorded **and** a World Bank WGI political stability estimate (indicator `GOV_WGI_PV.EST`, not older than 3 years) exists: at least 0.0 gives **Low**, at least -1.0 gives **Moderate**, below that **High**.
3. Otherwise **Insufficient data** (UCDP file missing or older than 2 years; no conflict recorded and no WGI value).

### Economic
Three World Bank indicators are each placed in a band (inflation: below 0 Moderate, below 5 Low, below 10 Moderate, below 20 High, else Critical; GDP growth: below -5 Critical, below 0 High, below 2 Moderate, else Low; unemployment: below 6 Low, below 10 Moderate, below 15 High, else Critical). The level is the **worst** available band. At least 2 indicators with a reference year no older than 3 years are required, otherwise Insufficient data. These indicators do not measure debt, reserves, sanctions, war damage or banking stress; a "Low" means only that the listed indicators are in ordinary ranges, and a country with a UCDP war gets an explicit caution on its economic card.

### Diplomatic: no level (evidence-only card)
No level is computed for any country. I looked for a free, key-free, machine-readable and legally reusable dataset of diplomatic tension or sanctions that I could verify, and found none that supports a defensible automatic assessment. Counting articles, "sanctions" headlines or keywords is not a measurement of diplomatic risk, so the card says Insufficient data and shows up to 3 reported headlines as context. If you later find a source you trust, add a sourced entry in `data/countries.js` (it is shown instead) or extend the rules.

### Data sources and their limits
| Source | Used for | Access and licence | Main limits |
|---|---|---|---|
| [UCDP/PRIO Armed Conflict Dataset](https://ucdp.uu.se/downloads/) (one CSV zip, v26.1, tried newer versions automatically) | Security: conflict involvement | Static download, no key. CC BY 4.0 as stated on the download page; citation text is in `data/risk-methodology.mjs` and the card | Annual, covers state-based armed conflict only (not tension, unrest or terrorism); the newest year is last year's. Its API needs an emailed token, so it is NOT used |
| [World Bank WGI political stability, `GOV_WGI_PV.EST`](https://data.worldbank.org/indicator/GOV_WGI_PV.EST) | Security (only when no conflict) | World Bank API, no key; World Bank Open Data terms of use | Perception-based composite on the WGI 2025 revised methodology (history recalculated to 1996), annual, margins of error. The thresholds were chosen on the conventional -2.5 to +2.5 scale and are not re-checked against the revision. Not published for Taiwan as far as the World Bank API answers (the run tells you). The old code `PV.EST` was retired by the World Bank and is deliberately never used as a fallback |
| World Bank GDP growth, inflation (existing `indicators.json`), unemployment (ILO modelled) | Economic | World Bank API, no key, CC BY 4.0 | Annual, lagged; Taiwan not published by the World Bank; revisions; modelled estimates |
| Country briefs (`briefs.json`) | Reported context only | Already in the project | Headlines are reports, not verified facts |
**Not used:** the IMF (its terms prohibit bulk automated download without permission, so it is not fetched automatically; Taiwan economic data would be the main benefit if you obtain permission), ACLED (needs registration and a key), the UCDP API (needs a token), commercial risk indices.

**Taiwan:** names and codes are used exactly as each source gives them and no sovereignty position is taken. Where a source does not publish Taiwan, the card says so and nothing from China or any other country is substituted. Taiwan therefore shows Insufficient data in Economic, and in Security unless a source publishes a value.

### Automation and failure handling
- Workflow **Update risk assessments** (`.github/workflows/update-risk.yml`): fetches the inputs, then builds `risk.json`, then commits `data/cache/risk-inputs.json` and `data/cache/risk.json`. It is separate from the news and indicator workflows (they are unchanged) and shares their concurrency group. **Its schedule is off** until you have verified it (see below).
- To avoid pointless requests: World Bank series are requested again only when older than 7 days, the UCDP file only when older than 30 days. A daily run therefore makes almost no requests.
- If a request fails, the earlier value is kept with its original fetch time and the error recorded; the assessment uses it but is marked **stale**. If nothing can be read at all, the previous `risk.json` is kept and marked `status: "error"`; the page shows "Latest rebuild failed: earlier assessments kept".
- The page shows a stale label when the build is older than 72 hours or the datasets have not been refreshed for 14 days.

### Verify before enabling the schedule
1. Actions, **Update risk assessments**, Run workflow, mode `verify`. The log should show UCDP (a "27.1 not published yet (HTTP 404)" line is normal), then a value for each country and each series; Taiwan should say "no country with code TWN" or similar. Nothing is written. If UCDP says "unexpected UCDP file layout", the file format differs from what the code expects: do not continue, tell me the message.
2. Run again with mode `fetch`. Open `data/cache/risk-inputs.json` and `data/cache/risk.json` and check that values and years match the World Bank and UCDP pages.
3. Open the live site, select each country, expand the details of each card, and compare the facts and links with the sources.
4. Only then remove the `# ` before the two `schedule:` lines in `update-risk.yml` and commit.

### If the WGI request fails
The run log prints a `[metadata lookup ...]` note: what the World Bank's metadata endpoint says about the code. If it says the indicator was not found, the World Bank renamed it again; open `https://api.worldbank.org/v2/country/USA/indicator/GOV_WGI_PV.EST?format=json&mrnev=1` in a browser to see the reply, and send me the first lines. Until it works, Security shows Insufficient data for countries with no recorded conflict; nothing is guessed. A cache entry written for a different indicator code is never trusted and is requested again.

### Tests
`node tests/test-risk.mjs` (90 simulated checks: documented levels and boundaries, missing and incomplete data, stale data, failed requests, source attribution, no fabricated levels, all five countries, existing files unchanged). The mock server stands in for the World Bank and UCDP; **no real request was made by the tests, and nothing has been run on GitHub or the live site.** The real UCDP column layout and the World Bank reply format are implemented from their documentation and from the existing World Bank code; the verify run is how you confirm them.

## Changing things
- **News search terms:** edit the `gdelt:` line per country in `data/countries.js`. GDELT rules: OR groups go in parentheses, phrases in quotes, every word at least 3 letters. After a change, run the Action manually. If a query is invalid the site will show GDELT's own error message.
- **Schedule:** edit the `cron:` lines in `.github/workflows/update-data.yml`. GDELT asks for at most one request per 5 seconds; the script already waits about 8 seconds between countries. More than every few hours adds little and uses free minutes.
- **Stale thresholds:** `staleAfterHours` in `js/config.js`.

## Running the fetcher on your own computer (optional)
Needs Node 18 or newer (`node --version`). In Terminal, inside the project folder:
```
node scripts/fetch-data.mjs --verify        # checks World Bank country codes, writes nothing
node scripts/fetch-data.mjs --only=news     # writes data/cache/news.json
node scripts/fetch-data.mjs                 # news and indicators
node tests/test-fetch.mjs                   # simulated tests, no internet needed
python3 -m http.server 8000                 # then open http://localhost:8000
```

## Adding sourced analysis (Stage 3 will build on this)
`data/countries.js` has `risk` and `brief` entries with instructions at the top. Anything left empty shows as Unavailable. This site never generates scores or assessments.

## What has and has not been tested (RSS)
**Simulated (`node tests/test-gdelt-files.mjs`, 46 checks):** ZIP reading (deflate, stored, non-ZIP, oversize, truncated); feed discovery; the GDELT file route end to end on fake files (lastupdate parsing, headline-only country matching, HTML entities, unsafe links, headline duplicates across sites, future or missing publication times left empty, headline-less records ignored, malformed lines counted); verify failing honestly when headlines or the 27-column layout are missing; repeat runs downloading nothing; a 404 file recorded as missing; a corrupt file not marked as read; a 503 retried; server down keeping cached articles with exit code 2; per-country cap; 3-day expiry; redirects to another host refused before being requested; plain http refused in the production setting.

**Simulated (`node tests/test-rss.mjs`, 105 checks, fake feeds on a local server, no real publisher contacted):** RSS 2.0, RDF (DW style) and Atom parsing; CDATA and entities; HTML pages and non-feeds rejected; date parsing including junk, future and pre-2000 dates; link and headline duplicates; off-site and unsafe links; country matching including false-positive cases; summary text never stored; verify mode (exit codes, per-feed reasons, writes nothing); refusal to fetch a publisher without `termsChecked`; one failing feed not blocking others; earlier articles and last-success time preserved when everything fails; 7-day expiry; removal of a switched-off publisher's articles; ETag/304; retry on 503, timeout, no retry on 404, hop-by-hop redirect checks (the refused target is never requested; relative redirects, 3-hop limit, loops, credentials in the address, plain http, missing feedHosts, IP-address feeds), and skipped feeds. The page was rendered in a headless browser using cache files produced by the script (not enabled, partly failed, all failed).

**Never run against the real services, so unverified:** whether UN Geneva has usable feeds and what their addresses are, whether the real GDELT files match the assumed layout and are reachable from GitHub, how large they are in practice, whether any of the 12 publisher feed addresses works from GitHub's servers today, what their real content looks like, whether any publisher blocks GitHub's addresses, and what any publisher's terms allow. The addresses came from third-party feed directories. **Verify mode on GitHub is the first real test.**

## What has and has not been tested (GDELT and World Bank)
**Simulated (local mock server, `tests/test-fetch.mjs`, 32 checks):** exponential backoff with jitter and `Retry-After`; skipping countries whose cache is fresh; the circuit breaker and time budget; World Bank data surviving a total GDELT failure; parsing; duplicate, unsafe-URL and untitled article removal; empty GDELT bodies; rate-limit retry; plain-text GDELT errors; persistent 503s; timeouts; World Bank missing values, error replies, unsupported codes and refusal of a reply for the wrong country; keeping earlier data when a refresh fails; exit code when everything fails. The front end was also rendered in a headless browser using cache files produced by the real script against the mock server.

**Never run against the real services, so unverified:**
- Any request to the real GDELT or World Bank APIs (the test environment blocked both hosts).
- Whether GDELT accepts the five search queries as written, and how many relevant articles they return.
- Whether the World Bank API recognises `TWN` (the `--verify` step answers this on your first run).
- The GitHub Action itself: the schedule, the commit and push, and the Pages build.
- Real 3D globe rendering (unchanged from Stage 1, still untested).

## Known limitations and open issues
- **Pages rebuild after the Action commits.** GitHub does not always rebuild Pages for commits made by the built-in token. The workflow asks for a rebuild as a best-effort step, but I could not confirm it works. If the site does not show new data after a run (data/cache files are updated in the repo but the site is old): go to **Actions**, find **pages build and deployment**, and re-run it; or tell me and I will switch to the other approach (deploying Pages from the workflow itself).
- **Scheduled runs can be late or skipped**, and GitHub disables schedules in a public repository after 60 days with no repository activity. I could not confirm whether the bot's own commits count as activity. Check the Actions tab now and then; the site shows "Stale" if updates stop.
- **RSS is unverified.** No feed has been confirmed to work. Publishers can change or remove feeds, block GitHub's servers, or change their terms at any time. The word matching can still produce misleading matches (for example a headline that mentions Russia in passing).
- **GDELT availability.** See "GDELT rate limits and reliability" above. News may be missing or stale on some days, and failed runs make GitHub send you a failure email.
- **GDELT quality.** GDELT lists the time it first saw an article, not the publication time, and the "publisher" is the website domain. Headlines are machine-collected, can be noisy or off-topic, and are not checked here.
- **Action versions.** The workflow uses `actions/checkout@v4` and `actions/setup-node@v4`. If GitHub retires them, the run log will say so and the version number needs bumping.
- **Boundaries and the globe library** still load from the jsDelivr CDN unless you save your own copies in `vendor/` and `data/` (see config.js).
