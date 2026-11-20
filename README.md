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
scripts/fetch-rss.mjs               the publisher RSS fetcher, with a verify mode
scripts/rss-lib.mjs                 RSS parsing, dates, duplicates, country matching
tests/test-fetch.mjs                SIMULATED tests for the GDELT/World Bank fetcher (no internet needed)
tests/test-rss.mjs                  SIMULATED tests for the RSS pipeline (no internet needed)
.github/workflows/update-data.yml   GDELT + World Bank schedule
.github/workflows/update-rss.yml    publisher RSS (manual only until you enable its schedule)
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

## Publisher RSS feeds (optional news source, OFF until you switch it on)
Four publishers are supported: BBC News, DW, France 24 and Al Jazeera English. **All four are switched off.** Nothing is copied from any publisher until you have (1) verified the feeds work and (2) read that publisher's terms and decided you are allowed to show their headlines and links. Free access does not by itself mean permission to republish.

**What is copied:** headline, link, publisher name, publication date. Never summaries or article text. A feed's summary is read only to look for country names and is not stored.

**It is separate from GDELT.** It has its own workflow (`update-rss.yml`) and its own file (`data/cache/news-rss.json`). A GDELT failure cannot block or erase RSS news, and an RSS failure cannot affect GDELT or the World Bank data. The page shows each source in its own section with its own status.

### Step 1: verify (nothing is switched on, nothing is written)
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
Plain word matching, not understanding. Whole words only (so "Chinatown" does not match China), case-insensitive except short terms like "US" that must be upper case (so "let us talk" does not match). The word list is shown under each article list and lives in `data/rss-sources.mjs`. "Washington" alone, "America", "Congress", "Georgia" and "Hong Kong" are deliberately not used because they are ambiguous or politically contested.
- **Country named in headline**: a matching word is in the headline. It is the stronger match, but it still does not prove the article is mainly about that country (for example "Putin visits Beijing" is listed under both Russia and China).
- **Mentioned in feed summary only**: the headline does not name the country; only the summary does. These are collapsed and labelled weaker.
The page never says an article is "about" a country, only what matched.

### Duplicates, dates and freshness
- The same article (same link after removing tracking parameters, or same headline at the same publisher) is kept once. The same story at two different publishers is shown twice, each credited, because they are separate reports.
- Dates come only from the feed. A missing, unreadable or future-dated value is shown as "Publication date not provided by the feed". Nothing is guessed.
- Articles older than 7 days are dropped. If a feed fails, its earlier articles stay and are labelled **Cached: feed refresh failed**; one failing feed never stops the others. If every feed fails the run turns red.
- Feeds only keep their latest items, so each country may often show few or no articles. "No headline names this country" only describes these feeds, not the world.

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
**Simulated (`node tests/test-rss.mjs`, 90 checks, fake feeds on a local server, no real publisher contacted):** RSS 2.0, RDF (DW style) and Atom parsing; CDATA and entities; HTML pages and non-feeds rejected; date parsing including junk, future and pre-2000 dates; link and headline duplicates; off-site and unsafe links; country matching including false-positive cases; summary text never stored; verify mode (exit codes, per-feed reasons, writes nothing); refusal to fetch a publisher without `termsChecked`; one failing feed not blocking others; earlier articles and last-success time preserved when everything fails; 7-day expiry; removal of a switched-off publisher's articles; ETag/304; retry on 503, timeout, no retry on 404, refusal of a redirect to another website. The page was rendered in a headless browser using cache files produced by the script (not enabled, partly failed, all failed).

**Never run against the real publishers, so unverified:** whether any of the 12 feed addresses works from GitHub's servers today, what their real content looks like, whether any publisher blocks GitHub's addresses, and what any publisher's terms allow. The addresses came from third-party feed directories. **Verify mode on GitHub is the first real test.**

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
