#!/usr/bin/env node
// Shows exactly how one headline is judged, using the same rules as the pipeline. No network.
//   node scripts/explain-headline.mjs "China warns US over chip export controls"
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMatchers, matchCountries } from './rss-lib.mjs';
import { compileRules, classify } from './relevance-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { COUNTRY_TERMS } = await import(pathToFileURL(path.join(ROOT, 'data', 'country-terms.mjs')).href);
const { RULES } = await import(pathToFileURL(path.join(ROOT, 'data', 'relevance-rules.mjs')).href);
const title = process.argv.slice(2).join(' ');
if (!title) { console.log('Usage: node scripts/explain-headline.mjs "headline text"'); process.exit(1); }
const m = matchCountries(buildMatchers(COUNTRY_TERMS), title, ''), named = Object.values(m).length, c = classify(title, compileRules(RULES), named);
console.log('Headline:', title);
console.log('Countries:', Object.keys(m).length ? Object.entries(m).map(([id, x]) => `${id} (${x.level}: ${x.terms.join(', ')})`).join('; ') : 'none, so it would not be stored');
console.log('Topics:   ', c.topics.length ? c.topics.map(t => `${t.label} (${t.terms.join(', ')})`).join('; ') : 'none');
console.log('Score:    ', c.score, `(${c.tier})`);
console.log('Verdict:  ', c.filtered ? `FILTERED as a routine financial notice (${c.filtered.terms.join(', ')})` : Object.keys(m).length ? 'shown' : 'not stored');
