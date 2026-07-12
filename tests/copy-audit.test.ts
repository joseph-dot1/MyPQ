// Copy audit: the words "predict" and "subscription" must appear nowhere in
// student-facing UI strings. This scans every page/component source file.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const UI_DIRS = ["src/app", "src/components"];
const BANNED = [/predict/i, /subscription/i];
// Server-only files may reference the subscriptions DB table.
const EXEMPT = [/\/api\//];

function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectFiles(full, out);
    else if (/\.(tsx|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

// Strip code that talks to the DB (queries reference the subscriptions table
// by name); we only audit what a student can read: JSX text + string literals
// rendered in the UI. A pragmatic proxy: remove supabase query lines first.
function visibleSource(file: string): string {
  const src = readFileSync(file, "utf-8");
  return src
    .split("\n")
    .filter((line) => !/\.from\(|select\(|count.*exact|subscriptions?\"\)/.test(line))
    .join("\n");
}

describe("copy audit", () => {
  const files = UI_DIRS.flatMap((d) => collectFiles(d)).filter(
    (f) => !EXEMPT.some((re) => re.test(f.replace(/\\/g, "/")))
  );

  it("finds UI source files", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  for (const banned of BANNED) {
    it(`never says "${banned.source}" in the UI`, () => {
      const offenders = files.filter((f) => banned.test(visibleSource(f)));
      expect(offenders, `Found banned word ${banned} in: ${offenders.join(", ")}`).toEqual([]);
    });
  }
});
