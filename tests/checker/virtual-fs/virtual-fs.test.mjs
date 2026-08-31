#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkLayout } from "../../../src/lib/checker.mjs";
import { lintLayout } from "../../../src/lib/lint.mjs";
import { showLayout } from "../../../src/lib/layout-view.mjs";
import { renderFindings } from "../../../src/lib/renderer.mjs";
import { readSnapshot } from "../../snapshot.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, "fixtures");

// Read once, in one shape: every loop below needs the same fixture, and a second
// reader is a second chance to disagree about what it holds. `ignore.txt`, when a
// fixture has one, is the `--ignore` globs, one per line.
const fixtures = fs.readdirSync(fixturesDir).sort()
  .map((name) => ({ name, dir: path.join(fixturesDir, name) }))
  .filter(({ dir }) => fs.statSync(dir).isDirectory())
  .map(({ name, dir }) => ({
    name,
    dir,
    root: path.join(dir, "fs"),
    layoutSource: fs.readFileSync(path.join(dir, "layout.layout"), "utf8"),
    // Named, with the way out: a fixture arriving without its snapshot says how to
    // generate one rather than throwing a raw ENOENT.
    expected: JSON.parse(readSnapshot(dir, name)),
    ignore: fs.existsSync(path.join(dir, "ignore.txt"))
      ? fs.readFileSync(path.join(dir, "ignore.txt"), "utf8").split("\n").map((line) => line.trim()).filter(Boolean)
      : [],
  }));

for (const { name, root, layoutSource, expected, ignore } of fixtures) {
  assert.deepEqual(checkLayout({ root, layoutSource, ignore }), expected, name);
}
const count = fixtures.length;

// The other half of the promise `../exit-codes` holds up. That suite proves lint
// refuses everything check refuses; this one proves it accepts everything check
// accepts, so the two cannot drift in either direction. Warnings are fine — those
// are house style, which check does not judge. `lintLayout` directly rather than
// the CLI: the claim is about the two LIBRARIES agreeing, and a process per fixture
// cost three of this suite's four seconds.
for (const { name, layoutSource } of fixtures) {
  const broken = lintLayout(layoutSource).findings.filter((finding) => finding.level === "error");
  assert.deepEqual(broken, [], `${name}: checkLayout compiled this contract, so lint must not call it broken`);
}

// Two names that are the same glyphs and different bytes: `café` composed (U+00E9)
// against `café` decomposed (e + U+0301). macOS hands out the second and most
// editors type the first, so a contract can miss a file whose name looks identical.
// Not a fixture: git on macOS rewrites the decomposed name on the way in.
const decomposed = fs.mkdtempSync(path.join(os.tmpdir(), "layout-nfd-"));
fs.writeFileSync(path.join(decomposed, "cafe\u0301.md"), "");
const encoded = checkLayout({ root: decomposed, layoutSource: "caf\u00e9.md\n" });
assert.equal(encoded.level, "ERROR", "a composed name must not match a decomposed file");
assert.match(
  encoded.items.find((item) => item.message.startsWith("Required entry missing")).message,
  /looks the same but is encoded differently/,
  "and the message must say why, rather than reporting an entry the reader can see",
);
fs.rmSync(decomposed, { recursive: true, force: true });

// A name reaches the reader through two channels — the row's address and any
// message that quotes it — and both must escape it. Only the address did, so
// `a<TAB>b` was drawn as `a\tb` and described as `"a b"`, a name that does not
// exist.
const tabbed = fs.mkdtempSync(path.join(os.tmpdir(), "layout-tab-"));
fs.writeFileSync(path.join(tabbed, "a\tb"), "");
const quoted = checkLayout({ root: tabbed, layoutSource: "{:n}/\n{}\n" });
assert.match(
  quoted.items.find((item) => item.level === "error").message,
  /"a\\tb" is here/,
  "a message quoting a name shows its control characters, like the address does",
);
fs.rmSync(tabbed, { recursive: true, force: true });

