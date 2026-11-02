CREATE TABLE IF NOT EXISTS schema_versions (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, username varchar(30) NOT NULL, email varchar(254) NOT NULL,
 password_hash text NOT NULL, bio varchar(500) NOT NULL DEFAULT '',
 role text NOT NULL DEFAULT 'user' CHECK(role IN ('user','moderator','admin')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','deactivated')),
 verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(lower(username));
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS auth_tokens (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('verify','reset')), expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS teams (
 id text PRIMARY KEY, name text NOT NULL, nickname text NOT NULL, conference text NOT NULL,
 division text NOT NULL, color text NOT NULL, source text NOT NULL
);
CREATE TABLE IF NOT EXISTS players (
 id text PRIMARY KEY, name text NOT NULL, position text NOT NULL, source text NOT NULL
);
CREATE TABLE IF NOT EXISTS player_seasons (
 player_id text REFERENCES players ON DELETE CASCADE, season integer NOT NULL,
 team_id text NOT NULL REFERENCES teams, stats jsonb NOT NULL, weekly jsonb NOT NULL,
 PRIMARY KEY(player_id,season)
);
CREATE INDEX IF NOT EXISTS player_seasons_team ON player_seasons(team_id,season);
CREATE TABLE IF NOT EXISTS games (
 id text PRIMARY KEY, season integer NOT NULL, week integer NOT NULL,
 type text NOT NULL, home_id text NOT NULL REFERENCES teams, away_id text NOT NULL REFERENCES teams,
 starts_at timestamptz NOT NULL, home_score integer, away_score integer, stadium text NOT NULL DEFAULT '',
 source text NOT NULL, CHECK(home_id <> away_id), CHECK((home_score IS NULL) = (away_score IS NULL))
);
CREATE INDEX IF NOT EXISTS games_schedule ON games(season,starts_at);
ALTER TABLE games ADD COLUMN IF NOT EXISTS kickoff_confirmed boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS favorite_teams (user_id uuid REFERENCES users ON DELETE CASCADE, team_id text REFERENCES teams ON DELETE CASCADE, PRIMARY KEY(user_id,team_id));
CREATE TABLE IF NOT EXISTS favorite_players (user_id uuid REFERENCES users ON DELETE CASCADE, player_id text REFERENCES players ON DELETE CASCADE, PRIMARY KEY(user_id,player_id));
CREATE TABLE IF NOT EXISTS communities (
 id text PRIMARY KEY, name text NOT NULL, description text NOT NULL,
 team_id text REFERENCES teams, rules text NOT NULL DEFAULT 'Be respectful. Support your takes with sources. No spam or harassment.'
);
CREATE TABLE IF NOT EXISTS memberships (user_id uuid REFERENCES users ON DELETE CASCADE, community_id text REFERENCES communities ON DELETE CASCADE, joined_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,community_id));
CREATE TABLE IF NOT EXISTS community_moderators (user_id uuid REFERENCES users ON DELETE CASCADE, community_id text REFERENCES communities ON DELETE CASCADE, PRIMARY KEY(user_id,community_id));
CREATE TABLE IF NOT EXISTS posts (
 id uuid PRIMARY KEY, user_id uuid REFERENCES users ON DELETE SET NULL, community_id text NOT NULL REFERENCES communities,
 title varchar(180) NOT NULL, body varchar(10000) NOT NULL, hidden boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS posts_feed ON posts(community_id,created_at DESC);
CREATE TABLE IF NOT EXISTS comments (
 id uuid PRIMARY KEY, post_id uuid NOT NULL REFERENCES posts ON DELETE CASCADE, user_id uuid REFERENCES users ON DELETE SET NULL,
 body varchar(3000) NOT NULL, hidden boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reactions (user_id uuid REFERENCES users ON DELETE CASCADE, post_id uuid REFERENCES posts ON DELETE CASCADE, PRIMARY KEY(user_id,post_id));
CREATE TABLE IF NOT EXISTS reports (
 id uuid PRIMARY KEY, user_id uuid REFERENCES users ON DELETE SET NULL,
 post_id uuid REFERENCES posts ON DELETE CASCADE, comment_id uuid REFERENCES comments ON DELETE CASCADE,
 reason varchar(1000) NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK((post_id IS NOT NULL)::integer + (comment_id IS NOT NULL)::integer = 1)
);
CREATE TABLE IF NOT EXISTS predictions (
 user_id uuid REFERENCES users ON DELETE CASCADE, game_id text REFERENCES games ON DELETE CASCADE,
 team_id text NOT NULL REFERENCES teams, points integer, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,game_id)
);
CREATE TABLE IF NOT EXISTS polls (
 id uuid PRIMARY KEY, community_id text REFERENCES communities ON DELETE CASCADE, user_id uuid REFERENCES users ON DELETE SET NULL,
 question varchar(180) NOT NULL, options jsonb NOT NULL, closes_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS poll_votes (user_id uuid REFERENCES users ON DELETE CASCADE, poll_id uuid REFERENCES polls ON DELETE CASCADE, option_index integer NOT NULL CHECK(option_index >= 0), PRIMARY KEY(user_id,poll_id));
CREATE TABLE IF NOT EXISTS sync_jobs (
 id uuid PRIMARY KEY, source text NOT NULL, status text NOT NULL CHECK(status IN ('running','success','failed')),
 message text NOT NULL DEFAULT '', started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS one_running_sync_per_source ON sync_jobs(source) WHERE status='running';
CREATE TABLE IF NOT EXISTS audit_logs (id uuid PRIMARY KEY, actor_id uuid REFERENCES users ON DELETE SET NULL, action text NOT NULL, target text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS activity_events (id uuid PRIMARY KEY, user_id uuid REFERENCES users ON DELETE CASCADE, kind text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS activity_dates ON activity_events(created_at,user_id);
INSERT INTO schema_versions(version) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS team_rosters (
 player_id text NOT NULL, team_id text NOT NULL REFERENCES teams, season integer NOT NULL,
 name text NOT NULL, position text NOT NULL, status text NOT NULL,
 PRIMARY KEY(player_id,team_id,season)
);
CREATE TABLE IF NOT EXISTS player_weekly (
 player_id text NOT NULL, team_id text NOT NULL REFERENCES teams, season integer NOT NULL,
 week integer NOT NULL CHECK(week BETWEEN 1 AND 30), type text NOT NULL CHECK(type IN ('REG','POST')),
 name text NOT NULL, position text NOT NULL, stats jsonb NOT NULL,
 PRIMARY KEY(player_id,team_id,season,week,type)
);
CREATE TABLE IF NOT EXISTS team_weekly (
 team_id text NOT NULL REFERENCES teams, season integer NOT NULL, week integer NOT NULL CHECK(week BETWEEN 1 AND 30),
 type text NOT NULL CHECK(type IN ('REG','POST')), stats jsonb NOT NULL,
 PRIMARY KEY(team_id,season,week,type)
);
INSERT INTO schema_versions(version) VALUES (2) ON CONFLICT DO NOTHING;
