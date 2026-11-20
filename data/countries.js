// DATA LAYER: edit this file, not the interface. Every null is a deliberate placeholder.
//
// To add a sourced risk assessment:
//   risk: { security: { rating:'…', assessor:'Who made it', asOf:'YYYY-MM-DD', url:'https://…' } }
//   (optional on any assessment) note:'Analyst note'
// To add brief text (kind is 'reporting' for verified reporting, 'analysis' for judgement):
//   brief: { overview: { kind:'fact'|'reporting'|'analysis', text:'…', asOf:'YYYY-MM-DD' } }
//   brief.sources: [{ title:'…', publisher:'…', url:'https://…', accessed:'YYYY-MM-DD' }]
const none = () => ({ overview: null, developments: null, why: null, sources: [] });

window.INDICATORS = [
  { code: 'NY.GDP.MKTP.CD',    label: 'GDP (current US$)',                     f: 'usd' },
  { code: 'NY.GDP.MKTP.KD.ZG', label: 'GDP growth (annual %)',                 f: 'pct' },
  { code: 'FP.CPI.TOTL.ZG',    label: 'Inflation, consumer prices (annual %)', f: 'pct' },
  { code: 'MS.MIL.XPND.GD.ZS', label: 'Military expenditure (% of GDP)',       f: 'pct' },
  { code: 'SP.POP.TOTL',       label: 'Population, total',                     f: 'num' }
];

// view = where the globe camera flies when the area is selected (alt: 0.3 close, 2 far).
// color = highlight colour, label = [lon, lat] of the globe label.
// map = ISO 3166-1 numeric id used by the map file, wb = World Bank country code,
// gdelt = GDELT search query used by scripts/fetch-data.mjs (broad: country, capital, government and armed-forces terms,
//         not only topic words, so the feed is not limited to sanctions or military stories).
//         GDELT rules: put OR groups in parentheses, quote phrases, every word needs 3+ letters.
window.COUNTRIES = {
  USA: { view: { lat: 39, lng: -98, alt: 1.5 }, name: 'United States', color: '#22d3ee', label: { ll: [-98, 39] },  map: '840', wb: 'USA', note: null, risk: {}, brief: none(),
         gdelt: '("United States" OR "White House" OR Pentagon OR "State Department" OR "Treasury Department" OR "U.S. Senate")' },
  CHN: { view: { lat: 35, lng: 103, alt: 1.4 }, name: 'China', color: '#ef4444', label: { ll: [103, 35] },  map: '156', wb: 'CHN', note: null, risk: {}, brief: none(),
         gdelt: '(China OR Beijing OR "Chinese government" OR "Xi Jinping" OR PLA OR "South China Sea")' },
  RUS: { view: { lat: 61, lng: 96, alt: 2.0 }, name: 'Russia', color: '#fb923c', label: { ll: [96, 61] },  map: '643', wb: 'RUS', note: null, risk: {}, brief: none(),
         gdelt: '(Russia OR Moscow OR Kremlin OR "Russian government" OR "Russian military")' },
  UKR: { view: { lat: 49, lng: 31, alt: 0.7 }, name: 'Ukraine', color: '#3b82f6', label: { ll: [31, 49], dy: 2 },  map: '804', wb: 'UKR', note: null, risk: {}, brief: none(),
         gdelt: '(Ukraine OR Kyiv OR Kiev OR "Ukrainian government" OR "Ukrainian forces")' },
  TWN: { view: { lat: 23.7, lng: 121, alt: 0.45 }, name: 'Taiwan', color: '#a78bfa', label: { ll: [121, 23.7], dx: 11, dy: 3, a: 'start' }, hit: true,  map: '158', wb: 'TWN', risk: {}, brief: none(),
         note: 'Taiwan\u2019s political status is disputed. The government in Taipei (Republic of China) administers Taiwan and nearby islands, while the People\u2019s Republic of China claims Taiwan as part of China. Governments hold differing positions on recognition. This site takes no position.',
         gdelt: '(Taiwan OR Taipei OR "Taiwan Strait" OR "Taiwanese government")' }
};