// What a rule says when it matched nothing, in every combination that decides it:
// whether it lost a candidate and to whom, whether it near-missed one, and whether
// it is optional. One decision, so one table rather than a fixture per row — edits
// have repeatedly fixed one of these rows by breaking another.
//
//   lost to an EQUAL rule      -> it says so, and `?` excuses it only if it has no
//                                 children (a subtree would have gone unchecked)
//   lost to a MORE SPECIFIC    -> it says so; `?` excuses it, because that rule
//                                 carved the child out and "any other" is vacuous
//   lost nothing, near miss    -> the near-miss pass speaks; `?` excuses it
//   lost nothing, no near miss -> "Required entry missing"; `?` excuses it
for (const [what, layoutSource, tree, level, spoken] of [
  ["lost to equal, near miss, required", "{:a}\nf2\n{:b}\n", ["f1", "f2", "d/k"], "ERROR",
    ["Expected a file, found a directory", 'Nothing left to match — "f1" fits this rule and an earlier rule at this level claimed it']],
  ["lost to equal, near miss, optional", "{:a}\nf2\n?{:b}\n", ["f1", "f2", "d/k"], "ERROR",
    ["Expected a file, found a directory"]],
  ["lost to more specific, near miss, required", "vendor/\n  {}\n{:d}/\n  {}\nnotes.md\n", ["vendor/k", "notes.md"], "ERROR",
    ['Nothing left to match — "vendor" fits this rule and an earlier rule at this level claimed it']],
  ["lost to more specific, near miss, optional", "vendor/\n  {}\n?{:d}/\n  {}\nnotes.md\n", ["vendor/k", "notes.md"], "OK", []],
  ["lost nothing, near miss, required", "docs/\n  {}\n", ["docs"], "ERROR", ["Expected a directory, found a file"]],
  ["lost nothing, near miss, optional", "?docs/\n  {}\n{}\n", ["docs"], "OK", []],
  ["lost to equal, no near miss, required", "{:a}\n{:b}\n", ["f1"], "ERROR",
    ['Nothing left to match — "f1" fits this rule and an earlier rule at this level claimed it']],
  ["lost to equal, no near miss, optional", "{:a}\n?{:b}\n", ["f1"], "OK", []],
  ["genuinely absent, required", "gone.md\n{}\n", ["f1"], "ERROR", ["Required entry missing"]],
  ["genuinely absent, optional", "?gone.md\n{}\n", ["f1"], "OK", []],
]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "layout-says-"));
  for (const entry of tree) {
    fs.mkdirSync(path.join(root, path.dirname(entry)), { recursive: true });
    fs.writeFileSync(path.join(root, entry), "");
  }
  const report = checkLayout({ root, layoutSource });
  assert.equal(report.level, level, `${what}\n${layoutSource}`);
  assert.deepEqual(report.layout.filter((row) => row.level !== "ok").map((row) => row.message), spoken, what);
  fs.rmSync(root, { recursive: true, force: true });
}

// A check has no warnings — README's own words, and the reason `--strict` is not a
// check option. A tree either matches a rule or it does not.
for (const { name, root, layoutSource, ignore } of fixtures) {
  const report = checkLayout({ root, layoutSource, ignore });
  const levels = new Set([...report.items, ...(report.layout ?? [])].map((row) => row.level));
  assert.deepEqual([...levels].filter((level) => level !== "ok" && level !== "error"), [], `${name}: a check emitted a level that is not ok or error`);
}

// No row is ever repeated exactly, in either list: every rule speaks once per thing
// it has to say. Asserted over every fixture rather than pinned per case, because
// three separate edits have reopened it.
for (const { name, root, layoutSource, ignore } of fixtures) {
  const report = checkLayout({ root, layoutSource, ignore });
  for (const list of ["items", "layout"]) {
    const rows = (report[list] ?? []).map((row) => [row.level, row.path, row.message].join(" | "));
    assert.equal(new Set(rows).size, rows.length, `${name}: ${list}[] carries the same row twice\n${rows.join("\n")}`);
  }
}

