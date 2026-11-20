// Settings you may change. Everything here is public, so never put secrets in this file.
window.CONFIG = {
  // Cached data files written by the GitHub Action (Stage 2). The browser never calls GDELT or the World Bank.
  newsFile: 'data/cache/news.json',
  indicatorsFile: 'data/cache/indicators.json',
  // Publisher RSS articles, written by scripts/fetch-rss.mjs once you have verified and enabled a publisher (see README).
  rssFile: 'data/cache/news-rss.json',
  // After this many hours without an update, the page labels the data "Stale".
  staleAfterHours: { news: 24, indicators: 240, rss: 12 },
  // Natural Earth 1:110m boundaries (world-atlas package). Tried in order; the first that loads is used.
  atlas: ['data/countries-110m.json', 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json'],
  // globe.gl (MIT licence). Tried in order. Save the file as vendor/globe.gl.min.js to stop using the CDN (see README).
  globeLib: ['vendor/globe.gl.min.js', 'https://cdn.jsdelivr.net/npm/globe.gl@2/dist/globe.gl.min.js']
};
