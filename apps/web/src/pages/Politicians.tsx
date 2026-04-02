import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { listPoliticians } from '../api';
import type { PoliticianSummary, Paginated } from '../api';

const PAGE_SIZE = 24;
const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
];

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

function PoliticianCard({ pol }: { pol: PoliticianSummary }) {
  return (
    <article className="card">
      <div className="pol-card-inner">
        {pol.image_url ? (
          <img className="pol-avatar" src={pol.image_url} alt={`${pol.first_name} ${pol.last_name}`} loading="lazy" />
        ) : (
          <div className="pol-avatar-placeholder" aria-hidden="true">
            {initials(pol.first_name, pol.last_name)}
          </div>
        )}
        <div className="pol-card-info">
          <h2 className="card-title">
            <Link to={`/politicians/${pol.id}`}>{pol.first_name} {pol.last_name}</Link>
          </h2>
          <div className="card-meta" style={{ marginTop: '0.25rem' }}>
            <span className={`party-badge party-${pol.party}`}>{pol.party}</span>
            <span className={`chamber-badge chamber-${pol.chamber}`}>{pol.chamber}</span>
            <span>{pol.state}{pol.district != null ? `-${pol.district}` : ''}</span>
          </div>
        </div>
      </div>
      {pol.website && (
        <a href={pol.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.875rem' }}>
          Official website ↗
        </a>
      )}
    </article>
  );
}

export default function Politicians() {
  const [nameQuery, setNameQuery] = useState('');
  const [chamber, setChamber]     = useState('');
  const [party, setParty]         = useState('');
  const [state, setState]         = useState('');
  const [page, setPage]           = useState(1);
  const [result, setResult]       = useState<Paginated<PoliticianSummary> | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPoliticians({
        page: p,
        limit: PAGE_SIZE,
        q: nameQuery.trim() || undefined,
        chamber: chamber || undefined,
        party: party || undefined,
        state: state || undefined,
      });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load politicians');
    } finally {
      setLoading(false);
    }
  }, [chamber, party, state, nameQuery]);

  useEffect(() => { void load(page); }, [load, page]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    void load(1);
  }

  function clearFilters() {
    setNameQuery('');
    setChamber('');
    setParty('');
    setState('');
    setPage(1);
  }

  const totalPages = result ? Math.ceil(result.total / PAGE_SIZE) : 1;
  const hasFilters = nameQuery || chamber || party || state;

  return (
    <div>
      <h1 className="page-heading">Politicians</h1>

      <form className="filters" onSubmit={handleSearch} role="search">
        <div className="filter-group filter-search">
          <label htmlFor="pol-search">Name search</label>
          <input
            id="pol-search"
            className="filter-input"
            type="search"
            placeholder="Search by name…"
            value={nameQuery}
            onChange={e => setNameQuery(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label htmlFor="pol-chamber">Chamber</label>
          <select id="pol-chamber" className="filter-select" value={chamber} onChange={e => { setChamber(e.target.value); setPage(1); }}>
            <option value="">All chambers</option>
            <option value="senate">Senate</option>
            <option value="house">House</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="pol-party">Party</label>
          <select id="pol-party" className="filter-select" value={party} onChange={e => { setParty(e.target.value); setPage(1); }}>
            <option value="">All parties</option>
            <option value="D">Democrat</option>
            <option value="R">Republican</option>
            <option value="I">Independent</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="pol-state">State</label>
          <select id="pol-state" className="filter-select" value={state} onChange={e => { setState(e.target.value); setPage(1); }}>
            <option value="">All states</option>
            {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button type="submit" className="btn btn-primary">Search</button>
        {hasFilters && (
          <button type="button" className="btn btn-ghost" onClick={clearFilters}>Clear</button>
        )}
      </form>

      {loading && <div className="spinner" role="status" aria-label="Loading" />}

      {!loading && error && (
        <div className="state-box">
          <div className="state-box-icon">⚠️</div>
          <h2>Something went wrong</h2>
          <p>{error}</p>
          <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={() => void load(page)}>Retry</button>
        </div>
      )}

      {!loading && !error && result && result.data.length === 0 && (
        <div className="state-box">
          <div className="state-box-icon">👤</div>
          <h2>No politicians found</h2>
          <p>Try adjusting your search or filters.</p>
          {hasFilters && (
            <button className="btn btn-ghost" style={{ marginTop: '1rem' }} onClick={clearFilters}>Clear filters</button>
          )}
        </div>
      )}

      {!loading && !error && result && result.data.length > 0 && (
        <>
          <p className="pagination-info" style={{ marginBottom: '0.75rem' }}>
            {result.total.toLocaleString()} politician{result.total !== 1 ? 's' : ''}
          </p>
          <div className="cards-grid">
            {result.data.map(pol => <PoliticianCard key={pol.id} pol={pol} />)}
          </div>

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