// A name cannot reorder the report around itself. `gpj.<U+202E>txt.md` displays as
// `gpj.dm.txt` in any terminal that honours bidi controls — the same forgery a
// newline commits, by a different mechanism. Zero-width joiners are left alone: they
// compose one glyph from several and reorder nothing.
const bidi = fs.mkdtempSync(path.join(os.tmpdir(), "layout-bidi-"));
fs.writeFileSync(path.join(bidi, "gpj.\u202Etxt.md"), "");
fs.writeFileSync(path.join(bidi, "a\u200Db.md"), "");
const spoofed = checkLayout({ root: bidi, layoutSource: "{:f}\n" });
assert.deepEqual(spoofed.items.map((row) => row.path).sort(), ["a\u200Db.md", "gpj.\u202Etxt.md"], "the paths are the bytes on disk");
assert.deepEqual(
  renderFindings(spoofed, { style: "list", as: "actual" }).trimEnd().split("\n").map((row) => row.slice(2).trim()),
  ["a\u200Db.md", "gpj.\\u202etxt.md"],
  "the override is escaped on the way to the screen; the joiner is not",
);
fs.rmSync(bidi, { recursive: true, force: true });

// A file rule wants a file or a symlink. A FIFO, socket or device carrying the
// right name is a near miss — the name is right and the thing is not a file — and a
// kind test written as `!== (kind === "directory")` let all three through silently.
// Not a fixture: git stores no FIFO.
const special = fs.mkdtempSync(path.join(os.tmpdir(), "layout-fifo-"));
execFileSync("mkfifo", [path.join(special, "package.json")]);
const piped = checkLayout({ root: special, layoutSource: "package.json\n" });
assert.equal(piped.level, "ERROR", "a named pipe does not satisfy a file rule");
assert.match(piped.items[0].message, /Expected a file, found a special file/, piped.items[0].message);
assert.equal(checkLayout({ root: special, layoutSource: "{}\n" }).level, "OK", "and an outlet still accepts it");
fs.rmSync(special, { recursive: true, force: true });

// A rule can near-miss two children of DIFFERENT wrong kinds, and that is two facts
// about it. Deduping by the rule alone kept only the first. Not a fixture: a
// dangling symlink, a file and a directory all matching one regex is a puzzle to
// read on disk.
const kinds = fs.mkdtempSync(path.join(os.tmpdir(), "layout-kinds-"));
fs.mkdirSync(path.join(kinds, "xdir"));
fs.writeFileSync(path.join(kinds, "xfile"), "");
fs.symlinkSync("xfile", path.join(kinds, "xlink"));
const nearMisses = checkLayout({ root: kinds, layoutSource: "{/x.*/}/\n  {}\n" });
assert.deepEqual(
  nearMisses.layout.filter((row) => row.level === "error").map((row) => row.message),
  ["Expected a directory, found a file", "Expected a directory, found a symlink"],
  "two children of different wrong kinds are two things to say about one rule",
);
fs.rmSync(kinds, { recursive: true, force: true });

// A filename may contain a backslash, and `normalizePath` rewrites `\` into `/` for
// findings arriving from a tool that uses Windows separators — so `a\b.md` was
// reported at `a/b.md`, an invented directory. Not a fixture: a repo carrying that
// name is a trap for anyone on Windows.
const backslash = fs.mkdtempSync(path.join(os.tmpdir(), "layout-backslash-"));
fs.writeFileSync(path.join(backslash, "a\\b.md"), "");
const named = checkLayout({ root: backslash, layoutSource: "{}\n" });
assert.deepEqual(named.items.map((item) => item.path), ["a\\b.md"], "a name with a backslash is not two path segments");
fs.rmSync(backslash, { recursive: true, force: true });

