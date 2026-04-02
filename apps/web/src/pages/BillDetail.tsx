import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getBill, getBillVotes, getVoteRecords } from '../api';
import type { BillSummary, Vote, VoteRecord } from '../api';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function VoteBar({ vote }: { vote: Vote }) {
  const total = vote.yea_count + vote.nay_count + vote.abstain_count + vote.not_voting_count;
  if (total === 0) return null;
  const yeaPct = (vote.yea_count / total) * 100;
  const nayPct = (vote.nay_count / total) * 100;
  const absPct = (vote.abstain_count / total) * 100;
  return (
    <>
      <div className="vote-bar" aria-label="Vote breakdown">
        <div className="vote-bar-yea"     style={{ width: `${yeaPct}%` }} />
        <div className="vote-bar-nay"     style={{ width: `${nayPct}%` }} />
        <div className="vote-bar-abstain" style={{ width: `${absPct}%` }} />
      </div>
      <div className="vote-stats">
        <span className="vote-stat"><span className="vote-dot vote-dot-yea" />Yea: {vote.yea_count}</span>
        <span className="vote-stat"><span className="vote-dot vote-dot-nay" />Nay: {vote.nay_count}</span>
        {vote.abstain_count > 0 && (
          <span className="vote-stat"><span className="vote-dot vote-dot-abstain" />Abstain: {vote.abstain_count}</span>
        )}
        {vote.not_voting_count > 0 && (
          <span className="vote-stat"><span className="vote-dot vote-dot-not-voting" />Not voting: {vote.not_voting_count}</span>
        )}
      </div>
    </>
  );
}

function VoteRecordsTable({ voteId }: { voteId: string }) {
  const [records, setRecords] = useState<VoteRecord[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function loadRecords() {
    if (records) { setOpen(o => !o); return; }
    setLoading(true);
    try {
      const data = await getVoteRecords(voteId);
      setRecords(data);
      setOpen(true);
    } catch {
      setRecords([]);
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <button className="btn btn-ghost" style={{ fontSize: '0.875rem' }} onClick={() => void loadRecords()} disabled={loading}>
        {loading ? 'Loading…' : open ? 'Hide individual votes' : 'Show individual votes'}
      </button>
      {open && records && (
        <div className="table-wrap" style={{ marginTop: '0.75rem' }}>
          {records.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>No individual vote records available.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Politician</th>
                  <th>Party</th>
                  <th>State</th>
                  <th>Chamber</th>
                  <th>Vote</th>
                </tr>
              </thead>
              <tbody>
                {records.map(r => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/politicians/${r.politician_id}`}>
                        {r.politician_first_name} {r.politician_last_name}
                      </Link>
                    </td>
                    <td><span className={`party-badge party-${r.politician_party}`}>{r.politician_party}</span></td>
                    <td>{r.politician_state}</td>
                    <td><span className={`chamber-badge chamber-${r.politician_chamber}`}>{r.politician_chamber}</span></td>
                    <td><span className={`vote-${r.value}`}>{r.value}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function BillDetail() {
  const { id } = useParams<{ id: string }>();
  const [bill, setBill]     = useState<BillSummary | null>(null);
  const [votes, setVotes]   = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([getBill(id), getBillVotes(id)])
      .then(([b, v]) => { setBill(b); setVotes(v); })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load bill'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="spinner" role="status" aria-label="Loading" />;

  if (error) return (
    <div className="state-box">
      <div className="state-box-icon">⚠️</div>
      <h2>Something went wrong</h2>
      <p>{error}</p>
      <Link to="/bills" className="btn btn-ghost" style={{ marginTop: '1rem' }}>← Back to bills</Link>
    </div>
  );

  if (!bill) return null;

  const statusClass = `status-badge status-${bill.status}`;

  return (
    <div>
      <Link to="/bills" className="back-link">← Back to bills</Link>

      {/* Hero / header */}
      <div className="detail-hero">
        <div className="detail-meta">
          <span className={statusClass}>{bill.status.replace(/-/g, ' ')}</span>
          <span>Congress {bill.congress}</span>
          <span>{bill.bill_type.toUpperCase()} {bill.bill_number}</span>
          <span className="source-label source-label-official">
            🏛 Official Data
          </span>
        </div>
        <h1 className="detail-title">{bill.title}</h1>
        <div className="detail-meta">
          <span>Sponsored by <Link to={`/politicians/${bill.sponsor_id}`}>{bill.sponsor_first_name} {bill.sponsor_last_name}</Link></span>
          <span>Introduced {formatDate(bill.introduced_at)}</span>
          <span>Updated {formatDate(bill.updated_at)}</span>
        </div>
        {bill.tags.length > 0 && (
          <div className="card-tags" style={{ marginTop: '0.5rem' }}>
            {bill.tags.map(t => <span key={t} className="tag">{t.replace(/-/g, ' ')}</span>)}
          </div>
        )}
      </div>

      {/* Summary */}
      {bill.summary && (
        <div className="detail-section">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <h2 className="detail-section-title" style={{ marginBottom: 0, border: 'none', paddingBottom: 0 }}>Summary</h2>
            <span className="source-label source-label-official" style={{ fontSize: '0.7rem' }}>Official</span>
          </div>
          <p style={{ margin: 0, lineHeight: 1.7 }}>{bill.summary}</p>
          <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            Source:{' '}
            <a
              href={`https://www.congress.gov/${bill.congress}/bills/${bill.bill_type.toLowerCase()}${bill.bill_number}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              congress.gov ↗
            </a>
          </p>
        </div>
      )}

      {/* Vote events */}
      <div className="detail-section">
        <h2 className="detail-section-title">Roll-Call Votes</h2>
        {votes.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>No roll-call votes recorded for this bill.</p>
        ) : (
          votes.map(vote => (
            <div key={vote.id} style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span className={`chamber-badge chamber-${vote.chamber}`}>{vote.chamber}</span>
                <span style={{ fontWeight: 600 }}>{formatDate(vote.vote_date)}</span>
                <span className={`result-${vote.result}`}>{vote.result.toUpperCase()}</span>
              </div>
              <VoteBar vote={vote} />
              <VoteRecordsTable voteId={vote.id} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
