// SOURCE TYPES. What KIND of body publishes a feed. This is different from the outlet label in data/source-quality.mjs
// (which describes a news outlet) and it is set by the project owner per publisher in data/rss-sources.mjs, never guessed from a headline.
// Read by scripts/fetch-rss.mjs (stored in the cache), scripts/relevance-lib.mjs (duplicate rule) and the page (labels).
//
// WHY THIS EXISTS
//   An official communication (a government press release, a UN or EU statement) tells you what that body says. It is not independent
//   reporting and it has not been verified here. So:
//   - every official item is labelled with its type on the page;
//   - an official item is never grouped with another publisher's headline as a duplicate, so it can never appear as "also reported by"
//     (that would look like independent corroboration);
//   - official items are kept out of the country briefs for now (scripts/brief-lib.mjs) and never feed the risk assessment
//     (the risk scripts do not read the RSS cache; tests/test-official-sources.mjs checks this).
//
// Types that are not `official` (journalism) behave exactly as before.
export const SOURCE_TYPES = {
  journalism: {
    label: 'Publisher reporting',
    official: false,
    note: 'Reporting by a news publisher (independent or otherwise: see the outlet label). Not checked or endorsed here.'
  },
  government: {
    label: 'Government communications',
    official: true,
    note: 'An official statement by a government. It gives that government\'s own position or account. It is not independently verified and it is not independent corroboration of other reports.'
  },
  'international-organisation': {
    label: 'International organization communications',
    official: true,
    note: 'A communication by an international organization (for example the United Nations). It gives that organization\'s own account. It is not independently verified here and it is not independent corroboration of other reports.'
  },
  'eu-institution': {
    label: 'EU institutional communications',
    official: true,
    note: 'A communication by an institution of the European Union. It gives that institution\'s own position or account. It is not independently verified here and it is not independent corroboration of other reports.'
  }
};

export const isKnownType = t => Object.prototype.hasOwnProperty.call(SOURCE_TYPES, t);
export const isOfficial = t => isKnownType(t) && SOURCE_TYPES[t].official === true;
// The part of the table that is written into the cache file, so the page shows exactly these words.
export const typeSummary = () => Object.fromEntries(Object.entries(SOURCE_TYPES).map(([k, v]) => [k, { label: v.label, official: v.official, note: v.note }]));
