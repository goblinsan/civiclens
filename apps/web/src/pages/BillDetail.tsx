import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getBill, getBillVotes, getVoteRecords } from '../api';
import type { BillDetail as BillDetailData, BillTagDetail, Vote, VoteRecord } from '../api';
import SentimentWidget from '../components/SentimentWidget';
import { track } from '../analytics';
import { tagLabel } from '../tagLabels';

const TAGGING_DOC_URL = 'https://github.com/goblinsan/civiclens/blob/main/docs/bill-tagging.md';

/** Plain-language explanation of where a tag came from. */
function tagProvenance(t: BillTagDetail): string {
  if (t.source === 'policy-area') return `from the official policy area “${t.matched_on}”`;
  if (t.source === 'subject') return `from the official subject term “${t.matched_on}”`;
  return 'applied manually by CivReveal';
}

function ClassificationSection({ bill }: { bill: BillDetailData }) {
  const subjects = bill.subjects ?? [];
  const tagDetails = bill.tag_details ?? [];
  const muted = { color: 'var(--color-text-muted)', fontSize: '0.875rem', margin: '0 0 0.75rem' } as const;
  const subHeading = { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' } as const;

  return (
    <div className="detail-section">
      <h2 className="detail-section-title">How this bill is classified</h2>

      <div style={{ marginBottom: '1.25rem' }}>
        <div style={subHeading}>
          <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600 }}>Official classification</h3>
          <span className="source-label source-label-official" style={{ fontSize: '0.7rem' }}>Official</span>
        </div>
        <p style={muted}>
          Assigned by the Congressional Research Service and published on Congress.gov.
        </p>
        <p style={{ margin: '0 0 0.5rem' }}>
          <strong>Policy area:</strong>{' '}
          {bill.policy_area ?? <span style={{ color: 'var(--color-text-muted)' }}>not yet assigned</span>}
        </p>
        {subjects.length > 0 && (
          <>
            <p style={{ margin: '0 0 0.375rem' }}><strong>Subjects:</strong></p>
            <div className="card-tags">
              {subjects.map((s) => <span key={s} className="tag tag-ghost">{s}</span>)}
            </div>
          </>
        )}
      </div>

      <div>
        <div style={subHeading}>
          <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600 }}>CivReveal policy tags</h3>
          <span className="source-label source-label-platform" style={{ fontSize: '0.7rem' }}>Platform</span>
        </div>
        <p style={muted}>
          Derived from the official classification using a fixed, public rule set. Tags decide
          which questionnaire topics this bill counts toward; they describe what the bill is
          about, not which way a “yea” vote pushes it.{' '}
          <a href={TAGGING_DOC_URL} target="_blank" rel="noopener noreferrer">See the rules ↗</a>
        </p>
        {tagDetails.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
            No policy tag applies to this bill, so it does not count toward any alignment score.
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.9 }}>
            {tagDetails.map((t) => (
              <li key={t.slug}>
                <span className="tag" style={{ marginRight: '0.5rem' }}>{tagLabel(t.slug)}</span>
                <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{tagProvenance(t)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Returns a human-readable relative time string, e.g. "2 days ago". */
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths === 1) return '1 month ago';
  if (diffMonths < 12) return `${diffMonths} months ago`;
  const diffYears = Math.floor(diffDays / 365);
  return diffYears === 1 ? '1 year ago' : `${diffYears} years ago`;
}

/** Returns true if the data is considered stale (not updated in >30 days). */
function isStale(iso: string): boolean {
  const diffMs = Date.now() - new Date(iso).getTime();
  return diffMs > 30 * 24 * 60 * 60 * 1000;
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
  const [bill, setBill]     = useState<BillDetailData | null>(null);
  const [votes, setVotes]   = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([getBill(id), getBillVotes(id)])
      .then(([b, v]) => {
        setBill(b);
        setVotes(v);
        track('bill_detail_viewed', { billId: id });
      })
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
          <span>Updated {formatDate(bill.updated_at)} ({timeAgo(bill.updated_at)})</span>
          {isStale(bill.updated_at) && (
            <span className="freshness-badge freshness-badge-stale" title="This record has not been updated in over 30 days">
              ⚠ Data may be outdated
            </span>
          )}
          {!isStale(bill.updated_at) && (
            <span className="freshness-badge freshness-badge-current" title="This record was recently updated">
              ✓ Recently updated
            </span>
          )}
        </div>
        {bill.tags.length > 0 && (
          <div className="card-tags" style={{ marginTop: '0.5rem' }}>
            {bill.tags.map(t => <span key={t} className="tag">{tagLabel(t)}</span>)}
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

      {/* Official classification + derived policy tags */}
      <ClassificationSection bill={bill} />

      {/* Sentiment widget */}
      <SentimentWidget billId={bill.id} />

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
