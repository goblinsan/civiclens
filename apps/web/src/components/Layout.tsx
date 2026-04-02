import { Outlet, NavLink, Link } from 'react-router-dom';

const navLinks = [
  { to: '/bills', label: 'Bills' },
  { to: '/politicians', label: 'Politicians' },
  { to: '/questionnaire', label: 'Questionnaire' },
  { to: '/matches', label: 'Matches' },
];

export default function Layout() {
  return (
    <div>
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
    </div>
  );
}
