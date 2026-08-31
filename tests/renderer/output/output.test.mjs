#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ANSI } from "../../../src/lib/ansi.mjs";
import { exampleFindings } from "../../../src/lib/examples.mjs";
import { normalizeFindings, sortFindings } from "../../../src/lib/findings.mjs";
import { renderFindings } from "../../../src/lib/renderer.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, "fixtures");
// Declared here, not beside parseArgs: a `const` is not hoisted and the fixture loop
// runs above that function.
const RENDER_OPTIONS = new Set(["as", "style", "filter", "color"]);

let count = 0;
for (const name of fs.readdirSync(fixturesDir).sort()) {
  const fixtureDir = path.join(fixturesDir, name);
  if (!fs.statSync(fixtureDir).isDirectory()) continue;
  const input = JSON.parse(fs.readFileSync(path.join(fixtureDir, "input.json"), "utf8"));
  const args = parseArgs(fs.readFileSync(path.join(fixtureDir, "args.txt"), "utf8"));
  const actual = renderFindings(input, args).trimEnd();
  const expected = fs.readFileSync(path.join(fixtureDir, "expected.txt"), "utf8").trimEnd();
  assert.equal(actual, expected, name);
  count += 1;
}

// Order is taken from the SEGMENTS a row is drawn by, not from its path field. A row
// carrying segments — a filename holding a backslash, or a rule with a `/` inside its
// regex — is drawn whole while `normalizePath` splits the field, so a root-level
// `a\y.md` sorted between `a/` and its own child.
assert.deepEqual(
  sortFindings([
    { level: "ok", path: "a\\y.md", segments: ["a\\y.md"] },
    { level: "ok", path: "a/z.md" },
    { level: "ok", path: "a", directory: true },
  ]).map((row) => row.path),
  ["a", "a/z.md", "a\\y.md"],
  "a name holding a backslash sorts as one segment, after the subtree it looked like part of",
);

// A backslash in a finding from ANOTHER tool is a Windows separator and becomes `/`;
// a backslash in a path this checker produced is part of a NAME. The two look
// identical in the JSON and are told apart by whether the row carries its segments.
// `../../checker/virtual-fs` holds the other half.
assert.equal(
  renderFindings({ items: [{ level: "error", path: "src\\components\\Button.tsx", message: "Unexpected" }] }, { style: "list" }).trim(),
  "✗ src/components/Button.tsx                 # Unexpected",
  "a Windows separator in third-party findings is a path separator",
);
assert.equal(
  renderFindings({ items: [{ level: "ok", path: "a\\b.md", segments: ["a\\b.md"] }] }, { style: "list" }).trim(),
  "✓ a\\b.md",
  "and a backslash in a row that carries its segments is part of the name",
);

// Order is segment by segment, so it agrees with the tree it is drawn as. A
// whole-string compare does not: `-` sorts below `/`, so `src-x` fell between `src`
// and `src/bad.md` — hidden unfiltered, and visible under `--filter=error`, which
// drops the parent row the tree had grouped everything under. A flag documented as
// not changing the verdict changed the order of a report people diff.
assert.deepEqual(
  sortFindings([{ level: "ok", path: "src-x" }, { level: "ok", path: "src/bad.md" }, { level: "ok", path: "src" }])
    .map((row) => row.path),
  ["src", "src/bad.md", "src-x"],
  "a path sorts under its parent, not beside it",
);

// Two rules that address the same text — `{:n}/` and `{:n}`, which the parser
// deliberately allows — are two rows in `list` and one in `tree`: a tree cannot hold
// two nodes at one address, and the list keys on the kind as well. README's Limits
// says so, and this pair keeps that sentence true.
const sameAddress = {
  items: [],
  layout: [
    { level: "ok", path: "{:n}", message: "", directory: true },
    { level: "ok", path: "{:n}", message: "" },
  ],
};
assert.equal(renderFindings(sameAddress, { style: "list" }).trimEnd().split("\n").length, 2, "list draws both");
assert.equal(renderFindings(sameAddress, { style: "tree" }).trimEnd().split("\n").length, 1, "tree draws one");

