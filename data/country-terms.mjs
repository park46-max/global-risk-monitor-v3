// HOW A HEADLINE IS MATCHED TO ONE OF THE FIVE COUNTRIES. Plain word matching, no AI. Edit here, then run: node tests/test-relevance.mjs
//
// Each country has two kinds of term, and the page labels them differently:
//   kind 'name'        the country's own name or its demonym ("China", "Chinese"). Shown as: "Country named in headline".
//   kind 'institution' a capital or a government/armed-forces body that is routinely used to mean the state ("Beijing", "Kremlin", "Pentagon").
//                      Shown as: "Capital or government body named in headline". Weaker than a name, and labelled that way.
//
// PEOPLE ARE NEVER MATCH TERMS. A leader's name is not a country identifier: "Trump" can appear in a headline about golf, a company or a court case,
// and leaders change. A headline such as "Trump announces tariffs on China" is still matched to China because it names China.
// The trade-off is that a headline naming only a leader ("Putin says ...") is not matched to any country. tests/test-relevance.mjs enforces this rule.
//
// Other rules: whole words only ("Chinatown" does not match "China"); case-insensitive unless cs:true (so "US" does not match the word "us").
// Deliberately NOT used because they are ambiguous or contested: "Washington" alone, "America", "Congress", "Georgia", "Hong Kong".
export const COUNTRY_TERMS = {
  USA: [
    { t: 'United States', kind: 'name' }, { t: 'U.S.', kind: 'name', cs: true }, { t: 'US', kind: 'name', cs: true }, { t: 'USA', kind: 'name', cs: true },
    { t: 'White House', kind: 'institution' }, { t: 'Pentagon', kind: 'institution' }, { t: 'State Department', kind: 'institution' },
    { t: 'Treasury Department', kind: 'institution' }, { t: 'Washington DC', kind: 'institution' }, { t: 'Washington, D.C.', kind: 'institution' }
  ],
  CHN: [
    { t: 'China', kind: 'name' }, { t: 'Chinese', kind: 'name' },
    { t: 'Beijing', kind: 'institution' }, { t: 'PLA', kind: 'institution', cs: true }, { t: "People's Liberation Army", kind: 'institution' }
  ],
  RUS: [
    { t: 'Russia', kind: 'name' }, { t: 'Russian', kind: 'name' }, { t: 'Russians', kind: 'name' },
    { t: 'Moscow', kind: 'institution' }, { t: 'Kremlin', kind: 'institution' }
  ],
  UKR: [
    { t: 'Ukraine', kind: 'name' }, { t: 'Ukrainian', kind: 'name' }, { t: 'Ukrainians', kind: 'name' },
    { t: 'Kyiv', kind: 'institution' }, { t: 'Kiev', kind: 'institution' }
  ],
  TWN: [
    { t: 'Taiwan', kind: 'name' }, { t: 'Taiwanese', kind: 'name' },
    { t: 'Taipei', kind: 'institution' }
  ]
};
