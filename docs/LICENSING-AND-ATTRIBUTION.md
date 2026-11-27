# Licensing and attribution (Stage 10.1)

Checked 2026-11-28 against the pages named below, through search results and page fetches. This is a project record, not legal advice. **VERIFIED** = official text seen. **PARTIAL** = official text seen only in part, or only via a secondary page. **UNVERIFIED** = not seen.

| Source | Terms found | Status | Where credited |
|---|---|---|---|
| UCDP/PRIO Armed Conflict Dataset v26.1 | ucdp.uu.se/downloads: "All datasets are free of charge and licensed under CC BY 4.0 … provided you cite the relevant publications". Listed citations: Davies, Pettersson & Öberg (2026) *Journal of Peace Research* 63(4), doi:10.1093/jopres/xjag046; Gleditsch et al. (2002) *JPR* 39(5). The codebook asks to cite the codebook where appropriate and always give the version number and the dataset name. | VERIFIED | Footer (added in 10.1); version shown in each Security tile |
| World Bank WDI (inflation FP.CPI.TOTL.ZG, unemployment SL.UEM.TOTL.ZS, GDP growth NY.GDP.MKTP.KD.ZG) | Terms of Use for Datasets (as quoted in search results): CC BY 4.0 plus a mandatory attribution "The World Bank: Dataset name: Data source (if known)"; some third-party data may carry other terms. Indicator pages show "License: CC BY-4.0" for inflation (source IMF International Financial Statistics) and unemployment (source ILO Modelled Estimates, ILOSTAT). | PARTIAL | Footer (added in 10.1) |
| GDP growth licence label | Metadata lists the sources "World Bank national accounts data, and OECD National Accounts data files". The indicator page's own licence label was not retrieved. The World Bank catalogue states CC BY 4.0 is the default "unless otherwise specified". | PARTIAL | Footer |
| World Bank WGI | Indicator pages show CC BY-4.0. Official citation: "Worldwide Governance Indicators, 2025 Revision, World Bank (www.govindicators.org)". Methodology: Kaufmann & Kraay (2024); World Bank (2025) revised methodology. A 2026 methodology document also exists; confirm the edition name in the Data Catalog before release. | PARTIAL | Footer |
| GDELT | Terms: "available for unlimited and unrestricted use for any academic, commercial, or governmental use of any kind without fee"; redistribution allowed; "any use or redistribution of the data must include a citation to the GDELT Project and a link to this website". The terms section says nothing about publishers' content. | VERIFIED (about.html) | Footer links https://www.gdeltproject.org/ (already present, kept) |
| Natural Earth | Public domain; "No permission is needed … Crediting the authors is unnecessary" (suggested credit "Made with Natural Earth"). | VERIFIED | Footer and map note |
| world-atlas | Package listed as ISC licence; described as a redistribution of Natural Earth data as TopoJSON. | PARTIAL (package listings, not the repository) | Footer |
| globe.gl, three.js | MIT (package metadata and listings, not the repositories' LICENSE files). | PARTIAL | Footer |
| jsDelivr CDN | Terms: free for personal and commercial use, no bandwidth or request limits; SRI should be used only with exact versions. | VERIFIED | Footer (privacy note) |
| Publisher RSS | All publishers disabled, `termsChecked: null`. No publisher RSS items are fetched or shown. | VERIFIED (current files) | n/a |

## Publisher headlines: what is and is not established (Stage 10.2)

**Status: UNRESOLVED, managed as a risk decision.** The owner has accepted that the right to reproduce publisher headlines has not been conclusively established and that GDELT's dataset licence does not automatically grant rights to third-party content. Keeping short headlines is a risk-management decision. It is **not** a claim of legal permission, and this is not legal advice.

### Five things that must not be confused
| Topic | What is true |
|---|---|
| Direct publisher RSS | Disabled for every publisher (`termsChecked: null`). No publisher feed is read. Enabling any of them needs a separate terms review. |
| Headlines indexed through GDELT | The project downloads GDELT's public files / API results and keeps each item's headline, publisher name, date and link. No article text or images. |
| GDELT dataset licence | Covers GDELT's own datasets (citation and link required). It is silent on the copyright or terms of the publishers' content, so it does not by itself license publisher headlines. |
| Third-party headline rights | Not established. Protection of headlines varies by country (a short headline may be unprotected in some places and protected in others), and publisher terms may be stricter. Not reviewed for unlisted publishers. |
| Publisher exclusions | A small list (`data/publisher-exclusions.js`) removes chosen publishers. An entry means "excluded". **No entry, and no absence of an entry, means approved or licensed.** |

### Current exclusion list
- **Al Jazeera** (aljazeera.com, aljazeera.net, aje.io, ajplus.net): excluded after the earlier permissions review. The three extra domains are believed, not verified.
- **DW** (dw.com, dw.de): excluded as a precaution because DW's terms could not be retrieved or read. The owner should review DW's terms before ever removing this entry.

### What the exclusion does
Matching is by link address (including addresses hidden in link parameters), publisher name or domain, RSS feed id, and a headline credit such as "| Al Jazeera". It is applied before anything is written to `news.json`, `news-gdelt.json`, `news-rss.json`, `briefs.json` and `risk.json` (including carried-over and fallback copies), as a last-line check that stops the write, and again when the page displays cached data (so old caches are hidden at once). If the list cannot be loaded, scripts keep the old files and the page hides headlines. Ranking, keywords, country relevance and risk methodology are unchanged.

**Limits.** A listed publisher's story republished on an unlisted domain with no credit in the headline cannot be detected. Unlisted publishers are not checked. Cached files are not meant as a news dataset or API: they exist to run the page, carry no promise of format or stability and are not offered for reuse.

### Public caches and Git history
Every scheduled run commits the cache files, so earlier versions stay in the repository's history and in any fork or clone. Excluding a publisher cleans the current files only. Removing a publisher from history needs a separate, deliberate history rewrite (not done; see docs/KNOWN-LIMITATIONS.md and the README removal procedure).

### Notice and removal requests
The page footer says headlines come from third-party publishers, that GDELT indexes the reports, that no article text or images are reproduced, and that publishers may ask for removal through a GitHub Issues link. Attribution, non-commercial operation and a removal route do not by themselves give permission, and the page says so.

## Technical dependency notes

- **globe.gl floating version (`globe.gl@2`)**: an exact compatible version and a verified SRI hash could **not** be established in this audit (jsDelivr file and API endpoints could not be fetched, and the sandbox has no network). A secondary listing shows v2.46.1 but that is not confirmed as what `@2` resolves to today. No version or hash is proposed. To establish both: open `https://cdn.jsdelivr.net/npm/globe.gl@2/package.json` in a browser to read the resolved version, then generate the hash from the exact-version file (`curl -sL <exact URL> | openssl dgst -sha384 -binary | openssl base64 -A`) and test the live page with it.
- **update-risk.yml header comment** ("THE SCHEDULE IS OFF ON PURPOSE") is outdated. It was not changed (needs separate approval; schedules and permissions are untouched).
- **GitHub Actions versions** (`checkout@v4`, `setup-node@v4`): no change proposed until real production run logs are available.
