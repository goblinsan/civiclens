import { Link } from 'react-router-dom';

const REPO = 'https://github.com/goblinsan/civiclens/blob/main';

const h2 = { fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem', marginTop: '1.5rem' } as const;
const p = { marginBottom: '0.75rem', lineHeight: 1.7 } as const;
const th = { textAlign: 'left', padding: '0.25rem 1rem 0.25rem 0', borderBottom: '1px solid var(--color-border)' } as const;
const td = { padding: '0.25rem 1rem 0.25rem 0' } as const;

export default function ScoringMethodology() {
  return (
    <div style={{ maxWidth: '720px' }}>
      <h1 className="page-heading">How matching works</h1>

      <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
        CivReveal gives every sitting member a <strong>match score</strong> from 0 to 100: how often
        their recorded votes, on bills that advance or hinder the goals you answered, went the way
        you would have wanted. This page is the whole method. Everything it describes can be checked
        from a member's match card or a bill's page.
      </p>

      <h2 style={h2}>1. Goals, not topics</h2>
      <p style={p}>
        The questionnaire asks about <strong>goals</strong>: concrete directions Congress could take,
        such as “Expand nuclear power generation” or “Let the federal government negotiate or cap
        prescription drug prices”. Goals are independent. Supporting one never implies a position
        on another. You answer <em>support</em> or <em>oppose</em> and say how much it matters
        (a little, some, a lot). Anything you skip is ignored.
      </p>
      <p style={p}>
        The full list, with the rules for writing a goal fairly, is public:{' '}
        <a href={`${REPO}/docs/policy-goals.md`} target="_blank" rel="noopener noreferrer">docs/policy-goals.md ↗</a>.
      </p>

      <h2 style={h2}>2. Bills are coded for their effect on goals</h2>
      <p style={p}>
        A bill counts only once it has been coded as <strong>advancing</strong> or{' '}
        <strong>hindering</strong> a goal, with a strength (partial, clear, or the bill's central
        purpose), a written rationale, and the passage of the official Congressional Research Service
        summary the rationale rests on. Every coding is shown on the bill's page.
      </p>
      <p style={p}>
        Coding is editorial, and it is treated that way: codings live in a public file, every change
        goes through review before it counts, and the history is kept.{' '}
        <a href={`${REPO}/data/bill-goal-effects`} target="_blank" rel="noopener noreferrer">See the codings and their history ↗</a>.
        A bill with no coding affects no score.
      </p>

      <h2 style={h2}>3. Which votes count</h2>
      <p style={p}>
        Only roll-calls that decide the bill itself: passage, suspension votes to pass or agree,
        agreeing to a resolution or conference report, concurring in the other chamber's amendment,
        and veto overrides. Procedural votes (motions to recommit, previous-question votes, rules,
        tabling) and votes on amendments are excluded until they are coded in their own right.
        Abstentions and absences are no signal either way.
      </p>

      <h2 style={h2}>4. The arithmetic</h2>
      <p style={p}>For each of your answered goals and each coded bill with a decisive roll-call:</p>
      <table style={{ borderCollapse: 'collapse', marginBottom: '1rem', fontSize: '0.9375rem' }}>
        <thead>
          <tr><th style={th}>Your answer</th><th style={th}>Bill coding</th><th style={th}>Member's vote</th><th style={th}>Agreement</th></tr>
        </thead>
        <tbody>
          <tr><td style={td}>support</td><td style={td}>advances</td><td style={td}>yea</td><td style={td}>+1</td></tr>
          <tr><td style={td}>support</td><td style={td}>advances</td><td style={td}>nay</td><td style={td}>−1</td></tr>
          <tr><td style={td}>support</td><td style={td}>hinders</td><td style={td}>nay</td><td style={td}>+1</td></tr>
          <tr><td style={td}>oppose</td><td style={td}>advances</td><td style={td}>yea</td><td style={td}>−1</td></tr>
        </tbody>
      </table>
      <p style={p}>
        Each vote weighs <em>importance × strength</em> (1–3 each). The score is the weighted share of
        agreement mapped onto 0–100: <code>((Σ agreement × weight) / (Σ weight) + 1) / 2 × 100</code>.
        All votes agreeing gives 100, all disagreeing gives 0, an even split or no data gives 50.
        The per-goal breakdown uses the same formula on one goal at a time.
      </p>

      <h2 style={h2}>5. Confidence</h2>
      <p style={p}>
        The confidence badge counts the decisive votes behind a score: none (no data), 1–2 (low),
        3–7 (medium), 8 or more (high). A low-confidence score says little about the member and a
        lot about how few coded bills have reached a vote so far.
      </p>

      <h2 style={h2}>6. What these scores are not</h2>
      <ul style={{ paddingLeft: '1.25rem', lineHeight: 1.8, marginBottom: '1rem' }}>
        <li>Not an ideology or party measure. The goals are written to be answerable either way.</li>
        <li>Not a verdict on anyone. A high score means the record agreed with <em>your</em> answers.</li>
        <li>Not complete. Scores move as more bills are coded and more votes are recorded.</li>
        <li>Not the official record. Codings and bill briefs are CivReveal's reading of it, labelled
          “Analysis” wherever they appear; the official summary and vote tallies sit beside them.</li>
      </ul>

      <h2 style={h2}>7. Sources</h2>
      <p style={p}>
        Bills, summaries, classification and House roll-calls come from the Congress.gov API; Senate
        roll-calls from senate.gov. See <Link to="/data-sources">Data sources</Link> and{' '}
        <a href={`${REPO}/docs/scoring-methodology.md`} target="_blank" rel="noopener noreferrer">the written methodology ↗</a>.
      </p>
    </div>
  );
}
