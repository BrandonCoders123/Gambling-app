import { useState, useEffect } from 'react';
import { Link, NavLink, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  LayoutDashboard,
  Users,
  Shield,
  Star,
  ArrowUpRight,
  Search,
  ChevronDown,
  Menu,
  X,
  LogOut,
  GitCompareArrows,
  CalendarDays,
  Trophy,
  Target,
  Settings,
  ArrowRight,
  Activity,
} from 'lucide-react';
import { useApp, api } from './lib';
import {
  Dashboard,
  Teams,
  Players,
  PlayerDetail,
  TeamDetail,
  Compare,
  Games,
  GameDetail,
  Favorites,
  SearchPage,
} from './sports';
import { Communities, Community, Discussion, Predictions, Leaderboard } from './social';
import {
  AuthPage,
  VerifyPage,
  Profile,
  PublicProfile,
  Admin,
  Privacy,
  Onboarding,
} from './account';
const links = [
  {
    section: 'EXPLORE',
    items: [
      ['/', 'Overview', LayoutDashboard],
      ['/teams', 'Teams', Shield],
      ['/players', 'Players', Users],
      ['/compare', 'Compare', GitCompareArrows],
      ['/games', 'Schedule & results', CalendarDays],
    ],
  },
  {
    section: 'THE COMMUNITY',
    items: [
      ['/communities', 'Communities', Users],
      ['/predictions', 'Game predictions', Target],
      ['/leaderboard', 'Leaderboard', Trophy],
    ],
  },
];
export default function App() {
  const { user, season, setSeason, meta, reloadUser, notify } = useApp();
  const [narrow, setNarrow] = useState(matchMedia('(max-width:760px)').matches);
  const [mobile, setMobile] = useState(false),
    [search, setSearch] = useState('');
  const location = useLocation(),
    navigate = useNavigate();
  useEffect(() => {
    const mq = matchMedia('(max-width:760px)');
    const fn = () => setNarrow(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobile(false);
    };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, []);
  useEffect(() => {
    setMobile(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const logout = async () => {
    try {
      await api('/auth/logout', 'POST');
      await reloadUser();
      navigate('/');
      notify('You’re signed out.');
    } catch (e) {
      notify((e as Error).message, true);
    }
  };
  return (
    <div className="app">
      <Onboarding />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {mobile && <div className="sidebar-scrim" onClick={() => setMobile(false)} />}
      <aside
        inert={narrow && !mobile}
        className={'sidebar ' + (mobile ? 'is-open' : '')}
        aria-label="Main navigation"
      >
        <Link to="/" className="brand">
          <span className="brand-icon">
            <BarChart3 size={23} />
          </span>
          stat<span>arena</span>
          <span className="brand-dot">.</span>
        </Link>
        <button
          className="mobile-close icon-btn"
          onClick={() => setMobile(false)}
          aria-label="Close navigation"
        >
          <X />
        </button>
        <div className="league-switch">
          <span className="football-small">◆</span>
          <div>
            <strong>NFL</strong>
            <small>American football</small>
          </div>
          <span className="league-badge">SEASON</span>
        </div>
        <nav>
          {links.map((group) => (
            <div className="nav-group" key={group.section}>
              <p>{group.section}</p>
              {group.items.map(([href, title, Icon]) => {
                const I = Icon as typeof Shield;
                return (
                  <NavLink
                    key={String(href)}
                    to={String(href)}
                    end={href === '/'}
                    className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
                  >
                    <I size={19} />
                    <span>{String(title)}</span>
                    {href === '/communities' && (
                      <span className="nav-new">{meta?.communityCount || 33}</span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
          <div className="nav-group">
            <p>YOUR ARENA</p>
            <NavLink to="/favorites" className="nav-link">
              <Star size={19} />
              Favorites
            </NavLink>
            <NavLink to="/profile" className="nav-link">
              <Settings size={19} />
              Profile & settings
            </NavLink>
            {user && ['admin', 'moderator'].includes(user.role) && (
              <NavLink to="/admin" className="nav-link">
                <Shield size={19} />
                Moderation & admin
              </NavLink>
            )}
          </div>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Activity size={23} />
            <strong>
              Better takes.
              <br />
              Bigger conversations.
            </strong>
            <p>Find your people in the stands.</p>
            <Link to="/communities">
              Explore communities <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="sidebar-foot">
            <span className="status-dot" />
            NFL data by nflverse<Link to="/privacy">Privacy</Link>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="mobile-menu icon-btn"
            onClick={() => setMobile(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Your home for the game <span>/</span> <strong>NFL</strong>
            <ChevronDown size={13} />
          </div>
          <form
            className="global-search"
            onSubmit={(e) => {
              e.preventDefault();
              if (search.trim()) navigate('/search?q=' + encodeURIComponent(search));
            }}
          >
            <Search size={18} />
            <input
              aria-label="Search teams, players and communities"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the arena…"
            />
            <kbd>↵</kbd>
          </form>
          <div className="topbar-account">
            {user ? (
              <>
                <Link className="user-pill" to="/profile">
                  <span className="avatar">{user.username.slice(0, 2).toUpperCase()}</span>
                  <span>{user.username}</span>
                </Link>
                <button onClick={logout} className="icon-btn" aria-label="Sign out">
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="signin-link">
                  Sign in
                </Link>
                <Link to="/register" className="btn small dark">
                  Join the arena <ArrowUpRight size={15} />
                </Link>
              </>
            )}
          </div>
        </header>
        <main id="main">
          <div className="page-topline">
            <span>
              <span className="status-dot" />
              NFL FAN COMMUNITY <span className="topline-divider">/</span> DATA. DISCUSSION.
              PERSPECTIVE.
            </span>
            <label className="season-select">
              Stats season{' '}
              <select
                aria-label="Statistics season"
                value={season}
                onChange={(e) => setSeason(Number(e.target.value))}
              >
                {(meta?.seasons || [2024]).map((n: number) => (
                  <option key={n} value={n}>
                    {n} regular season
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/teams" element={<Teams />} />
            <Route path="/teams/:id" element={<TeamDetail />} />
            <Route path="/players" element={<Players />} />
            <Route path="/players/:id" element={<PlayerDetail />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/games" element={<Games />} />
            <Route path="/games/:id" element={<GameDetail />} />
            <Route path="/communities" element={<Communities />} />
            <Route path="/communities/:id" element={<Community />} />
            <Route path="/posts/:id" element={<Discussion />} />
            <Route path="/predictions" element={<Predictions />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="/forgot" element={<AuthPage mode="forgot" />} />
            <Route path="/reset" element={<AuthPage mode="reset" />} />
            <Route path="/verify" element={<VerifyPage />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/users/:id" element={<PublicProfile />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route
              path="*"
              element={
                <div className="empty">
                  <h1>Out of bounds.</h1>
                  <p>We couldn’t find that page.</p>
                  <Link className="btn" to="/">
                    Back to the arena <ArrowRight size={16} />
                  </Link>
                </div>
              }
            />
          </Routes>
          <footer className="page-footer">
            <span>
              © {new Date().getFullYear()} StatArena <span className="footer-sep">·</span> For the
              love of the game.
            </span>
            <span>
              Historical statistics & sourced schedules <span className="footer-sep">·</span>{' '}
              <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noreferrer">
                Data sources <ArrowUpRight size={12} />
              </a>
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
