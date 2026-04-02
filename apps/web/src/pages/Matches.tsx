import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getMatches } from '../api';
import type { MatchResult } from '../api';

const SESSION_KEY = 'civiclens_session_id';

/** Labels for each policy tag. */
const TAG_LABELS: Record<string, string> = {
  healthcare:       'Healthcare',
  education:        'Education',
  environment:      'Environment',
  economy:          'Economy',
  defense:          'Defense',
  immigration:      'Immigration',
  housing:          'Housing',
  infrastructure:   'Infrastructure',
  'civil-rights':   'Civil Rights',
  'foreign-policy': 'Foreign Policy',
};

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
        style={{
          flex: 1,
          height: '0.5rem',
          background: 'var(--color-border)',
          borderRadius: '9999px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            borderRadius: '9999px',
            transition: 'width 0.4s ease',
          }}
        />
      </div>
      <span style={{ minWidth: '2.75rem', fontSize: '0.875rem', fontWeight: 600, color }}>
        {pct}%
      </span>
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
      style={{
        fontSize: '0.6875rem',
        fontWeight: 600,
        padding: '0.125rem 0.5rem',
        borderRadius: '9999px',
        background: bg,
        color: text,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {label} confidence
    </span>
  );
}

function MatchCard({ match }: { match: MatchResult }) {
  const [open, setOpen] = useState(false);
  const score = parseFloat(match.score);
  const tagEntries = Object.entries(match.breakdown)
    .filter(([k]) => k !== '_total_votes')
    .sort((a, b) => b[1] - a[1]);

  return (
    <article className="card">
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        {/* Avatar */}
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
              style={{
                width: '3rem', height: '3rem', borderRadius: '50%',
                background: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: '1rem',
              }}
            >
              {match.first_name.charAt(0)}{match.last_name.charAt(0)}
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="card-title" style={{ marginBottom: '0.25rem' }}>
            <Link to={`/politicians/${match.politician_id}`}>
              {match.first_name} {match.last_name}
            </Link>
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

      {/* Breakdown toggle */}
      {tagEntries.length > 0 && (
        <div style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ fontSize: '0.8125rem', padding: '0.25rem 0.625rem' }}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? '▲ Hide breakdown' : '▼ Show issue breakdown'}
          </button>

          {open && (
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                gap: '0.25rem 0.75rem',
                marginTop: '0.75rem',
                fontSize: '0.8125rem',
              }}
            >
              {tagEntries.map(([tag, tagScore]) => (
                <>
                  <dt key={`${tag}-label`} style={{ color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                    {TAG_LABELS[tag] ?? tag}
                  </dt>
                  <dd key={`${tag}-bar`} style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
                    <div style={{ flex: 1, height: '0.375rem', background: 'var(--color-border)', borderRadius: '9999px', overflow: 'hidden' }}>
                      <div style={{ width: `${tagScore}%`, height: '100%', background: 'var(--color-primary)', borderRadius: '9999px' }} />
                    </div>
                  </dd>
                  <dd key={`${tag}-pct`} style={{ margin: 0, fontWeight: 600, textAlign: 'right' }}>
                    {Math.round(tagScore)}%
                  </dd>
                </>
              ))}
            </dl>
          )}
        </div>
      )}
    </article>
  );
}

export default function Matches() {
  const [matches, setMatches]   = useState<MatchResult[] | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const sessionId = localStorage.getItem(SESSION_KEY);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    getMatches(sessionId)
      .then((data) => {
        setMatches(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load matches.';
        setError(msg);
        setLoading(false);
      });
  }, [sessionId]);

  if (!sessionId || (!loading && !matches?.length && !error)) {
    return (
      <div>
        <h1 className="page-heading">Your Matches</h1>
        <p style={{ color: 'var(--color-text-muted)' }}>
          You haven't completed the questionnaire yet.{' '}
          <Link to="/questionnaire">Take it now →</Link>
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <h1 className="page-heading">Your Matches</h1>
        <p style={{ color: 'var(--color-text-muted)' }}>Loading your matches…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="page-heading">Your Matches</h1>
        <p style={{ color: 'var(--color-danger)' }}>{error}</p>
        <Link to="/questionnaire" className="btn btn-primary" style={{ display: 'inline-flex', marginTop: '1rem' }}>
          Retake Questionnaire
        </Link>
      </div>
    );
  }

  const topMatches    = matches!.slice(0, 10);
  const hasBreakdown  = topMatches.some((m) => Object.keys(m.breakdown).filter((k) => k !== '_total_votes').length > 0);

  return (
    <div>
      <h1 className="page-heading">Your Political Matches</h1>

      <p style={{ color: 'var(--color-text-muted)', marginBottom: '0.375rem' }}>
        Politicians ranked by how closely their voting record aligns with your stated preferences.
        Scores range from 0 (no alignment) to 100 (perfect alignment).
      </p>

      <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
        ⚠️ Scores are based solely on available voting records for tagged bills.
        Low-confidence results mean few relevant votes were found.{' '}
        <a href="/docs/scoring-methodology.md" target="_blank" rel="noopener noreferrer">
          Read the methodology →
        </a>
      </p>

      {!hasBreakdown && (
        <div
          style={{
            padding: '0.875rem 1rem',
            background: 'var(--color-primary-light)',
            borderRadius: 'var(--radius)',
            marginBottom: '1.25rem',
            fontSize: '0.875rem',
            color: 'var(--color-primary-dark)',
          }}
        >
          ℹ️ No voting data was found for your selected topics. Scores default to 50%.
          Try retaking the questionnaire with different topics, or check back as more
          bills are tagged.
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <Link to="/questionnaire" className="btn btn-ghost" style={{ fontSize: '0.875rem' }}>
          ← Retake Questionnaire
        </Link>
      </div>

      <div className="cards-grid" style={{ gridTemplateColumns: '1fr' }}>
        {topMatches.map((m) => (
          <MatchCard key={m.id} match={m} />
        ))}
      </div>

      {matches!.length > 10 && (
        <p style={{ marginTop: '1rem', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          Showing top 10 of {matches!.length} politicians.
        </p>
      )}
    </div>
  );
}