// A filename may hold a newline — POSIX allows it — and this output is read as one
// row per entry, so `a\nb.md` drew TWO rows, neither of which exists. A name cannot
// be allowed to forge a row.
for (const style of ["tree", "list"]) {
  const forged = renderFindings({ items: [{ level: "ok", path: "a\nb.md" }] }, { style }).trimEnd();
  assert.equal(forged.split("\n").length, 1, `${style}: a name with a newline drew ${forged.split("\n").length} rows\n${forged}`);
  assert.match(forged, /a\\nb\.md/, `${style}: and the name is shown escaped rather than dropped`);
}
// A tab moved every comment after it out of the column.
assert.match(renderFindings({ items: [{ level: "ok", path: "a\tb.md" }] }, {}), /a\\tb\.md/, "a tab in a name is escaped too");

// An EMPTY `layout` is no schema view, not an empty one: it drew nothing while the
// roll-up still counted `items`, so the run printed nothing and exited 1.
assert.equal(
  renderFindings({ items: [{ level: "error", path: "src/x.ts", message: "Boom" }], layout: [] }, {}).trimEnd(),
  "✗ src/\n└─ ✗ x.ts                                   # Boom",
  "an empty layout array falls back to the path view rather than drawing nothing",
);

// Both styles reduce to one row per path BEFORE filtering. The tree did not, so a
// path carrying `ok` and `warn` drew a ✓ under `--filter=ok` — the
// green-over-a-warning bug arriving through the filter.
const mixed = { items: [{ level: "ok", path: "a.md" }, { level: "warn", path: "a.md", message: "Stale" }] };
for (const style of ["tree", "list"]) {
  assert.equal(renderFindings(mixed, { style, filter: "ok" }).trim(), "", `${style}: a path whose worst finding is a warning is not an ok row`);
  assert.match(renderFindings(mixed, { style, filter: "warn" }), /a\.md/, `${style}: and it is a warn row`);
}

// One measurement of how wide a row is, in code POINTS. Three places line a comment
// up — the linter, the contract printer, and this — and this one used `.length`,
// which counts an emoji as two.
const aligned = renderFindings({
  items: [
    { level: "ok", path: "aaa.md", message: "Plain" },
    { level: "ok", path: "bbb🎉.md", message: "Astral" },
    { level: "ok", path: "日本語.md", message: "Wide" },
  ],
}, {}).trimEnd().split("\n");
const hashAt = aligned.map((line) => [...line].indexOf("#"));
assert.deepEqual(new Set(hashAt).size, 1, `every comment starts at one column, got ${hashAt.join(", ")}\n${aligned.join("\n")}`);

// Report order does not read the environment. `sortFindings` compared paths with
// `localeCompare`, which uses the ambient locale: under `LC_ALL=sv_SE` — Swedish
// sorts ä after z — `ähre` moved from the top of a report to the bottom. This pair is
// ordered one way by the deterministic comparison and the other way by every Latin
// locale, so putting `localeCompare` back fails here.
assert.deepEqual(
  sortFindings([{ level: "ok", path: "ähre" }, { level: "ok", path: "zebra" }]).map((row) => row.path),
  ["zebra", "ähre"],
  "paths sort case-insensitively then exactly, never by the ambient locale",
);
assert.deepEqual(
  sortFindings([{ level: "ok", path: "Bar" }, { level: "ok", path: "apple" }]).map((row) => row.path),
  ["apple", "Bar"],
  "and case-insensitively is what keeps that readable",
);

// The built-in example is the page that shows another tool what a well-formed report
// looks like, and it is written by hand — two lists describing one run, with nothing
// making them agree. They had drifted, and a directory carried `warn` with no message
// at all: a glyph the roll-up paints anyway, with no reason beside it.
const example = exampleFindings("stress");
const spoken = (rows) => rows.filter((row) => row.level !== "ok").map((row) => row.message).sort();
for (const [view, rows] of Object.entries({ items: example.items, layout: example.layout })) {
  for (const row of rows) {
    assert(row.level === "ok" || row.message, `example ${view}: ${row.path} is ${row.level} with no message`);
  }
}
assert.deepEqual(spoken(example.items), spoken(example.layout),
  "the example's two views describe one run, so they must report the same faults");

