import "server-only";
import { existsSync } from "node:fs";
import { join } from "node:path";

/** Drop your photo into /public with one of these names and it is used automatically. */
const CANDIDATES = ["profile.jpg", "profile.jpeg", "profile.png", "profile.webp"];

let cached: string | null | undefined;

/** Public URL of the owner's profile photo, or null if none has been added yet. */
export function findLogoSrc(): string | null {
  if (process.env.NODE_ENV === "production" && cached !== undefined) return cached;
  const found = CANDIDATES.find((f) => existsSync(join(process.cwd(), "public", f)));
  cached = found ? "/" + found : null;
  return cached;
}
