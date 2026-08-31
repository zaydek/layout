#!/usr/bin/env node
// Exit 2 means "this contract is broken", which is a different thing from exit 1,
// "the tree has findings". A contract that does not resolve must never degrade into
// a matcher that accepts anything — so this runs the real CLI and asserts the
// process status, not a library return value.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, "fixtures");
const bin = path.resolve(__dirname, "../../../src/layout.mjs");
const repoRoot = path.resolve(__dirname, "../../..");

function check(cwd) {
  return spawnSync(process.execPath, [bin, "check", "fs", "--config", "layout.layout"], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

function run(args, options = {}) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd: repoRoot, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" }, ...options,
  });
}

function brokenFixtures() {
  return fs.readdirSync(fixturesDir).sort()
    .map((name) => ({ name, dir: path.join(fixturesDir, name) }))
    .filter(({ dir }) => fs.statSync(dir).isDirectory());
}

let count = 0;
for (const { name, dir } of brokenFixtures()) {
  const broken = check(dir);
  assert.equal(broken.status, 2, `${name}: a broken contract must exit 2, got ${broken.status}\n${broken.stdout}${broken.stderr}`);
  assert.equal(broken.stdout, "", `${name}: a broken contract prints no findings`);
  assert.equal(broken.stderr, fs.readFileSync(path.join(dir, "expected.txt"), "utf8"), name);
  count += 1;
}

// The control: a contract that DOES resolve keeps the two-outcome behaviour.
const resolves = path.resolve(__dirname, "../virtual-fs/fixtures");
const green = check(path.join(resolves, "pass-hoist-nested"));
assert.equal(green.status, 0, `a resolved contract over a conforming tree exits 0\n${green.stderr}`);
const red = check(path.join(resolves, "fail-hoist-nested"));
assert.equal(red.status, 1, `a resolved contract over a non-conforming tree exits 1\n${red.stderr}`);
assert.match(red.stdout, /Required entry missing/);

// All three commands agree about what a valid contract is: every fixture here makes
// `check` exit 2, so `lint` must report at least one ERROR and `render` must refuse
// to print it. That was one question with two answers — `render` only parsed, so it
// reformatted contracts the other two refuse and exited 0 over them.
for (const { name, dir } of brokenFixtures()) {
  const lint = run(["lint", "layout.layout"], { cwd: dir });
  assert.equal(lint.status, 1, `${name}: check exits 2 on this contract, so lint must report it\n${lint.stdout}${lint.stderr}`);
  assert.match(lint.stdout, /^ERROR /m, `${name}: lint must report an ERROR, not only warnings\n${lint.stdout}`);
  const drawn = run(["render", "layout.layout"], { cwd: dir });
  assert.equal(drawn.status, 2, `${name}: check exits 2 on this contract, so render must refuse it\n${drawn.stdout}`);
}

// A bad OPTION VALUE is the same failure wearing different clothes: a typo quietly
// accepted turns the run into a matcher that reports nothing and exits 0. Every one
// runs with --format=json, the path that never reaches the renderer — which is where
// the validation used to live, so --format=text refused these and --format=json did
// not.
for (const bad of ["--filter=eror", "--filter=error:banana", "--as=banana", "--style=banana", "--color=banana", "--filter", "--config", "--config=", "--filter="]) {
  const bogus = run([".", bad, "--format=json"]);
  assert.equal(bogus.status, 2, `layout . ${bad} --format=json must exit 2, got ${bogus.status}\n${bogus.stdout}`);
  assert.equal(bogus.stdout, "", `layout . ${bad} --format=json prints nothing on stdout`);
}

// `render` must not hand findings JSON to the CONTRACT pretty-printer, which parses
// anything and would echo a report full of errors back at exit 0. Each of these is a
// shape a real tool emits; the last is the control, a contract whose first line opens
// with `[` and must still be drawn as a contract.
for (const [input, expected] of [
  ['[{"level":"error","path":"a","message":"x"}]', 2],
  ['{"findings":[{"level":"error","message":"x"}]}', 2],
  ['{"itms":[{"level":"error","path":"a"}]}', 2],
  ['{"items": oops}', 2],
  ['{"items":[{"level":"error","path":"a","message":"x"}]}', 1],
  ["[id].tsx\n", 0],
]) {
  const drawn = run(["render", "-"], { input });
  assert.equal(drawn.status, expected, `layout render - over ${input} must exit ${expected}, got ${drawn.status}\n${drawn.stdout}${drawn.stderr}`);
}

// A bare word the CLI cannot use is a typo, and a typo quietly dropped is a run that
// checked something other than what was asked for.
for (const args of [[".", "strict"], [""], ["banana"], ["render", "--example=bogus"]]) {
  const typo = run(args);
  assert.equal(typo.status, 2, `layout ${args.map((a) => JSON.stringify(a)).join(" ")} must exit 2, got ${typo.status}\n${typo.stdout}`);
  assert.equal(typo.stdout, "", "and print nothing on stdout");
}

// Which contract a bare `layout .` reads. A fixture cannot ask this — the loop above
// always passes `--config`. Without a `repo.layout`, discovery used to sort the
// `*.layout` files and take the alphabetically first in silence, so a directory
// holding a draft beside the real contract could be checked against the draft, with a
// report that looked exactly like a report about the right file.
const discovery = fs.mkdtempSync(path.join(os.tmpdir(), "layout-discovery-"));
fs.mkdirSync(path.join(discovery, "src"));
fs.writeFileSync(path.join(discovery, "src/index.js"), "");
const contract = "src/                                   # Code\n  {}\n";
const bare = (where) => run(["."], { cwd: where });

fs.writeFileSync(path.join(discovery, "draft.layout"), contract);
assert.equal(bare(discovery).status, 1, "one *.layout under any name is the contract");

fs.writeFileSync(path.join(discovery, "other.layout"), contract);
const ambiguous = bare(discovery);
assert.equal(ambiguous.status, 2, `two contracts and no repo.layout must be refused\n${ambiguous.stdout}`);
assert.match(ambiguous.stderr, /More than one contract/, ambiguous.stderr);
assert.match(ambiguous.stderr, /draft\.layout, other\.layout/, "and must name what it found");

// The names it lists come off the disk, so they get the same escaping every other
// name in a message gets: `evil\n… .layout` would otherwise forge a line in the
// middle of the diagnostic.
fs.writeFileSync(path.join(discovery, "evil\n. Everything is fine.layout"), contract);
const forged = bare(discovery);
assert.equal(forged.status, 2, forged.stdout);
assert.match(forged.stderr, /evil\\n\. Everything is fine\.layout/, forged.stderr);
assert.equal(forged.stderr.split("\n").length, 3, `the diagnostic is two lines and a trailing newline\n${forged.stderr}`);
fs.rmSync(path.join(discovery, "evil\n. Everything is fine.layout"));

fs.writeFileSync(path.join(discovery, "repo.layout"), contract);
assert.equal(bare(discovery).status, 1, "repo.layout wins outright, however many others sit beside it");
fs.rmSync(discovery, { recursive: true, force: true });

console.log(JSON.stringify({ level: "PASS", code: "EXIT_CODES_OK", fixtures: count }));
