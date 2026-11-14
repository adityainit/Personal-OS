# WhatsApp worker

A small Node program that keeps **your own WhatsApp** linked (like WhatsApp Web) and:

- sends the WhatsApp drafts you approved in Personal OS, one at a time, inside your sending rules
- records each send exactly like *Mark as sent*: the lead becomes *contacted* and the next follow-up is scheduled
- sends each follow-up **on its due date**, if the client hasn't replied
- records client replies on the lead, which cancels their follow-ups and takes their remaining drafts off the queue

It runs free on **Render** (no card, laptop can be off), or on any computer.

## The rules (enforced by the database, not the worker)

| Rule | Default |
|---|---|
| Sending window | **12:00–14:00 India time**, Monday–Saturday |
| Daily limit | **8** messages (first messages + follow-ups together) |
| Gap between messages | random, **8–15 minutes** |
| Who | only clients **Claude researched**, once their **first message and every follow-up** are drafted |
| Approval | you approve each client first (can be switched off) |
| Follow-ups | only from their **due date**; due follow-ups go before new clients |
| Never | two WhatsApp messages to one client within 20 hours, or anyone who replied, won, lost or is *do not contact* |
| Auto-pause | after **3 connection failures in a row**, or if WhatsApp restricts the number, auto-send switches itself off and notifies you |

All of these are editable on the **Auto-send** page.

> **Risk:** this uses an unofficial WhatsApp Web library ([Baileys](https://github.com/WhiskeySockets/Baileys)), which is against WhatsApp's Terms of Service, and Render is a datacenter connection. A number that messages strangers can be restricted or banned. Keep volume low, personalise every message, don't put links in first messages, and use a number you can afford to lose.

---

## Setup on Render (free, no card)

### 1. Apply the database migration

Supabase → **SQL Editor** → paste all of `supabase/migrations/20261115000001_whatsapp_autosend.sql` → **Run**. (Or `npm run db:push` from the project root if the Supabase CLI is linked.)

Redeploy the web app too, so the **Auto-send** page exists.

### 2. Push the code to GitHub

Render deploys from your GitHub repo. Commit and push this project (the `worker/` folder and `render.yaml`).

### 3. Create the service

1. Sign in at [render.com](https://render.com) with GitHub.
2. **New → Blueprint** → choose this repository. Render reads `render.yaml`.
3. Fill in when asked:

   | Variable | Value |
   |---|---|
   | `SUPABASE_URL` | same as `NEXT_PUBLIC_SUPABASE_URL` in the web app |
   | `SUPABASE_PUBLISHABLE_KEY` | same as `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
   | `PERSONAL_OS_EMAIL` / `PERSONAL_OS_PASSWORD` | your Personal OS login |
   | `WA_PAIRING_PHONE` | optional: your WhatsApp number, digits with country code (`919876543210`) |

   `WA_AUTH_SECRET` is generated for you. It encrypts your WhatsApp login before it's stored in Supabase.
4. **Apply**. The first build takes a few minutes. In **Logs** you should see `Signed in to Personal OS` and a QR code.

> No Blueprint option? **New → Web Service** → this repo → Root Directory `worker`, Build `npm ci`, Start `npm start`, Instance type **Free**, Health check path `/health`, and add the variables above plus `WA_AUTH_STORE=supabase`, `WA_AUTH_SECRET=<a long random string>` and `NODE_VERSION=22`.

### 4. Link WhatsApp

Open Personal OS → **Auto-send**. Within a few seconds the QR appears there. On your phone: **WhatsApp → Settings → Linked devices → Link a device** → scan. (With `WA_PAIRING_PHONE` set you can choose *Link with phone number instead* and type the code shown.)

The status turns **Connected**. The login is saved (encrypted) in Supabase, so restarts reconnect on their own.

### 5. Keep it awake

Render's free instances sleep after 15 minutes without visitors. The worker visits itself every 10 minutes, and as a backup:

1. Sign up free at [cron-job.org](https://cron-job.org).
2. **Create cronjob** → URL `https://<your-service>.onrender.com/health` → every **10 minutes** → Save.

(Your service URL is at the top of its Render page.) One free service running all month fits inside Render's 750 free hours, so don't run a second free service on the same account.

### 6. Turn it on

Personal OS → **Auto-send** → check the rules → **Turn on auto-send** → approve clients under **Needs approval**.

**Your laptop can now be off.** Your phone can be off too, but open WhatsApp on it at least every 14 days, or WhatsApp unlinks the worker.

---

## Your daily flow

1. Your Claude scheduled task researches clients and saves a WhatsApp first message plus follow-ups #1 and #2 for each.
2. You open **Auto-send** (on your phone is fine) and approve the ones you like. Or untick *I approve each client first* once you trust the drafts.
3. Between 12 and 2pm, the worker sends up to 8 messages, follow-ups due that day first.
4. Replies appear on the lead's **Conversation** tab with a notification, and their follow-ups stop.

Add this to your scheduled task prompt so every client qualifies:

> For each client, save a WhatsApp first message (step 0) and WhatsApp follow-ups (step 1 and step 2) in the same run. Each follow-up shorter than the last and adding something new. No links in the first message.

---

## Running on your own computer instead

```bash
cd worker
cp .env.example .env     # fill it in; generate WA_AUTH_SECRET as described inside
npm install
npm run check            # signs in and prints your rules
npm start                # scan the QR in the terminal or on the Auto-send page
```

Use the **same** `WA_AUTH_SECRET` as on Render if both should share one login, but **never run two workers at once**: a second copy kicks the first one off. To keep the login in a local folder instead of Supabase, set `WA_AUTH_STORE=file`.

A systemd unit for a Linux server is in `personal-os-whatsapp.service`.

---

## What you'll see

| Where | What |
|---|---|
| Auto-send page | connection status, QR, sent today / limit, next send time, review list, queue (with what each client is waiting for), failures |
| Lead → Outreach | each draft's step and state: *Needs approval*, *Auto-send*, *Sending…*, *Not sent*, *Manual* |
| Lead → Conversation | client replies, recorded automatically |
| Activity / notifications | automatic sends, replies, failures and pauses (tagged *automatic*) |

### When something goes wrong

| Message | Meaning |
|---|---|
| *Worker offline* | No check-in for 3+ minutes. Check the service's Logs on Render, and that cron-job.org is pinging it. |
| *Waiting for drafts: Follow-up #2* | The full-sequence rule: ask Claude to write the missing follow-up. |
| *Won't auto-send: not researched by Claude* | You added this client yourself. Send manually, or untick *Only Claude's complete sequences*. |
| *This number isn't on WhatsApp* | Fix the number or email them. |
| *The worker stopped while sending* | It may or may not have gone out. Check WhatsApp, then **Mark as sent** or **Retry**. |
| *Auto-send paused: …* | 3 failures in a row, or WhatsApp restricted the number. Check WhatsApp on your phone; turn auto-send back on when it's fine. |
| *Logged out* | Unlinked from your phone (or by WhatsApp). Scan a new QR on the Auto-send page. |

To unlink completely: remove *Personal OS* under **Linked devices** on your phone, and suspend the service on Render.

## Tests

```bash
npm test                                   # worker helpers + encrypted login storage
npx vitest run tests/db/autosend.test.ts   # (project root) all queue rules
```
