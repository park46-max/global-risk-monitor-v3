// RISK ASSESSMENT METHODOLOGY (Stage 4). Read by scripts/risk-lib.mjs, scripts/fetch-risk-inputs.mjs and scripts/build-risk.mjs. The website never reads this file.
// Every threshold and rule below is written out so it can be read, challenged and changed. Nothing is hidden in code and nothing is learned from data.
// The README ("Risk assessments") explains the reasoning. Run the tests after any change:  node tests/test-risk.mjs
//
// PRINCIPLES
//  - Levels are broad (Low / Moderate / High / Critical) and are given ONLY when the evidence listed below supports one. Otherwise the category says "Insufficient data".
//  - Missing data is never treated as low risk. No recorded conflict is not the same as low risk.
//  - Observed facts (a value from a named source and year) are kept apart from the rule-based interpretation (a level derived by the rules here).
//  - News headlines and article counts NEVER set a level. Headlines are shown as "reported context" only.
//  - The thresholds are analyst-chosen conventions for a transparent screening rule. They are not an academic standard and not a forecast.
//
// VERSION 2 (Stage 8B-1): wording, role separation and disclosure only. NO classification rule or threshold was changed.
//  - UCDP location, primary-party and supporting-party roles are now stored separately (cache field "roles"); the old merged "role" field is kept.
//  - Texts no longer call every entry "location or primary party", state the reference years, and say what UCDP intensity and "location" mean.
//  - All bands and cut-offs are labelled as project-defined conventions (see notes.conventions below).

