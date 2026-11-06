import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Enforces WCAG AA contrast for every semantic text/background token pair, in both
 * themes, by reading the real tokens from globals.css.
 */
const css = readFileSync(join(__dirname, "..", "..", "src", "app", "globals.css"), "utf8");

function block(selector: RegExp) {
  const m = css.match(selector);
  if (!m) throw new Error("block not found: " + selector);
  return Object.fromEntries([...m[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((x) => [x[1], x[2]]));
}

const light = block(/:root\s*\{([^}]*)\}/);
const dark = { ...light, ...block(/\.dark\s*\{([^}]*)\}/) };

type RGB = [number, number, number];
const rgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const lum = ([r, g, b]: RGB) => {
  const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: RGB, b: RGB) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** Colour `fg` drawn at `alpha` over `bg`. */
const blend = (fg: RGB, bg: RGB, alpha: number): RGB => fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha))) as RGB;

const themes = { light, dark } as const;

describe.each(Object.entries(themes))("%s theme text contrast (WCAG AA)", (_name, t) => {
  const surfaces = ["bg", "surface", "surface-2"] as const;

  it.each(surfaces)("body text (fg) on %s is at least 7:1", (s) => {
    expect(ratio(rgb(t.fg), rgb(t[s]))).toBeGreaterThanOrEqual(7);
  });

  it.each(surfaces)("muted text on %s is at least 4.5:1", (s) => {
    expect(ratio(rgb(t.muted), rgb(t[s]))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["accent", "danger", "success", "warning"] as const)("%s text on every surface is at least 4.5:1", (c) => {
    for (const s of surfaces) expect(ratio(rgb(t[c]), rgb(t[s]))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["danger", "success", "warning"] as const)("%s text on its own tint (bg-%s/10, /15) is at least 4.5:1", (c) => {
    for (const s of ["surface", "bg"] as const)
      for (const a of [0.1, 0.15]) {
        const tint = blend(rgb(t[c]), rgb(t[s]), a);
        expect(ratio(rgb(t[c]), tint)).toBeGreaterThanOrEqual(4.5);
      }
  });

  it("accent text on accent-soft is at least 4.5:1", () => {
    expect(ratio(rgb(t.accent), rgb(t["accent-soft"]))).toBeGreaterThanOrEqual(4.5);
  });

  it("primary button text (accent-fg) on accent is at least 4.5:1", () => {
    expect(ratio(rgb(t["accent-fg"]), rgb(t.accent))).toBeGreaterThanOrEqual(4.5);
  });

  it("text on solid danger backgrounds (danger-fg on danger) is at least 4.5:1", () => {
    expect(ratio(rgb(t["danger-fg"]), rgb(t.danger))).toBeGreaterThanOrEqual(4.5);
  });

  it("borders are visible against surfaces (3:1 is not required, 1.15:1 minimum)", () => {
    expect(ratio(rgb(t.border), rgb(t.surface))).toBeGreaterThanOrEqual(1.15);
  });
});
