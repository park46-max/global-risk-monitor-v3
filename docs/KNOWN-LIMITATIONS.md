# Known limitations

Global Risk Monitor is an independent International Relations and data-monitoring portfolio project. It is **not** a comprehensive geopolitical intelligence service, it makes **no forecasts or predictions**, and it does not independently verify individual news items.

1. **Keyword-based topic classification.** Topic labels (security, diplomacy, sanctions and trade, economic policy) come from fixed keyword rules on headline text. The articles are not read. A keyword match is not confirmed substantive coverage: for example "truce", "war" or "espionage" in a trade headline counts as security wording, and "sanctioned by China" counts as sanctions wording.
2. **Selection bias in Media Coverage Patterns.** The "N of 12" figures count the 12 highest-ranked unique headlines. The ranking score adds points for the same topic keywords, so topic proportions are pushed up. They are **not representative** of all matching reports or of overall media coverage. (Production check, 2026-11-27: e.g. China security 11 of 12 shown vs 24 of 45 across all matching reports; Russia diplomacy 8 of 12 vs 10 of 40.) The page states this by default.
3. **Country relevance false positives.** Matching uses country, capital, institution and name terms. A sea or an institution name can match (e.g. "South China Sea" in a Malaysia headline). A headline naming two countries does not show how they are connected. One headline can appear in several countries' briefs.
4. **Duplicates.** Syndicated copies are grouped only when the headline text matches. The same story in different wording counts as separate headlines. Repeats are not independent corroboration.
5. **Incomplete GDELT coverage.** GDELT files can be missing in a run (368 listed, 27 missing in the 2026-11-27 cache), many items have no publication time, and GDELT's first-seen time is not the publication time.
6. **Unassessed publisher quality.** Outlet labels come from short fixed lists; most outlets (176 of 186 items) are unassessed. Some sources are blogs or community posts.
7. **Annual and lagged risk data.** UCDP/PRIO, WGI and World Bank indicators are annual and lag by months or years. Outdated indicator values (over 3 years old) are excluded, not replaced.
8. **WGI uncertainty not retrieved.** Only point estimates are used. The WGI margins of error are not retrieved or shown, so small differences between countries should not be over-read.
9. **Internal consistency, not independent verification.** The project's own code reproduces the production cache files exactly, and an independent re-implementation matched all 61 risk comparisons. The original UCDP and World Bank datasets were not re-downloaded and compared, and individual news items were not checked against their articles.
10. **No defensible diplomatic risk dataset.** The Diplomatic category stays "Insufficient data" for every country. Headlines never change a risk level.
11. **Taiwan.** Treated neutrally; UCDP and World Bank coverage differs for Taiwan and missing data is never shown as low risk. The cross-strait situation is not captured by an armed-conflict dataset.
12. **Third-party scripts.** The globe library loads from the jsDelivr CDN at a floating major version without a Subresource Integrity hash. A pinned version and verified hash have not yet been established (see LICENSING-AND-ATTRIBUTION.md).

## Publisher headlines in Git history (Stage 10.2)
Each scheduled run commits the cache files, so earlier headline copies remain in the repository history, forks and clones. The exclusion list cleans current files only. Options for limiting accumulation are assessed (read-only, nothing applied) in the Stage 10.2 report; any change needs separate approval.