export const RISK = {
  methodologyVersion: 2,
  // gw = Gleditsch-Ward country code used by UCDP; wb = World Bank country code. Names are only for display.
  countries: {
    USA: { name: 'United States', wb: 'USA', gw: 2 },
    CHN: { name: 'China', wb: 'CHN', gw: 710 },
    RUS: { name: 'Russia', wb: 'RUS', gw: 365 },
    UKR: { name: 'Ukraine', wb: 'UKR', gw: 369 },
    TWN: { name: 'Taiwan', wb: 'TWN', gw: 713,
      // Shown on Taiwan's cards. Names and codes are used as the sources give them; no sovereignty or status position is taken.
      securityNote: 'This level for Taiwan does not measure cross-strait tension or military activity: it uses only the absence of a UCDP-recorded state-based armed conflict and the WGI perception estimate.',
      economicNote: 'The World Bank help desk states that its World Development Indicators do not list "Taiwan, China" as a separate country (https://datahelpdesk.worldbank.org/knowledgebase/articles/114933-where-are-your-data-on-taiwan), so these series are absent at the source. This is a source coverage limit, not evidence of low risk. The WGI political stability series is published for Taiwan and is a different dataset.' }
  },
  levels: ['Low', 'Moderate', 'High', 'Critical'],

  // Where the data comes from. Only free, public, key-free sources. Licences were read on 2026-11-20 (see the README for the exact wording).
  sources: {
    ucdp: {
      name: 'UCDP/PRIO Armed Conflict Dataset', publisher: 'Uppsala Conflict Data Program (Uppsala University) and PRIO', url: 'https://ucdp.uu.se/downloads/', host: 'ucdp.uu.se',
      licence: 'CC BY 4.0 (stated on the UCDP download page)',
      citation: 'Davies, Pettersson & Öberg (2026), Organized violence 1989-2025, Journal of Peace Research; Gleditsch et al. (2002), Armed Conflict 1946-2001, Journal of Peace Research 39(5). UCDP is funded by DEMSCORE, Swedish Research Council grant 2021-00162.',
      // The file is a static download (the UCDP API needs an access token requested by email, so it is NOT used).
      // parserVersion 2 (Stage 8B-1) = the cache stores location, primary-party and supporting-party roles separately ("roles").
      // A cache written by an older reader is re-read once (see scripts/fetch-risk-inputs.mjs); the old data is kept if that fails.
      parserVersion: 2,
      latestKnownVersionYear: 26,   // 26 = version 26.1. The fetch script also tries newer years automatically when it refreshes.
      urlTemplate: 'https://ucdp.uu.se/downloads/ucdpprio/ucdp-prio-acd-{yy}1-csv.zip',
      maxDatasetAgeYears: 2         // if the newest year in the file is older than (this year - 2), no level is given
    },
    wgi: {
      // The old code PV.EST was retired by the World Bank when the WGI 2025 revision (revised methodology) was published; the API now answers
      // "The indicator was not found" for it. The series is published as GOV_WGI_PV.EST (World Bank data portal page and its own API download links, read 2026-11-21).
      // The legacy code is deliberately NOT used as a fallback: its values follow the old methodology and must never be mixed with the revised series.
      name: 'Worldwide Governance Indicators (2025 revision): Political Stability, governance estimate (approx. -2.5 to +2.5), GOV_WGI_PV.EST', publisher: 'World Bank Group',
      url: 'https://data.worldbank.org/indicator/GOV_WGI_PV.EST', host: 'api.worldbank.org', code: 'GOV_WGI_PV.EST', licence: 'World Bank Open Data terms of use (https://data.worldbank.org/summary-terms-of-use)',
      note: 'A composite of perception-based surveys (WGI 2025 revision, history recalculated back to 1996), roughly -2.5 (weak) to +2.5 (strong). The World Bank defines political stability as perceptions of the likelihood of politically motivated violence, including civil unrest and terrorism. Annual. The World Bank publishes 90 percent confidence intervals, which are not used here: single-year differences between countries can lie within them. The cut-offs 0.0 and -1.0 are project-defined conventions chosen on the conventional scale and have not been re-checked against the revised series.'
    },
    unemployment: { name: 'Unemployment, total (% of labour force), modelled ILO estimate', publisher: 'World Bank (ILO modelled estimate)', url: 'https://data.worldbank.org/indicator/SL.UEM.TOTL.ZS', code: 'SL.UEM.TOTL.ZS', licence: 'World Bank Open Data, CC BY 4.0' },
    growth: { name: 'GDP growth (annual %)', publisher: 'World Bank', url: 'https://data.worldbank.org/indicator/NY.GDP.MKTP.KD.ZG', code: 'NY.GDP.MKTP.KD.ZG', licence: 'World Bank Open Data, CC BY 4.0' },
    inflation: { name: 'Inflation, consumer prices (annual %)', publisher: 'World Bank', url: 'https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG', code: 'FP.CPI.TOTL.ZG', licence: 'World Bank Open Data, CC BY 4.0' }
  },

  // ---------- SECURITY ----------
  // Step 1 (needs the UCDP file): the newest year in the UCDP/PRIO Armed Conflict Dataset is examined.
  //   Critical  the country is the LOCATION of, or a PRIMARY PARTY (side A or side B) in, a state-based armed conflict coded intensity 2 (war: at least 1,000 battle-related deaths in that year)
  //   High      the same for intensity 1 (minor: 25 to 999 battle-related deaths)
  //   Moderate  the country appears only as a SUPPORTING party (secondary warring party) in such a conflict
  // Step 2 (only if step 1 found no involvement, and only with a World Bank WGI value not older than wgiMaxAgeYears): the GOV_WGI_PV.EST estimate sets
  //   Low if it is at least wgiLowFrom, Moderate if at least wgiModerateFrom, otherwise High.
  // No level (Insufficient data) when: the UCDP file is unavailable or too old; or there is no involvement in step 1 AND no usable WGI value.
  //   (Absence from the UCDP file means no armed conflict of that kind was recorded. It does not show low risk, and it says nothing about interstate tension.)
  security: { wgiLowFrom: 0.0, wgiModerateFrom: -1.0, wgiMaxAgeYears: 3 },

  // ---------- ECONOMIC ----------
  // Three macro indicators, each placed in a band (value < lt -> that level, checked in order). The overall level is the WORST of the available dimensions.
  // At least minDimensions dimensions with a reference year no older than maxAgeYears are needed, otherwise Insufficient data.
  // These indicators say nothing about debt, reserves, sanctions, war damage or banking stress. A band describes only the listed indicators.
  // PROVENANCE: every band limit is a project-defined convention. The only one with an outside reference is the inflation limit of 20 for Critical, which matches
  // the inflation-crisis convention of Reinhart and Rogoff (2011). That does not validate the project's Critical level, and no other limit has an outside source.
  economic: {
    minDimensions: 2, maxAgeYears: 3,
    dimensions: {
      inflation: { label: 'Inflation (consumer prices, annual %)', bands: [{ lt: 0, level: 'Moderate', why: 'falling prices' }, { lt: 5, level: 'Low' }, { lt: 10, level: 'Moderate' }, { lt: 20, level: 'High' }, { lt: Infinity, level: 'Critical' }] },
      growth: { label: 'GDP growth (annual %)', bands: [{ lt: -5, level: 'Critical' }, { lt: 0, level: 'High' }, { lt: 2, level: 'Moderate' }, { lt: Infinity, level: 'Low' }] },
      unemployment: { label: 'Unemployment (% of labour force)', bands: [{ lt: 6, level: 'Low' }, { lt: 10, level: 'Moderate' }, { lt: 15, level: 'High' }, { lt: Infinity, level: 'Critical' }] }
    }
  },

  // ---------- DIPLOMATIC ----------
  // No level is ever computed. No free, key-free, machine-readable and legally reusable dataset of diplomatic tension was found that could be verified,
  // and counting articles, sanctions headlines or keywords is not a measurement of diplomatic risk. The card shows an explanation and the reported context only.
  diplomatic: { levelsComputed: false },

  // Wording shared by several cards (kept here so it can be read and challenged in one place).
  notes: {
    conventions: 'Level bands and cut-offs (S1 to S4, the WGI cut-offs and the economic bands) are project-defined conventions, not validated international risk standards.',
    inflationCrisis: 'The inflation limit for Critical (20% a year) corresponds to the inflation-crisis convention used by Reinhart and Rogoff (American Economic Review, 2011). That convention does not validate the project\'s Critical level or its other limits.',
    economicScope: 'Only these three macro indicators are used. Debt, reserves, sanctions, war damage and banking stress are not measured. A band describes only the listed indicators; it is not an assessment of overall economic risk.'
  },

  // How many reported headlines are shown as context (from the country briefs). They never affect a level.
  contextMax: 3,
  // A cached input older than this many days is flagged as stale in the assessment.
  staleAfterDays: 14,

  // Words that must never appear in a generated explanation (they would claim a cause, a forecast or a verdict).
  bannedInText: ['because', 'therefore', 'due to', 'caused', 'proves', 'will ', 'would ', 'likely', 'forecast', 'predict', 'threat of', 'imminent']
};