// One path carrying two findings, drawn both ways. The list printed every finding it
// was handed, so a directory that satisfied `{:x}/` and failed a file rule `docs`
// drew `✗ docs` above `✓ docs`: two rows contradicting each other in the view
// `--as actual` documents as one row per real path. `render` takes findings from any
// tool and cannot assume they were deduplicated, so how many rows a path gets is
// decided here, once, for both styles.
const contradiction = {
  items: [
    { level: "error", path: "docs", message: "Required entry missing" },
    { level: "ok", path: "docs" },
  ],
};
for (const style of ["list", "tree"]) {
  const drawn = renderFindings(contradiction, { style }).trimEnd().split("\n");
  assert.equal(drawn.length, 1, `${style}: one path drew ${drawn.length} rows\n${drawn.join("\n")}`);
  assert.match(drawn[0], /^✗ docs/, `${style}: the worst finding at the path must be the one drawn`);
}

// A finding with no address at all belongs to the root, whose address is `.` — the
// same `.` the report carries as its `root`. Unaddressed, it landed on the root NODE,
// which the tree only walks the CHILDREN of, so it vanished from the report while
// still counting toward the verdict.
const unaddressed = { items: [{ level: "error", path: "", message: "boom" }] };
for (const style of ["tree", "list"]) {
  assert.equal(renderFindings(unaddressed, { style }).trimEnd(), "✗ .                                         # boom", style);
}

// The verdict is the worst finding in the REPORT, both lists together. It rolled up
// from `items` alone while `--as schema` — the default — draws `layout`, so a report
// carrying its errors only there printed a tree of ✗ and reported OK.
assert.equal(
  renderFindings({ items: [], layout: [{ level: "error", path: "src/gone.mjs", message: "Required entry missing" }] }, {}).trimEnd(),
  "✗ src/\n└─ ✗ gone.mjs                               # Required entry missing",
  "the schema view draws layout[]",
);
// Through `normalizeFindings`, which is where the roll-up happens: `levelForItems`
// was never the half that was wrong — it was called with `items` only.
assert.equal(
  normalizeFindings({ items: [], layout: [{ level: "error", path: "src/gone.mjs", message: "Required entry missing" }] }).level,
  "ERROR",
  "the verdict is the worst finding in the report, whichever list it sits in",
);
assert.equal(normalizeFindings({ items: [{ level: "ok", path: "a" }], layout: [{ level: "ok", path: "a" }] }).level, "OK", "and OK when neither list has anything worse");

const optionalSyntax = renderFindings({
  items: [{ level: "ok", path: "?fixtures" }],
}, { color: true });
assert(optionalSyntax.includes(`${ANSI.dim}${ANSI.green}?${ANSI.reset}`));

const warnGlyph = renderFindings({
  items: [{ level: "warn", path: "fixtures" }],
}, { color: true });
assert(warnGlyph.includes(`${ANSI.yellow}!${ANSI.reset} fixtures`));

// A rule addressed by segments renders as ONE line; the same rule addressed only by
// its joined text still splits on "/", which is exactly why segments exist.
const rule = "objects/{/[0-9a-f]{2}/}";
const segments = ["objects", "{/[0-9a-f]{2}/}"];
const withSegments = renderFindings({ items: [], layout: [{ level: "ok", path: rule, segments: segments }] });
assert.equal(withSegments.trimEnd().split("\n").length, 2, withSegments);
assert(withSegments.includes("{/[0-9a-f]{2}/}"), withSegments);
const withoutSegments = renderFindings({ items: [], layout: [{ level: "ok", path: rule }] });
assert(withoutSegments.trimEnd().split("\n").length > 2, withoutSegments);

console.log(JSON.stringify({ level: "PASS", code: "RENDER_OUTPUT_OK", fixtures: count }));

// `--key=value` only, and anything else is refused rather than skipped: an `args.txt`
// written `--as actual` — the spelling the CLI accepts — would otherwise have tested
// the DEFAULT view while its name said otherwise, and a fixture that does not test
// what it claims is worse than none. Refused for the same reason: an option
// `renderFindings` does not read (`--format` is the CLI's), and `--color=on` as a
// string, where the CLI hands this function a boolean.
function parseArgs(source) {
  const options = {};
  for (const arg of source.trim().split(/\s+/)) {
    const pair = /^--([a-z]+)=(.+)$/.exec(arg);
    assert(pair, `args.txt: "${arg}" is not --key=value`);
    assert(RENDER_OPTIONS.has(pair[1]), `args.txt: renderFindings does not read --${pair[1]}`);
    options[pair[1]] = pair[1] === "color" ? pair[2] === "on" : pair[2];
  }
  return options;
}
