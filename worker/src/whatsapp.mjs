/**
 * Keeps your WhatsApp linked (like WhatsApp Web) and exposes send + incoming-message hooks.
 */
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidBroadcast,
  isJidGroup,
  isLidUser,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
} from "baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import { loadAuthState } from "./auth-store.mjs";
import { config } from "./config.mjs";
import { log } from "./log.mjs";
import { jidFromPhone, messageDate, messageText, phoneFromPnJid, typingMs } from "./messages.mjs";

const silent = pino({ level: "silent" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class WhatsApp {
  /**
   * @param {{
   *   onState: (s: { state: string, qr?: string|null, pairing_code?: string|null, phone?: string|null, last_error?: string|null }) => void,
   *   onMessage: (m: { phone: string, text: string, id: string, at: Date }) => Promise<void>,
   *   onRestricted: (reason: string) => void,
   * }} hooks
   * @param {Parameters<typeof loadAuthState>[0]} authStore  database store for the WhatsApp login
   */
  constructor(hooks, authStore) {
    this.hooks = hooks;
    this.authStore = authStore;
    this.timelockTimer = null;
    this.sock = null;
    this.connected = false;
    this.phone = null;
    this.retries = 0;
    this.stopped = false;
  }

  async start() {
    this.stopped = false;
    const auth = await loadAuthState(this.authStore);
    const { state, saveCreds } = auth;
    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch {
      version = undefined; // fall back to the library's built-in version
    }

    this.hooks.onState({ state: "starting", qr: null, pairing_code: null, last_error: null });
    const sock = makeWASocket({
      version,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, silent) },
      logger: silent,
      browser: Browsers.ubuntu("Personal OS"),
      // Stay "offline" so your phone keeps getting notifications.
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      getMessage: async () => undefined,
    });
    this.sock = sock;
    let pairingRequested = false;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (u) => {
      if (u.qr) {
        log.info("Link WhatsApp: scan this QR (WhatsApp → Settings → Linked devices → Link a device), or use the QR on the Auto-send page.");
        qrcode.generate(u.qr, { small: true });
        let pairing_code = null;
        if (config.pairingPhone && !pairingRequested && !sock.authState.creds.registered) {
          pairingRequested = true;
          try {
            pairing_code = await sock.requestPairingCode(config.pairingPhone);
            log.info(`Or link with phone number instead, using code: ${pairing_code}`);
          } catch (e) {
            log.warn("Couldn't get a pairing code:", e.message);
          }
        }
        this.hooks.onState({ state: "qr", qr: u.qr, ...(pairing_code ? { pairing_code } : {}) });
      }

      // WhatsApp temporarily restricted this number from messaging new people: stop at once.
      if (u.reachoutTimeLock?.isActive) {
        const until = u.reachoutTimeLock.timeEnforcementEnds
          ? ` until ${u.reachoutTimeLock.timeEnforcementEnds.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`
          : "";
        this.hooks.onRestricted(`WhatsApp has restricted this number from messaging new people${until}.`);
      }

      if (u.connection === "open") {
        this.connected = true;
        this.retries = 0;
        this.phone = phoneFromPnJid(jidNormalizedUser(sock.user?.id));
        log.info(`WhatsApp connected${this.phone ? ` as ${this.phone}` : ""}`);
        this.hooks.onState({ state: "connected", qr: null, pairing_code: null, phone: this.phone, last_error: null });
        this.#checkRestrictions();
        clearInterval(this.timelockTimer);
        this.timelockTimer = setInterval(() => this.#checkRestrictions(), 3 * 3_600_000);
      }

      if (u.connection === "close") {
        this.connected = false;
        const code = u.lastDisconnect?.error?.output?.statusCode;
        const reason = u.lastDisconnect?.error?.message ?? "connection closed";
        if (this.stopped) return;

        if (code === DisconnectReason.loggedOut) {
          log.warn("WhatsApp logged this device out. Removing the saved login; scan a new QR to link again.");
          await auth.clear();
          this.hooks.onState({ state: "logged_out", qr: null, pairing_code: null, last_error: "Logged out from the phone. Link again." });
          await sleep(3_000);
          return this.start();
        }
        if (code === DisconnectReason.connectionReplaced) {
          const msg = "Another copy of the worker took over this WhatsApp link. Only run one worker. Retrying in 5 minutes.";
          log.error(msg);
          this.hooks.onState({ state: "error", last_error: msg });
          await sleep(5 * 60_000);
          return this.start();
        }

        // 515 "restart required" is normal right after linking.
        const delay = code === DisconnectReason.restartRequired ? 0 : Math.min(60_000, 3_000 * 2 ** this.retries++);
        log.warn(`WhatsApp disconnected (${code ?? "?"}: ${reason}). Reconnecting in ${Math.round(delay / 1000)}s`);
        this.hooks.onState({ state: "starting", last_error: code === DisconnectReason.restartRequired ? null : reason });
        await sleep(delay);
        return this.start();
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify" && type !== "append") return;
      for (const m of messages) {
        try {
          await this.#handleIncoming(m);
        } catch (e) {
          log.error("Couldn't process an incoming message:", e.message);
        }
      }
    });
  }

  /** Asks WhatsApp whether this number is restricted; the answer arrives as a connection update. */
  async #checkRestrictions() {
    try {
      await this.sock?.fetchAccountReachoutTimelock();
    } catch (e) {
      log.debug("Couldn't check for WhatsApp restrictions:", e.message);
    }
  }

  async #handleIncoming(m) {
    const key = m.key ?? {};
    if (key.fromMe) return;
    const jid = key.remoteJid;
    if (!jid || isJidGroup(jid) || isJidBroadcast(jid) || jid === "status@broadcast" || jid.endsWith("@newsletter")) return;

    const at = messageDate(m.messageTimestamp);
    // Old history that arrives after reconnecting isn't a new reply.
    if (Date.now() - at.getTime() > 3 * 86_400_000) return;

    const text = messageText(m.message);
    if (!text) return;

    const phone = await this.#phoneFor(jid, key);
    if (!phone) {
      log.debug("Incoming message without a resolvable phone number, skipped");
      return;
    }
    await this.hooks.onMessage({ phone, text, id: key.id, at });
  }

  /** Newer WhatsApp chats may be addressed by a private id (LID) instead of the phone number. */
  async #phoneFor(jid, key) {
    const direct = phoneFromPnJid(jidNormalizedUser(jid));
    if (direct) return direct;
    if (key.remoteJidAlt) {
      const alt = phoneFromPnJid(jidNormalizedUser(key.remoteJidAlt));
      if (alt) return alt;
    }
    if (isLidUser(jid)) {
      try {
        const pn = await this.sock?.signalRepository?.lidMapping?.getPNForLID(jid);
        return phoneFromPnJid(jidNormalizedUser(pn ?? undefined));
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Sends a text message like a person would: checks the number is on WhatsApp, shows
   * "typing…" for a few seconds, then sends. Returns the WhatsApp message id.
   */
  async sendText(e164, text) {
    if (!this.sock || !this.connected) throw new Error("WhatsApp is not connected");
    const found = await this.sock.onWhatsApp(jidFromPhone(e164));
    const hit = found?.find((r) => r.exists);
    if (!hit) {
      const err = new Error("This number isn't on WhatsApp. Check the number or contact them by email.");
      err.permanent = true;
      throw err;
    }
    const jid = hit.jid;
    try {
      await this.sock.presenceSubscribe(jid);
      await sleep(800 + Math.random() * 1500);
      await this.sock.sendPresenceUpdate("composing", jid);
      await sleep(typingMs(text));
      await this.sock.sendPresenceUpdate("paused", jid);
    } catch {
      // Typing indicators are cosmetic; never block the send on them.
    }
    const sent = await this.sock.sendMessage(jid, { text });
    return sent?.key?.id ?? null;
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.timelockTimer);
    this.connected = false;
    try {
      this.sock?.end(undefined);
    } catch {
      // already closed
    }
  }
}
