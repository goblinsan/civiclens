import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getBillAnalysis } from '../api';
import type { BillBrief, BillGoalEffect } from '../api';

const CODINGS_URL = 'https://github.com/goblinsan/civiclens/tree/main/data/bill-goal-effects';
const BRIEFS_URL = 'https://github.com/goblinsan/civiclens/tree/main/data/bill-briefs';

const STRENGTH: Record<number, string> = { 1: 'partial', 2: 'clear', 3: 'central purpose' };

function AnalysisLabel() {
  return <span className="analysis-label" title="Written by CivReveal and reviewed before publication; not part of the official record">Analysis</span>;
}

function Effects({ effects }: { effects: BillGoalEffect[] }) {
  return (
    <div className="detail-section">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <h2 className="detail-section-title" style={{ marginBottom: 0, border: 'none', paddingBottom: 0 }}>What this bill does to policy goals</h2>
        <AnalysisLabel />
      </div>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', margin: '0 0 0.75rem' }}>
        Each coding says which questionnaire goal the bill advances or hinders and quotes the passage
        of the official summary it rests on. These codings are what make a vote on this bill count
        toward a <Link to="/questionnaire">match score</Link>.{' '}
        <a href={CODINGS_URL} target="_blank" rel="noopener noreferrer">Review history ↗</a>
      </p>
      {effects.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
          Not yet coded against any goal, so votes on it do not affect match scores.
        </p>
      ) : (
        <ul className="effect-list">
          {effects.map((e) => (
            <li key={e.goal_slug} className="effect-item">
              <div className="effect-head">
                <span className={`effect-badge effect-${e.effect}`}>{e.effect}</span>
                <strong>{e.goal_statement}</strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{e.area_label} · {STRENGTH[e.strength]}</span>
              </div>
              <p style={{ margin: 0 }}>{e.rationale}</p>
              <blockquote className="effect-evidence">“{e.evidence}” — official CRS summary</blockquote>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Brief({ brief }: { brief: BillBrief }) {
  return (
    <div className="detail-section">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <h2 className="detail-section-title" style={{ marginBottom: 0, border: 'none', paddingBottom: 0 }}>What this bill would likely do</h2>
        <AnalysisLabel />
      </div>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', margin: '0 0 0.75rem' }}>
        Plain-language analysis of likely results if the bill took effect, the assumptions each
        rests on, and what similar efforts produced before. It is a reading of the record, not
        the record.{' '}
        <a href={BRIEFS_URL} target="_blank" rel="noopener noreferrer">Review history ↗</a>
      </p>

      <p style={{ lineHeight: 1.7, margin: '0 0 1rem' }}>{brief.plain_summary}</p>

      <h3 style={{ fontSize: '0.9375rem', margin: '0 0 0.5rem' }}>Likely results</h3>
      {brief.scenarios.map((s, i) => (
        <div key={i} className="scenario">
          <p className="scenario-outcome">
            {s.outcome}
            <span className="likelihood">{s.likelihood}</span>
          </p>
          <h4>Only if</h4>
          <ul>{s.assumptions.map((a, j) => <li key={j}>{a}</li>)}</ul>
          {s.precedents.length > 0 && (
            <>
              <h4>What similar efforts produced</h4>
              <ul>
                {s.precedents.map((p, j) => (
                  <li key={j}>
                    <strong>{p.what}</strong> ({p.when}): {p.result}
                    {p.source && <> <a href={p.source} target="_blank" rel="noopener noreferrer">source ↗</a></>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ))}

      <div className="stakeholders" style={{ marginTop: '1rem' }}>
        <div>
          <h3 style={{ fontSize: '0.9375rem', margin: '0 0 0.375rem' }}>Who is likely to benefit most</h3>
          <ul>{brief.likely_beneficiaries.map((s, i) => <li key={i}><strong>{s.who}</strong>: {s.how}</li>)}</ul>
        </div>
        {brief.likely_costs.length > 0 && (
          <div>
            <h3 style={{ fontSize: '0.9375rem', margin: '0 0 0.375rem' }}>Who is likely to bear the cost</h3>
            <ul>{brief.likely_costs.map((s, i) => <li key={i}><strong>{s.who}</strong>: {s.how}</li>)}</ul>
          </div>
        )}
      </div>

      {brief.official_estimates.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
            <h3 style={{ fontSize: '0.9375rem', margin: 0 }}>Official estimates this rests on</h3>
            <span className="source-label source-label-official" style={{ fontSize: '0.7rem' }}>Official</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem' }}>
            {brief.official_estimates.map((e, i) => (
              <li key={i}><a href={e.url} target="_blank" rel="noopener noreferrer">{e.source} ↗</a>: {e.finding}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function BillAnalysis({ billId }: { billId: string }) {
  const [data, setData] = useState<{ effects: BillGoalEffect[]; brief: BillBrief | null } | null>(null);

  useEffect(() => {
    getBillAnalysis(billId).then(setData).catch(() => setData({ effects: [], brief: null }));
  }, [billId]);

  if (!data) return null;
  return (
    <>
      {data.brief && <Brief brief={data.brief} />}
      <Effects effects={data.effects} />
    </>
  );
}
