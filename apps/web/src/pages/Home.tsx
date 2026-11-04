import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStats } from '../api';
import type { SiteStats } from '../api';

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function Home() {
  const [stats, setStats] = useState<SiteStats | null>(null);

  useEffect(() => {
    getStats().then(setStats).catch(() => setStats(null));
  }, []);

  return (
    <div>
      <div className="home-hero">
        <h1>CivReveal</h1>
        <p>
          See how your representatives actually vote — from official government
          records, with no party lens.
        </p>
        <div className="home-cta">
          <Link to="/bills" className="btn btn-primary">Browse Bills</Link>
          <Link to="/politicians" className="btn btn-ghost">Find Politicians</Link>
          <Link to="/questionnaire" className="btn btn-ghost">Find Your Matches</Link>
        </div>
      </div>

      {stats && (
        <div className="home-stats" aria-label="What the site covers">
          <Stat value={fmt(stats.bills)} label="bills tracked" />
          <Stat value={fmt(stats.house_votes + stats.senate_votes)} label="roll-call votes" />
          <Stat value={fmt(stats.vote_records)} label="recorded positions" />
          <Stat value={fmt(stats.members)} label="sitting members" />
          {stats.last_ingest_at && (
            <Stat value={ago(stats.last_ingest_at)} label="last updated" />
          )}
        </div>
      )}

      <div className="home-grid">
        <Link to="/bills" className="card home-card">
          <h2 className="card-title">What Congress is voting on</h2>
          <p className="card-summary">
            Every bill with its official classification, roll-call results, and
            how each member voted — straight from Congress.gov.
          </p>
        </Link>
        <Link to="/politicians" className="card home-card">
          <h2 className="card-title">Your representatives' records</h2>
          <p className="card-summary">
            Each member's full voting history, with the bills behind every yea and nay.
          </p>
        </Link>
        <Link to="/questionnaire" className="card home-card">
          <h2 className="card-title">Votes vs. your priorities</h2>
          <p className="card-summary">
            Say what matters to you; see whose record lines up — scored from
            votes, not party labels, with the method published in full.
          </p>
        </Link>
      </div>

      <p className="home-footnote">
        All data comes from official records (Congress.gov, senate.gov). Policy tags
        are derived from the Congressional Research Service's own classification;
        the rules are public. <Link to="/transparency">How we keep it honest →</Link>
      </p>
    </div>
  );
}
