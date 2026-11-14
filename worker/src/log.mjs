import { config } from "./config.mjs";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const min = LEVELS[config.logLevel] ?? LEVELS.info;

function out(level, args) {
  if (LEVELS[level] < min) return;
  const time = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
  (level === "error" ? console.error : console.log)(`[${time}] ${level.toUpperCase().padEnd(5)}`, ...args);
}

export const log = {
  debug: (...a) => out("debug", a),
  info: (...a) => out("info", a),
  warn: (...a) => out("warn", a),
  error: (...a) => out("error", a),
};
