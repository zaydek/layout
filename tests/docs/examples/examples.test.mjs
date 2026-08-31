#!/usr/bin/env node
// Every ```layout block in the docs is real layout source, and this compiles all of them.
//
// Documentation examples rot silently: the grammar moves, the prose gets updated, and a
// four-line snippet three sections down goes on teaching a spelling the tool no longer
// accepts. That is exactly what happened to the case rules — the docs described them as
// "still accepted" for as long as somebody remembered to edit that sentence.
//
// So the fence itself is the contract. ```layout means "this compiles"; ```text means
// "this is a legend, a table or terminal output, and nothing checks it". A block that
// cannot resolve fails here with its file and line, the same way `layout check` would
// exit 2 on it.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkLayout } from "../../../src/lib/checker.mjs";
import { OPTIONS } from "../../../src/lib/help.mjs";
import { compilePattern } from "../../../src/lib/scan.mjs";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "../../..");

const DOCS = ["README.md"];

// An empty directory, so the run reaches the contract and nothing else. checkLayout
// validates every definition and compiles every rule BEFORE it reads the tree, which is
// the property being leaned on here: a broken contract throws no matter what is on disk.
const bin = path.join(repoRoot, "src/layout.mjs");

const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "layout-docs-"));

function blocks(relative, fence = "```layout") {
  const lines = fs.readFileSync(path.join(repoRoot, relative), "utf8").split("\n");
  const found = [];
  let open = null;
  for (const [index, line] of lines.entries()) {
    if (open === null) {
      if (line.startsWith(fence)) open = { line: index + 1, body: [] };
      continue;
    }
    if (line.startsWith("```")) {
      found.push({ file: relative, line: open.line, source: open.body.join("\n") });
      open = null;
      continue;
    }
    open.body.push(line);
  }
  assert.equal(open, null, `${relative}: unterminated \`\`\`layout block`);
  return found;
}

let count = 0;
const seen = [];
for (const relative of DOCS) {
  for (const block of blocks(relative)) {
    const where = `${block.file}:${block.line}`;
    assert(block.source.trim(), `${where}: empty \`\`\`layout block`);
    try {
      checkLayout({ root: emptyRoot, layoutSource: block.source });
    } catch (error) {
      assert.fail(`${where}: this documented example does not compile — ${error.message}`);
    }
    // And every one is well-formed by this tool's own house style. The page argues
    // that a directory's comment is the point, and then showed two contracts whose
    // directories had none — a reader copying either gets a warning from the tool
    // the page is teaching.
    const linted = spawnSync(process.execPath, [bin, "lint", "-", "--strict"], {
      cwd: repoRoot, input: block.source, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" },
    });
    assert.equal(linted.status, 0, `${where}: this documented contract does not lint clean under --strict\n${linted.stdout}`);
    seen.push(where);
    count += 1;
  }
}

// A docs test that silently checks nothing is worse than no docs test: it reports green
// while every example rots. Pin the floor so deleting the fences fails loudly.
assert(count >= 4, `expected at least 4 documented layout examples, found ${count} (${seen.join(", ")})`);

// A ```layout block must not teach the dead colon spelling — case rules are not
// syntax, and a compiling example carrying one would say otherwise.
for (const relative of DOCS) {
  for (const block of blocks(relative)) {
    for (const dead of [":kebab-case", ":snake_case", ":PascalCase"]) {
      assert(
        !block.source.includes(dead),
        `${relative}:${block.line}: a compiling example must not carry the dead spelling "${dead}"`,
      );
    }
  }
}


// The Layout Example in the README is not a paraphrase of this repo's contract, it IS the
// contract — the same bytes `layout .` reads. A hand-copied example drifts the moment the
// real file moves, and the reader has no way to tell: the drifted copy still compiles, so
// the docs test above would pass while the section teaches a tree nothing checks. (It had
// drifted: the copy omitted the `{}` outlet under `?fixtures/` and carried an entry in a
// spelling repo.layout had already moved off.)
const readmeExample = blocks("README.md").find((block) => block.source.includes("CLAUDE.md -> AGENTS.md"));
assert(readmeExample, "README.md: the Layout Example block is gone");
assert.equal(
  readmeExample.source.trim(),
  fs.readFileSync(path.join(repoRoot, "repo.layout"), "utf8").trim(),
  "README.md's Layout Example has drifted from repo.layout — it claims to be that file verbatim",
);

