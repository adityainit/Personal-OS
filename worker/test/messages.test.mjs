import assert from "node:assert/strict";
import { test } from "node:test";
import { isTransient, jidFromPhone, messageDate, messageText, phoneFromPnJid, typingMs } from "../src/messages.mjs";

test("messageText reads text, captions and media", () => {
  assert.equal(messageText({ conversation: " Hi there " }), "Hi there");
  assert.equal(messageText({ extendedTextMessage: { text: "Sounds good" } }), "Sounds good");
  assert.equal(messageText({ imageMessage: { caption: "our menu" } }), "(photo) our menu");
  assert.equal(messageText({ audioMessage: {} }), "(voice message)");
  assert.equal(messageText({ ephemeralMessage: { message: { conversation: "disappearing" } } }), "disappearing");
  assert.equal(messageText({ viewOnceMessageV2: { message: { imageMessage: {} } } }), "(photo)");
});

test("messageText ignores reactions, edits and protocol messages", () => {
  assert.equal(messageText({ reactionMessage: { text: "👍" } }), null);
  assert.equal(messageText({ protocolMessage: { type: 0 } }), null);
  assert.equal(messageText({ senderKeyDistributionMessage: {} }), null);
  assert.equal(messageText(null), null);
});

test("phone numbers and jids", () => {
  assert.equal(phoneFromPnJid("919876543210@s.whatsapp.net"), "+919876543210");
  assert.equal(phoneFromPnJid("919876543210:12@s.whatsapp.net"), "+919876543210");
  assert.equal(phoneFromPnJid("1234567890@lid"), null);
  assert.equal(phoneFromPnJid("12036300000@g.us"), null);
  assert.equal(phoneFromPnJid(undefined), null);
  assert.equal(jidFromPhone("+91 98765 43210"), "919876543210@s.whatsapp.net");
});

test("messageDate handles numbers and Long-like objects", () => {
  assert.equal(messageDate(1_700_000_000).toISOString(), "2023-11-14T22:13:20.000Z");
  assert.equal(messageDate({ toString: () => "1700000000" }).getTime(), 1_700_000_000_000);
});

test("typing time stays between ~2 and ~10 seconds", () => {
  for (const t of ["hi", "x".repeat(200), "x".repeat(5000)]) {
    const ms = typingMs(t);
    assert.ok(ms >= 1600 && ms <= 12000, `${ms}`);
  }
});

test("isTransient tells connection trouble from permanent errors", () => {
  assert.equal(isTransient(new Error("Connection Closed")), true);
  assert.equal(isTransient(new Error("Timed Out")), true);
  assert.equal(isTransient(new Error("This number isn't on WhatsApp")), false);
});
