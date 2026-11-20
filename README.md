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
data/countries.js                   the five countries: colours, camera, GDELT search queries, sourced entries
data/cache/                         JSON written by the Action (starts empty)
scripts/fetch-data.mjs              the fetcher (Node 18+, no packages to install)
tests/test-fetch.mjs                SIMULATED tests for the fetcher (local mock server, no internet needed)
.github/workflows/update-data.yml   the schedule
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
3. Wait about two to four minutes. (GDELT is asked for one country every 6 seconds, as it requests. Indicators take roughly a minute.)
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
| Fetch succeeded | Green pill with age ("Updated 2 h ago"); times in tooltips and under the panels |
| Fetch failed, earlier data exists | Amber "Last success X ago" plus red "Latest refresh failed", the error text, and the earlier articles/values, each labelled |
| Fetch failed, nothing earlier | Red "No successful update yet" and the error text; no content |
| Older than the threshold | Amber "Stale" (news after 24 h, indicators after 10 days; change in `js/config.js`) |
| GDELT found nothing | "GDELT returned no articles..." (a valid result, not an error) |
| No indicator published | "No value published" for that row |
| Unsupported country code (expected for Taiwan) | Red "Not published by the World Bank", explicit message, nothing substituted |
| Cache files missing | "Unavailable" with the reason (before the first Action run) |

## Changing things
- **News search terms:** edit the `gdelt:` line per country in `data/countries.js`. GDELT rules: OR groups go in parentheses, phrases in quotes, every word at least 3 letters. After a change, run the Action manually. If a query is invalid the site will show GDELT's own error message.
- **Schedule:** edit the `cron:` lines in `.github/workflows/update-data.yml`. GDELT asks for at most one request per 5 seconds; the script already waits 6 seconds between countries. More than every few hours adds little and uses free minutes.
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

## What has and has not been tested
**Simulated (local mock server, `tests/test-fetch.mjs`, 19 checks):** parsing; duplicate, unsafe-URL and untitled article removal; empty GDELT bodies; rate-limit retry; plain-text GDELT errors; persistent 503s; timeouts; World Bank missing values, error replies, unsupported codes and refusal of a reply for the wrong country; keeping earlier data when a refresh fails; exit code when everything fails. The front end was also rendered in a headless browser using cache files produced by the real script against the mock server.

**Never run against the real services, so unverified:**
- Any request to the real GDELT or World Bank APIs (the test environment blocked both hosts).
- Whether GDELT accepts the five search queries as written, and how many relevant articles they return.
- Whether the World Bank API recognises `TWN` (the `--verify` step answers this on your first run).
- The GitHub Action itself: the schedule, the commit and push, and the Pages build.
- Real 3D globe rendering (unchanged from Stage 1, still untested).

## Known limitations and open issues
- **Pages rebuild after the Action commits.** GitHub does not always rebuild Pages for commits made by the built-in token. The workflow asks for a rebuild as a best-effort step, but I could not confirm it works. If the site does not show new data after a run (data/cache files are updated in the repo but the site is old): go to **Actions**, find **pages build and deployment**, and re-run it; or tell me and I will switch to the other approach (deploying Pages from the workflow itself).
- **Scheduled runs can be late or skipped**, and GitHub disables schedules in a public repository after 60 days with no repository activity. I could not confirm whether the bot's own commits count as activity. Check the Actions tab now and then; the site shows "Stale" if updates stop.
- **GDELT quality.** GDELT lists the time it first saw an article, not the publication time, and the "publisher" is the website domain. Headlines are machine-collected, can be noisy or off-topic, and are not checked here.
- **Action versions.** The workflow uses `actions/checkout@v4` and `actions/setup-node@v4`. If GitHub retires them, the run log will say so and the version number needs bumping.
- **Boundaries and the globe library** still load from the jsDelivr CDN unless you save your own copies in `vendor/` and `data/` (see config.js).
