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

## Publisher headlines obtained through GDELT: UNRESOLVED

- GDELT's terms cover GDELT's own datasets. They are silent on the copyright or terms of the publishers' content, so they **do not by themselves grant any right** to store or show publisher headlines.
- The project stores each item's headline, publisher, URL and timestamps in `news-gdelt.json` (public, in the repository) and shows the headline, publisher, date and a link to the original page. It does not copy article text. Headlines are credited to their publishers and link out.
- Whether storing and showing headlines this way is permitted depends on each publisher's terms and on the law where the site operator and readers are. This was **not** established. No publisher's terms were reviewed, and this is not legal advice.
- This is a release decision for the project owner. Options (none applied): accept and document the risk with a takedown contact; show only publisher, time and link; or seek legal advice.

## Technical dependency notes

- **globe.gl floating version (`globe.gl@2`)**: an exact compatible version and a verified SRI hash could **not** be established in this audit (jsDelivr file and API endpoints could not be fetched, and the sandbox has no network). A secondary listing shows v2.46.1 but that is not confirmed as what `@2` resolves to today. No version or hash is proposed. To establish both: open `https://cdn.jsdelivr.net/npm/globe.gl@2/package.json` in a browser to read the resolved version, then generate the hash from the exact-version file (`curl -sL <exact URL> | openssl dgst -sha384 -binary | openssl base64 -A`) and test the live page with it.
- **update-risk.yml header comment** ("THE SCHEDULE IS OFF ON PURPOSE") is outdated. It was not changed (needs separate approval; schedules and permissions are untouched).
- **GitHub Actions versions** (`checkout@v4`, `setup-node@v4`): no change proposed until real production run logs are available.
