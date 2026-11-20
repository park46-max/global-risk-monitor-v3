// COUNTRY BRIEF RULES. Read by scripts/brief-lib.mjs (and so by scripts/build-briefs.mjs). The website never reads this file.
// The briefs are built by fixed rules from the cached headlines; there is no AI and no paid service. Everything a brief says is either
//   - a count of cached headlines ("Overview"),
//   - a headline copied word for word with its publisher, time and link ("Key developments"), or
//   - one of the narrow rule sentences below, each showing the numbered reports that triggered it ("Why it matters").
// Nothing else is ever written. If the data does not support a section, the section says so instead of filling the gap.
// Test them with:  node tests/test-briefs.mjs

export const BRIEF_RULES = {
  rulesVersion: 1,
  names: { USA: 'the United States', CHN: 'China', RUS: 'Russia', UKR: 'Ukraine', TWN: 'Taiwan' },
  windowHours: 72,          // only reports from the last 72 hours are used (publication time; otherwise the time GDELT saw it; otherwise first cached)
  maxReports: 12,           // the highest-ranked grouped reports that are analysed and listed as sources (all numbers in the brief refer to these)
  maxDevelopments: 5,       // how many of those are shown under Key developments
  minReportsForWhy: 2,      // fewer listed reports than this: no analytical sentence at all
  topicMinReports: 2,       // a topic sentence needs at least this many listed reports with that topic
  carryMaxHours: 168,       // an earlier brief may be kept (marked stale) for at most this long when the latest cache has nothing usable
  staleAfterHours: { gdelt: 12, rss: 12 },   // an input cache older than this is flagged in the brief
  // Words that must never appear in a generated overview or "why it matters" sentence (they would claim cause, proof or prediction).
  // tests/test-briefs.mjs enforces this on every generated sentence.
  bannedInAnalysis: ['because', 'therefore', 'due to', 'caused', 'proves', 'proved', 'confirms', 'confirmed', 'as a result', 'leading to', 'will ', 'would ', 'likely', 'escalat', 'threat', 'risk of'],
  // The one-line caveat shown on every brief.
  notice: 'Headlines are reports by publishers (or indexed by GDELT). They are not verified facts, and a country named in a headline does not prove the report is mainly about it. The sentences under "Why it matters" come from fixed keyword rules, not from reading the articles.'
};
