import { Outlet, NavLink } from 'react-router-dom';

const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/bills', label: 'Bills' },
  { to: '/politicians', label: 'Politicians' },
  { to: '/questionnaire', label: 'Questionnaire' },
  { to: '/matches', label: 'Matches' },
];

export default function Layout() {
  return (
    <div>
      <header>
        <nav aria-label="Main navigation">
          <strong>CivicLens</strong>
          <ul>
            {navLinks.map(({ to, label }) => (
              <li key={to}>
                <NavLink to={to} end={to === '/'}>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
