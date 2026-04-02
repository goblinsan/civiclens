export default function ScoringMethodology() {
  return (
    <div style={{ maxWidth: '720px' }}>
      <h1 className="page-heading">Scoring Methodology</h1>

      <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
        CivicLens computes an <strong>alignment score</strong> (0–100) for each
        politician that reflects how closely their voting record matches your stated
        policy preferences. This page explains exactly how those scores are calculated.
      </p>

      <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>1. Policy Taxonomy</h2>
      <p style={{ marginBottom: '1rem' }}>
        Politicians and bills are categorised using a fixed set of <strong>policy tags</strong>:
        Civil Rights, Defense, Economy, Education, Environment, Foreign Policy, Healthcare,
        Housing, Immigration, and Infrastructure. Each bill can carry one or more tags.
        Tagging is performed manually using a rules-based system.
      </p>

      <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>2. Questionnaire Responses</h2>
      <p style={{ marginBottom: '0.5rem' }}>For each policy tag you answer, you select one of five stances:</p>
      <table style={{ borderCollapse: 'collapse', marginBottom: '1rem', fontSize: '0.9375rem' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.25rem 1rem 0.25rem 0', borderBottom: '1px solid var(--color-border)' }}>Stance</th>
            <th style={{ textAlign: 'right', padding: '0.25rem 0', borderBottom: '1px solid var(--color-border)' }}>Weight</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['Strongly Support', '+2'],
            ['Support', '+1'],
            ['Skip / No Opinion', '0 (excluded)'],
            ['Oppose', '−1'],
            ['Strongly Oppose', '−2'],
          ].map(([s, w]) => (
            <tr key={s}>
              <td style={{ padding: '0.25rem 1rem 0.25rem 0' }}>{s}</td>
              <td style={{ textAlign: 'right' }}>{w}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginBottom: '1rem' }}>
        <strong>Skipped questions</strong> are completely excluded from the score calculation.
      </p>

      <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>3. Vote Mapping</h2>
      <p style={{ marginBottom: '0.5rem' }}>Each politician's vote is converted to a direction value:</p>
      <table style={{ borderCollapse: 'collapse', marginBottom: '1rem', fontSize: '0.9375rem' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.25rem 1rem 0.25rem 0', borderBottom: '1px solid var(--color-border)' }}>Vote cast</th>
            <th style={{ textAlign: 'right', padding: '0.25rem 0', borderBottom: '1px solid var(--color-border)' }}>Direction</th>
          </tr>
        </thead>
        <tbody>
          {[
            ['Yea', '+1'],
            ['Nay', '−1'],
            ['Abstain', '0 (excluded)'],
            ['Not Voting', '0 (excluded)'],
          ].map(([v, d]) => (
            <tr key={v}>
              <td style={{ padding: '0.25rem 1rem 0.25rem 0' }}>{v}</td>
              <td style={{ textAlign: 'right' }}>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>4. Score Calculation</h2>
      <p style={{ marginBottom: '0.5rem' }}>For each politician and each non-neutral stance you gave on a tag:</p>
      <ol style={{ marginBottom: '1rem', paddingLeft: '1.5rem', lineHeight: '1.75' }}>
        <li>Find every bill tagged with that policy area.</li>
        <li>Find every <em>yea</em> or <em>nay</em> vote cast by the politician on those bills.</li>
        <li>For each vote: <code>contribution = stance_weight × vote_direction</code></li>
        <li>Sum contributions and maximum possible points across all answered tags.</li>
        <li>
          Normalise:{' '}
          <code>score = ((total_raw / total_max) + 1) / 2 × 100</code>
          {' '}→ maps −1 to 0%, +1 to 100%, and equal split to 50%.
        </li>
      </ol>
      <p style={{ marginBottom: '1rem' }}>
        When no relevant votes are found the score defaults to <strong>50%</strong> (no data).
      </p>

      <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>5. Confidence</h2>
      <p style={{ marginBottom: '0.5rem' }}>Confidence reflects how many relevant yea/nay votes were found:</p>
      <table style={{ borderCollapse: 'collapse', marginBottom: '1rem', fontSize: '0.9375rem' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.25rem 1rem 0.25rem 0', borderBottom: '1px solid var(--color-border)' }}>Votes found</th>
            <th style={{ textAlign: 'left', padding: '0.25rem 0', borderBottom: '1px solid var(--color-border)' }}>Badge</th>
          </tr>
        </thead>
        <tbody>
          {[['0', 'No data'], ['1–2', 'Low'], ['3–7', 'Medium'], ['8+', 'High']].map(([n, b]) => (
            <tr key={n}>
              <td style={{ padding: '0.25rem 1rem 0.25rem 0' }}>{n}</td>
              <td>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>6. Limitations</h2>
      <ul style={{ marginBottom: '1rem', paddingLeft: '1.5rem', lineHeight: '1.75' }}>
        <li>CivicLens does <strong>not</strong> infer ideology or political affiliation from scores.</li>
        <li>A high score does not mean a politician is "better" or that you should vote for them.</li>
        <li>Scores can change as more bills are tagged and more votes are recorded.</li>
        <li>Bill tagging is an editorial judgment; a single tag may not capture a bill's full complexity.</li>
        <li>Abstentions and non-participation are excluded — a politician who often skips votes on a topic will appear neutral.</li>
      </ul>

      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
        Use scores as one data point alongside your own research.
      </p>
    </div>
  );
}