function run(cwd, args) {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" },
  });
  return `${result.stdout}${result.stderr}`.trimEnd();
}

// The syntax table is the reference for the whole notation, and it is a second
// listing of a grammar scan.mjs also spells out in its header — so a form could be
// documented that the grammar rejects, or the other way round, and nothing would
// say. Every spelling in the left column that carries a slot is compiled here.
const syntax = blocks("README.md", "```text").find((b) => b.source.includes("Symlink A must point at B"));
assert(syntax, "README.md: the syntax table is gone");
const definitions = Object.assign(Object.create(null), { name: { value: "/[a-z]+/", line: 1 } });
let forms = 0;
for (const row of syntax.source.split("\n")) {
  const spelling = row.split(/ {2,}/)[0];
  if (!spelling?.includes("{") || spelling.startsWith("#")) continue;
  const rule = spelling.replace(/^\?/, "");
  if (rule === "{}") continue; // the outlet is its own node type, never compiled
  try {
    compilePattern(rule, definitions);
  } catch (error) {
    assert.fail(`README.md's syntax table documents "${spelling}", which the grammar refuses — ${error.message}`);
  }
  forms += 1;
}
assert(forms >= 6, `expected at least 6 slot forms in the syntax table, found ${forms}`);

// ── The README's terminal output, run ────────────────────────────────────────
// The tree at the top of that page is not an illustration, it is what the tool
// prints. The compile pass above skips ```text on purpose, so nothing read it at
// all: the wording, the glyphs and the comment column could all move and the front
// page would go on claiming otherwise. So it is RUN, and diffed byte for byte
// against the real CLI.
function findText(marker, what) {
  const block = blocks("README.md", "```text").find((b) => b.source.startsWith(marker));
  assert(block, `README.md: the ${what} block is gone (nothing starts with ${JSON.stringify(marker)})`);
  return block;
}

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "layout-readme-"));

// The ordinary-project contract is the one a reader is most likely to copy, and the
// page makes two promises about it: a conforming tree exits 0, and one stray file
// exits 1 naming it. Both are run.
const web = path.join(sandbox, "web");
for (const dir of ["public", "src/components", "src/utils", "tests"]) fs.mkdirSync(path.join(web, dir), { recursive: true });
// Found by a line only IT has: the starter contract earlier on the page also opens
// with `package.json`, and `startsWith` quietly picked that one instead.
const ordinary = blocks("README.md").find((b) => b.source.includes("{/[A-Z][A-Za-z]*/}.tsx"));
assert(ordinary, "README.md: the ordinary-project contract is gone");
fs.writeFileSync(path.join(web, "repo.layout"), ordinary.source);
// A real package.json, because Node's own module bootstrap reads the nearest one
// and throws on a malformed file before layout gets a turn.
fs.writeFileSync(path.join(web, "package.json"), '{"name":"web","version":"1.0.0"}\n');
for (const file of ["README.md", "package-lock.json", "public/logo.png", "src/index.ts", "src/components/Button.tsx", "src/utils/format.ts", "tests/index.test.ts"]) {
  fs.writeFileSync(path.join(web, file), "");
}
assert.equal(spawnSync(process.execPath, [bin, "."], { cwd: web, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } }).status, 0,
  "README.md's ordinary-project contract must exit 0 over a tree that conforms");
