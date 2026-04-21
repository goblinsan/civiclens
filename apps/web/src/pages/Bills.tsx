import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { listBills } from '../api';
import type { BillSummary, Paginated } from '../api';
import { BILL_STATUSES, POLICY_TAGS } from '@civreveal/shared';

const PAGE_SIZE = 20;

function statusClass(status: string): string {
  const known = ['introduced','committee','floor','passed-house','passed-senate','enrolled','signed','vetoed'];
  return `status-badge status-${known.includes(status) ? status : 'default'}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
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

export default function Bills() {
  const [query, setQuery]   = useState('');
  const [status, setStatus] = useState('');
  const [tag, setTag]       = useState('');
  const [page, setPage]     = useState(1);
  const [result, setResult] = useState<Paginated<BillSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listBills({
        page: p,
        limit: PAGE_SIZE,
        q: query || undefined,
        status: status || undefined,
        tag: tag || undefined,
      });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load bills');
    } finally {
      setLoading(false);
    }
  }, [query, status, tag]);

  useEffect(() => { void load(page); }, [load, page]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    void load(1);
  }

  function clearFilters() {
    setQuery('');
    setStatus('');
    setTag('');
    setPage(1);
  }

  const totalPages = result ? Math.ceil(result.total / PAGE_SIZE) : 1;

  return (
    <div>
      <h1 className="page-heading">Bills</h1>

      {/* Filters */}
      <form className="filters" onSubmit={handleSearch} role="search">
        <div className="filter-group filter-search">
          <label htmlFor="bill-search">Search</label>
          <input
            id="bill-search"
            className="filter-input"
            type="search"
            placeholder="Search bills by title or summary…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="bill-status">Status</label>
          <select id="bill-status" className="filter-select" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {BILL_STATUSES.map(s => (
              <option key={s} value={s}>{s.replace(/-/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="bill-tag">Policy area</label>
          <select id="bill-tag" className="filter-select" value={tag} onChange={e => { setTag(e.target.value); setPage(1); }}>
            <option value="">All areas</option>
            {POLICY_TAGS.map(t => (
              <option key={t} value={t}>{t.replace(/-/g, ' ')}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary">Search</button>
        {(query || status || tag) && (
          <button type="button" className="btn btn-ghost" onClick={clearFilters}>Clear</button>
        )}
      </form>

      {/* Loading */}
      {loading && <div className="spinner" role="status" aria-label="Loading" />}

      {/* Error */}
      {!loading && error && (
        <div className="state-box">
          <div className="state-box-icon">⚠️</div>
          <h2>Something went wrong</h2>
          <p>{error}</p>
          <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => void load(page)}>Retry</button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && result && result.data.length === 0 && (
        <div className="state-box">
          <div className="state-box-icon">📋</div>
          <h2>No bills found</h2>
          <p>Try adjusting your search or filters.</p>
          {(query || status || tag) && (
            <button className="btn btn-ghost" style={{ marginTop: '1rem' }} onClick={clearFilters}>Clear filters</button>
          )}
        </div>
      )}

      {/* Results */}
      {!loading && !error && result && result.data.length > 0 && (
        <>
          <p className="pagination-info" style={{ marginBottom: '0.75rem' }}>
            {result.total.toLocaleString()} bill{result.total !== 1 ? 's' : ''}
          </p>
          <div className="cards-grid">
            {result.data.map(bill => (
              <article key={bill.id} className="card">
                <div className="card-meta">
                  <span className={statusClass(bill.status)}>{bill.status.replace(/-/g, ' ')}</span>
                  <span>Congress {bill.congress}</span>
                  <span>{bill.bill_type.toUpperCase()} {bill.bill_number}</span>
                </div>
                <h2 className="card-title">
                  <Link to={`/bills/${bill.id}`}>{bill.title}</Link>
                </h2>
                {bill.summary && (
                  <p className="card-summary">{bill.summary}</p>
                )}
                <div className="card-meta">
                  <span>Sponsor: {bill.sponsor_first_name} {bill.sponsor_last_name}</span>
                  <span>Introduced {formatDate(bill.introduced_at)}</span>
                  <span title={`Source data last updated ${formatDate(bill.updated_at)}`}>
                    Updated {timeAgo(bill.updated_at)}
                  </span>
                </div>
                {bill.tags.length > 0 && (
                  <div className="card-tags">
                    {bill.tags.map(t => (
                      <span key={t} className="tag">{t.replace(/-/g, ' ')}</span>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="btn btn-ghost"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                ← Prev
              </button>
              <span className="pagination-info">Page {page} of {totalPages}</span>
              <button
                className="btn btn-ghost"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
