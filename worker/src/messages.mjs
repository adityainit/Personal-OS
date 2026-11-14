/** Pure helpers for incoming WhatsApp messages (no network). */

const MEDIA_LABEL = {
  imageMessage: "(photo)",
  videoMessage: "(video)",
  audioMessage: "(voice message)",
  documentMessage: "(document)",
  documentWithCaptionMessage: "(document)",
  stickerMessage: "(sticker)",
  contactMessage: "(contact card)",
  contactsArrayMessage: "(contact cards)",
  locationMessage: "(location)",
  liveLocationMessage: "(live location)",
  pollCreationMessage: "(poll)",
  pollCreationMessageV2: "(poll)",
  pollCreationMessageV3: "(poll)",
};

function unwrap(m) {
  let cur = m;
  for (let i = 0; i < 5 && cur; i++) {
    const inner =
      cur.ephemeralMessage?.message ??
      cur.viewOnceMessage?.message ??
      cur.viewOnceMessageV2?.message ??
      cur.viewOnceMessageV2Extension?.message ??
      cur.documentWithCaptionMessage?.message;
    if (!inner) break;
    cur = inner;
  }
  return cur;
}

/**
 * What the client wrote, or a short label for media. `null` = not a real message (ignore it).
 * @param {Record<string, any> | null | undefined} message  a Baileys `WAMessage.message`
 */
export function messageText(message) {
  const m = unwrap(message);
  if (!m) return null;
  const text =
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    m.documentMessage?.caption ??
    m.buttonsResponseMessage?.selectedDisplayText ??
    m.listResponseMessage?.title ??
    m.templateButtonReplyMessage?.selectedDisplayText;
  const label = Object.keys(m).map((k) => MEDIA_LABEL[k]).find(Boolean);
  if (text && text.trim()) return label && !m.conversation && !m.extendedTextMessage ? `${label} ${text.trim()}` : text.trim();
  // Anything else (reactions, edits, receipts, protocol messages) isn't a reply.
  return label ?? null;
}

/** "919876543210@s.whatsapp.net" or "919876543210:12@s.whatsapp.net" → "+919876543210". */
export function phoneFromPnJid(jid) {
  if (!jid || !/@s\.whatsapp\.net$/.test(jid)) return null;
  const digits = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : null;
}

/** "+91 98765 43210" → "919876543210@s.whatsapp.net" */
export function jidFromPhone(e164) {
  return `${String(e164).replace(/\D/g, "")}@s.whatsapp.net`;
}

/** Seconds since epoch (number or protobuf Long) → Date. */
export function messageDate(ts) {
  const n = typeof ts === "object" && ts !== null ? Number(ts.toString()) : Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
}

/** Simulated typing time: about 40 characters a second, between 2 and 10 seconds. */
export function typingMs(text) {
  return Math.round(Math.min(10_000, Math.max(2_000, (text?.length ?? 0) * 25)) * (0.8 + Math.random() * 0.4));
}

/** Errors worth retrying later (connection trouble) vs. ones that won't fix themselves. */
export function isTransient(err) {
  const msg = `${err?.message ?? err}`.toLowerCase();
  return /timed? ?out|connection|closed|socket|econn|network|rate|429|503|502|not connected/.test(msg);
}
