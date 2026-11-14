/**
 * Personal OS WhatsApp worker.
 *
 * - Keeps your WhatsApp linked (like WhatsApp Web).
 * - Every minute, asks Personal OS for the next approved message that's due and sends it.
 *   Personal OS decides what's due: your daily limit, sending hours and days, a random gap
 *   between messages, first message before follow-ups, follow-ups only when due, and never
 *   to anyone who replied or is closed.
 * - Records every client reply on their lead, which stops their follow-ups.
 *
 *   npm start           run the worker
 *   npm run check       test the Personal OS login and show your sending rules
 */
import { createServer } from "node:http";
import { config } from "./config.mjs";
import { db, signIn } from "./db.mjs";
import { log } from "./log.mjs";
import { isTransient } from "./messages.mjs";
import { WhatsApp } from "./whatsapp.mjs";

const HEARTBEAT_MS = 60_000;
const KEEP_AWAKE_MS = 10 * 60_000;
const startedAt = new Date();

let status = { state: "starting" };
let lastIdleReason = null;
let ticking = false;

function pushStatus(patch) {
  status = { ...status, ...patch };
  db.setStatus(patch).catch((e) => log.warn("Couldn't update status in Personal OS:", e.message));
}

const REASON = {
  disabled: "Auto-send is paused in Personal OS",
  outside_days: "Not a sending day",
  outside_hours: "Outside sending hours",
  daily_limit: "Daily limit reached",
  waiting: "Waiting for the gap between messages",
  idle: "Nothing due right now",
  busy: "A send is already in progress",
};

async function tick(wa) {
  if (ticking || !wa.connected) return;
  ticking = true;
  let claimed = null;
  try {
    const r = await db.claimNext();
    if (r.status !== "claimed") {
      if (r.status !== lastIdleReason) {
        const extra = r.next_send_at ? ` (next at ${new Date(r.next_send_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })})` : "";
        log.info(`${REASON[r.status] ?? r.status}${extra}. Sent today: ${r.sent_today ?? 0}`);
        lastIdleReason = r.status;
      }
      return;
    }
    lastIdleReason = null;
    claimed = r;
    const what = r.step === 0 ? "first message" : `follow-up #${r.step}`;
    log.info(`Sending ${what} to ${r.lead_name} (${r.phone})`);

    const waId = await wa.sendText(r.phone, r.body);
    claimed = { ...claimed, sent: true };
    const done = await db.complete(r.outreach_id, waId);
    const fu = done.follow_up?.due_at
      ? ` Next follow-up due ${new Date(done.follow_up.due_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.`
      : "";
    log.info(`Sent to ${r.lead_name}.${fu}`);
  } catch (e) {
    if (!claimed) {
      log.error("Couldn't check the queue:", e.message);
    } else if (claimed.sent) {
      // It went out on WhatsApp but recording failed. Don't retry the send: Personal OS
      // marks it "not sent - check WhatsApp" after 10 minutes so you can confirm.
      log.error(`Sent to ${claimed.lead_name} but couldn't record it in Personal OS: ${e.message}`);
    } else {
      const retry = !e.permanent && isTransient(e);
      log.warn(`Couldn't send to ${claimed.lead_name}: ${e.message}${retry ? " (will retry)" : ""}`);
      const f = await db.fail(claimed.outreach_id, e.message, retry).catch((err) => {
        log.error("Couldn't record the failure:", err.message);
        return null;
      });
      if (f?.paused) log.error("3 sends failed in a row: auto-send is now paused. Turn it back on in Personal OS once WhatsApp works.");
    }
  } finally {
    ticking = false;
  }
}

/**
 * Tiny web server: Render needs a port to treat this as a web service, and the health URL is
 * what keeps the free instance awake (cron-job.org, plus the worker pinging itself).
 */
function startHealthServer() {
  if (!config.port) return;
  createServer((req, res) => {
    const body = JSON.stringify({
      ok: true,
      service: "personal-os-whatsapp",
      whatsapp: status.state,
      up_since: startedAt.toISOString(),
    });
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(req.method === "HEAD" ? undefined : body);
  }).listen(config.port, () => log.info(`Health check on port ${config.port} (/health)`));

  if (config.publicUrl) {
    const url = `${config.publicUrl.replace(/\/$/, "")}/health`;
    setInterval(() => {
      fetch(url, { signal: AbortSignal.timeout(20_000) }).catch(() => undefined);
    }, KEEP_AWAKE_MS);
    log.info(`Keeping awake by visiting ${url} every 10 minutes`);
  }
}

async function check() {
  const user = await signIn();
  const s = await db.settings();
  const days = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  console.log(`Signed in to Personal OS as ${user.email}`);
  console.log(`Auto-send:        ${s.autosend_enabled ? "ON" : "paused"}`);
  console.log(`Approval needed:  ${s.autosend_require_approval ? "yes" : "no"}`);
  console.log(`Daily limit:      ${s.autosend_daily_limit}`);
  console.log(`Hours (IST):      ${s.autosend_start_hour}:00 to ${s.autosend_end_hour}:00`);
  console.log(`Days:             ${s.autosend_days.map((d) => days[d]).join(", ")}`);
  console.log(`Gap:              ${s.autosend_min_gap_minutes}-${s.autosend_max_gap_minutes} minutes`);
  console.log(`Full sequences:   ${s.autosend_full_sequence_only ? "only Claude's complete sequences" : "any approved draft"}`);
  console.log(`WhatsApp login:   ${config.authStore === "file" ? config.authDir : "encrypted in Supabase"}`);
}

async function main() {
  if (process.argv.includes("--check")) {
    await check();
    return;
  }

  startHealthServer();
  const user = await signIn();
  log.info(`Signed in to Personal OS as ${user.email}`);

  const wa = new WhatsApp(
    {
    onState: (s) => pushStatus(s),
    onMessage: async ({ phone, text, id, at }) => {
      const r = await db.recordReply(phone, text, id, at);
      if (r.recorded) {
        log.info(`${r.merged ? "More from" : "Reply from"} ${r.lead_name} recorded${r.merged ? "" : ": follow-ups stopped"}`);
      }
    },
      onRestricted: (reason) => {
        log.error(`${reason} Pausing auto-send.`);
        pushStatus({ last_error: reason });
        db.pause(reason).catch((e) => log.error("Couldn't pause auto-send:", e.message));
      },
    },
    db.authStore,
  );
  await wa.start();

  const heartbeat = setInterval(() => pushStatus({}), HEARTBEAT_MS);
  // Small random offset so checks don't land on exact minutes.
  const poll = setInterval(() => setTimeout(() => tick(wa), Math.random() * 10_000), config.pollSeconds * 1000);
  setTimeout(() => tick(wa), 15_000);

  const shutdown = async (signal) => {
    log.info(`${signal}: stopping`);
    clearInterval(heartbeat);
    clearInterval(poll);
    // Let a send in progress finish so it gets recorded.
    for (let i = 0; i < 30 && ticking; i++) await new Promise((r) => setTimeout(r, 1000));
    await wa.stop();
    await db.setStatus({ state: "offline", qr: null, pairing_code: null }).catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

process.on("unhandledRejection", (e) => log.error("Unexpected error:", e?.message ?? e));

main().catch((e) => {
  log.error(e.message);
  process.exit(1);
});
