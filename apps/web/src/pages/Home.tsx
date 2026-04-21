import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="home-hero">
      <h1>CivReveal</h1>
      <p>
        Track legislation and understand how your representatives vote.
        All data sourced from official U.S. government records.
      </p>
      <div className="home-cta">
        <Link to="/bills" className="btn btn-primary">Browse Bills</Link>
        <Link to="/politicians" className="btn btn-ghost">Find Politicians</Link>
      </div>
    </div>
  );
}
