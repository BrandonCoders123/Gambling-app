import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Users,
  Plus,
  Search,
  ArrowUpRight,
  MessageCircle,
  ArrowUp,
  Flag,
  Trash2,
  Send,
  Shield,
  Target,
  Trophy,
  Check,
  Clock,
  BarChart3,
  Pencil,
} from 'lucide-react';
import { api, useApp, useResource, Load, Modal, Badge, date, num, type Team } from './lib';
import { Heading, SignInPrompt, GameCard, FavoriteTeamsSection } from './sports';
export function Communities() {
  const { user, notify, refresh, requireUser } = useApp();
  const r = useResource<any[]>('/communities');
  const [q, setQ] = useState(''),
    [joined, setJoined] = useState(false);
  const toggle = async (c: any) => {
    if (!requireUser()) return;
    try {
      await api('/communities/' + c.id + '/join', 'POST', { join: !c.joined });
      refresh();
      notify(c.joined ? 'You left the community.' : 'Welcome to ' + c.name + '.');
    } catch (e) {
      notify((e as Error).message, true);
    }
  };
  return (
    <>
      <Heading
        eyebrow="FIND YOUR PEOPLE"
        title="The stands are always open."
        description="Your team. Your takes. A community that gets it."
      />
      <FavoriteTeamsSection />
      <div className="filter-bar">
        <label className="search-input">
          <Search size={17} />
          <input
            aria-label="Search communities"
            placeholder="Find a community…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <div className="segmented">
          <button className={!joined ? 'selected' : ''} onClick={() => setJoined(false)}>
            All communities
          </button>
          <button
            className={joined ? 'selected' : ''}
            onClick={() => {
              if (requireUser()) setJoined(true);
            }}
          >
            My communities
          </button>
        </div>
      </div>
      <Load {...r}>
        <div className="community-grid">
          {r.data
            ?.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) && (!joined || c.joined))
            .map((c) => (
              <article className="panel community-tile" key={c.id}>
                <div className="community-tile-head">
                  {c.team_id ? (
                    <Badge team={{ id: c.team_id, color: c.color }} size="large" />
                  ) : (
                    <span className="league-icon large">
                      <Shield size={32} />
                    </span>
                  )}
                  <span className="tag">{c.team_id ? 'TEAM COMMUNITY' : 'LEAGUE COMMUNITY'}</span>
                </div>
                <Link to={'/communities/' + c.id}>
                  <h2>{c.name}</h2>
                </Link>
                <p>{c.description}</p>
                <div className="community-counts">
                  <span>
                    <Users size={14} />
                    {num(c.members)} members
                  </span>
                  <span>
                    <MessageCircle size={14} />
                    {num(c.posts)} discussions
                  </span>
                </div>
                <div className="community-tile-bottom">
                  <Link className="text-link" to={'/communities/' + c.id}>
                    Enter community <ArrowUpRight size={16} />
                  </Link>
                  <button
                    className={'btn small ' + (c.joined ? 'outline' : 'dark')}
                    onClick={() => toggle(c)}
                  >
                    {c.joined ? (
                      <>
                        <Check size={15} />
                        Joined
                      </>
                    ) : (
                      <>
                        <Plus size={15} />
                        Join
                      </>
                    )}
                  </button>
                </div>
              </article>
            ))}
        </div>
        {r.data &&
          !r.data.some(
            (c) => c.name.toLowerCase().includes(q.toLowerCase()) && (!joined || c.joined),
          ) && (
            <div className="empty">
              <Users />
              <h3>{joined ? 'Find your first community.' : 'No communities found.'}</h3>
              <p>
                {joined ? 'Choose All communities to find your team.' : 'Try another team name.'}
              </p>
            </div>
          )}
      </Load>
    </>
  );
}
function Compose({ community, onClose }: { community: string; onClose: () => void }) {
  const { notify, refresh } = useApp();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Bring your perspective." onClose={onClose}>
      <p className="muted">A good conversation starts with a thoughtful take.</p>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await api('/posts', 'POST', {
              community_id: community,
              title: f.get('title'),
              body: f.get('body'),
            });
            refresh();
            notify('Your discussion is live.');
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Title
          <input
            name="title"
            required
            minLength={1}
            maxLength={180}
            placeholder="What’s on your football mind?"
          />
        </label>
        <label>
          Your take
          <textarea
            name="body"
            required
            rows={7}
            maxLength={10000}
            placeholder="Make your case. Stats and thoughtful questions are always welcome."
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn dark" disabled={busy}>
          {busy ? 'Publishing…' : 'Publish discussion'}
          <Send size={16} />
        </button>
      </form>
    </Modal>
  );
}
function PollComposer({ community, onClose }: { community: string; onClose: () => void }) {
  const { notify, refresh } = useApp();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Ask the arena." onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await api('/polls', 'POST', {
              community_id: community,
              question: f.get('question'),
              options: String(f.get('options'))
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean),
              closes_at: new Date(String(f.get('closes'))).toISOString(),
            });
            refresh();
            notify('Your poll is open.');
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Question
          <input name="question" required maxLength={180} />
        </label>
        <label>
          Answers <small>One answer per line. Between 2 and 6 options.</small>
          <textarea name="options" required rows={4} />
        </label>
        <label>
          Closes at (your local time)
          <input
            name="closes"
            type="datetime-local"
            required
            min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn dark" disabled={busy}>
          {busy ? 'Creating…' : 'Create poll'}
        </button>
      </form>
    </Modal>
  );
}
function Poll({ poll }: { poll: any }) {
  const { requireUser, refresh, notify } = useApp();
  const total = poll.votes.reduce((n: number, v: any) => n + v.count, 0),
    closed = new Date(poll.closes_at).getTime() <= Date.now();
  const [busy, setBusy] = useState(false);
  const vote = async (option: number) => {
    if (!requireUser()) return;
    setBusy(true);
    try {
      await api('/polls/' + poll.id + '/vote', 'PUT', { option });
      refresh();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="panel poll">
      <div className="mini-label">
        <BarChart3 size={14} />
        COMMUNITY POLL · {closed ? 'CLOSED' : 'OPEN'}
      </div>
      <h3>{poll.question}</h3>
      {poll.options.map((option: string, i: number) => {
        const n = poll.votes.find((v: any) => v.option === i)?.count || 0;
        return (
          <button
            className={'poll-option ' + (poll.my_vote === i ? 'voted' : '')}
            key={i}
            onClick={() => vote(i)}
            disabled={closed || busy}
            aria-pressed={poll.my_vote === i}
          >
            <span
              className="poll-progress"
              style={{ width: `${total ? (n / total) * 100 : 0}%` }}
            />
            <span>
              {poll.my_vote === i && <Check size={15} />} {option}
            </span>
            <strong>{total ? Math.round((n / total) * 100) : 0}%</strong>
          </button>
        );
      })}
      <p className="muted">
        {total} votes · {closed ? 'Closed' : 'Closes'} {date(poll.closes_at)} · One vote per
        account; changes allowed until close.
      </p>
    </div>
  );
}
function Feed({ community }: { community: string }) {
  const [sort, setSort] = useState('newest');
  const r = useResource<any[]>(`/communities/${community}/posts?sort=${sort}`);
  const { requireUser, notify, refresh } = useApp();
  return (
    <>
      <div className="section-heading">
        <h2>In the conversation</h2>
        <select
          aria-label="Sort discussions"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="newest">Newest first</option>
          <option value="popular">Most popular</option>
        </select>
      </div>
      <Load {...r}>
        {r.data?.map((p) => (
          <article className="panel post-card" key={p.id}>
            <div className="post-meta">
              <span className="avatar small">{(p.username || 'SA').slice(0, 2).toUpperCase()}</span>
              <Link to={'/users/' + p.user_id}>{p.username || 'Deleted account'}</Link>
              <span>·</span>
              <time>{date(p.created_at)}</time>
              <span className="post-community">{p.community_name}</span>
            </div>
            <Link to={'/posts/' + p.id}>
              <h2>{p.title}</h2>
            </Link>
            <p>
              {p.body.slice(0, 280)}
              {p.body.length > 280 ? '…' : ''}
            </p>
            <div className="post-actions">
              <button
                className={p.reacted ? 'reacted' : ''}
                aria-pressed={p.reacted}
                onClick={async () => {
                  if (!requireUser()) return;
                  try {
                    await api('/posts/' + p.id + '/reaction', 'PUT', { active: !p.reacted });
                    refresh();
                  } catch (e) {
                    notify((e as Error).message, true);
                  }
                }}
              >
                <ArrowUp size={16} />
                {p.upvotes}
              </button>
              <Link to={'/posts/' + p.id}>
                <MessageCircle size={16} />
                {p.comments} comments
              </Link>
              <Link to={'/posts/' + p.id} className="read-discussion">
                Join the discussion <ArrowUpRight size={15} />
              </Link>
            </div>
          </article>
        ))}
        {!r.data?.length && (
          <div className="empty panel">
            <MessageCircle size={32} />
            <h2>The first take could be yours.</h2>
            <p>Join the community and start a thoughtful football conversation.</p>
          </div>
        )}
      </Load>
    </>
  );
}
export function Community() {
  const { id } = useParams();
  const { notify, refresh, requireUser } = useApp();
  const r = useResource<any[]>('/communities');
  const c = r.data?.find((c) => c.id === id);
  const polls = useResource<any[]>('/polls?community=' + id);
  const [compose, setCompose] = useState(false),
    [polling, setPolling] = useState(false),
    [members, setMembers] = useState(false);
  const m = useResource<any[]>(members ? '/communities/' + id + '/members' : null);
  return (
    <Load {...r}>
      {c ? (
        <>
          <Link to="/communities" className="back-link">
            ← All communities
          </Link>
          <div className="community-hero">
            <div>
              {c.team_id ? (
                <Badge team={{ id: c.team_id, color: c.color }} size="large" />
              ) : (
                <Shield size={46} />
              )}
              <span className="eyebrow">YOUR PEOPLE. YOUR PERSPECTIVE.</span>
              <h1>{c.name}</h1>
              <p>{c.description}</p>
              <button className="member-link" onClick={() => setMembers(true)}>
                <Users size={15} />
                {c.members} members · View members
              </button>
            </div>
            <button
              className={'btn ' + (c.joined ? 'outline' : 'lime')}
              onClick={async () => {
                if (!requireUser()) return;
                try {
                  await api('/communities/' + id + '/join', 'POST', { join: !c.joined });
                  refresh();
                } catch (e) {
                  notify((e as Error).message, true);
                }
              }}
            >
              {c.joined ? (
                <>
                  <Check size={16} />
                  Joined · Leave
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Join community
                </>
              )}
            </button>
          </div>
          <div className="social-layout">
            <section>
              <div className="compose-bar">
                <MessageCircle size={22} />
                <span>Your next great conversation starts here.</span>
                <button
                  className="btn dark"
                  onClick={() => {
                    if (requireUser()) {
                      if (!c.joined) {
                        notify('Join this community before posting.');
                        return;
                      }
                      setCompose(true);
                    }
                  }}
                >
                  <Plus size={16} />
                  New discussion
                </button>
              </div>
              <Feed community={c.id} />
              {polls.data?.map((p) => (
                <Poll key={p.id} poll={p} />
              ))}
            </section>
            <aside>
              <section className="panel rules-panel">
                <Shield size={24} />
                <h2>A good place for a good game.</h2>
                <p className="mini-label">COMMUNITY RULES</p>
                <p className="preserve-lines">{c.rules}</p>
                <button
                  className="btn outline wide"
                  onClick={() => {
                    if (requireUser()) {
                      if (!c.joined) {
                        notify('Join this community to create a poll.');
                        return;
                      }
                      setPolling(true);
                    }
                  }}
                >
                  <BarChart3 size={16} />
                  Create a poll
                </button>
              </section>
            </aside>
          </div>
          {compose && <Compose community={c.id} onClose={() => setCompose(false)} />}{' '}
          {polling && <PollComposer community={c.id} onClose={() => setPolling(false)} />}{' '}
          {members && (
            <Modal title={c.name + ' members'} onClose={() => setMembers(false)}>
              <Load {...m}>
                {m.data?.map((u) => (
                  <div className="list-row" key={u.id}>
                    <span className="avatar">{u.username.slice(0, 2).toUpperCase()}</span>
                    <div>
                      <strong>{u.username}</strong>
                      <p className="muted">{u.bio}</p>
                    </div>
                  </div>
                ))}
                {!m.data?.length && <p className="muted">Be the first to join this community.</p>}
              </Load>
            </Modal>
          )}
        </>
      ) : (
        <div className="empty">
          <h1>Community not found.</h1>
          <Link to="/communities" className="btn dark">
            Explore communities
          </Link>
        </div>
      )}
    </Load>
  );
}
export function Discussion() {
  const { id } = useParams();
  const { user, requireUser, notify, refresh } = useApp();
  const r = useResource<any>('/posts/' + id);
  const [report, setReport] = useState<{ post_id?: string; comment_id?: string } | null>(null),
    [editing, setEditing] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const p = r.data;
  async function remove(type: 'posts' | 'comments', target: string) {
    if (!confirm('Remove this content from the community?')) return;
    try {
      await api('/' + type + '/' + target, 'DELETE');
      if (type === 'posts') location.assign('/communities/' + p.community_id);
      else refresh();
    } catch (e) {
      notify((e as Error).message, true);
    }
  }
  return (
    <Load {...r}>
      {p && (
        <>
          <Link className="back-link" to={'/communities/' + p.community_id}>
            ← {p.community_name}
          </Link>
          <article className="panel full-post">
            <div className="post-meta">
              <span className="avatar">{(p.username || 'SA').slice(0, 2).toUpperCase()}</span>
              <strong>{p.username || 'Deleted account'}</strong>
              <span>·</span>
              <time>{date(p.created_at)}</time>
            </div>
            <h1>{p.title}</h1>
            <p className="preserve-lines">{p.body}</p>
            <div className="post-actions">
              {user?.id === p.user_id && (
                <button onClick={() => setEditing(true)}>
                  <Pencil size={15} />
                  Edit
                </button>
              )}
              {(user?.id === p.user_id || user?.role === 'admin') && (
                <button onClick={() => remove('posts', p.id)}>
                  <Trash2 size={15} />
                  Remove
                </button>
              )}
              <button
                onClick={() => {
                  if (requireUser()) setReport({ post_id: p.id });
                }}
              >
                <Flag size={15} />
                Report
              </button>
              <span className="muted">{p.comments.length} comments</span>
            </div>
          </article>
          <section className="panel comments-panel">
            <div className="panel-heading">
              <h2>Keep the conversation going.</h2>
              <MessageCircle size={20} />
            </div>
            {p.comments.map((c: any) => (
              <div className="comment" key={c.id}>
                <div className="post-meta">
                  <strong>{c.username || 'Deleted account'}</strong>
                  <span>·</span>
                  {date(c.created_at)}
                </div>
                <p className="preserve-lines">{c.body}</p>
                <div className="post-actions">
                  {(c.user_id === user?.id || user?.role === 'admin') && (
                    <button onClick={() => remove('comments', c.id)}>
                      <Trash2 size={13} />
                      Remove
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (requireUser()) setReport({ comment_id: c.id });
                    }}
                  >
                    <Flag size={13} />
                    Report
                  </button>
                </div>
              </div>
            ))}
            <form
              className="form panel-padding"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!requireUser()) return;
                const form = e.currentTarget;
                const body = new FormData(form).get('body');
                setBusy(true);
                setError('');
                try {
                  await api('/posts/' + p.id + '/comments', 'POST', { body });
                  form.reset();
                  refresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Add your perspective
                <textarea
                  name="body"
                  maxLength={3000}
                  required
                  rows={3}
                  placeholder="Keep it thoughtful. Keep it football."
                />
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="btn dark" disabled={busy}>
                {busy ? 'Posting…' : 'Post comment'}
                <Send size={15} />
              </button>
            </form>
          </section>
          {report && (
            <Modal title="Help keep the arena welcoming." onClose={() => setReport(null)}>
              <form
                className="form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  try {
                    await api('/reports', 'POST', { ...report, reason: f.get('reason') });
                    setReport(null);
                    notify('Report received. Thank you for looking out for the community.');
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <label>
                  What should a moderator know?
                  <textarea name="reason" required maxLength={1000} rows={4} />
                </label>
                {error && <p className="form-error">{error}</p>}
                <button className="btn dark">Submit report</button>
              </form>
            </Modal>
          )}
          {editing && (
            <Modal title="Edit your discussion" onClose={() => setEditing(false)}>
              <form
                className="form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  try {
                    await api('/posts/' + p.id, 'PATCH', {
                      title: f.get('title'),
                      body: f.get('body'),
                    });
                    setEditing(false);
                    refresh();
                    notify('Discussion updated.');
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <label>
                  Title
                  <input name="title" defaultValue={p.title} required maxLength={180} />
                </label>
                <label>
                  Your take
                  <textarea name="body" defaultValue={p.body} required maxLength={10000} rows={7} />
                </label>
                {error && <p className="form-error">{error}</p>}
                <button className="btn dark">Save changes</button>
              </form>
            </Modal>
          )}
        </>
      )}
    </Load>
  );
}
export function Predictions() {
  const { user, requireUser, notify, refresh } = useApp();
  const games = useResource<any[]>('/predictions/games'),
    teams = useResource<Team[]>('/teams'),
    history = useResource<any[]>(user ? '/predictions/history' : null);
  const [tab, setTab] = useState('upcoming'),
    [saving, setSaving] = useState('');
  const choose = async (game_id: string, team_id: string) => {
    if (!requireUser()) return;
    setSaving(game_id);
    try {
      await api('/predictions', 'POST', { game_id, team_id });
      refresh();
      notify('Your pick is saved. Change it any time before kickoff.');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setSaving('');
    }
  };
  return (
    <>
      <Heading
        eyebrow="FOR THE BRAGGING RIGHTS"
        title="You know the game. Call it."
        description="Friendly predictions. One point per correct winner. Picks lock at kickoff."
        action={
          <div className="button-row">
            {user && (
              <Link to="/profile" className="btn outline">
                My profile & predictions
              </Link>
            )}
            <Link to="/leaderboard" className="btn outline">
              <Trophy size={16} />
              Leaderboard
            </Link>
          </div>
        }
      />
      <div className="prediction-notice">
        <Target size={20} />
        <span>For fun and friendly competition. No money, wagering, or cash prizes.</span>
      </div>
      <div className="tabs spaced">
        <button className={tab === 'upcoming' ? 'selected' : ''} onClick={() => setTab('upcoming')}>
          Upcoming matchups
        </button>
        <button
          className={tab === 'history' ? 'selected' : ''}
          onClick={() => {
            if (requireUser()) setTab('history');
          }}
        >
          My prediction history
        </button>
      </div>
      <Load loading={games.loading || teams.loading} error={games.error || teams.error}>
        {tab === 'upcoming' ? (
          <>
            <div className="game-grid">
              {games.data?.map((g) => (
                <div className="prediction-card" key={g.id}>
                  <GameCard game={g} teams={teams.data || []} />
                  <p>Who takes the win?</p>
                  <div className="prediction-picks">
                    {[g.away_id, g.home_id].map((tid) => {
                      const active = history.data?.find((h) => h.game_id === g.id)?.team_id === tid;
                      return (
                        <button
                          key={tid}
                          disabled={saving === g.id}
                          aria-pressed={active}
                          onClick={() => choose(g.id, tid)}
                          className={active ? 'picked' : ''}
                        >
                          {active && <Check size={15} />} {tid}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {!games.data?.length && (
              <div className="empty">
                <Clock />
                <h2>Waiting for the next kickoff.</h2>
                <p>No eligible upcoming games in the current data source.</p>
              </div>
            )}
          </>
        ) : user ? (
          <PredictionHistory {...history} />
        ) : (
          <SignInPrompt />
        )}
      </Load>
    </>
  );
}
export function Leaderboard() {
  const r = useResource<any[]>('/predictions/leaderboard');
  return (
    <>
      <Heading
        eyebrow="THE FRIENDLY COMPETITION"
        title="A little football foresight."
        description="One point for each correct winner. Only scored predictions count toward accuracy."
      />
      <Load {...r}>
        <section className="panel">
          <div className="panel-heading">
            <h2>The prediction leaderboard</h2>
            <Trophy size={22} />
          </div>
          {r.data?.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>RANK</th>
                    <th>FAN</th>
                    <th className="number">SCORED PICKS</th>
                    <th className="number">ACCURACY</th>
                    <th className="number">POINTS</th>
                  </tr>
                </thead>
                <tbody>
                  {r.data.map((u, i) => (
                    <tr key={u.id}>
                      <td>{i + 1}</td>
                      <td>
                        <strong>{u.username}</strong>
                      </td>
                      <td className="number">{u.played}</td>
                      <td className="number">
                        {u.played ? Math.round((u.points / u.played) * 100) : 0}%
                      </td>
                      <td className="number emphasized">{u.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              <Trophy size={38} />
              <h2>The top spot is up for grabs.</h2>
              <p>Rankings appear after official results score the first picks.</p>
              <Link to="/predictions" className="btn dark">
                Make a prediction <ArrowUpRight size={16} />
              </Link>
            </div>
          )}
        </section>
      </Load>
    </>
  );
}

export function PredictionHistory({
  data,
  loading,
  error,
}: {
  data: any[] | null;
  loading: boolean;
  error: string;
}) {
  return (
    <Load loading={loading} error={error}>
      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>MATCHUP</th>
                <th>YOUR PICK</th>
                <th>DATE</th>
                <th>RESULT</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((g) => (
                <tr key={g.game_id}>
                  <td>
                    <Link to={'/games/' + g.game_id}>
                      {g.away_id} at {g.home_id}
                    </Link>
                  </td>
                  <td className="emphasized">{g.team_id}</td>
                  <td>{date(g.starts_at)}</td>
                  <td>
                    <span className="tag">
                      {g.points === null
                        ? 'Pending'
                        : g.points === 1
                          ? 'Correct · +1'
                          : 'Incorrect · 0'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data?.length && (
          <div className="empty">
            <Target />
            <h3>No picks yet.</h3>
            <p>Choose an upcoming game to get started.</p>
          </div>
        )}
      </div>
    </Load>
  );
}
