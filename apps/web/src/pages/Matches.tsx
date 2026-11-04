import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getMatches, getMatchEvidence } from '../api';
import type { MatchEvidence, MatchResult } from '../api';
import { track } from '../analytics';

const SESSION_KEY = 'civreveal_session_id';

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score);
  const color =
    pct >= 70 ? 'var(--color-success)' :
    pct >= 40 ? 'var(--color-warning)' :
                'var(--color-danger)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{ flex: 1, height: '0.5rem', background: 'var(--color-border)', borderRadius: '9999px', overflow: 'hidden' }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '9999px', transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ minWidth: '2.75rem', fontSize: '0.875rem', fontWeight: 600, color }}>{pct}%</span>
    </div>
  );
}

function ConfidenceBadge({ votes }: { votes: number }) {
  const [label, bg, text] =
    votes === 0  ? ['No data',  '#f3f4f6', '#6b7280'] :
    votes < 3    ? ['Low',      '#fef3c7', '#78350f'] :
    votes < 8    ? ['Medium',   '#dbeafe', '#1e40af'] :
                   ['High',     '#d1fae5', '#065f46'];
  return (
    <span
      style={{ fontSize: '0.6875rem', fontWeight: 600, padding: '0.125rem 0.5rem', borderRadius: '9999px', background: bg, color: text, textTransform: 'uppercase', letterSpacing: '0.04em' }}
      title={`${votes} decisive vote${votes === 1 ? '' : 's'} on bills coded for your goals`}
    >
      {label} confidence
    </span>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function describe(e: MatchEvidence): string {
  const verb = e.effect === 'advances' ? 'advances' : 'hinders';
  const you = e.stance === 'support' ? 'support' : 'oppose';
  return `This bill ${verb} a goal you ${you}; a ${e.position} vote ${e.agreed ? 'went your way' : 'went against you'}.`;
}

function EvidenceList({ sessionId, politicianId }: { sessionId: string; politicianId: string }) {
  const [rows, setRows] = useState<MatchEvidence[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMatchEvidence(sessionId, politicianId)
      .then(setRows)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load votes.'));
  }, [sessionId, politicianId]);

  if (error) return <p style={{ color: 'var(--color-danger)', fontSize: '0.8125rem' }}>{error}</p>;
  if (!rows) return <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>Loading votes…</p>;
  if (rows.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem', margin: '0.75rem 0 0' }}>
        No decisive roll-call by this member on a bill coded for your goals yet.
      </p>
    );
  }
  return (
    <ul className="evidence-list" aria-label="Votes that counted">
      {rows.map((e) => (
        <li key={`${e.vote_id}-${e.goal_slug}`} className="evidence-item">
          <span className={`evidence-mark ${e.agreed ? 'evidence-mark-agreed' : 'evidence-mark-disagreed'}`}>
            {e.agreed ? 'Agreed' : 'Disagreed'}
          </span>
          <div>
            <div>
              <span className={`vote-${e.position}`}>{e.position}</span>{' '}
              on <Link to={`/bills/${e.bill_id}`}>{e.bill_type} {e.bill_number}</Link> · {e.question} · {formatDate(e.vote_date)}
            </div>
            <div style={{ marginTop: '0.125rem' }}>{e.bill_title}</div>
            <div className="evidence-why">
              Goal: <em>{e.goal_statement}</em>. {describe(e)}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function MatchCard({ match, sessionId }: { match: MatchResult; sessionId: string }) {
  const [open, setOpen] = useState(false);
  const [showVotes, setShowVotes] = useState(false);
  const score = parseFloat(match.score);
  const goalEntries = Object.entries(match.breakdown.goals ?? {}).sort((a, b) => b[1].score - a[1].score);

  return (
    <article className="card">
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        <div style={{ flexShrink: 0 }}>
          {match.image_url ? (
            <img
              src={match.image_url}
              alt={`${match.first_name} ${match.last_name}`}
              style={{ width: '3rem', height: '3rem', borderRadius: '50%', objectFit: 'cover' }}
              loading="lazy"
            />
          ) : (
            <div
              aria-hidden
              style={{ width: '3rem', height: '3rem', borderRadius: '50%', background: 'var(--color-primary-light)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1rem' }}
            >
              {match.first_name.charAt(0)}{match.last_name.charAt(0)}
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="card-title" style={{ marginBottom: '0.25rem' }}>
            <Link to={`/politicians/${match.politician_id}`}>{match.first_name} {match.last_name}</Link>
          </h2>
          <div className="card-meta" style={{ marginBottom: '0.625rem' }}>
            <span className={`party-badge party-${match.party}`}>{match.party}</span>
            <span className={`chamber-badge chamber-${match.chamber}`}>{match.chamber}</span>
            <span>{match.state}</span>
            <ConfidenceBadge votes={match.total_votes} />
          </div>
          <ScoreBar score={score} />
        </div>
      </div>

      {goalEntries.length > 0 && (
        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8125rem', padding: '0.25rem 0.625rem' }} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? '▲ Hide goals' : '▼ By goal'}
          </button>
          <button type="button" className="btn btn-ghost" style={{ fontSize: '0.8125rem', padding: '0.25rem 0.625rem' }} onClick={() => setShowVotes((v) => !v)} aria-expanded={showVotes}>
            {showVotes ? '▲ Hide votes' : `▼ The ${match.total_votes} vote${match.total_votes === 1 ? '' : 's'} that counted`}
          </button>
        </div>
      )}

      {open && goalEntries.length > 0 && (
        <dl className="match-goals">
          {goalEntries.map(([slug, g]) => (
            <GoalRow key={slug} slug={slug} score={g.score} votes={g.votes} agreed={g.agreed} />
          ))}
        </dl>
      )}

      {showVotes && <EvidenceList sessionId={sessionId} politicianId={match.politician_id} />}
    </article>
  );
}

function GoalRow({ slug, score, votes, agreed }: { slug: string; score: number; votes: number; agreed: number }) {
  return (
    <>
      <dt title={slug}>{slug.replace(/-/g, ' ')}</dt>
      <dd><div className="match-goal-bar"><div style={{ width: `${score}%` }} /></div></dd>
      <dd className="match-goal-votes"><strong>{Math.round(score)}%</strong> · {agreed}/{votes} agreed</dd>
    </>
  );
}

export default function Matches() {
  const [matches, setMatches] = useState<MatchResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sessionId = localStorage.getItem(SESSION_KEY);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    getMatches(sessionId)
      .then((data) => {
        setMatches(data);
        track('matches_viewed', { matchCount: data.length });
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load matches.');
        setLoading(false);
      });
  }, [sessionId]);

  if (!sessionId || (!loading && !matches?.length && !error)) {
    return (
      <div>
        <h1 className="page-heading">Your matches</h1>
        <p style={{ color: 'var(--color-text-muted)' }}>
          You haven't answered any goals yet. <Link to="/questionnaire">Start here →</Link>
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <h1 className="page-heading">Your matches</h1>
        <p style={{ color: 'var(--color-text-muted)' }}>Loading your matches…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="page-heading">Your matches</h1>
        <p style={{ color: 'var(--color-danger)' }}>{error}</p>
        <Link to="/questionnaire" className="btn btn-primary" style={{ display: 'inline-flex', marginTop: '1rem' }}>Back to the goals</Link>
      </div>
    );
  }

  const withData = matches!.filter((m) => m.total_votes > 0);
  const ranked = withData.length > 0 ? withData : matches!;
  const top = ranked.slice(0, 10);

  return (
    <div>
      <h1 className="page-heading">Your matches</h1>

      <p style={{ color: 'var(--color-text-muted)', marginBottom: '0.375rem' }}>
        Sitting members ranked by how often their decisive roll-call votes, on bills coded as
        advancing or hindering the goals you answered, went the way you would have wanted.
        100 means every such vote agreed with you; 50 means an even split or no data.
      </p>
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
        Every score can be checked: open <em>the votes that counted</em> on any member. Only
        bills with a reviewed coding affect a score. <Link to="/methodology">Read the methodology →</Link>
      </p>

      {withData.length === 0 && (
        <div style={{ padding: '0.875rem 1rem', background: 'var(--color-primary-light)', borderRadius: 'var(--radius)', marginBottom: '1.25rem', fontSize: '0.875rem', color: 'var(--color-primary-dark)' }}>
          No decisive roll-call vote yet touches a bill coded for the goals you answered, so every
          member sits at 50. Coding is ongoing; try adding more areas, or check back.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <Link to="/questionnaire" className="btn btn-ghost" style={{ fontSize: '0.875rem' }}>← Change my answers</Link>
      </div>

      <div className="cards-grid" style={{ gridTemplateColumns: '1fr' }}>
        {top.map((m) => <MatchCard key={m.id} match={m} sessionId={sessionId} />)}
      </div>

      {ranked.length > 10 && (
        <p style={{ marginTop: '1rem', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          Showing the top 10 of {ranked.length} members{withData.length > 0 && withData.length < matches!.length ? ` with a relevant vote (${matches!.length - withData.length} more have none yet)` : ''}.
        </p>
      )}
    </div>
  );
}
