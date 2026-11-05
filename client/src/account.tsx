import { useState } from 'react';
import { Link, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import {
  ArrowUpRight,
  Eye,
  EyeOff,
  Shield,
  Users,
  MessageCircle,
  Flag,
  RefreshCw,
  CheckCircle2,
  LogIn,
  Settings,
  Trash2,
  UserRound,
  Activity,
} from 'lucide-react';
import { api, useApp, useResource, Load, Modal, date, num } from './lib';
import { Heading, SignInPrompt } from './sports';
import { PredictionHistory } from './social';
export function AuthPage({ mode }: { mode: 'login' | 'register' | 'forgot' | 'reset' }) {
  const { reloadUser, notify } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const googleErrors: Record<string, string> = {
    unavailable: 'Google sign-in is not configured yet. Please use email and password.',
    expired: 'Your Google sign-in expired. Please try again.',
    cancelled: 'Google sign-in was cancelled. You can try again.',
    existing: 'An account already uses this email. Please sign in with your password.',
    disabled: 'This account is not active. Please contact support.',
    failed: 'Google sign-in could not be completed. Please try again.',
  };
  const googleError = googleErrors[params.get('google_error') || ''];
  const [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [email, setEmail] = useState(''),
    [busy, setBusy] = useState(false),
    [show, setShow] = useState(false);
  const titles = {
    login: 'Welcome back to the arena.',
    register: 'Your seat is waiting.',
    forgot: 'Let’s get you back in.',
    reset: 'A fresh start.',
  };
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <span className="hero-kicker">
          <span />
          YOUR GAME. YOUR PEOPLE.
        </span>
        <h1>
          Great games.
          <br />
          Better
          <br />
          <em>conversations.</em>
        </h1>
        <p>
          A little more insight. A little more connection.
          <br />A whole new way to be a fan.
        </p>
        <div className="auth-story-stat">
          <div>
            <strong>32</strong>
            <span>NFL teams</span>
          </div>
          <div>
            <strong>One</strong>
            <span>Shared love of the game</span>
          </div>
        </div>
        <div className="auth-field" aria-hidden="true">
          <span>10</span>
          <span>20</span>
          <span>30</span>
          <span>40</span>
          <span>50</span>
        </div>
      </section>
      <section className="auth-form-wrap" key={mode}>
        <span className="auth-icon">
          <LogIn size={24} />
        </span>
        <h2>{titles[mode]}</h2>
        <p className="muted">
          {mode === 'login'
            ? 'Sign in to pick up the conversation.'
            : mode === 'register'
              ? 'Follow your favorites. Find your community.'
              : mode === 'forgot'
                ? 'We’ll send a link to reset your password.'
                : 'Choose a strong password for your account.'}
        </p>
        {(mode === 'login' || mode === 'register') && (
          <>
            {googleError && (
              <p className="form-error" role="alert">
                {googleError}
              </p>
            )}
            <div className="google-signin">
              <a className="btn outline wide" href="/api/auth/google">
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M6.41 13.92a6 6 0 0 1 0-3.84V7.49H3.07a10 10 0 0 0 0 9.02l3.34-2.59Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.96c1.47 0 2.79.5 3.82 1.49l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59C7.2 7.72 9.4 5.96 12 5.96Z"
                  />
                </svg>
                Continue with Google
              </a>
              <p className="muted">or continue with email</p>
            </div>
          </>
        )}
        {success ? (
          <div className="auth-success" role="status">
            <CheckCircle2 size={32} />
            <h3>{success}</h3>
            <Link className="btn dark" to="/login" onClick={() => setSuccess('')}>
              Go to sign in
            </Link>
          </div>
        ) : (
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              setError('');
              setBusy(true);
              const f = new FormData(e.currentTarget);
              try {
                const body = Object.fromEntries(f.entries());
                if (mode === 'reset') body.token = params.get('token') || '';
                const result = await api(
                  '/auth/' + (mode === 'forgot' ? 'forgot' : mode),
                  'POST',
                  body,
                );
                if (mode === 'login') {
                  await reloadUser();
                  notify('Welcome back.');
                  navigate('/');
                } else setSuccess(result.message);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {mode === 'register' && (
              <label>
                Username
                <input
                  name="username"
                  required
                  minLength={3}
                  maxLength={30}
                  pattern="[a-zA-Z0-9_]+"
                  autoComplete="username"
                  placeholder="Your name in the stands"
                />
                <small>3–30 letters, numbers, or underscores.</small>
              </label>
            )}
            {mode !== 'reset' && (
              <label>
                Email address
                <input
                  type="email"
                  name="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            )}
            {mode !== 'forgot' && (
              <label>
                Password
                <div className="password-input">
                  <input
                    type={show ? 'text' : 'password'}
                    name="password"
                    required
                    minLength={mode === 'login' ? 1 : 12}
                    maxLength={128}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    placeholder={mode === 'login' ? 'Your password' : 'At least 12 characters'}
                  />
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                  >
                    {show ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
            )}
            {mode === 'login' && (
              <Link className="text-link forgot-link" to="/forgot">
                Forgot password?
              </Link>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="btn dark wide" disabled={busy}>
              {busy
                ? 'One moment…'
                : mode === 'login'
                  ? 'Sign in'
                  : mode === 'register'
                    ? 'Create your account'
                    : mode === 'forgot'
                      ? 'Send reset link'
                      : 'Update password'}
              <ArrowUpRight size={17} />
            </button>
          </form>
        )}
        <p className="auth-switch">
          {mode === 'login' ? (
            <>
              New around here?{' '}
              <Link
                to="/register"
                onClick={() => {
                  setError('');
                  setSuccess('');
                }}
              >
                Join the arena
              </Link>
            </>
          ) : (
            <>
              Already have a seat?{' '}
              <Link
                to="/login"
                onClick={() => {
                  setError('');
                  setSuccess('');
                }}
              >
                Sign in
              </Link>
            </>
          )}
        </p>
        <p className="auth-privacy">
          By using StatArena, you agree to respectful community participation.{' '}
          <Link to="/privacy">Read our privacy notice.</Link>
        </p>
      </section>
    </div>
  );
}
export function VerifyPage() {
  return (
    <section className="panel verification">
      <h1>Your account is ready.</h1>
      <p>Email verification is no longer required. Sign in with your email and password.</p>
      <Link to="/login" className="btn dark">
        Sign in
      </Link>
    </section>
  );
}
export function Profile() {
  const { user, reloadUser, notify } = useApp();
  const navigate = useNavigate();
  const predictions = useResource<any[]>(user ? '/predictions/history' : null);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [action, setAction] = useState<'delete' | 'deactivate' | null>(null);
  if (!user) return <SignInPrompt />;
  return (
    <>
      <Heading
        eyebrow="YOUR ARENA"
        title="Make yourself at home."
        description="A little about the fan behind the perspective."
      />
      <div className="settings-layout">
        <section className="panel settings-panel">
          <div className="profile-header">
            <span className="profile-avatar">{user.username.slice(0, 2).toUpperCase()}</span>
            <div>
              <h2>{user.username}</h2>
              <span className="tag green">{user.role}</span>
            </div>
          </div>
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              const f = new FormData(e.currentTarget);
              try {
                await api('/profile', 'PATCH', Object.fromEntries(f.entries()));
                await reloadUser();
                notify('Your profile is updated.');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Username
              <input
                name="username"
                defaultValue={user.username}
                minLength={3}
                maxLength={30}
                pattern="[a-zA-Z0-9_]+"
                required
              />
            </label>
            <label>
              Email address
              <input value={user.email} readOnly />
              <small>Your email stays private.</small>
            </label>
            <label>
              Biography
              <textarea
                name="bio"
                defaultValue={user.bio}
                maxLength={500}
                rows={4}
                placeholder="Your team. Your favorite football memory. Your story."
              />
              <small>Visible on your public profile. Up to 500 characters.</small>
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="btn dark" disabled={busy}>
              {busy ? 'Saving…' : 'Save profile'}
            </button>
          </form>
        </section>
        <aside>
          <section className="panel settings-panel">
            <Shield size={24} />
            <h2>Keep your account secure.</h2>
            <p className="muted">Password resets end all existing sessions.</p>
            <Link className="btn outline" to="/forgot">
              Reset password
            </Link>
          </section>
          <section className="panel settings-panel spaced">
            <h2>Your account, your choice.</h2>
            <p className="muted">
              Deactivation disables sign-in. Contact the administrator to reactivate. Deletion
              removes your account and favorites, and anonymizes retained discussions.
            </p>
            <div className="button-column">
              <button className="btn outline" onClick={() => setAction('deactivate')}>
                Deactivate account
              </button>
              <button className="btn danger" onClick={() => setAction('delete')}>
                Delete account
              </button>
            </div>
          </section>
        </aside>
      </div>
      <section aria-labelledby="my-predictions" className="spaced">
        <div className="section-heading">
          <h2 id="my-predictions">My Predictions</h2>
          <Link className="btn outline" to="/predictions">
            Make a prediction
          </Link>
        </div>
        <p className="muted">
          Your saved NFL picks and results. Updates to your picks appear here.
        </p>
        <PredictionHistory {...predictions} />
      </section>
      {action && (
        <Modal
          title={
            action === 'delete' ? 'Permanently delete your account?' : 'Deactivate your account?'
          }
          onClose={() => {
            setAction(null);
            setError('');
          }}
        >
          <p>
            {action === 'delete'
              ? 'Your private account data, sessions, favorites, memberships, predictions, and votes will be removed. Discussions remain under “Deleted account”. This cannot be undone.'
              : 'Your account will stop accepting sign-ins and all active sessions will end.'}
          </p>
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              try {
                await api('/account/' + action, 'POST', { password: f.get('password') });
                await reloadUser();
                navigate('/');
                setAction(null);
                notify(
                  'Your account has been ' + (action === 'delete' ? 'deleted.' : 'deactivated.'),
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Confirm with your password
              <input type="password" name="password" required autoComplete="current-password" />
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="btn danger" disabled={busy}>
              {busy ? 'Processing…' : action === 'delete' ? 'Delete permanently' : 'Deactivate'}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function PublicProfile() {
  const { id } = useParams();
  const r = useResource<any>('/users/' + id);
  return (
    <Load {...r}>
      {r.data && (
        <section className="panel settings-panel">
          <span className="profile-avatar">{r.data.username.slice(0, 2).toUpperCase()}</span>
          <Heading
            title={r.data.username}
            description={
              'In the arena since ' + date(r.data.created_at, { month: 'long', year: 'numeric' })
            }
          />
          <p className="preserve-lines">{r.data.bio || 'This fan hasn’t written a bio yet.'}</p>
        </section>
      )}
    </Load>
  );
}
export function Admin() {
  const { user, notify, refresh, season } = useApp();
  const isAdmin = user?.role === 'admin';
  const allowed = isAdmin || user?.role === 'moderator';
  const overview = useResource<any>(isAdmin ? '/admin/overview' : null),
    users = useResource<any[]>(isAdmin ? '/admin/users' : null),
    reports = useResource<any[]>(allowed ? '/moderation/reports' : null),
    communities = useResource<any[]>(isAdmin ? '/communities' : null);
  const [tab, setTab] = useState('overview'),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<any>(null),
    [error, setError] = useState('');
  const run = async (task: () => Promise<any>, message: string) => {
    setBusy(true);
    try {
      await task();
      refresh();
      notify(message);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  if (!allowed)
    return (
      <div className="empty">
        <Shield size={36} />
        <h1>Staff access only.</h1>
        <p>This area is reserved for authorized administrators and community moderators.</p>
        <Link className="btn outline" to="/">
          Back to the arena
        </Link>
      </div>
    );
  const selected = isAdmin ? tab : 'reports',
    o = overview.data;
  return (
    <>
      <Heading
        eyebrow={isAdmin ? 'PLATFORM OPERATIONS' : 'COMMUNITY MODERATION'}
        title={isAdmin ? 'Behind the arena.' : 'Look after the conversation.'}
        description={
          isAdmin
            ? 'Platform health, community safety, and sourced sports data.'
            : 'Review reports within your assigned communities.'
        }
      />
      <div className="tabs spaced">
        {(isAdmin
          ? ['overview', 'reports', 'users', 'communities', 'data & audit']
          : ['reports']
        ).map((t) => (
          <button
            className={selected === t ? 'selected capitalize' : 'capitalize'}
            onClick={() => setTab(t)}
            key={t}
          >
            {t}
          </button>
        ))}
      </div>
      {selected === 'overview' && (
        <Load {...overview}>
          {o && (
            <>
              <div className="stats-grid">
                {[
                  ['Registered users', o.users],
                  ['Active today', o.dailyActive],
                  ['Active this month', o.monthlyActive],
                  ['Open reports', o.reports],
                ].map(([label, value]) => (
                  <div className="panel stat-box" key={label}>
                    <span>{label}</span>
                    <strong>{num(value)}</strong>
                  </div>
                ))}
              </div>
              <div className="stats-grid">
                {[
                  ['Communities', o.communities],
                  ['Visible posts', o.posts],
                  ['Visible comments', o.comments],
                ].map(([label, value]) => (
                  <div className="panel stat-box" key={label}>
                    <span>{label}</span>
                    <strong>{num(value)}</strong>
                  </div>
                ))}
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>New accounts · last 30 days</h2>
                  <Activity size={18} />
                </div>
                {o.registrations.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>DATE</th>
                          <th>NEW ACCOUNTS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {o.registrations.map((r: any) => (
                          <tr key={r.registration_day}>
                            <td>{date(r.registration_day)}</td>
                            <td>{r.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="panel-padding muted">No new registrations during this period.</p>
                )}
                <p className="source-note">
                  Daily activity uses session last-seen timestamps; monthly activity counts distinct
                  users with recorded login or post events.
                </p>
              </section>
            </>
          )}
        </Load>
      )}
      {selected === 'reports' && (
        <Load {...reports}>
          <div className="panel">
            <div className="panel-heading">
              <h2>Content reports</h2>
              <Flag size={18} />
            </div>
            {reports.data?.map((r) => (
              <div className="report-row" key={r.id}>
                <div>
                  <span className="tag">{r.status}</span>
                  <span className="muted"> {r.community_name}</span>
                  <h3>{r.title}</h3>
                  <blockquote>{(r.comment_body || r.post_body)?.slice(0, 600)}</blockquote>
                  <p>
                    <strong>Reported reason:</strong> {r.reason}
                  </p>
                </div>
                {r.status === 'open' && (
                  <div className="button-row">
                    <button
                      className="btn danger small"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            api('/moderation/reports/' + r.id, 'PATCH', {
                              status: 'resolved',
                              hide: true,
                            }),
                          'Content hidden and report resolved.',
                        )
                      }
                    >
                      Hide content & resolve
                    </button>
                    <button
                      className="btn outline small"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            api('/moderation/reports/' + r.id, 'PATCH', {
                              status: 'dismissed',
                              hide: false,
                            }),
                          'Report dismissed.',
                        )
                      }
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            ))}
            {!reports.data?.length && (
              <div className="empty">
                <CheckCircle2 size={32} />
                <h3>A clear queue.</h3>
                <p>No reports in your moderation scope.</p>
              </div>
            )}
          </div>
        </Load>
      )}
      {selected === 'users' && (
        <Load {...users}>
          <div className="panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>USER</th>
                    <th>EMAIL</th>
                    <th>ROLE</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data?.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.username}</strong>
                      </td>
                      <td>{u.email}</td>
                      <td>
                        <select
                          aria-label={'Role for ' + u.username}
                          disabled={u.id === user?.id || busy}
                          value={u.role}
                          onChange={(e) =>
                            run(
                              () => api('/admin/users/' + u.id, 'PATCH', { role: e.target.value }),
                              'Role updated.',
                            )
                          }
                        >
                          {['user', 'moderator', 'admin'].map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {u.status === 'deactivated' ? (
                          <span className="tag">deactivated</span>
                        ) : (
                          <button
                            className={
                              'btn small ' + (u.status === 'suspended' ? 'dark' : 'outline')
                            }
                            disabled={u.id === user?.id || busy}
                            onClick={() =>
                              run(
                                () =>
                                  api('/admin/users/' + u.id, 'PATCH', {
                                    status: u.status === 'active' ? 'suspended' : 'active',
                                  }),
                                'Account status updated.',
                              )
                            }
                          >
                            {u.status === 'active' ? 'Suspend' : 'Reactivate'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Load>
      )}
      {selected === 'communities' && (
        <Load {...communities}>
          <div className="panel">
            {communities.data?.map((c) => (
              <div className="list-row" key={c.id}>
                <strong>{c.name}</strong>
                <span className="muted">{c.members} members</span>
                <button
                  className="btn outline small"
                  onClick={() => {
                    setEditing(c);
                    setError('');
                  }}
                >
                  Manage
                </button>
              </div>
            ))}
          </div>
        </Load>
      )}
      {selected === 'data & audit' && (
        <Load {...overview}>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Sports-data synchronization</h2>
                <p>Idempotent import of the installed nflverse snapshot.</p>
              </div>
              <button
                className="btn dark"
                disabled={busy}
                onClick={() =>
                  run(
                    () => api('/admin/sync', 'POST'),
                    'Snapshot imported. Existing records were updated without duplicates.',
                  )
                }
              >
                <RefreshCw size={16} />
                {busy ? 'Importing…' : 'Import snapshot'}
              </button>
            </div>
            <div className="button-row panel-padding">
              <button
                className="btn outline"
                disabled={busy}
                onClick={() =>
                  run(
                    () => api('/admin/refresh', 'POST', { season }),
                    'Provider refresh queued. Check status in a moment.',
                  )
                }
              >
                <RefreshCw size={16} />
                Refresh nflverse · {season}
              </button>
              <button className="btn outline" onClick={refresh}>
                Check status
              </button>
            </div>
            <p className="source-note">
              Refreshing from the provider is an operator command: npm run data:fetch -- 2024.
              Snapshot imports do not imply current or live scores.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>STARTED</th>
                    <th>STATUS</th>
                    <th>DETAILS</th>
                  </tr>
                </thead>
                <tbody>
                  {o?.sync.map((s: any) => (
                    <tr key={s.id}>
                      <td>{date(s.started_at)}</td>
                      <td>
                        <span className="tag">{s.status}</span>
                      </td>
                      <td>{s.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel spaced">
            <div className="panel-heading">
              <h2>Administrative audit trail</h2>
              <Shield size={18} />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>ACTOR</th>
                    <th>ACTION</th>
                    <th>TARGET</th>
                  </tr>
                </thead>
                <tbody>
                  {o?.audit.map((a: any) => (
                    <tr key={a.id}>
                      <td>{date(a.created_at)}</td>
                      <td>{a.username || 'Deleted account'}</td>
                      <td>{a.action}</td>
                      <td className="audit-target">{a.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </Load>
      )}
      {editing && (
        <Modal title={'Manage ' + editing.name} onClose={() => setEditing(null)}>
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await api(
                  '/admin/communities/' + editing.id,
                  'PATCH',
                  Object.fromEntries(f.entries()),
                );
                refresh();
                notify('Community updated.');
                setEditing(null);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <label>
              Description
              <textarea
                name="description"
                defaultValue={editing.description}
                maxLength={1000}
                required
              />
            </label>
            <label>
              Rules
              <textarea
                name="rules"
                defaultValue={editing.rules}
                maxLength={3000}
                required
                rows={4}
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="btn dark">Save community</button>
          </form>
          <hr />
          <form
            className="form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                await api('/admin/communities/' + editing.id + '/moderator', 'PUT', {
                  user_id: f.get('user_id'),
                  assigned: f.get('assigned') === 'true',
                });
                notify('Moderator assignment updated.');
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <h3>Moderator scope</h3>
            <label>
              Moderator
              <select name="user_id" required>
                <option value="">Choose a moderator</option>
                {users.data
                  ?.filter((u) => ['moderator', 'admin'].includes(u.role))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Assignment
              <select name="assigned">
                <option value="true">Assign to this community</option>
                <option value="false">Remove assignment</option>
              </select>
            </label>
            <button className="btn outline">Update assignment</button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Privacy() {
  return (
    <article className="panel policy">
      <span className="eyebrow">YOUR PRIVACY IN THE ARENA</span>
      <h1>A clear view of your data.</h1>
      <p>
        StatArena stores your email, username, hashed password, profile, favorites, community
        memberships, discussions, predictions, votes, and basic account activity to provide the
        service. Your email and account information are private. Your username, bio, posts,
        comments, and scored leaderboard entry are public.
      </p>
      <h2>Account security</h2>
      <p>
        Passwords are derived using scrypt. Sessions use an HTTP-only cookie. Verification and reset
        links expire after one hour. Administrative access is restricted and sensitive actions are
        audited.
      </p>
      <h2>Keeping and deleting data</h2>
      <p>
        Account data is retained while the account exists. Account deletion removes your private
        identity data, sessions, memberships, favorites, predictions, and votes. Existing
        discussions and moderation records may remain with their authors anonymized to preserve
        community context. Expired sessions are removed on subsequent logins. The operator must
        configure backup retention, expired-token cleanup, and activity-log retention before a
        public launch.
      </p>
      <h2>Sports data</h2>
      <p>
        Team, player, schedule, and statistical records are sourced from nflverse. The included
        player-statistics snapshot covers the 2023 and 2024 regular seasons. Statistics are
        historical and schedules may change. StatArena is not affiliated with the NFL or its teams.
      </p>
      <h2>Before public launch</h2>
      <p>
        This is the application’s development privacy notice. The deployment operator must publish
        their identity, contact information, retention schedule, applicable legal terms, and privacy
        request procedure before collecting public registrations.
      </p>
    </article>
  );
}
