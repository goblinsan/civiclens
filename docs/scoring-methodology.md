# Scoring Methodology

CivReveal computes a **match score** (0–100) for each sitting member of
Congress: how often their recorded votes, on bills coded as advancing or
hindering the goals a respondent answered, went the way the respondent would
have wanted. This document is the complete method. The web page at
`/methodology` says the same thing in fewer words.

---

## 1. Goals, not topics

The questionnaire asks about **policy goals**: concrete directions of federal
action, e.g. *Expand nuclear power generation*, *Let the federal government
negotiate or cap prescription drug prices*. Goals are independent of each
other; supporting one never implies a position on another. For each goal a
respondent answers **support** or **oppose** and an **importance** (1 a
little, 2 some, 3 a lot). Skipped goals are ignored.

The list and the rules for writing a fair goal are in
[policy-goals.md](./policy-goals.md); the canonical machine-read copy is
`data/policy-goals.json`.

Policy *tags* (`bill_tags`, see [bill-tagging.md](./bill-tagging.md)) still
exist: they say what a bill is about and drive browsing. They play no part in
scoring, because a tag cannot say which way a vote pushes a topic.

## 2. Bill → goal effect codings

A bill counts toward a score only once it carries a **coding**: for one goal,
whether the bill *advances* or *hinders* it, a **strength** (1 partial, 2
clear, 3 central purpose), a written **rationale**, and the **evidence**: the
passage of the official CRS summary the rationale rests on.

Codings are editorial and are handled as such:

- They live in `data/bill-goal-effects/<congress>.json`, one entry per
  (bill, goal).
- The pull request that adds or changes an entry is the review; nothing
  counts until it is merged, and `git log` is the audit trail.
- `pnpm db:sync-goals` (run by the ingest workflow after migrations) loads
  merged files into `bill_goal_effects`; entries removed from the file are
  removed from the database.
- Every coding is shown on the bill's page with its rationale and evidence.

Only bills with a recorded roll-call vote are worth coding; the **Coding
candidates** workflow exports them with their summaries and the goals whose
candidate terms match their official classification.

## 3. Which roll-calls count

Only votes whose question decides the bill itself. The rule is one tested
function (`apps/api/src/scoring/goalScoring.ts`, `isDecisiveQuestion`),
applied identically in SQL:

| Counted | Excluded |
| --- | --- |
| On Passage (incl. "Objections of the President Notwithstanding") | On Motion to Recommit / to Commit |
| On Motion to Suspend the Rules and Pass / Agree / Concur… | On Ordering the Previous Question |
| On Agreeing to the Resolution / Concurrent Resolution / Conference Report | On Agreeing to the Amendment, On the Amendment |
| On Concurring in the Senate Amendment, On Motion to Concur… | Rules ("Providing for Consideration…"), tabling, adjourning, the Journal, quorum calls, instructing conferees |
| On Overriding the Veto | Votes with no recorded question |

Amendments are excluded until they are coded in their own right. `yea` and
`nay` are the only positions that count; abstentions and absences are no
signal.

## 4. Arithmetic

For a respondent's answer *(stance s, importance w)* on goal G, a coding
*(effect e, strength k)* of bill B for G, and a member's decisive vote *v* on
B:

```
direction(s) = +1 support, −1 oppose
direction(e) = +1 advances, −1 hinders
direction(v) = +1 yea, −1 nay

agreement = direction(s) × direction(e) × direction(v)     ∈ {+1, −1}
weight    = w × k                                          ∈ [1, 9]
```

Per goal and overall:

```
ratio = Σ agreement × weight / Σ weight     ∈ [−1, 1]
score = (ratio + 1) / 2 × 100               ∈ [0, 100]
```

All votes agreeing gives 100; all disagreeing 0; an even split, or no data,
50. The overall score pools every (goal, bill, vote) triple; the per-goal
breakdown applies the same formula to one goal at a time. Both are stored in
`match_results` (`breakdown.goals[slug] = {score, votes, agreed}`,
`breakdown._total_votes`).

A worked example: importance 3 on a goal, a strength-3 coding, one yea
(+9), plus importance 1 on another goal, a strength-1 coding, one nay (−1):
ratio = 8 / 10, score = 90.

## 5. Confidence

The badge counts the decisive votes behind a score:

| Votes | Badge |
| --- | --- |
| 0 | No data |
| 1–2 | Low |
| 3–7 | Medium |
| 8+ | High |

## 6. Showing the work

- A member's match card lists **the votes that counted**: bill, question,
  date, the member's position, the goal, the coding, and whether the vote
  agreed with the respondent (`GET /questionnaire/matches/:politicianId/evidence`).
- A bill's page shows its codings and, where one exists, its **brief**: what
  the bill would likely do in plain words, each likely result with the
  assumptions it needs and what similar efforts produced before, who is likely
  to benefit most and who bears the cost, and the official estimates (CBO,
  JCT, GAO) relied on. Briefs live in `data/bill-briefs/` under the same
  review rule and are labelled *Analysis* on the site.

## 7. What these scores are not

- Not an ideology or party measure. Goals are written so that *oppose* is a
  legitimate answer to each.
- Not a verdict. A high score means the record agreed with the respondent's
  own answers.
- Not complete. Scores move as bills are coded and votes recorded; a low
  confidence badge says more about coverage than about the member.
- Not the official record. Codings and briefs are CivReveal's reading of it;
  the official summary, classification and tallies sit beside them.

## 8. Source data

- Bills, summaries, official classification and CBO estimate links: the
  Congress.gov API.
- House roll-calls with every member's position: the Congress.gov
  `house-vote` endpoint.
- Senate roll-calls: senate.gov LIS XML (subject to the access described in
  [data-ingestion.md](./data-ingestion.md)).

---

*Last updated: November 2026*
