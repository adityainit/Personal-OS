# Personal OS

A private CRM for Instagram brand deals and freelancing: finding brands and clients, outreach, follow-ups and revenue. Claude, through your Claude Pro account, connects to it over MCP to research leads and keep records up to date.

- **Brand deals:** a brand needs its name and Instagram handle (or website). You reach them by Instagram DM or email.
- **Freelancing:** a client needs a business name and phone number (Instagram optional). You reach them on WhatsApp or by email, never Instagram DM. Follow-up rules are separate from brand deals (default: first after 3 days, then 4 days later, max 2).

**Claude never contacts anyone.** No tool can send a message. Claude researches, saves records and drafts outreach; you send every message yourself.

- **Stack:** Next.js 16 (App Router) · Tailwind v4 · Supabase (Postgres, Auth, RLS, pg_cron) · remote MCP server at `/api/mcp`
- **Sign-in:** email + password only (password reset by email). No social login.
- **Cost:** free tiers (Vercel Hobby + Supabase Free). No paid AI API.

---

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. **Create your user first:** Authentication → Users → Add user (your email + a strong password, tick *Auto Confirm User*).
3. **Run the migrations in the SQL Editor, in this order, one file per query** (or `npm run db:link` then `npm run db:push`):
   1. `supabase/migrations/20261105000001_schema.sql`
   2. `supabase/migrations/20261105000002_logic.sql`
   3. `supabase/migrations/20261105000003_security.sql`: a database-level sign-up guard and tighter permissions.
   4. `supabase/migrations/20261109000004_freelancing.sql`: the freelancing pipeline (existing leads stay brand deals).
4. **Authentication settings** (dashboard → Authentication):

| Setting | Value |
|---|---|
| Sign In / Providers → **Allow new users to sign up** | **Off** |
| Sign In / Providers → Google / other social providers | **Off** (the app no longer uses them) |
| URL Configuration → Site URL | `https://<your-app>.vercel.app` (or `http://localhost:3000` while developing) |
| URL Configuration → Redirect URLs | `https://<your-app>.vercel.app/**` and `http://localhost:3000/**` (needed for the password-reset link) |
| JWT Signing Keys | Use **asymmetric** keys |
| OAuth Server (needed for the Claude connection) | **Enable**, enable dynamic client registration, set the authorization path to `/oauth/consent` |

   Supabase's built-in email sender is limited to a few emails per hour. If password-reset emails don't arrive, configure a custom SMTP provider (Authentication → Emails → SMTP Settings; most have a free tier).

   Even if sign-ups are switched on by mistake, migration 3 makes the database reject any email that isn't on the allow-list (`private.allowed_emails`), and the app only admits `ALLOWED_EMAIL`. Migration 3 allow-lists every user that exists when it runs, which is why you create your user first. To add an email later, run in the SQL Editor:

   ```sql
   insert into private.allowed_emails (email) values ('you@example.com');
   ```

## 2. Run locally

```bash
cp .env.example .env.local   # fill in the values from Project Settings → API
npm install
npm run dev                  # http://localhost:3000
```

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API Keys → Publishable key (or legacy anon key) |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally, your Vercel URL in production |
| `ALLOWED_EMAIL` | The only email allowed to sign in |

No service-role key is used anywhere. Every query runs as you, through Row Level Security.

## 3. Your logo

Save your profile photo as **`public/profile.jpg`** (also accepted: `.jpeg`, `.png`, `.webp`). A square crop around your face works best. It is shown, cropped to a circle, in the sidebar, mobile menu and on the login pages. Until the file exists, a neutral initial is shown. No other image is ever used.

The photo is git-ignored (`/public/profile.*`), so it never ends up in the repository. To show it on Vercel too, upload it as part of a local deploy (`npx vercel --prod`) or remove that line from `.gitignore` if you're happy for it to be in the repo.

## 4. Deploy to Vercel

1. Push the folder to a private GitHub repo and import it into Vercel.
2. Add the four environment variables above, with `NEXT_PUBLIC_SITE_URL=https://<your-app>.vercel.app`.
3. Deploy, then update the Supabase **Site URL** and **Redirect URLs** to match.

## 5. Connect Claude (claude.ai, Pro plan)

1. On claude.ai, go to **Settings → Connectors → Add custom connector**.
2. Name it `Personal OS`, set the URL to `https://<your-app>.vercel.app/api/mcp`, and leave the OAuth fields empty.
3. Click **Connect**, sign in to Personal OS, and click **Allow access**.
4. In a chat, turn on **Personal OS** and **Web search**, then ask for what you need.

Fill in **Settings → Creator profile** first, so Claude can match brands to your niche. The **Claude Assistant** page has copy-ready prompts.

---

## Brand lead rules

Whether a brand is added in the app or by Claude:

- **Required:** brand name and the brand's Instagram handle **or** website. No phone number: you reach brands by Instagram DM or email.
- **Optional:** email, contact person, LinkedIn, location, description. Email is never required, and Claude is instructed never to guess contact details.
- **Follow-ups** (default): first after 3 days, then every 4 days, up to 2. Change them in **Settings → Follow-up rules**.
- New drafts default to Instagram DM; the Follow-ups page links straight to each brand's Instagram.

## How it works

```
Claude.ai ──OAuth 2.1──> Supabase Auth (consent page = /oauth/consent)
    │ Bearer JWT
    ▼
/api/mcp (Next.js) ──> Supabase Postgres  (RLS · triggers · RPCs · pg_cron)
    ▲
Web UI (server actions) ───────┘   same repository layer (src/lib/domain/repo.ts)
```

- The business rules live in the database, so the website and Claude behave identically:
  - Marking a draft as sent sets the lead to *contacted* and schedules a follow-up using your rules (change them in Settings).
  - Recording a **reply** cancels pending follow-ups. A **decline**, **won**, **lost** or **do not contact** stops them for good.
  - Duplicates are blocked by website domain and Instagram handle; a very similar name triggers a warning. A second message on the same channel within 20 hours is blocked.
  - Every change goes into an append-only activity log tagged *you*, *Claude* or *automatic*.
  - A `pg_cron` job runs every 15 minutes, flags follow-ups that have come due and adds a notification.
- The MCP server has 25 tools (`src/lib/mcp/tools.ts`). None of them sends or deletes anything.

## Scripts

| | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | Database rules (in-process Postgres), MCP protocol, validation and colour-contrast checks |
| `npm run typecheck` / `lint` | TypeScript / ESLint |
| `npm run db:push` | Apply migrations to the linked Supabase project |

## Privacy & secrets

- `.env.local` (your Supabase URL, key and email) is git-ignored and never committed. Put the values in Vercel → Project → Settings → Environment Variables instead.
- No service-role key exists anywhere in the code; every request runs as the signed-in user under Row Level Security.
- Your CRM data lives only in your Supabase database, never in the repository.
- Your profile photo is git-ignored.
- If a secret is ever committed by mistake, rotate it in Supabase (Project Settings → API Keys); deleting the commit is not enough.

## Backups

Download a full JSON backup from **Settings → Export & backup**, or CSV files from any list. The free Supabase plan has no downloadable backups, so export regularly.