// `.git` and `node_modules` are skipped before any rule sees them, at every depth,
// with nothing to turn that off — so a rule naming one can never be satisfied, and
// the message must say so rather than reporting a directory that is plainly there
// missing. Neither can be a fixture: `node_modules/` is gitignored and a `.git`
// inside a fixture would be a repository.
const skipped = fs.mkdtempSync(path.join(os.tmpdir(), "layout-skipped-"));
fs.mkdirSync(path.join(skipped, "node_modules"));
fs.mkdirSync(path.join(skipped, ".git"));
fs.writeFileSync(path.join(skipped, "node_modules", "left-pad.js"), "");
for (const name of ["node_modules", ".git"]) {
  const result = checkLayout({ root: skipped, layoutSource: `${name}/\n  {}\n` });
  assert.equal(result.level, "ERROR", `${name}: a rule naming it can never be satisfied`);
  assert.equal(
    result.items.find((item) => item.level === "error").message,
    `${name} is never read — it is skipped at every depth, before any rule sees it, and no option turns that off`,
    `${name}: the message must name the rule as the fault, not report an entry the reader can see`,
  );
}
// And the tree really is empty to the checker: an outlet over it finds nothing to
// claim, so nothing is "Unexpected by layout" either.
assert.equal(checkLayout({ root: skipped, layoutSource: "{}\n" }).level, "OK", "both are invisible, not merely unmatched");
fs.rmSync(skipped, { recursive: true, force: true });

// `render` re-emits a contract from the parse tree rather than copying the file, so
// it is only honest if what it prints MEANS what it read. A contract can lint clean
// while saying something else — dropping a `?`, or emitting a `#` that was escaped —
// so every contract here is rendered and re-checked against its own tree, which is
// the claim itself. `checker/self` proves only the weaker half.
for (const { name, root, layoutSource, expected, ignore } of fixtures) {
  const once = showLayout(layoutSource);
  const rendered = checkLayout({ root, layoutSource: once, ignore });
  assert.deepEqual(rendered, expected, `${name}: rendering this contract changed what it means\n${once}`);
  // And rendering is settled after one pass: a formatter that keeps moving the file
  // is one nobody can put in a pre-commit hook.
  assert.equal(showLayout(once), once, `${name}: rendering the rendered contract moves it again\n${once}`);
}

// The promise the tiers exist to keep, checked against every contract above rather
// than the handful of fixture pairs written to pin it: rewrite each contract with
// its rules in the opposite order at EVERY depth, each carrying its own subtree, and
// the VERDICT must not move. The pairs pin four specific shapes, and the general
// gate is where the last violation hid.
//
// The verdict, not the findings. Two rules in the SAME tier still race for one
// child and the first written wins, so the loser's message legitimately differs
// between the orders. What may never differ is whether the tree passed.
function reversed(source) {
  const definitions = [];
  const rules = [];
  for (const line of source.split("\n")) {
    if (line.trim() === "") continue;
    // A `$name:` definition is not a rule and does not move.
    if (line.startsWith("$")) definitions.push(line);
    else rules.push(line);
  }
  return [...definitions, ...flip(rules, 0)].join("\n") + "\n";
}

// Siblings reversed at EVERY depth, each rule carrying its own subtree: reversing
// only the top level leaves the order below it — most of a real contract —
// unasserted.
function flip(lines, indent) {
  const groups = [];
  for (const line of lines) {
    if (/^ */.exec(line)[0].length === indent) groups.push([line]);
    else groups.at(-1).push(line);
  }
  return groups.reverse().flatMap(([head, ...rest]) => [head, ...flip(rest, indent + 2)]);
}

for (const { name, root, layoutSource, expected, ignore } of fixtures) {
  const swapped = checkLayout({ root, layoutSource: reversed(layoutSource), ignore });
  assert.equal(
    swapped.level, expected.level,
    `${name}: the same contract with its rules in the opposite order reaches a different verdict\n${reversed(layoutSource)}`,
  );
}

console.log(JSON.stringify({ level: "PASS", code: "VIRTUAL_FS_OK", fixtures: count }));
