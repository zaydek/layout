#!/usr/bin/env node
// The slot grammar, asserted by INTENT rather than by snapshot.
//
// `tests/checker/virtual-fs` re-checks the same fixture directories against
// generated `expected.json` files, which proves the output is stable and cannot
// prove it is right — the snapshots came from this implementation. This table is
// written by hand: intent here, exact shape there.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkLayout } from "../../../src/lib/checker.mjs";

const __filename = fileURLToPath(import.meta.url);
const fixturesDir = path.resolve(path.dirname(__filename), "../virtual-fs/fixtures");

// what the case proves · fixture · the level it must reach · the entries that must
// be OK on disk · the entries that must be reported unexpected
// (an outlet DOES list what it claimed, by name — `--as actual` is the view for
// seeing what a rule matched, and `{}` is the rule most likely to match something
// unexpected — but it does not walk inside what it claimed)
const CASES = [
  ["a regex slot matches a whole segment", "pass-regex-basic", "OK", ["readme.md"], []],
  ["a regex slot that does not match is a missing entry", "fail-regex-basic", "ERROR", [], ["README.md"]],

  ["\\d{4} does not close the slot early", "pass-regex-braces", "OK", ["2026-08-28", "2026-08-28/note.md"], []],
  ["a one-digit month fails \\d{2}", "fail-regex-braces", "ERROR", [], ["2026-8-28"]],

  ["a # inside a regex is not a comment", "pass-regex-hash", "OK", ["a#b.md"], []],
  ["the same rule still rejects a non-match", "fail-regex-hash", "ERROR", [], ["axb.md"]],

  ["a ' -> ' inside a regex is not a symlink", "pass-regex-arrow", "OK", ["a -> b"], []],
  ["the same rule still rejects a non-match", "fail-regex-arrow", "ERROR", [], ["a-b"]],

  ["an escaped slash does not split the rule", "pass-regex-escaped-slash", "OK", ["axb.md"], []],
  ["the same rule still needs the middle character", "fail-regex-escaped-slash", "ERROR", [], ["ab.md"]],

  ["a trailing / after a regex slot still demands a directory", "pass-regex-directory", "OK", ["stuff", "stuff/x"], []],
  // `stuff` is an error but not an UNEXPECTED one: its name fits the rule and its
  // kind does not, which the checker names outright. ../virtual-fs pins the message.
  ["a file cannot satisfy a regex directory rule", "fail-regex-directory", "ERROR", [], []],

  ["an absent optional regex slot is not a finding", "pass-regex-optional", "OK", ["keep.md"], []],
  ["a present non-matching entry is still unexpected", "fail-regex-optional", "ERROR", ["keep.md"], ["Bad.LOG"]],

  ["a descriptor over a regex binds across the rule path", "pass-regex-binding", "OK", ["alpha", "alpha/alpha.md"], []],
  ["a second value for the same binding does not match", "fail-regex-binding", "ERROR", ["alpha"], ["alpha/beta.md"]],

  ["an unbound enum accepts a listed value", "pass-enum-unbound", "OK", ["main.tsx"], []],
  ["an unbound enum refuses an unlisted value", "fail-enum-unbound", "ERROR", [], ["main.js"]],

  ["a hoisted regex resolves at the use site", "pass-hoist-regex", "OK", ["INCIDENT_2026-08-28.md"], []],
  ["a hoisted regex still enforces", "fail-hoist-regex", "ERROR", [], ["INCIDENT_2026-8-28.md"]],

  ["a hoisted comma list resolves at the use site", "pass-hoist-enum", "OK", ["main.tsx"], []],
  ["a hoisted comma list still enforces", "fail-hoist-enum", "ERROR", [], ["main.js"]],

  ["a definition may reference other definitions", "pass-hoist-nested", "OK", ["INCIDENT_2026-08-28_kill-by-pattern.md"], []],
  ["a nested definition still enforces every part", "fail-hoist-nested", "ERROR", [], ["INCIDENT_2026-08-28_KILL.md"]],

  ["a comma list splices into a regex definition", "pass-hoist-enum-into-regex", "OK", ["parser.test.tsx"], []],
  ["the spliced list is closed, not open", "fail-hoist-enum-into-regex", "ERROR", [], ["parser.test.js"]],

  ["alternation matches the whole segment", "pass-regex-anchoring", "OK", ["ab"], []],
  ["alternation cannot match a superstring of the segment", "fail-regex-anchoring", "ERROR", [], ["abc"]],

  // Two regex slots with nothing between them: the first's closing delimiter and
  // the second's opening one used to be read as one span, collapsing both slots.
  ["two adjacent regex slots stay two slots", "pass-regex-adjacent", "OK", ["ab0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcd"], []],
  ["and both halves still enforce", "fail-regex-adjacent", "ERROR", [], ["ab0123456789abcdef0123456789abcdef0123456789abcdef0123456789abc"]],
];

let count = 0;
for (const [what, fixture, level, okPaths, unexpectedPaths] of CASES) {
  const dir = path.join(fixturesDir, fixture);
  const layoutSource = fs.readFileSync(path.join(dir, "layout.layout"), "utf8");
  const actual = checkLayout({ root: path.join(dir, "fs"), layoutSource });
  const label = `${fixture}: ${what}`;

  assert.equal(actual.level, level, label);
  assert.deepEqual(
    actual.items.filter((item) => item.level === "ok").map((item) => item.path).sort(),
    [...okPaths].sort(),
    `${label} — ok entries`,
  );
  assert.deepEqual(
    actual.items.filter((item) => item.message === "Unexpected by layout").map((item) => item.path).sort(),
    [...unexpectedPaths].sort(),
    `${label} — unexpected entries`,
  );
  count += 1;
}

// A rule that carries `/` or `\` cannot survive as a joined string, so it travels as
// segments — and a rule that does not is left exactly as it always was.
const braces = checkLayout({
  root: path.join(fixturesDir, "fail-regex-braces/fs"),
  layoutSource: fs.readFileSync(path.join(fixturesDir, "fail-regex-braces/layout.layout"), "utf8"),
});
const missing = braces.layout.find((item) => item.message === "Required entry missing");
assert.deepEqual(missing.segments, ["{/\\d{4}-\\d{2}-\\d{2}/}"], "a regex rule carries its segments");
assert.equal(missing.path, "{/\\d{4}-\\d{2}-\\d{2}/}", "the rule text is not path-normalized");
assert.equal(
  braces.items.find((item) => item.message === "Required entry missing").path,
  "{/\\d{4}-\\d{2}-\\d{2}/}",
  "the synthesized missing path keeps the rule verbatim",
);

const plain = checkLayout({
  root: path.join(fixturesDir, "pass-date-hoisted/fs"),
  layoutSource: fs.readFileSync(path.join(fixturesDir, "pass-date-hoisted/layout.layout"), "utf8"),
});
assert(plain.layout.every((item) => item.segments === undefined), "a rule with no / or \\ carries no segments");

console.log(JSON.stringify({ level: "PASS", code: "REGEX_SLOTS_OK", cases: count }));
