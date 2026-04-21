# Scoring Methodology

CivReveal computes an **alignment score** (0–100) for each politician that
reflects how closely their voting record matches your stated policy preferences.
This document explains exactly how those scores are calculated so you can
evaluate the results with appropriate context.

---

## 1. Policy Taxonomy

Politicians and bills are both categorised using a fixed set of **policy tags**:

| Slug            | Label           |
| --------------- | --------------- |
| `civil-rights`  | Civil Rights    |
| `defense`       | Defense         |
| `economy`       | Economy         |
| `education`     | Education       |
| `environment`   | Environment     |
| `foreign-policy`| Foreign Policy  |
| `healthcare`    | Healthcare      |
| `housing`       | Housing         |
| `immigration`   | Immigration     |
| `infrastructure`| Infrastructure  |

Each bill can carry one or more of these tags. Tagging is performed manually
using a rules-based system; the methodology is kept transparent so that it can
be audited and improved over time.

---

## 2. Questionnaire Responses

For each policy tag you choose to answer, you select one of five stances:

| Stance             | Weight |
| ------------------ | ------:|
| Strongly Support   |     +2 |
| Support            |     +1 |
| Skip / No Opinion  |      0 |
| Oppose             |     -1 |
| Strongly Oppose    |     -2 |

**Skipped questions** (neutral / no opinion) are completely excluded from the
score calculation. Your answer only influences results for topics you actually
rated.

---

## 3. Vote Mapping

Each politician's vote on a roll-call is converted to a **direction value**:

| Vote cast      | Direction |
| -------------- | --------: |
| Yea            |        +1 |
| Nay            |        -1 |
| Abstain        |         0 |
| Not voting     |         0 |

Abstentions and non-participation are treated as **no signal** — they neither
help nor hurt a politician's alignment score.

---

## 4. Score Calculation

### Per-tag contribution

For each non-neutral stance you gave on tag **T** and each politician **P**:

1. Find every bill tagged with **T**.
2. Find every vote where **P** cast a `yea` or `nay` on those bills.
3. For each such vote:
   - `contribution = stance_weight × vote_direction`
   - `max_possible += |stance_weight|`
4. Sum contributions: `tag_raw = Σ contribution`

### Normalising to 0–100

Once the per-tag values are aggregated across all answered tags:

```
raw_ratio = total_raw / total_max_possible   ∈ [-1, 1]
score     = ((raw_ratio + 1) / 2) × 100      ∈ [0, 100]
```

This maps perfect alignment to **100**, perfect misalignment to **0**, and
equal yea/nay split (or no data) to **50**.

### No data

If no bills tagged with your chosen topics have recorded votes by the
politician, there is no signal. The score defaults to **50** — the neutral
midpoint — and a **"No data"** confidence badge is shown.

---

## 5. Confidence

The **confidence badge** reflects how many relevant `yea`/`nay` votes were
found for each politician across your answered topics:

| Votes found | Badge      |
| ----------- | ---------- |
| 0           | No data    |
| 1–2         | Low        |
| 3–7         | Medium     |
| 8+          | High       |

Low confidence scores should be interpreted cautiously. A politician may simply
have a thin voting record on a topic, not necessarily a different stance.

---

## 6. Per-Issue Breakdown

The **Show issue breakdown** panel lists per-tag alignment scores using the
same formula above applied to each tag independently. This lets you see where
alignment is strong and where it diverges.

---

## 7. What These Scores Do NOT Mean

- **CivReveal does not infer ideology or political affiliation** from scores.
- **A high score does not mean a politician is "good"** or that you should vote
  for them.
- **Scores can change** as more bills are tagged and more votes are recorded.
- **Bill tagging is an editorial judgment**. A bill may carry a tag while
  representing a complex policy trade-off that a single tag cannot capture.
- **Abstentions and absences are excluded**, so a politician who consistently
  skips votes on a topic will appear neutral regardless of their stated views.

Use scores as one data point alongside your own research.

---

## 8. Source Data

- **Voting records** are sourced from the U.S. Senate roll-call archives
  (senate.gov) and the House Office of the Clerk (clerk.house.gov).
- **Bills** are sourced from Congress.gov via the Congress.gov API.
- Data ingestion is described in [data-ingestion.md](./data-ingestion.md).

---

*Last updated: April 2026*
