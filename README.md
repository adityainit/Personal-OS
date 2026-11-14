# Personal OS

A private CRM for freelancers: find clients, manage outreach and never miss a follow-up. Claude connects to it through a remote [MCP](https://modelcontextprotocol.io) server to research businesses and keep records up to date, while **you stay in control of every message that is sent**.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Supabase (Postgres, Auth, Row Level Security, `pg_cron`) · MCP over HTTP · Vitest

---

## Features

- **Client pipeline:** leads move through *new → researched → drafted → contacted → replied → interested → negotiating → won / lost / do not contact*. List and board views, filters, sorting, CSV export.
- **Outreach drafts:** WhatsApp and email drafts per client, with one-click copy and a prefilled WhatsApp link. Marking a draft as *sent* is always a manual action.
- **Automatic follow-ups:** configurable rules (default: first after 3 days, then every 4 days, max 2). A reply, decline, win or "do not contact" cancels pending follow-ups. A scheduled job flags overdue ones and raises a notification.
- **Messages sent per day:** a daily strip on the client list and dashboard. Click a day to see who you messaged.
- **Duplicate protection:** blocked by website domain, Instagram handle and phone number, with a fuzzy-name warning. A second message on the same channel within 20 hours is blocked.
- **Dashboard, reports and activity log:** funnel with period-over-period comparison, and an append-only history tagged *you*, *Claude* or *automatic*.
- **Claude integration:** 20 MCP tools to research leads, save drafts, log replies and schedule follow-ups.
- **Privacy-first:** single-user, sign-ups disabled and enforced at the database level, every query runs under Row Level Security.

> **Claude never contacts anyone.** No tool can send or delete anything. Claude researches, saves records and drafts outreach. You send every message yourself.

## How it works

```
Claude.ai ──OAuth 2.1──> Supabase Auth (consent page = /oauth/consent)
    │ Bearer JWT
    ▼
/api/mcp (Next.js) ──> Supabase Postgres  (RLS · triggers · RPCs · pg_cron)
    ▲
Web UI (server actions) ───────┘   same repository layer (src/lib/domain/repo.ts)
```

The business rules live in the database, so the website and Claude behave identically:

- Marking a draft as sent sets the lead to *contacted* and schedules the next follow-up from your rules.
- Every change is written to the activity log by triggers, with the actor detected from the JWT.
- A `pg_cron` job runs every 15 minutes to flag due follow-ups and notify.

## Getting started

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. **Create your user first:** Authentication → Users → Add user (tick *Auto Confirm User*).
3. Run the migrations in order in the SQL Editor (one file per query), or use `npm run db:link` then `npm run db:push`:
   1. `supabase/migrations/20261105000001_schema.sql`: tables, enums, indexes, RLS
   2. `supabase/migrations/20261105000002_logic.sql`: triggers, RPCs, reports, cron job
   3. `supabase/migrations/20261105000003_security.sql`: sign-up allow-list and tighter permissions
4. In Authentication settings:

| Setting | Value |
|---|---|
| Sign In / Providers → **Allow new users to sign up** | **Off** |
| URL Configuration → Site URL | your deployed URL (or `http://localhost:3000`) |
| URL Configuration → Redirect URLs | `<your URL>/**` (needed for password reset) |
| JWT Signing Keys | **Asymmetric** |
| OAuth Server (for the Claude connection) | **Enable**, enable dynamic client registration, authorization path `/oauth/consent` |

To add another allowed email later: `insert into private.allowed_emails (email) values ('you@example.com');`

### 2. Run locally

```bash
cp .env.example .env.local   # fill in the values below
npm install
npm run dev                  # http://localhost:3000
```

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → Publishable key |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally, your URL in production |
| `ALLOWED_EMAIL` | The only email allowed to sign in |

No service-role key is used anywhere.

### 3. Deploy

Import the repo into [Vercel](https://vercel.com), add the four environment variables, deploy, then update the Supabase Site URL and Redirect URLs.

### 4. Connect Claude (claude.ai)

1. Settings → Connectors → **Add custom connector**.
2. Name it `Personal OS`, URL `https://<your-app>/api/mcp`, leave the OAuth fields empty.
3. Click **Connect**, sign in and **Allow access**.
4. In a chat, enable **Personal OS** and web search. The in-app **Claude Assistant** page has ready-made prompts.

Optional: save your profile photo as `public/profile.jpg` (git-ignored) to show it in the sidebar and login pages.

## Client rules

- **Required:** business name and a valid phone number with country code.
- **Optional:** Instagram handle, website, email, contact person, LinkedIn, location, description.
- Outreach channels: WhatsApp or email. Claude is instructed never to guess contact details.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Database rules (in-process Postgres via PGlite), MCP protocol, validation, colour contrast |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| `npm run db:push` | Apply migrations to the linked Supabase project |

`supabase/clear_data.sql` is a manual helper that wipes all CRM data (never run automatically).

## Project structure

```
src/
  app/            routes: dashboard, freelance, leads/[id], follow-ups, reports, activity, settings, api/mcp
  actions/        server actions (web UI)
  components/     UI, charts, lead views, shell
  lib/domain/     schemas (zod), repository layer, constants, phone and message helpers
  lib/mcp/        MCP server tools and auth
supabase/
  migrations/     schema, business logic, security
tests/            db (PGlite), unit
```

## Security

- Row Level Security on every table; the app and Claude both act as the signed-in user.
- Sign-ups are closed in the dashboard **and** blocked by a database trigger against an allow-list.
- `.env.local` and the profile photo are git-ignored. If a secret is ever committed, rotate it in Supabase.
- Backups: Settings → Export & backup (JSON/CSV). The free Supabase plan has no downloadable backups, so export regularly.

---

<sub>Built by Aditya Ranjan. Developed with AI pair-programming (Claude Code): product requirements, architecture decisions, database design and review by the author; implementation accelerated with Claude.</sub>
