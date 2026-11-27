#!/usr/bin/env node
// Shows exactly how one headline is judged, using the same rules as the pipeline. No network.
//   node scripts/explain-headline.mjs "China warns US over chip export controls"
//   node scripts/explain-headline.mjs "Headline" https://www.reuters.com/x     (optional second argument: the article link, to see its source label)
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMatchers, matchCountries } from './rss-lib.mjs';
import { compileRules, classify, roleFor, classifySource } from './relevance-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { COUNTRY_TERMS } = await import(pathToFileURL(path.join(ROOT, 'data', 'country-terms.mjs')).href);
const { RULES } = await import(pathToFileURL(path.join(ROOT, 'data', 'relevance-rules.mjs')).href);
const args = process.argv.slice(2), url = args.length > 1 && /^https?:\/\//.test(args[args.length - 1]) ? args.pop() : null, title = args.join(' ');
if (!title) { console.log('Usage: node scripts/explain-headline.mjs "headline text"'); process.exit(1); }
const MS = buildMatchers(COUNTRY_TERMS), CR = compileRules(RULES), m = matchCountries(MS, title, ''), ids = Object.keys(m), c = classify(title, CR, ids.length);
console.log('Headline:', title);
console.log('Countries:', ids.length ? Object.entries(m).map(([id, x]) => `${id} (${x.level}: ${x.terms.join(', ')}; role: ${x.level === 'summary' ? 'n/a' : roleFor(title, id, MS[id], ids, c.maxWeight, CR)})`).join('; ') : 'none, so it would not be stored');
if (url) console.log('Source:   ', classifySource(url).tier, '(label of the outlet from its domain; not a fact-check)');
console.log('Topics:   ', c.topics.length ? c.topics.map(t => `${t.label} (${t.terms.join(', ')})`).join('; ') : 'none');
console.log('Score:    ', c.score, `(${c.tier})`);
if (c.style) console.log('Style:    ', 'sensational wording flagged (' + c.style.terms.join(', ') + '), score lowered by 1');
console.log('Verdict:  ', c.filtered ? `FILTERED as ${c.filtered.kind === 'off-topic' ? 'off-topic (' + c.filtered.group + ')' : 'a routine financial notice'} (${c.filtered.terms.join(', ')})` : Object.keys(m).length ? 'shown' : 'not stored');
