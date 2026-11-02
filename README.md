# StatArena

A full-stack NFL statistics and fan community application built from the [product requirements](docs/PRD.md). React + TypeScript, Express, and PostgreSQL. No betting, wagers, or cash prizes.

[Desktop screenshot](docs/screenshots/dashboard-desktop.png) · [Mobile screenshot](docs/screenshots/dashboard-mobile.png)

## Run locally

Requires Node.js 22+ (validated with Node 24).

```sh
npm ci
npm run db:init
npm run dev
```

The server listens on port 3000. Vite and the API share the same server. `PORT` and `APP_URL` can be changed in an untracked `.env` copied from `.env.example`.

Without `DATABASE_URL`, the application uses **PGlite**, the PostgreSQL engine compiled to WebAssembly, with durable files under `.data/postgres`. This is not an in-memory mock. For a hosted deployment, use a dedicated PostgreSQL database with `DATABASE_URL`.

PGlite is a **single-process development database**: stop the app before running database-writing CLI commands (`db:init`, `db:import`, `admin`) against the same directory. The API serializes local database transactions. `DATA_DIR` selects a separate local database; browser tests use isolated `.data/e2e-*` directories.

## What works

- Email/password registration, one-hour email verification and password-reset links, scrypt password hashing, seven-day server-side sessions, logout, profile editing, account deactivation/deletion.
- NFL team/player profiles, season statistics, weekly charts with table alternatives, search, position/stat filters, paginated player tables, and player/team comparisons.
- Persistent favorite teams and players, a personalized dashboard, 32 team communities plus NFL Central, memberships, discussions, owner editing, comments, upvotes, and reports.
- Administrator dashboard, user suspension/roles, community rules, scoped moderator assignment, report resolution/hiding, synchronization history, and audit logs.
- Friendly winner predictions that lock at kickoff, result-based idempotent scoring, history, leaderboard, and community polls with one changeable vote per account until closing.
- Responsive desktop/mobile layouts, keyboard controls, focus-contained dialogs, and sourced data instead of fabricated scores or statistics.

## Email and administrator access

In development, emails are written to a private, git-ignored `.data/mailbox.ndjson` file. After registering, read your verification link with:

```sh
npm run mail -- you@example.com
```

Open that link, verify, then sign in. `npm run mail` is an operator-only development tool; the mailbox is never served through the API. Production requires SMTP.

To grant the first administrator role, register and verify an account, stop the app if using PGlite, then run:

```sh
npm run admin -- you@example.com
```

Restart the app and open Moderation & admin. There are no default passwords or seeded privileged accounts. Administrators can grant moderator roles and assign each moderator to specific communities. A moderator cannot administer users or see reports outside their assignments.

## Data provenance and refresh

See [data sources and limitations](data/README.md). The included snapshot contains **32 teams, 2,929 player-season records for 2023, 2024, and 2026, and 1,127 games across 2023–2026**, plus 3,063 roster records and weekly player/team statistics for 2026 through week 8. It is historical data plus a sourced schedule, not a live feed. No user accounts, community engagement, predictions, or statistics are fabricated to fill the UI.

```sh
npm run data:fetch -- 2026  # Download and validate public nflverse CSVs; update the snapshot.
npm run db:import          # Transactionally upsert snapshot, score completed games.
```

Fetching another supported archived season merges that season with the existing snapshot. The importer supports the legacy offensive `player_stats` feed for 2023/2024 and the current `stats_player_week` and `stats_team_week` feeds for newer seasons, plus season roster snapshots. The default fetch season follows the current NFL calendar (January/February belong to the preceding season). Explicit missing provider assets fail the refresh without overwriting the installed snapshot.

Schedule & results now supports season/week and regular-season/postseason browsing for all 32 teams. Final W/L/T comes only from recorded scores; past games without results remain unavailable. Bye labels require a complete regular-season team schedule. Team links default to the newest installed schedule season, independently of the global statistics selector; the team page has its own historical selector. Communities includes **My Favorite Teams**, sharing the existing account-backed favorites API and tables.

Administrators can import the installed snapshot or queue a fresh provider download from the Data & audit tab. Provider downloads run outside the HTTP response path; their actual result is recorded in synchronization history. Refresh status to see completion. Repeated imports keep stable provider IDs and do not duplicate records. Failed imports roll back. A database uniqueness constraint prevents concurrent sync jobs for the same source.

Optional scheduled refresh: set `SYNC_INTERVAL_MINUTES=60` (minimum 15) and `SYNC_SEASON=2026`. The next interval retries failed jobs. Enable this only on a persistent server process; use an external scheduler on platforms that suspend instances. After a hard crash, an administrator/operator must inspect any stale `running` sync job and mark it failed before retrying. Active processes and scheduled timers do not survive environment snapshots.

## Validation

```sh
npm run check       # TypeScript
npm test            # API, auth, RBAC, data integrity, prediction locks, persistence
npm run test:e2e    # Build + Chromium desktop/mobile user journeys and axe checks
npm run build       # Production browser assets and bundled server
```

Browser tests use the Chromium distribution bundled with `@sparticuz/chromium` from npm; no separate browser CDN download is needed. Set `CHROMIUM_PATH` to use a compatible installed Chromium instead. On restricted machines, set `XDG_CACHE_HOME` to a writable directory for Chromium's font cache.

## Production / Replit

The deployment command is `npm run build`, followed by `npm start` from the repository root. Configure:

| Variable                               | Purpose                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `NODE_ENV=production`                  | Security headers, secure session cookies, production asset serving       |
| `APP_URL=https://your-domain`          | Exact public HTTPS origin and email links                                |
| `DATABASE_URL`                         | Managed PostgreSQL connection string; use provider-supported TLS options |
| `SMTP_URL`                             | SMTP transport URL for real verification/reset email delivery            |
| `MAIL_FROM`                            | Authorized sender address                                                |
| `PORT`                                 | Platform-provided listening port (default 3000)                          |
| `SYNC_INTERVAL_MINUTES`, `SYNC_SEASON` | Optional provider synchronization schedule                               |

The production entrypoint refuses to start without HTTPS origin, managed PostgreSQL, and SMTP settings. Put credentials in platform secrets, never in source control. Allow outbound access to the database/SMTP transport and nflverse's GitHub/raw/release asset hosts. A proxy placeholder intended for HTTPS APIs is not a raw database password or SMTP credential.

The server trusts one reverse-proxy hop. Deploy behind exactly one trusted HTTPS proxy, or adjust this to your actual infrastructure. Rate limits are per process: use a shared limiter store before scaling across replicas. Managed PostgreSQL must have backups and a tested restore procedure. Use a dedicated least-privilege database user. The SQL schema is versioned and applied transactionally at startup; future breaking schema changes need explicit migrations.

Before public launch, complete deployment-specific privacy/legal contact information, retention policy, data licensing review, SMTP delivery/domain verification, load tests, monitoring, backup restoration, and external PostgreSQL validation. The development privacy notice identifies these pending deployment obligations. This implementation does not claim real-time scores, full multi-sport support, email delivery without SMTP, or public deployment.

## Layout

- `client/src`: responsive React interface and charts
- `server/app.ts`: validated API and server-side permission checks
- `server/schema.sql`: relational constraints and indexes
- `server/db.ts`: managed PostgreSQL / durable local PGlite adapters
- `server/provider.ts`, `server/data.ts`, `server/sync.ts`: validated nflverse ingestion
- `scripts`: setup, refresh, administrator bootstrapping, development mailbox
- `tests`: isolated API tests and browser journeys

Each cloud task already has an isolated checkout. Reuse it; do not create a worktree unless explicitly requested.
