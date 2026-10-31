import { useState, lazy, Suspense } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowUpRight,
  ArrowRight,
  Star,
  Shield,
  Users,
  MessageCircle,
  ChevronRight,
  Search,
  SlidersHorizontal,
  TrendingUp,
  ChartNoAxesCombined,
  Target,
  CalendarDays,
  BookOpen,
  GitCompareArrows,
} from 'lucide-react';
import {
  useApp,
  useResource,
  Load,
  Badge,
  num,
  date,
  metrics,
  type Team,
  type Player,
} from './lib';
const StatChart = lazy(() => import('./Chart'));
export function Heading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function SourceNote() {
  const { season } = useApp();
  return (
    <p className="source-note">
      Source:{' '}
      <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noreferrer">
        nflverse
      </a>{' '}
      · {season} regular season · Recorded data, not a live feed.
    </p>
  );
}
export function Follow({
  type,
  id,
  compact = false,
}: {
  type: 'teams' | 'players';
  id: string;
  compact?: boolean;
}) {
  const { favorites, follow } = useApp();
  const active = favorites[type].includes(id);
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={(compact ? 'icon-btn follow-icon' : 'btn subtle') + (active ? ' followed' : '')}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await follow(type, id);
        setBusy(false);
      }}
      aria-label={active ? 'Unfollow ' + id : 'Follow ' + id}
      aria-pressed={active}
    >
      <Star size={16} fill={active ? 'currentColor' : 'none'} />
      {!compact && (active ? 'Following' : 'Follow')}
    </button>
  );
}
export function GameCard({
  game,
  teams,
  compact = false,
}: {
  game: any;
  teams: Team[];
  compact?: boolean;
}) {
  const lookup = (id: string) => teams.find((t) => t.id === id) || { id, nickname: id };
  return (
    <Link to={'/games/' + game.id} className={'game-card ' + (compact ? 'compact' : '')}>
      <div className="game-meta">
        <span>
          {date(game.starts_at)} <span>·</span> W{game.week}
        </span>
        <span className={game.home_score === null ? 'scheduled' : 'final'}>
          {game.home_score === null ? 'SCHEDULED' : 'FINAL'}
        </span>
      </div>
      <div className="game-row">
        <Badge team={lookup(game.away_id)} size="small" />
        <strong>{compact ? game.away_id : lookup(game.away_id).nickname}</strong>
        <b>{game.away_score ?? '—'}</b>
      </div>
      <div className="game-row">
        <Badge team={lookup(game.home_id)} size="small" />
        <strong>{compact ? game.home_id : lookup(game.home_id).nickname}</strong>
        <b>{game.home_score ?? '—'}</b>
      </div>
      <div className="game-card-foot">
        {game.home_score === null
          ? game.kickoff_confirmed
            ? new Date(game.starts_at).toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                timeZoneName: 'short',
              })
            : 'Kickoff time TBA'
          : `${game.season} season`}
        <ChevronRight size={13} />
      </div>
    </Link>
  );
}
export function Dashboard() {
  const { user, season } = useApp();
  const dashboard = useResource('/dashboard?season=' + season),
    teams = useResource<Team[]>('/teams?season=' + season),
    passing = useResource<{ items: Player[] }>('/players?season=' + season + '&position=QB'),
    rushing = useResource<{ items: Player[] }>(
      '/players?season=' + season + '&metric=rushing_yards',
    ),
    receiving = useResource<{ items: Player[] }>(
      '/players?season=' + season + '&metric=receiving_yards',
    );
  const communities = useResource<any[]>('/communities');
  const [category, setCategory] = useState('passing_yards');
  const leaders = category === 'passing_yards' ? passing : rushing;
  const featured = passing.data?.items[0];
  return (
    <>
      <Heading
        title={user ? `Welcome back, ${user.username}.` : 'A home for your football mind.'}
        description="Go beyond the scoreboard. Find the stats, stories, and people that move the game."
        action={
          <Link className="btn outline" to="/games">
            <CalendarDays size={16} />
            Full schedule <ArrowUpRight size={16} />
          </Link>
        }
      />
      <Load loading={dashboard.loading || teams.loading} error={dashboard.error || teams.error}>
        <section className="scoreboard-strip" aria-label="Upcoming games">
          <div className="scoreboard-label">
            <span className="eyebrow">ON THE CALENDAR</span>
            <strong>
              Next up <ArrowUpRight size={16} />
            </strong>
            <span>Sourced NFL schedule</span>
          </div>
          {(dashboard.data?.nextGames || []).slice(0, 4).map((g: any) => (
            <GameCard key={g.id} game={g} teams={teams.data || []} compact />
          ))}
          {dashboard.data && !dashboard.data.nextGames.length && (
            <p className="muted">
              No upcoming games in the current source. <Link to="/games">Browse results</Link>
            </p>
          )}
        </section>
        <div className="dashboard-grid">
          <div className="dashboard-main">
            <section className="hero">
              <div className="hero-copy">
                <span className="hero-kicker">
                  <span /> THE FAN’S ADVANTAGE
                </span>
                <h2>
                  Football.
                  <br />
                  With more
                  <br />
                  <em>perspective.</em>
                </h2>
                <p>
                  Every number tells a story.
                  <br />
                  Find yours in the arena.
                </p>
                <Link className="btn lime" to="/players">
                  Explore the numbers <ArrowUpRight size={18} />
                </Link>
              </div>
              <div className="field-art" aria-hidden="true">
                <div className="field-frame">
                  <div className="endzone">STAT ARENA</div>
                  <div className="yard-lines">
                    {[10, 20, 30, 40, 50, 40, 30, 20, 10].map((n, i) => (
                      <div key={i}>
                        <span>{n}</span>
                        <i />
                        <span>{n}</span>
                      </div>
                    ))}
                  </div>
                  <div className="field-ball">◆</div>
                  <div className="play-route route-one" />
                  <div className="play-route route-two" />
                  <span className="play-x x1">×</span>
                  <span className="play-x x2">×</span>
                  <span className="play-x x3">×</span>
                  <span className="play-o o1" />
                  <span className="play-o o2" />
                  <span className="play-o o3" />
                </div>
                <div className="field-caption">
                  <ChartNoAxesCombined size={17} />
                  <span>A different view of the game</span>
                </div>
              </div>
            </section>
            <div className="section-heading">
              <div>
                <span className="eyebrow">THE NUMBERS THAT MATTER</span>
                <h2>Setting the standard</h2>
              </div>
              <span className="tag">{season} REGULAR SEASON</span>
            </div>
            <div className="leader-cards">
              {[
                {
                  r: passing,
                  label: 'PASSING LEADER',
                  metric: 'passing_yards',
                  unit: 'passing yards',
                },
                {
                  r: rushing,
                  label: 'RUSHING LEADER',
                  metric: 'rushing_yards',
                  unit: 'rushing yards',
                },
                {
                  r: receiving,
                  label: 'RECEIVING LEADER',
                  metric: 'receiving_yards',
                  unit: 'receiving yards',
                },
              ].map(({ r, label, metric, unit }, i) => (
                <div className="leader-card" key={label}>
                  <div className="leader-eyebrow">
                    <span>{label}</span>
                    <TrendingUp size={15} />
                  </div>
                  {r.data?.items[0] ? (
                    <>
                      <Link to={'/players/' + r.data.items[0].id} className="leader-person">
                        <span className={'player-monogram tone-' + i}>
                          {r.data.items[0].name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .slice(0, 2)}
                        </span>
                        <div>
                          <strong>{r.data.items[0].name}</strong>
                          <small>
                            {r.data.items[0].team_id} <span>·</span> {r.data.items[0].position}
                          </small>
                        </div>
                        <ArrowUpRight size={16} />
                      </Link>
                      <div className="leader-value">
                        {num(r.data.items[0].stats[metric])}
                        <span>{unit}</span>
                      </div>
                    </>
                  ) : (
                    <p className="muted">{r.error || 'Loading sourced statistics…'}</p>
                  )}
                </div>
              ))}
            </div>
            <section className="panel leaderboard-panel">
              <div className="panel-heading">
                <div>
                  <h2>By the numbers</h2>
                  <p>The season’s top performers. The full picture.</p>
                </div>
                <Link to="/players" className="text-link">
                  All players <ArrowUpRight size={16} />
                </Link>
              </div>
              <div className="tabs">
                <button
                  className={category === 'passing_yards' ? 'selected' : ''}
                  onClick={() => setCategory('passing_yards')}
                >
                  Passing
                </button>
                <button
                  className={category === 'rushing_yards' ? 'selected' : ''}
                  onClick={() => setCategory('rushing_yards')}
                >
                  Rushing
                </button>
                <span>{season} season totals</span>
              </div>
              <Load loading={leaders.loading} error={leaders.error}>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>PLAYER</th>
                        <th>TEAM</th>
                        <th className="number">YARDS</th>
                        <th className="number">TD</th>
                        <th aria-label="Player profile" />
                      </tr>
                    </thead>
                    <tbody>
                      {leaders.data?.items.slice(0, 5).map((p, i) => (
                        <tr key={p.id}>
                          <td className="rank">{String(i + 1).padStart(2, '0')}</td>
                          <td>
                            <Link className="table-player" to={'/players/' + p.id}>
                              <span
                                className="mini-avatar"
                                style={{
                                  background: p.color + '18',
                                  color: `color-mix(in srgb, ${p.color} 60%, #102a21)`,
                                }}
                              >
                                {p.name
                                  .split(' ')
                                  .map((x) => x[0])
                                  .join('')}
                              </span>
                              <span>
                                <strong>{p.name}</strong>
                                <small>{p.position}</small>
                              </span>
                            </Link>
                          </td>
                          <td>
                            <span className="team-code">{p.team_id}</span>
                          </td>
                          <td className="number emphasized">{num(p.stats[category])}</td>
                          <td className="number">
                            {num(
                              p.stats[category === 'passing_yards' ? 'passing_tds' : 'rushing_tds'],
                            )}
                          </td>
                          <td>
                            <Link to={'/players/' + p.id} aria-label={'View ' + p.name}>
                              <ArrowUpRight size={16} />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Load>
              <SourceNote />
            </section>
            {user && (
              <section className="panel spaced">
                <div className="panel-heading">
                  <div>
                    <h2>From your communities</h2>
                    <p>The conversations happening in your corner of the arena.</p>
                  </div>
                  <Link to="/communities" className="text-link">
                    All communities <ArrowUpRight size={16} />
                  </Link>
                </div>
                {dashboard.data?.recentPosts?.length ? (
                  dashboard.data.recentPosts.map((p: any) => (
                    <Link
                      className="list-row dashboard-discussion"
                      to={'/posts/' + p.id}
                      key={p.id}
                    >
                      <MessageCircle size={18} />
                      <span>
                        <strong>{p.title}</strong>
                        <small>
                          {p.community_name} · {p.username || 'Deleted account'}
                        </small>
                      </span>
                      <ArrowUpRight size={16} />
                    </Link>
                  ))
                ) : (
                  <p className="panel-padding muted">
                    Join a team community and start a discussion to make this feed yours.
                  </p>
                )}
              </section>
            )}
            <section className="community-banner">
              <div className="conversation-art" aria-hidden="true">
                <Users size={35} />
              </div>
              <div>
                <span className="eyebrow">GOOD TAKES DESERVE GOOD COMPANY</span>
                <h2>The conversation is part of the game.</h2>
                <p>Find your team’s community. Bring your perspective.</p>
              </div>
              <Link to="/communities" className="btn dark">
                Find your people <ArrowUpRight size={17} />
              </Link>
            </section>
          </div>
          <aside className="dashboard-aside">
            <section className="panel favorites-panel">
              <div className="panel-heading">
                <h2>{user ? 'Your teams' : 'Pick your side'}</h2>
                <Star size={17} />
              </div>
              <p className="muted">
                {user ? 'Keep your favorites close.' : 'Your colors. Your community. Your game.'}
              </p>
              {(dashboard.data?.favorites?.length
                ? dashboard.data.favorites
                : teams.data?.filter((t) => ['KC', 'PHI', 'BUF', 'SF'].includes(t.id))
              )
                ?.slice(0, 5)
                .map((t: Team) => (
                  <div className="favorite-team" key={t.id}>
                    <Badge team={t} />
                    <Link to={'/teams/' + t.id}>
                      <strong>{t.nickname}</strong>
                      <small>{t.division}</small>
                    </Link>
                    <Follow type="teams" id={t.id} compact />
                  </div>
                ))}
              <Link to="/teams" className="btn wide outline">
                Discover all teams <ArrowRight size={15} />
              </Link>
            </section>
            <section className="panel compare-teaser">
              <span className="tag green">THE MATCHUP LAB</span>
              <div className="compare-art" aria-hidden="true">
                <span>01</span>
                <GitCompareArrows size={23} />
                <span>02</span>
              </div>
              <h2>Settle it with stats.</h2>
              <p>Put your favorite players side by side. Let the numbers do the talking.</p>
              <Link to="/compare" className="text-link">
                Build a comparison <ArrowUpRight size={16} />
              </Link>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Around the arena</h2>
                <Users size={17} />
              </div>
              <div className="arena-stat">
                <strong>{teams.data?.length || 0}</strong>
                <span>teams. One league.</span>
              </div>
              <div className="arena-stat">
                <strong>{communities.data?.length || 0}</strong>
                <span>places to find your people.</span>
              </div>
              <p className="mini-label">START A CONVERSATION</p>
              {communities.data
                ?.filter((c) => !c.team_id)
                .map((c) => (
                  <Link className="community-mini" to={'/communities/' + c.id} key={c.id}>
                    <span className="league-icon">
                      <Shield size={18} />
                    </span>
                    <span>
                      <strong>{c.name}</strong>
                      <small>{c.members} members</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </Link>
                ))}
            </section>
            {featured && (
              <section className="insight-note">
                <BookOpen size={21} />
                <p>
                  <strong>Stats with context.</strong> Season totals cover regular-season play only.
                  Explore a player profile for the week-by-week breakdown.
                </p>
                <Link to={'/players/' + featured.id} aria-label="Explore a player’s season">
                  <ArrowUpRight size={18} />
                </Link>
              </section>
            )}
          </aside>
        </div>
      </Load>
    </>
  );
}
export function Teams() {
  const { season } = useApp();
  const r = useResource<Team[]>('/teams?season=' + season);
  const [q, setQ] = useState(''),
    [conference, setConference] = useState('ALL');
  return (
    <>
      <Heading
        eyebrow="KNOW YOUR COLORS"
        title="The league, at a glance."
        description="32 teams. Countless stories. Find the one you call home."
      />
      <div className="filter-bar">
        <label className="search-input">
          <Search size={17} />
          <input
            aria-label="Search teams"
            placeholder="Find a team…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <div className="segmented">
          {['ALL', 'AFC', 'NFC'].map((c) => (
            <button
              key={c}
              className={conference === c ? 'selected' : ''}
              onClick={() => setConference(c)}
            >
              {c === 'ALL' ? 'All conferences' : c}
            </button>
          ))}
        </div>
        <span className="muted">{season} regular-season records</span>
      </div>
      <Load {...r}>
        <div className="team-grid">
          {r.data
            ?.filter(
              (t) =>
                t.name.toLowerCase().includes(q.toLowerCase()) &&
                (conference === 'ALL' || t.conference === conference),
            )
            .map((t) => (
              <article className="panel team-tile" key={t.id}>
                <div className="team-tile-top">
                  <Badge team={t} size="large" />
                  <Follow type="teams" id={t.id} compact />
                </div>
                <span className="mini-label">{t.division}</span>
                <Link to={'/teams/' + t.id}>
                  <h2>{t.name}</h2>
                </Link>
                <div className="team-tile-bottom">
                  <span>
                    <strong>
                      {t.wins}–{t.losses}
                      {t.ties ? `–${t.ties}` : ''}
                    </strong>{' '}
                    <small>W–L{t.ties ? '–T' : ''}</small>
                  </span>
                  <Link to={'/teams/' + t.id} className="text-link">
                    Team profile <ArrowUpRight size={15} />
                  </Link>
                </div>
              </article>
            ))}
        </div>
        {r.data &&
          !r.data.some(
            (t) =>
              t.name.toLowerCase().includes(q.toLowerCase()) &&
              (conference === 'ALL' || t.conference === conference),
          ) && (
            <div className="empty">
              <Shield />
              <h3>No teams found</h3>
              <p>Try another name or conference.</p>
            </div>
          )}
        <SourceNote />
      </Load>
    </>
  );
}
export function Players() {
  const { season } = useApp();
  const [q, setQ] = useState(''),
    [position, setPosition] = useState('ALL'),
    [metric, setMetric] = useState('passing_yards'),
    [page, setPage] = useState(1);
  const r = useResource<{ items: Player[]; pages: number; total: number }>(
    `/players?season=${season}&q=${encodeURIComponent(q)}&position=${position}&metric=${metric}&page=${page}`,
  );
  return (
    <>
      <Heading
        eyebrow="BEHIND EVERY GREAT GAME"
        title="Meet the difference makers."
        description="Explore the players shaping the game. Every yard. Every week."
        action={
          <Link className="btn dark" to="/compare">
            <GitCompareArrows size={16} />
            Compare players
          </Link>
        }
      />
      <div className="filter-bar">
        <label className="search-input">
          <Search size={17} />
          <input
            aria-label="Search players"
            placeholder="Search players…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="select-label">
          Position
          <select
            aria-label="Player position"
            value={position}
            onChange={(e) => {
              setPosition(e.target.value);
              setPage(1);
            }}
          >
            {['ALL', 'QB', 'RB', 'WR', 'TE', 'FB'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="select-label">
          Sort by
          <select
            aria-label="Sort statistic"
            value={metric}
            onChange={(e) => {
              setMetric(e.target.value);
              setPage(1);
            }}
          >
            {['passing_yards', 'rushing_yards', 'receiving_yards', 'passing_tds', 'receptions'].map(
              (m) => (
                <option key={m} value={m}>
                  {metrics[m]}
                </option>
              ),
            )}
          </select>
        </label>
      </div>
      <Load {...r}>
        <section className="panel">
          <div className="panel-heading">
            <h2>Player explorer</h2>
            <span className="muted">
              {num(r.data?.total)} players · {season}
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>PLAYER</th>
                  <th>TEAM</th>
                  <th>POS</th>
                  <th className="number">{metrics[metric].toUpperCase()}</th>
                  <th className="number">GAMES</th>
                  <th>FAVORITE</th>
                </tr>
              </thead>
              <tbody>
                {r.data?.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link className="table-player" to={'/players/' + p.id}>
                        <span
                          className="mini-avatar"
                          style={{
                            background: p.color + '18',
                            color: `color-mix(in srgb, ${p.color} 60%, #102a21)`,
                          }}
                        >
                          {p.name
                            .split(' ')
                            .map((x) => x[0])
                            .join('')}
                        </span>
                        <strong>{p.name}</strong>
                      </Link>
                    </td>
                    <td>
                      <Link className="team-code" to={'/teams/' + p.team_id}>
                        {p.team_id}
                      </Link>
                    </td>
                    <td>{p.position}</td>
                    <td className="number emphasized">{num(p.stats[metric])}</td>
                    <td className="number">{p.stats.games}</td>
                    <td>
                      <Follow type="players" id={p.id} compact />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!r.data?.items.length && (
            <div className="empty">
              <Search />
              <h3>No players found</h3>
              <p>Try a different name or position.</p>
            </div>
          )}
          <div className="pagination">
            <button
              className="btn outline small"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {Math.max(1, r.data?.pages || 0)}
            </span>
            <button
              className="btn outline small"
              disabled={page >= (r.data?.pages || 1)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </section>
        <SourceNote />
      </Load>
    </>
  );
}
export function PlayerDetail() {
  const { id } = useParams(),
    { season } = useApp();
  const r = useResource<Player>(`/players/${id}?season=${season}`);
  const [metric, setMetric] = useState('');
  const p = r.data;
  const defaultMetric =
    p?.position === 'QB'
      ? 'passing_yards'
      : p?.position === 'RB'
        ? 'rushing_yards'
        : 'receiving_yards';
  const current = metric || defaultMetric;
  return (
    <Load {...r}>
      {p && (
        <>
          <Link className="back-link" to="/players">
            ← Player explorer
          </Link>
          <div className="profile-hero">
            <span className="profile-monogram" style={{ background: p.color }}>
              {p.name
                .split(' ')
                .map((x) => x[0])
                .join('')}
            </span>
            <div>
              <span className="eyebrow">
                {p.team_name} · {p.position}
              </span>
              <h1>{p.name}</h1>
              <p>{season} regular-season performance</p>
            </div>
            <Follow type="players" id={p.id} />
            <Link className="btn outline" to={'/compare?first=' + p.id}>
              <GitCompareArrows size={16} />
              Compare
            </Link>
          </div>
          <div className="stats-grid">
            {[defaultMetric, defaultMetric.replace('yards', 'tds'), 'games', 'receptions']
              .filter((m, i, a) => a.indexOf(m) === i)
              .map((m) => (
                <div className="panel stat-box" key={m}>
                  <span>{metrics[m]}</span>
                  <strong>{num(p.stats[m])}</strong>
                  <small>{season} season total</small>
                </div>
              ))}
          </div>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>A season in perspective</h2>
                <p>Week-by-week production · {season} regular season</p>
              </div>
              <select
                aria-label="Chart metric"
                value={current}
                onChange={(e) => setMetric(e.target.value)}
              >
                {Object.keys(metrics)
                  .filter((m) => !['games', 'completion_pct'].includes(m))
                  .map((m) => (
                    <option key={m} value={m}>
                      {metrics[m]}
                    </option>
                  ))}
              </select>
            </div>
            <Suspense fallback={<div className="loading">Loading weekly chart…</div>}>
              <StatChart player={p} metric={current} />
            </Suspense>
          </section>
          <section className="panel spaced">
            <div className="panel-heading">
              <h2>The full stat line</h2>
            </div>
            <div className="stat-line">
              {Object.entries(p.stats).map(([k, v]) => (
                <div key={k}>
                  <span>{metrics[k] || k}</span>
                  <strong>{num(v)}</strong>
                </div>
              ))}
            </div>
          </section>
          <SourceNote />
        </>
      )}
    </Load>
  );
}
export function TeamDetail() {
  const { id } = useParams(),
    { season } = useApp();
  const r = useResource<any>(`/teams/${id}?season=${season}`);
  const t = r.data;
  return (
    <Load {...r}>
      {t && (
        <>
          <Link className="back-link" to="/teams">
            ← All teams
          </Link>
          <div className="profile-hero">
            <Badge team={t} size="large" />
            <div>
              <span className="eyebrow">{t.division}</span>
              <h1>{t.name}</h1>
              <p>{season} season · NFL</p>
            </div>
            <Follow type="teams" id={t.id} />
            <Link className="btn outline" to={'/communities/' + t.id.toLowerCase()}>
              <Users size={16} />
              Team community
            </Link>
          </div>
          <div className="stats-grid">
            {[
              [
                'Wins',
                t.games.filter(
                  (g: any) =>
                    g.type === 'REG' &&
                    (g.home_id === id ? g.home_score > g.away_score : g.away_score > g.home_score),
                ).length,
              ],
              [
                'Losses',
                t.games.filter(
                  (g: any) =>
                    g.type === 'REG' &&
                    (g.home_id === id ? g.home_score < g.away_score : g.away_score < g.home_score),
                ).length,
              ],
              ['Rostered players', t.players.length],
              ['Recorded games', t.games.filter((g: any) => g.home_score !== null).length],
            ].map(([label, value]) => (
              <div className="panel stat-box" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{season} source records</small>
              </div>
            ))}
          </div>
          <div className="two-columns">
            <section className="panel">
              <div className="panel-heading">
                <h2>Player roster</h2>
                <span className="muted">Players with recorded stats</span>
              </div>
              {t.players.map((p: Player) => (
                <Link className="list-row" to={'/players/' + p.id} key={p.id}>
                  <span className="position-tag">{p.position}</span>
                  <strong>{p.name}</strong>
                  <ArrowUpRight size={16} />
                </Link>
              ))}
            </section>
            <section>
              <div className="section-heading">
                <h2>Season schedule & results</h2>
              </div>
              <div className="game-grid two">
                {t.games.map((g: any) => (
                  <GameCard key={g.id} game={g} teams={[t]} />
                ))}
              </div>
            </section>
          </div>
          <SourceNote />
        </>
      )}
    </Load>
  );
}
export function Compare() {
  const { season } = useApp();
  const [params] = useSearchParams();
  const [type, setType] = useState('players');
  const options = useResource<any[]>('/compare/options?season=' + season),
    teams = useResource<Team[]>('/teams?season=' + season);
  const [first, setFirst] = useState(params.get('first') || ''),
    [second, setSecond] = useState('');
  const a = useResource<Player>(
      type === 'players' && first ? `/players/${first}?season=${season}` : null,
    ),
    b = useResource<Player>(
      type === 'players' && second ? `/players/${second}?season=${season}` : null,
    );
  const items = type === 'players' ? options.data : teams.data;
  const currentA = type === 'players' ? a.data : teams.data?.find((t) => t.id === first),
    currentB = type === 'players' ? b.data : teams.data?.find((t) => t.id === second);
  const compareMetrics =
    type === 'players'
      ? [
          'passing_yards',
          'passing_tds',
          'rushing_yards',
          'rushing_tds',
          'receiving_yards',
          'receiving_tds',
          'receptions',
          'completion_pct',
        ]
      : ['wins', 'losses', 'ties'];
  return (
    <>
      <Heading
        eyebrow="THE MATCHUP LAB"
        title="Let the numbers talk."
        description="Two perspectives. One side-by-side view. Build your own comparison."
      />
      <div className="segmented compare-type">
        {['players', 'teams'].map((t) => (
          <button
            key={t}
            className={type === t ? 'selected' : ''}
            onClick={() => {
              setType(t);
              setFirst('');
              setSecond('');
            }}
          >
            Compare {t}
          </button>
        ))}
      </div>
      <Load loading={options.loading || teams.loading} error={options.error || teams.error}>
        <div className="compare-selectors">
          <label>
            <span>IN THIS CORNER</span>
            <select
              aria-label="First comparison selection"
              value={first}
              onChange={(e) => setFirst(e.target.value)}
            >
              <option value="">Select a {type === 'players' ? 'player' : 'team'}</option>
              {items?.map((p) => (
                <option key={p.id} value={p.id} disabled={p.id === second}>
                  {p.name}
                  {p.position ? ` · ${p.position}` : ''}
                </option>
              ))}
            </select>
          </label>
          <span className="versus">VS</span>
          <label>
            <span>AND IN THIS CORNER</span>
            <select
              aria-label="Second comparison selection"
              value={second}
              onChange={(e) => setSecond(e.target.value)}
            >
              <option value="">Select a {type === 'players' ? 'player' : 'team'}</option>
              {items?.map((p) => (
                <option key={p.id} value={p.id} disabled={p.id === first}>
                  {p.name}
                  {p.position ? ` · ${p.position}` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        {currentA && currentB ? (
          <section className="panel comparison">
            <div className="comparison-names">
              <h2>{currentA.name}</h2>
              <span>{season} REGULAR SEASON</span>
              <h2>{currentB.name}</h2>
            </div>
            {compareMetrics.map((m) => {
              const av = Number(
                  type === 'players' ? (currentA as Player).stats[m] : (currentA as any)[m],
                ),
                bv = Number(
                  type === 'players' ? (currentB as Player).stats[m] : (currentB as any)[m],
                );
              const max = Math.max(av, bv, 1);
              return (
                <div className="comparison-row" key={m}>
                  <div className="comparison-values">
                    <strong>{num(av)}</strong>
                    <span>{metrics[m] || m.toUpperCase()}</span>
                    <strong>{num(bv)}</strong>
                  </div>
                  <div className="comparison-bars">
                    <div>
                      <i style={{ width: `${(av / max) * 100}%` }} />
                    </div>
                    <div>
                      <i style={{ width: `${(bv / max) * 100}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
            <p className="source-note">
              Compare like positions for meaningful football context. All values are season totals
              except completion percentage.
            </p>
          </section>
        ) : (
          <div className="empty comparison-empty">
            <GitCompareArrows size={38} />
            <h2>A good debate starts here.</h2>
            <p>
              Choose two {type} to explore their {season} season side by side.
            </p>
            {a.error || b.error ? <p className="form-error">{a.error || b.error}</p> : null}
          </div>
        )}
        <SourceNote />
      </Load>
    </>
  );
}
export function Games() {
  const { meta } = useApp();
  const [year, setYear] = useState(0),
    [week, setWeek] = useState(''),
    [page, setPage] = useState(1);
  const selected = year || meta?.gameSeasons?.[0] || 2026;
  const r = useResource<any>(
      `/games?season=${selected}&page=${page}${week ? '&week=' + week : ''}`,
    ),
    teams = useResource<Team[]>('/teams');
  return (
    <>
      <Heading
        eyebrow="EVERY MATCHUP. EVERY STORY."
        title="The game plan."
        description="Sourced schedules and recorded results. Find your next football moment."
      />
      <div className="filter-bar">
        <label className="select-label">
          Schedule season
          <select
            aria-label="Schedule season"
            value={selected}
            onChange={(e) => {
              setYear(Number(e.target.value));
              setPage(1);
            }}
          >
            {(meta?.gameSeasons || [2026, 2025, 2024]).map((s: number) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="select-label">
          Week
          <select
            aria-label="Schedule week"
            value={week}
            onChange={(e) => {
              setWeek(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All weeks</option>
            {Array.from({ length: 22 }, (_, i) => (
              <option key={i} value={i + 1}>
                Week {i + 1}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">Times shown in your local timezone</span>
      </div>
      <Load loading={r.loading || teams.loading} error={r.error || teams.error}>
        <div className="game-grid">
          {r.data?.items.map((g: any) => (
            <GameCard key={g.id} game={g} teams={teams.data || []} />
          ))}
        </div>
        {!r.data?.items.length && (
          <div className="empty">
            <CalendarDays />
            <h3>No games in this selection</h3>
            <p>Try a different week or season.</p>
          </div>
        )}
        <div className="pagination">
          <button
            className="btn outline"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span>
            Page {page} of {Math.max(1, Math.ceil((r.data?.total || 0) / 32))}
          </span>
          <button
            className="btn outline"
            disabled={page * 32 >= (r.data?.total || 0)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
        <p className="source-note">
          Schedule source: nflverse / nfldata. Not a live scoreboard. Confirm kickoff times with the
          league.
        </p>
      </Load>
    </>
  );
}
export function GameDetail() {
  const { id } = useParams();
  const r = useResource<any>('/games/' + id),
    teams = useResource<Team[]>('/teams');
  const g = r.data;
  return (
    <Load loading={r.loading || teams.loading} error={r.error || teams.error}>
      {g && (
        <>
          <Link className="back-link" to="/games">
            ← Full schedule
          </Link>
          <Heading
            eyebrow={`${g.season} SEASON · WEEK ${g.week}`}
            title={`${g.away_id} at ${g.home_id}`}
            description={`${date(g.starts_at, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · ${g.kickoff_confirmed ? new Date(g.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'Kickoff time TBA'} · ${g.stadium}`}
          />
          <div className="game-detail">
            {[g.away_id, g.home_id].map((tid, i) => {
              const t = teams.data?.find((t) => t.id === tid);
              return (
                <div key={tid}>
                  <Badge team={t || { id: tid }} size="large" />
                  <Link to={'/teams/' + tid}>
                    <h2>{t?.name || tid}</h2>
                  </Link>
                  <strong>{(i ? g.home_score : g.away_score) ?? '—'}</strong>
                  <span>{i ? 'HOME' : 'AWAY'}</span>
                </div>
              );
            })}
          </div>
          <p className="source-note">
            {g.home_score === null
              ? 'Scheduled matchup · Scores unavailable until recorded by source.'
              : 'Recorded final score · Source: nflverse'}
          </p>
          {g.home_score === null &&
            g.kickoff_confirmed &&
            new Date(g.starts_at).getTime() > Date.now() && (
              <Link className="btn dark" to="/predictions">
                Make a friendly prediction <ArrowRight size={17} />
              </Link>
            )}
        </>
      )}
    </Load>
  );
}
export function Favorites() {
  const { user, season, favorites } = useApp();
  const d = useResource<any>(user ? '/dashboard?season=' + season : null);
  return (
    <>
      <Heading
        eyebrow="YOUR ARENA"
        title="Keep your favorites close."
        description="The teams and players you follow, all in one place."
      />
      {!user ? (
        <SignInPrompt />
      ) : (
        <Load {...d}>
          <h2 className="section-title">Your teams</h2>
          <div className="team-grid">
            {d.data?.favorites.map((t: Team) => (
              <div className="panel favorite-tile" key={t.id}>
                <Badge team={t} />
                <Link to={'/teams/' + t.id}>
                  <h3>{t.name}</h3>
                </Link>
                <Follow type="teams" id={t.id} compact />
              </div>
            ))}
          </div>
          {!favorites.teams.length && (
            <div className="empty">
              <Star />
              <h3>Every fan has a side.</h3>
              <p>Follow a team to make this space yours.</p>
              <Link to="/teams" className="btn dark">
                Explore teams
              </Link>
            </div>
          )}
          <h2 className="section-title">Your players · {season}</h2>
          <div className="team-grid">
            {d.data?.favoritePlayers.map((p: Player) => (
              <div className="panel favorite-tile" key={p.id}>
                <span className="position-tag">{p.position}</span>
                <Link to={'/players/' + p.id}>
                  <h3>{p.name}</h3>
                  <span className="muted">{p.team_id}</span>
                </Link>
                <Follow type="players" id={p.id} compact />
              </div>
            ))}
          </div>
          {!d.data?.favoritePlayers.length && (
            <div className="empty">
              <Users />
              <h3>Your player watchlist starts here.</h3>
              <p>Follow players to see their statistics for the selected season.</p>
              <Link to="/players" className="btn outline">
                Find players
              </Link>
            </div>
          )}
        </Load>
      )}
    </>
  );
}
export function SignInPrompt() {
  return (
    <div className="empty">
      <Star size={32} />
      <h2>Make the arena yours.</h2>
      <p>Sign in to follow teams, join communities, and share your perspective.</p>
      <div className="button-row">
        <Link to="/register" className="btn dark">
          Create an account <ArrowUpRight size={16} />
        </Link>
        <Link to="/login" className="btn outline">
          Sign in
        </Link>
      </div>
    </div>
  );
}
export function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q') || '';
  const r = useResource<any>(q ? '/search?q=' + encodeURIComponent(q) : null);
  return (
    <>
      <Heading
        title={q ? `Results for “${q}”` : 'Search the arena'}
        description="Find teams, players, communities, and conversations."
      />
      <Load {...r}>
        {r.data &&
          Object.entries(r.data).map(([type, items]) => (
            <section className="panel spaced" key={type}>
              <div className="panel-heading">
                <h2 className="capitalize">{type}</h2>
                <span className="muted">{(items as any[]).length} results</span>
              </div>
              {(items as any[]).map((item) => (
                <Link className="list-row" key={item.id} to={`/${type}/${item.id}`}>
                  <strong>{item.name || item.title}</strong>
                  <span className="muted">{item.position}</span>
                  <ArrowUpRight size={16} />
                </Link>
              ))}
              {!(items as any[]).length && (
                <p className="panel-padding muted">No matching {type}.</p>
              )}
            </section>
          ))}
      </Load>
    </>
  );
}