fs.writeFileSync(path.join(web, "src/components/helpers.ts"), "");
const strayRun = spawnSync(process.execPath, [bin, ".", "--filter=error"], { cwd: web, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
assert.equal(strayRun.status, 1, "one stray file must exit 1");
assert.match(strayRun.stdout, /helpers\.ts/, "and must name the file");
fs.rmSync(path.join(web, "src/components/helpers.ts"));

// The casing rule the prose claims is the point of that regex. The page shipped
// `{:/[A-Z][A-Za-z]*/}` — a colon out of place — which is a slot NAMED
// `/[A-Z][A-Za-z]*/`, matching any segment: the strictest-looking rule on the page
// enforced nothing. Nothing here would have caught it, because it compiles, and the
// stray-file case above fails on the extension rather than on the casing.
fs.writeFileSync(path.join(web, "src/components/lowercase.tsx"), "");
const casingRun = spawnSync(process.execPath, [bin, ".", "--filter=error"], { cwd: web, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
assert.equal(casingRun.status, 1, "a lowercase component name must exit 1 — that regex is the rule");
assert.match(casingRun.stdout, /lowercase\.tsx/, "and must name it");

// The findings-JSON example is executable too: it is the input format the page
// tells another tool to emit.
const findings = blocks("README.md", "```json").find((b) => b.source.includes('"items"'));
assert(findings, "README.md: the findings JSON example is gone");
const drawn = spawnSync(process.execPath, [bin, "render", "-"], {
  cwd: repoRoot, input: findings.source, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" },
});
assert.equal(drawn.status, 0, drawn.stderr);
assert.equal(drawn.stdout.trimEnd(), findText("! docs/", "findings output").source.trimEnd(),
  "README.md's findings example does not draw what the page shows");

// Its contract is the shape of the tree it draws, so both are written out here:
// this is the one example on the page with no file behind it.
const hero = path.join(sandbox, "hero");
for (const dir of ["src/lib", "tests/checker", "tests/parser"]) fs.mkdirSync(path.join(hero, dir), { recursive: true });
fs.writeFileSync(path.join(hero, "repo.layout"), [
  "repo.layout", "src/", "  layout.mjs", "  lib/", "    {:module}.mjs",
  "tests/", "  {:slug}/", "    {:slug}.test.mjs", "",
].join("\n"));
for (const file of ["src/layout.mjs", "src/lib/parser.mjs", "tests/checker/checker.test.mjs", "tests/parser/parser.test.mjs", "tests/parser/notes.md"]) {
  fs.writeFileSync(path.join(hero, file), "");
}
assert.equal(run(hero, ["."]), findText("✓ repo.layout", "hero output").source.trimEnd(),
  "README.md's opening tree is not what `layout .` prints");

// The Traps section makes precise claims about what a notation MEANS, and precise
// is the same as checkable. They were prose: every other example on the page is
// compiled, linted or executed, and the section warning readers about the notation
// that looks like a rule and is not was the one part taken on trust.
//
// Each case is a contract, a tree, and the exit code the page promises. The contract
// is written OUTSIDE the tree and passed with `--config`, because a `repo.layout`
// sitting in the tree is itself an entry no rule here names — the run would exit 1
// on the contract file and every claim would look confirmed for the wrong reason.
// `{}` sits under the rules that should not fire for the same reason: a rule that
// enforces nothing must not be rescued by some other file failing the run.
// Line breaks in the prose are wrapping, not meaning, so the sentences below are
// matched against the page with its whitespace collapsed. Otherwise re-wrapping a
// paragraph — which changes nothing — would fail every claim inside it.
const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8").replace(/\s+/g, " ");
const traps = path.join(sandbox, "traps");
const trapContract = path.join(sandbox, "trap.layout");
// Every fence on the page opens and closes. An unclosed one swallows the rest of
// the document on GitHub — the page still renders, as one long code block — and
// nothing here would notice, because the block reader simply stops finding blocks.
{
  const lines = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8").split("\n");
  let open = null;
  for (const [index, line] of lines.entries()) {
    const fence = /^```(\w*)$/.exec(line);
    if (!fence) continue;
    if (open === null) { open = { line: index + 1, lang: fence[1] }; continue; }
    assert.equal(fence[1], "", `README.md:${index + 1}: a closing fence carries a language`);
    open = null;
  }
  assert.equal(open, null, `README.md:${open?.line}: this fence is never closed`);
}

// The page links to its own sections — `[Syntax](#syntax)`, `[Traps](#traps)` —
// and GitHub resolves those against the headings. Rename a heading and the link
// still renders, still looks like a link, and goes nowhere. Headings are read
// outside fences, because the syntax table holds a line beginning with `#` that is
// a legend entry rather than a heading.
{
  const raw = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
  const headings = new Set();
  let fenced = false;
  for (const line of raw.split("\n")) {
    if (/^```/.test(line)) { fenced = !fenced; continue; }
    if (fenced) continue;
    const heading = /^#{1,6} (.+)$/.exec(line);
    if (heading) headings.add(heading[1].toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-"));
  }
  const links = [...raw.matchAll(/\]\(#([a-z0-9-]+)\)/g)].map((m) => m[1]);
  assert(links.length >= 3, `expected the README to link to its own sections; found ${links.length}`);
  for (const link of links) {
    assert(headings.has(link), `README.md links to #${link}, and no heading on the page has that anchor`);
  }
}

// Every `layout` invocation on the page is a command the CLI would accept. There
// are three and they are the ones a reader pastes into a terminal or a workflow —
// the install line, the local one, and the CI line. Checked against `OPTIONS`, the
// table `layout.mjs` parses, exactly as the help pages' `%` examples are.
//
// Read from the RAW file, and only from inside a ```sh or ```yaml fence, which is
// where a command lives. The first version of this ran over the whitespace-collapsed
// text and matched prose and the `layout.mjs` in the tree at the top of the page; the
// second matched the usage LEGEND, whose lines are `layout [check] [path]` followed
// by a description. Both "passed". A gate that matches the wrong thing is worse than
// no gate, because it reads like one.
const COMMANDS = new Set(["check", "lint", "render", "help"]);
let invocations = 0;
let fence = null;
for (const line of fs.readFileSync(path.join(repoRoot, "README.md"), "utf8").split("\n")) {
  const opens = /^```(\w*)$/.exec(line);
  if (opens) { fence = fence === null ? opens[1] : null; continue; }
  if (fence !== "sh" && fence !== "yaml") continue;
  const command = /^(?:- run: )?(?:npx (?:--yes )?(?:github:zaydek\/)?)?layout(?: |$)(.*)$/.exec(line.trim());
  if (!command) continue;
  const args = command[1].trim().split(/\s+/).filter(Boolean);
  const verb = COMMANDS.has(args[0]) ? args[0] : "check";
  for (const arg of args) {
    if (!arg.startsWith("--")) continue;
    const name = `--${arg.slice(2).split("=")[0]}`;
    assert(OPTIONS[name], `README.md documents "layout ${args.join(" ")}", and ${name} is not an option`);
    assert(OPTIONS[name].commands.includes(verb),
      `README.md documents "layout ${args.join(" ")}", and ${name} is not a ${verb} option`);
  }
  invocations += 1;
}
assert.equal(invocations, 3, `the README shows three layout invocations in sh or yaml fences; this found ${invocations}`);

// `says` is the sentence on the page this case executes. Asserting it is still
// there ties the two together: reword or delete the trap and this fails, rather
// than leaving an executable claim about a page that no longer makes it.
for (const [says, contract, tree, status, mustName] of [
  ["`src/` on its own accepts `src/junk.exe`", "src/\n", ["src/junk.exe"], 0, null],
  ["`{name}` matches the literal text `name`", "{name}\n", ["name"], 0, null],
  ["**A bare `{name}` is a one-value enum, not a named slot.**", "{name}\n", ["other"], 1, "{name}"],
  ["require a file named literally `kebab-case` or `PascalCase`", "{kebab-case}\n{}\n", ["kebab-case", "some-file"], 0, null],
  ["`{kebab-case}` and `{:x;PascalCase}` both compile", "{:x;PascalCase}\n{}\n", ["PascalCase", "Other"], 0, null],
  ["a file named `docs` does not satisfy `docs/`", "docs/\n", ["docs"], 1, "Expected a directory"],
  ["An unlisted `.env` is not \"unexpected\", it is unseen.", "keep.md\n", ["keep.md", ".env"], 0, null],
  ["Name the dot-files you care about", ".env\nkeep.md\n", ["keep.md", ".env"], 0, null],
  ["it is not a request for `.hidden.ts`", "{:route}.ts\n", [".hidden.ts"], 1, "Required entry missing"],
  ["**A rule names one entry, never a path.**", "docs/api.md\n", ["docs/api.md"], 2, null],
  ["`{:v}.a` and `{:v}.b` written as siblings accept `x.a` and `y.b`",
    "{:v}.a\n{:v}.b\n", ["x.a", "y.b"], 0, null],
  ["`{:v}/` with `{:v}.a` and `{:v}.b` inside it — and the binding holds",
    "{:v}/\n  {:v}.a\n  {:v}.b\n", ["x/x.a", "x/y.b"], 1, "y.b"],
  ["A link satisfies a plain file rule", "keep.md\n{:x}\n", ["keep.md", "other"], 0, null],
  // The starter contract from Install, run against a tree it describes. It is
  // already compiled and linted as a fenced block; this is the other half — that
  // the three lines a reader copies first actually pass over the shape they name.
  ["Start small and grow it",
    "package.json                           # Name, scripts, dependencies\nrepo.layout                            # This file\nsrc/                                   # Application code\n  {}\n",
    ["package.json", "repo.layout", "src/index.js"], 0, null],
  ["Name the contract file itself, or the first run will tell you it is unexpected",
    "package.json                           # Name, scripts, dependencies\nsrc/                                   # Application code\n  {}\n",
    ["package.json", "repo.layout", "src/index.js"], 1, "repo.layout"],
  ["A contract is legal as soon as it names one thing", "package.json\n", ["package.json"], 0, null],
  ["or a `{:s}` whose `s` a parent already bound",
    "{:s}/\n  {:s}/\n    keep.md\n  ?{/[a-z]+/}/\n    {}\n", ["foo/foo/keep.md"], 0, null],
  ["The same goes for a symlink's source", "docs/ -> ../x\n", ["docs/api.md"], 2, null],
  // Limits: the binding gap. A repeated `{:name}` is matched after the regex has
  // committed to a greedy split, so this is a FAIL over a tree the contract
  // describes. It is the page's own admission, and an admission is a claim.
  ["so `{:v}a{:v}` rejects `aaaaa`", "{:v}a{:v}\n", ["aaaaa"], 1, "Required entry missing"],
]) {
  assert(readme.includes(says), `README.md no longer says ${JSON.stringify(says)}, and a test below executes it`);
  fs.rmSync(traps, { recursive: true, force: true });
  fs.mkdirSync(traps, { recursive: true });
  fs.writeFileSync(trapContract, contract);
  for (const file of tree) {
    fs.mkdirSync(path.join(traps, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(traps, file), "");
  }
  const trapped = spawnSync(process.execPath, [bin, ".", "--config", trapContract, "--filter=error"], {
    cwd: traps, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" },
  });
  assert.equal(trapped.status, status, `README.md: ${says}\n${contract}${trapped.stdout}${trapped.stderr}`);
  if (mustName) assert.match(trapped.stdout, new RegExp(mustName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `README.md: ${says} — and must name it`);
}

// The one spelling the page says is REFUSED, which is a different promise: it is a
// contract error, exit 2, not a rule that quietly matches nothing.
fs.writeFileSync(trapContract, "{:x:PascalCase}\n");
const refused = spawnSync(process.execPath, [bin, ".", "--config", trapContract], { cwd: traps, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
assert(readme.includes("Only the colon spelling `{:x:PascalCase}` is refused."), "README.md no longer promises that spelling is refused");
assert.equal(refused.status, 2, "README.md Traps: only the colon spelling {:x:PascalCase} is refused");
assert.match(refused.stderr, /no rule after the colon/, refused.stderr);

// Limits: the same-tier race. It is the one claim on the page where the ORDER two
// rules are written in changes the verdict rather than the message, so both orders
// are run over one tree — running only the order that passes would confirm nothing,
// and running only the order that fails would not show that the other one differs.
assert(
  readme.includes("`{:a}/` with a `{}` child above a childless `?{:d}/` exits 0; the same two lines swapped exit 1"),
  "README.md no longer documents the same-tier race, and this executes it",
);
const race = path.join(sandbox, "race");
fs.mkdirSync(path.join(race, "dir"), { recursive: true });
fs.writeFileSync(path.join(race, "dir/needed.md"), "");
const raced = (contract) => {
  fs.writeFileSync(trapContract, contract);
  return spawnSync(process.execPath, [bin, ".", "--config", trapContract, "--filter=error"], {
    cwd: race, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" },
  });
};
assert.equal(raced("{:a}/\n  {}\n?{:d}/\n").status, 0,
  "README.md Limits: the rule that says more claims the directory, and the optional one is then vacuously true");
const lost = raced("?{:d}/\n{:a}/\n  {}\n");
assert.equal(lost.status, 1, "README.md Limits: the same two lines swapped exit 1");
assert.match(lost.stdout, /Nothing left to match/, "README.md Limits: and the loser names what beat it");

// The `--ignore` paragraph in Limits is the only place the glob semantics are
// written down, and it draws a distinction a reader has to trust: `vendor/**`
// EMPTIES the directory and still reports it, `vendor` skips it outright — which
// turns it into `Required entry missing` when a rule wanted it. The two spellings
// differ by two characters and give opposite answers about the same tree, so the
// sentence is worth executing rather than believing. Tied to the sentence as well
// as to the behaviour: a page that stops promising this should fail here too.
// Whitespace-collapsed, because the claim is the sentence and not the column it
// happens to wrap at — matching the raw text pins the line breaks too, and a
// reflowed paragraph would fail here while still promising exactly this.
const said = readme.replace(/\s+/g, " ");
assert(
  said.includes("So `--ignore 'vendor/**'` empties `vendor/` but still reports `vendor` itself"),
  "README.md no longer documents what --ignore 'vendor/**' does",
);
assert(
  said.includes("`--ignore vendor` skips the tree outright, and so does `--ignore vendor/`"),
  "README.md no longer promises --ignore vendor and --ignore vendor/ are the same",
);
const ig = path.join(sandbox, "ig");
fs.mkdirSync(path.join(ig, "vendor/deep"), { recursive: true });
for (const file of ["a.md", "note.txt", "vendor/x.js", "vendor/deep/y.js"]) fs.writeFileSync(path.join(ig, file), "");
fs.writeFileSync(path.join(ig, "repo.layout"), "a.md\nvendor/\n  {}\n");
const ignoring = (glob) => JSON.parse(spawnSync(process.execPath, [bin, ".", "--format=json", "--ignore", glob], {
  cwd: ig, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" },
}).stdout).items;
const emptied = ignoring("vendor/**");
assert.deepEqual(
  emptied.filter((item) => item.path.startsWith("vendor")).map((item) => [item.path, item.level, item.message]),
  [["vendor", "ok", ""]],
  "README.md Limits: --ignore 'vendor/**' empties vendor/ and still reports vendor itself",
);
const skipped = ignoring("vendor");
assert.deepEqual(
  skipped.filter((item) => item.path.startsWith("vendor")).map((item) => [item.path, item.level, item.message]),
  [["vendor", "error", "Required entry missing"]],
  "README.md Limits: --ignore vendor skips the tree outright, so a rule that wanted it reports it missing",
);
assert.deepEqual(ignoring("vendor/"), skipped, "README.md Limits: --ignore vendor/ does what --ignore vendor does");

fs.rmSync(sandbox, { recursive: true, force: true });
fs.rmSync(emptyRoot, { recursive: true, force: true });
console.log(JSON.stringify({ level: "PASS", code: "DOC_EXAMPLES_OK", examples: count }));
