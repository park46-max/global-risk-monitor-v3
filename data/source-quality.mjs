// SOURCE LABELS. A conservative, transparent policy for labelling the outlet behind a headline. No AI, no paid service, no fact-checking.
// Read by scripts/relevance-lib.mjs. Edit here, then run: node tests/test-relevance.mjs
//
// WHAT THIS IS
//   A label for the OUTLET (judged from the domain of the article link), never a judgement of a single headline. A headline from an
//   "established outlet" has NOT been fact-checked by this project, and a headline from an unlisted outlet is NOT claimed to be unreliable.
//
// THE THREE LABELS
//   established   Listed below. Criteria (all must hold): the outlet is a news agency, a national broadcaster with statutory editorial independence,
//                 or a long-running newspaper/magazine; it is not owned or run by a government or ruling party; and it publishes a named
//                 editorial or corrections policy. Membership is a starting point that the project owner reviews, not a ranking of accuracy.
//   state         Listed below. Criterion: the outlet or site is owned or directly run by a government or ruling party (ownership only). The list is
//                 deliberately not limited to the five monitored countries: it includes outlets of each of them and of others. The label says
//                 "expect the government's own framing"; it does not say the content is false, and it is not a blacklist.
//   unassessed    Everything else. This is the default and means only "not on either list". It does not mean unreliable.
//
// WHAT THE LABELS DO (and nothing more)
//   - They are shown next to each article, with the wording below.
//   - Between two otherwise equal articles (same score), an established outlet is preferred as the representative of a duplicate group and listed first.
//   - Nothing is hidden or removed because of a label. No score is changed by a label.
//
// LIMITATIONS
//   The lists are short and were compiled from general knowledge; they are not checked against any registry and some outlets fit more than one
//   description (public broadcasters that are state-funded but editorially independent were left unlisted rather than guessed). Add or remove
//   domains by editing the lists; subdomains match automatically ("news.bbc.co.uk" matches "bbc.co.uk").
export const SOURCE_POLICY = {
  version: 1,
  labels: {
    established: 'Established outlet (news agency, broadcaster or long-running publication with a published editorial policy). Not a fact-check of this headline.',
    state: 'State-owned or government-run outlet: expect the government\'s own framing. Ownership label only, not a finding about accuracy.',
    unassessed: 'Outlet not assessed by this project. This does not mean it is unreliable.'
  },
  established: [
    'reuters.com', 'apnews.com', 'afp.com', 'bbc.com', 'bbc.co.uk', 'npr.org', 'pbs.org', 'nytimes.com', 'washingtonpost.com', 'wsj.com', 'ft.com',
    'economist.com', 'bloomberg.com', 'theguardian.com', 'cbsnews.com', 'nbcnews.com', 'abcnews.go.com', 'cnn.com', 'politico.com', 'thehill.com',
    'usatoday.com', 'latimes.com', 'time.com', 'foreignpolicy.com', 'foreignaffairs.com', 'defensenews.com', 'japantimes.co.jp', 'straitstimes.com',
    'kyivindependent.com', 'taipeitimes.com'
  ],
  state: [
    'tass.com', 'tass.ru', 'ria.ru', 'sputnikglobe.com', 'rt.com', 'kremlin.ru', 'mid.ru',
    'xinhuanet.com', 'news.cn', 'globaltimes.cn', 'cgtn.com', 'chinadaily.com.cn', 'people.com.cn', 'mfa.gov.cn',
    'ukrinform.net', 'ukrinform.ua', 'mfa.gov.ua',
    'voanews.com', 'whitehouse.gov', 'state.gov', 'defense.gov', 'war.gov',
    'presstv.ir'
  ],
  // Headline STYLE flag (about the wording, not the outlet). A flagged headline has its score lowered by 1 (never below 0) and shows the reason.
  sensational: {
    phrases: ["you won't believe", 'shocking', 'bombshell', 'jaw-dropping', 'mind-blowing', 'what happens next', 'goes viral', 'must see', 'unbelievable',
      'destroys', 'obliterates', 'humiliates', 'meltdown'],
    exclamation: true,        // a "!" anywhere in the headline
    capsShare: 0.7,           // share of capital letters among all letters, for headlines with at least capsMinLetters letters
    capsMinLetters: 15,
    scorePenalty: 1
  }
};
