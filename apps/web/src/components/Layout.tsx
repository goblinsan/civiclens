import { Outlet, NavLink, Link } from 'react-router-dom';

const navLinks = [
  { to: '/bills', label: 'Bills' },
  { to: '/politicians', label: 'Politicians' },
  { to: '/questionnaire', label: 'Questionnaire' },
  { to: '/matches', label: 'Matches' },
];

export default function Layout() {
  return (
    <div className="layout-root">
      <header className="layout-header">
        <nav className="layout-nav" aria-label="Main navigation">
          <Link to="/" className="layout-brand">CivicLens</Link>
          <ul className="layout-nav-list">
            {navLinks.map(({ to, label }) => (
              <li key={to}>
                <NavLink to={to}>{label}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="layout-main">
        <Outlet />
      </main>
      <footer className="layout-footer">
        <div className="layout-footer-inner">
          <p className="layout-footer-copy">
            CivicLens — civic information tool. All legislative data sourced
            from official U.S. government records.
          </p>
          <nav className="layout-footer-nav" aria-label="Footer navigation">
            <Link to="/transparency">Trust &amp; Transparency</Link>
            <Link to="/data-sources">Data Sources</Link>
            <Link to="/methodology">Scoring Methodology</Link>
            <a
              href="https://github.com/goblinsan/civiclens/issues"
              target="_blank"
              rel="noopener noreferrer"
            >
              Report an Issue ↗
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
