import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPolitician, getPoliticianVotes } from '../api';
import type { PoliticianSummary, PoliticianVoteRecord, Paginated } from '../api';
import { track } from '../analytics';

const PAGE_SIZE = 20;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

function voteCounts(records: PoliticianVoteRecord[]) {
  const counts = { yea: 0, nay: 0, abstain: 0, 'not-voting': 0 };
  for (const r of records) counts[r.value]++;
  return counts;
}

export default function PoliticianDetail() {
  const { id } = useParams<{ id: string }>();
  const [politician, setPolitician] = useState<PoliticianSummary | null>(null);
  const [voteResult, setVoteResult] = useState<Paginated<PoliticianVoteRecord> | null>(null);
  const [allVotes, setAllVotes]     = useState<PoliticianVoteRecord[]>([]);
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(true);
  const [votesLoading, setVotesLoading] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  // Filters (client-side on loaded data)
  const [voteFilter, setVoteFilter] = useState('');      // 'yea'|'nay'|'abstain'|'not-voting'|''
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');

  // Load politician profile
  useEffect(() => {
    if (!id) return;
    getPolitician(id)
      .then(p => {
        setPolitician(p);
        track('politician_detail_viewed', { politicianId: id });
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load politician'))
      .finally(() => setLoading(false));
  }, [id]);

  // Load all vote records (paginated, accumulate for client-side filtering)
  // Reset accumulated votes when politician changes
  useEffect(() => {
    setAllVotes([]);
    setPage(1);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setVotesLoading(true);
    getPoliticianVotes(id, { page, limit: PAGE_SIZE })
      .then(data => {
        setVoteResult(data);
        setAllVotes(prev => (page === 1 ? data.data : [...prev, ...data.data]));
      })
      .catch(() => {/* ignore vote errors — show empty state */})
      .finally(() => setVotesLoading(false));
  }, [id, page]);

  if (loading) return <div className="spinner" role="status" aria-label="Loading" />;

  if (error) return (
    <div className="state-box">
      <div className="state-box-icon">⚠️</div>
      <h2>Something went wrong</h2>
      <p>{error}</p>
      <Link to="/politicians" className="btn btn-ghost" style={{ marginTop: '1rem' }}>← Back to politicians</Link>
    </div>
  );

  if (!politician) return null;

  // Apply client-side filters to loaded votes
  const filteredVotes = allVotes.filter(r => {
    if (voteFilter && r.value !== voteFilter) return false;
    const voteTime = new Date(r.vote_date).getTime();
    if (dateFrom && voteTime < new Date(dateFrom).getTime()) return false;
    if (dateTo) {
      const toEnd = new Date(dateTo);
      toEnd.setHours(23, 59, 59, 999);
      if (voteTime > toEnd.getTime()) return false;
    }
    return true;
  });

  const counts = voteCounts(allVotes);
  const totalPages = voteResult ? Math.ceil(voteResult.total / PAGE_SIZE) : 1;

  return (
    <div>
      <Link to="/politicians" className="back-link">← Back to politicians</Link>

      {/* Profile hero */}
      <div className="detail-hero">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {politician.image_url ? (
            <img
              src={politician.image_url}
              alt={`${politician.first_name} ${politician.last_name}`}
              style={{ width: '5rem', height: '5rem', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
            />
          ) : (
            <div className="pol-avatar-placeholder" style={{ width: '5rem', height: '5rem', fontSize: '1.75rem' }} aria-hidden="true">
              {initials(politician.first_name, politician.last_name)}
            </div>
          )}
          <div>
            <div className="detail-meta" style={{ marginBottom: '0.25rem' }}>
              <span className="source-label source-label-official">🏛 Official Data</span>
            </div>
            <h1 className="detail-title" style={{ marginBottom: '0.5rem' }}>
              {politician.first_name} {politician.last_name}
            </h1>
            <div className="detail-meta">
              <span className={`party-badge party-${politician.party}`}>{politician.party}</span>
              <span className={`chamber-badge chamber-${politician.chamber}`}>{politician.chamber}</span>
              <span>{politician.state}{politician.district != null ? ` District ${politician.district}` : ''}</span>
            </div>
            {politician.website && (
              <a href={politician.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.875rem', marginTop: '0.5rem', display: 'inline-block' }}>
                Official website ↗
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Vote summary counts */}
      {allVotes.length > 0 && (
        <div className="detail-section">
          <h2 className="detail-section-title">Voting Summary</h2>
          <div className="vote-stats" style={{ fontSize: '1rem' }}>
            <span className="vote-stat"><span className="vote-dot vote-dot-yea" /><strong>{counts.yea}</strong>&nbsp;Yea</span>
            <span className="vote-stat"><span className="vote-dot vote-dot-nay" /><strong>{counts.nay}</strong>&nbsp;Nay</span>
            {counts.abstain > 0 && (
              <span className="vote-stat"><span className="vote-dot vote-dot-abstain" /><strong>{counts.abstain}</strong>&nbsp;Abstain</span>
            )}
            {counts['not-voting'] > 0 && (
              <span className="vote-stat"><span className="vote-dot vote-dot-not-voting" /><strong>{counts['not-voting']}</strong>&nbsp;Not voting</span>
            )}
          </div>
        </div>
      )}

      {/* Vote history */}
      <div className="detail-section">
        <h2 className="detail-section-title">Vote History</h2>

        {/* Filters */}
        <div className="filters" style={{ marginBottom: '1rem' }}>
          <div className="filter-group">
            <label htmlFor="vote-filter">Vote type</label>
            <select id="vote-filter" className="filter-select" value={voteFilter} onChange={e => setVoteFilter(e.target.value)}>
              <option value="">All votes</option>
              <option value="yea">Yea</option>
              <option value="nay">Nay</option>
              <option value="abstain">Abstain</option>
              <option value="not-voting">Not voting</option>
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="date-from">From date</label>
            <input id="date-from" type="date" className="filter-input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="filter-group">
            <label htmlFor="date-to">To date</label>
            <input id="date-to" type="date" className="filter-input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
          {(voteFilter || dateFrom || dateTo) && (
            <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-end' }} onClick={() => { setVoteFilter(''); setDateFrom(''); setDateTo(''); }}>
              Clear
            </button>
          )}
        </div>

        {votesLoading && page === 1 && <div className="spinner" role="status" aria-label="Loading" />}

        {!votesLoading && filteredVotes.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>
            {allVotes.length === 0 ? 'No vote records found for this politician.' : 'No votes match your filters.'}
          </p>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Chamber</th>
                    <th>Bill</th>
                    <th>Vote</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVotes.map(r => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.vote_date)}</td>
                      <td><span className={`chamber-badge chamber-${r.chamber}`}>{r.chamber}</span></td>
                      <td>
                        {r.bill_id ? (
                          <Link to={`/bills/${r.bill_id}`}>View bill →</Link>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                        )}
                      </td>
                      <td><span className={`vote-${r.value}`}>{r.value}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Load more */}
            {page < totalPages && (
              <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => setPage(p => p + 1)}
                  disabled={votesLoading}
                >
                  {votesLoading ? 'Loading…' : 'Load more votes'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
