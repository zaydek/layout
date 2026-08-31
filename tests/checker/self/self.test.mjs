#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkLayout } from "../../../src/lib/checker.mjs";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "../../..");
const layoutSource = fs.readFileSync(path.join(repoRoot, "repo.layout"), "utf8");
const actual = checkLayout({ root: repoRoot, layoutSource });

assert.equal(actual.level, "OK", JSON.stringify(actual, null, 2));

const bin = path.join(repoRoot, "src/layout.mjs");
const defaultCheck = spawnSync(process.execPath, [bin, ".", "--filter=error", "--format=text"], {
  cwd: repoRoot,
  encoding: "utf8",
  env: { ...process.env, NO_COLOR: "1" },
});
assert.equal(defaultCheck.status, 0, defaultCheck.stderr);
assert.equal(defaultCheck.stdout, "");

const configCheck = spawnSync(process.execPath, [bin, "--config=repo.layout", "--filter=error", "--format=text"], {
  cwd: repoRoot,
  encoding: "utf8",
  env: { ...process.env, NO_COLOR: "1" },
});
assert.equal(configCheck.status, 0, configCheck.stderr);
assert.equal(configCheck.stdout, "");

// And the third spelling: the contract arrives on stdin. `--config -` is documented
// on the check page with its own example, `cat draft.layout | layout check . --config -`,
// and no suite ran it — the `-` path was proven for `lint` and `render` only, so the
// one command most likely to be handed a contract through a pipe was the one command
// whose pipe was never opened. Compared against the file spelling rather than asserted
// to be empty: the claim is that WHERE the contract came from changes nothing about
// the report, which an exit code alone does not say.
const stdinConfig = spawnSync(process.execPath, [bin, ".", "--config", "-", "--format=json"], {
  cwd: repoRoot,
  input: layoutSource,
  encoding: "utf8",
  env: { ...process.env, NO_COLOR: "1" },
});
assert.equal(stdinConfig.status, 0, stdinConfig.stderr);
const fileConfig = spawnSync(process.execPath, [bin, ".", "--config", "repo.layout", "--format=json"], {
  cwd: repoRoot,
  encoding: "utf8",
  env: { ...process.env, NO_COLOR: "1" },
});
assert.equal(stdinConfig.stdout, fileConfig.stdout, "a contract read from stdin gives the same report as the same contract read from a file");

const layoutView = spawnSync(process.execPath, [bin, ".", "--as=schema", "--format=text"], {
  cwd: repoRoot,
  encoding: "utf8",
  env: { ...process.env, NO_COLOR: "1" },
});
assert.equal(layoutView.status, 0, layoutView.stderr);
assert.match(layoutView.stdout, /\{:module\}\.mjs/);
assert.match(layoutView.stdout, /repo\.layout/);

const jsonColor = spawnSync(process.execPath, [bin, "render", "--example=stress", "--format=json", "--color=on"], {
  cwd: repoRoot,
  encoding: "utf8",
  env: { ...process.env, NO_COLOR: "1" },
});
assert.equal(jsonColor.status, 0, jsonColor.stderr);
assert.equal(Array.isArray(JSON.parse(jsonColor.stdout).items), true);
assert.doesNotMatch(jsonColor.stdout, /"rendered"/);

// An option belongs to the commands that READ it. `--example` is render's; check
// used to accept it and ignore it, which looked like a rendered example and was a
// checked tree. And a leading flag is not a command word: `layout --filter=error .`
// is the same run as `layout . --filter=error`.
const wrongCommand = spawnSync(process.execPath, [bin, "--example", "--filter=warn,error"], {
  cwd: repoRoot,
  encoding: "utf8",
  env: { ...process.env, NO_COLOR: "1" },
});
assert.equal(wrongCommand.status, 2);
assert.match(wrongCommand.stderr, /--example is not a check option/);

const leadingFlag = spawnSync(process.execPath, [bin, "--filter=error", "."], {
  cwd: repoRoot,
  encoding: "utf8",
  env: { ...process.env, NO_COLOR: "1" },
});
assert.equal(leadingFlag.status, 0, leadingFlag.stderr);
assert.equal(leadingFlag.stdout, "", "a clean check prints nothing under --filter=error");

// The contract's own house style. AGENTS.md's biggest rule — every directory entry
// carries a trailing `#` comment saying why the slot exists — is enforced by
// exactly this command, and it told the reader to run it while no suite did. The
// round trip below lints render's OUTPUT, which is re-aligned on the way through,
// so an alignment fault in the file itself was invisible to it.
const linted = spawnSync(process.execPath, [bin, "lint", "repo.layout", "--strict"], {
  cwd: repoRoot,
  encoding: "utf8",
  env: { ...process.env, NO_COLOR: "1" },
});
assert.equal(linted.status, 0, `repo.layout must lint clean under --strict\n${linted.stdout}${linted.stderr}`);

// What `render` emits, `lint` must accept. Both align trailing comments, and the
// column was written out twice until one of them drifted would have been the only
// way to find out. Piping one into the other is that check.
const rendered = spawnSync(process.execPath, [bin, "render", "repo.layout"], {
  cwd: repoRoot,
  encoding: "utf8",
  env: { ...process.env, NO_COLOR: "1" },
});
assert.equal(rendered.status, 0, rendered.stderr);
const relinted = spawnSync(process.execPath, [bin, "lint", "-", "--strict"], {
  cwd: repoRoot,
  input: rendered.stdout,
  encoding: "utf8",
  env: { ...process.env, NO_COLOR: "1" },
});
assert.equal(relinted.status, 0, relinted.stdout + relinted.stderr);

// repo.layout carries no `$name:` definitions, so the round trip above never
// exercised one — and render was dropping every definition it was given, printing
// the entries that USE a `{$name}` and none of the lines that make it resolve. The
// output was a contract that exits 2, over an input that checks clean.
const hoisted = "$date: /[0-9]+/                        # Dates are digits\n\nincidents/                             # Postmortems\n  {$date}.md\n";
const drawn = spawnSync(process.execPath, [bin, "render", "-"], {
  cwd: repoRoot, input: hoisted, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" },
});
assert.equal(drawn.status, 0, drawn.stderr);
assert.equal(drawn.stdout, hoisted, "render must reproduce a contract's definitions, comments included");
const drawnLint = spawnSync(process.execPath, [bin, "lint", "-", "--strict"], {
  cwd: repoRoot, input: drawn.stdout, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" },
});
assert.equal(drawnLint.status, 0, drawnLint.stdout + drawnLint.stderr);

function suiteFiles() {
  const found = [];
  const walk = (relative) => {
    for (const entry of fs.readdirSync(path.join(repoRoot, relative)).sort()) {
      const next = `${relative}/${entry}`;
      if (fs.statSync(path.join(repoRoot, next)).isDirectory()) walk(next);
      else if (entry.endsWith(".mjs")) found.push(next);
    }
  };
  walk("tests");
  return found;
}

// Nothing the tool prints may depend on the ambient locale. `localeCompare` reads
// it, and one call was enough to reorder a whole report under `LC_ALL=sv_SE`; the
// rule is that no call gets to try, which is checkable by reading the source rather
// than by running the suite under every locale on earth.
for (const relative of ["layout.mjs", ...fs.readdirSync(path.join(repoRoot, "src/lib")).sort().map((n) => `lib/${n}`)]) {
  const text = fs.readFileSync(path.join(repoRoot, "src", relative), "utf8");
  for (const [index, line] of text.split("\n").entries()) {
    if (line.trimStart().startsWith("//")) continue; // the comments explaining the rule
    assert.equal(line.includes("localeCompare"), false,
      `src/${relative}:${index + 1}: localeCompare reads the ambient locale, and report order may not\n${line.trim()}`);
  }
}

// The report says which tree it is about. `checkLayout` hard-coded `"root": "."`,
// so `layout check src --format=json` answered `"."` about a run over `src` — the
// one field whose whole job is naming the tree, naming the wrong one.
const elsewhere = spawnSync(process.execPath, [bin, "src", "--config", "repo.layout", "--format=json"], {
  cwd: repoRoot, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" },
});
assert.equal(JSON.parse(elsewhere.stdout).root, "src", "a report names the tree it is about");
// A reader that leaves. `layout . | head` closes the pipe part-way through, and
// every remaining write fails with EPIPE — which used to `process.exit(0)` and
// throw the verdict away, so a failing run piped into `head` reported success. The
// run finishes and keeps its exit code now.
//
// The report has to be big enough that writing is still in flight when the reader
// goes: the first version of this gate used the repo's own report, which fits in one
// pipe buffer, so no EPIPE ever fired and it passed with the bug restored. 5,000
// findings do not fit. They are built here rather than on disk — this is about the
// pipe, not the tree.
const flood = JSON.stringify({
  items: Array.from({ length: 5000 }, (_, index) => ({ level: "error", path: `src/file${index}.ts`, message: "Boom" })),
});
const early = spawn(process.execPath, [bin, "render", "-", "--filter=error"], {
  cwd: repoRoot, stdio: ["pipe", "pipe", "ignore"], env: { ...process.env, NO_COLOR: "1" },
});
early.stdin.end(flood);
early.stdout.once("data", () => early.stdout.destroy());
const leftEarly = await new Promise((resolve) => early.on("close", resolve));
assert.equal(leftEarly, 1, "a failing run keeps its exit code when the reader closes the pipe");

// Captured through a PIPE, which is the whole point of this one: stdout to a pipe
// is asynchronous, and `process.exit` beside a `console.log` cuts the buffer where
// it stands. This report is ~15KB and came back 8190 bytes long and unparseable to
// anything that captured it, while the same command redirected to a file was whole
// — invisible from a terminal, certain in CI. The CLI sets `process.exitCode` and
// lets the process end instead. `spawnSync` reads a pipe, so this assertion is the
// gate; the repo's report has to stay big enough to overflow one for it to be.
const here = spawnSync(process.execPath, [bin, ".", "--format=json"], {
  cwd: repoRoot, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" },
});
assert(here.stdout.length > 8192, `this gate needs a report larger than a pipe buffer; got ${here.stdout.length} bytes`);
const whole = JSON.parse(here.stdout);
assert.equal(whole.root, ".", "and the default target is still \".\"");
// Every row the library produced survived the pipe — compared against `actual`, the
// same run made in-process at the top of this file, so nothing here has to name a
// file that could move.
assert.equal(whole.items.length, actual.items.length, "a piped report must carry every row the check produced");

// The formatter claim, on the repo's own contract: `layout render repo.layout`
// reproduces `repo.layout` byte for byte. It used to drop every blank line and every
// standalone `#` comment — the parse tree had no record of either — so the command
// the README calls the formatter, run on the file it is most likely to be run on,
// deleted four blank lines from it. The round trip above only linted the output,
// and a file with its blank lines removed lints perfectly well.
const reprinted = spawnSync(process.execPath, [bin, "render", "repo.layout"], {
  cwd: repoRoot, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" },
});
assert.equal(reprinted.status, 0, reprinted.stderr);
assert.equal(reprinted.stdout, fs.readFileSync(path.join(repoRoot, "repo.layout"), "utf8"),
  "layout render repo.layout must reproduce repo.layout exactly");

// Every module says what it is on line one. repo.layout can require that a file
// EXISTS; only this can require that it introduces itself. The convention held by
// habit until three of the most-read files had quietly never had a header at all:
// checker and parser, found when this gate was written, and layout.mjs, which the
// gate itself missed at first because it only walked src/lib.
for (const relative of ["layout.mjs", ...fs.readdirSync(path.join(repoRoot, "src/lib")).sort().map((n) => `lib/${n}`)]) {
  const name = path.basename(relative);
  // layout.mjs opens with a shebang, so the header is the line after it.
  const lines = fs.readFileSync(path.join(repoRoot, "src", relative), "utf8").split("\n");
  const header = lines[0].startsWith("#!") ? lines[1] : lines[0];
  assert.equal(header.startsWith(`// ${name} — `), true, `src/${relative} must open with "// ${name} — <what it is>", got: ${header}`);
}

// `scan.mjs` opens with "Exports, in dependency order" and then lists them. That is
// a complete claim rather than a signature line — every other module's header names
// its one entry point — and it had already drifted: `UNICODE`, the flag every slot
// regex compiles with, was exported and not listed.
const scan = fs.readFileSync(path.join(repoRoot, "src/lib/scan.mjs"), "utf8");
assert.deepEqual(
  [...scan.split(/^import /m)[0].matchAll(/^\/\/ {3}([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]).sort(),
  [...scan.matchAll(/^export (?:const|function|class) ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]).sort(),
  "src/lib/scan.mjs: the header lists its exports, so the list and the exports must agree",
);

// And the other side of the same door: a name imported and never used. Moving the
// contract validation out of `checker.mjs` left two behind, and nothing noticed —
// the export gate only reads the module that DECLARES a name.
for (const relative of ["layout.mjs", ...fs.readdirSync(path.join(repoRoot, "src/lib")).sort().map((n) => `lib/${n}`)]) {
  const text = fs.readFileSync(path.join(repoRoot, "src", relative), "utf8");
  for (const line of text.split("\n")) {
    const imported = /^import \{([^}]*)\} from "[^"]*";$/.exec(line);
    if (!imported) continue;
    const body = text.replace(line, "");
    for (const name of imported[1].split(",").map((part) => part.trim())) {
      assert(new RegExp(`\\b${name}\\b`).test(body), `src/${relative} imports ${name} and never uses it`);
    }
  }
}

// An export nothing imports is a module offering a door onto a room it no longer
// has. `ansi.mjs` kept a `cyan` for months after the last caller went, and the only
// reason it was found is that someone read the file. Imports are matched by NAME out
// of the `import { … } from "./module.mjs"` lists, not by the name appearing
// somewhere in the text, so a mention in a comment does not keep an export alive.
const modules = fs.readdirSync(path.join(repoRoot, "src/lib")).sort().filter((name) => name.endsWith(".mjs"));
const sources = ["src/layout.mjs", ...modules.map((name) => `src/lib/${name}`), ...suiteFiles()]
  .map((relative) => fs.readFileSync(path.join(repoRoot, relative), "utf8"));
for (const name of modules) {
  const text = fs.readFileSync(path.join(repoRoot, "src/lib", name), "utf8");
  const exported = [...text.matchAll(/^export (?:const|function|async function|class) ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  for (const symbol of exported) {
    const imported = sources.some((source) => [...source.matchAll(/^import \{([^}]*)\} from "([^"]*)";$/gm)]
      .some(([, names, from]) => path.basename(from) === name && names.split(",").map((n) => n.trim()).includes(symbol)));
    assert.equal(imported, true, `src/lib/${name} exports ${symbol} and nothing imports it`);
  }
}

// The section rules inside a module are a ruler the eye reads down the file, so one
// a column short reads as a mistake in the file rather than in the rule. Six of
// seventeen had drifted, each by one column, because nothing measured them. Exactly
// 80 code points — not bytes: `─` is three of those, which is how they drifted.
for (const relative of ["layout.mjs", ...fs.readdirSync(path.join(repoRoot, "src/lib")).sort().map((n) => `lib/${n}`)]) {
  const lines = fs.readFileSync(path.join(repoRoot, "src", relative), "utf8").split("\n");
  for (const [index, line] of lines.entries()) {
    if (!line.startsWith("// ── ")) continue;
    assert.equal([...line].length, 80, `src/${relative}:${index + 1}: a section rule must be 80 columns wide\n${line}`);
    assert.equal(line.endsWith("─"), true, `src/${relative}:${index + 1}: a section rule must end in its rule\n${line}`);
  }
}

// The README's install line is `npx github:zaydek/layout .`, and nothing proved the
// package that reaches a consumer actually runs. It is not the repo: `files` narrows
// an install to `src/`, so a module reaching outside it — a helper left in `tests/`,
// a path assuming the repo layout — would break every install while every suite here
// passed. So the package is built, unpacked, and RUN, against a tree of its own.
const packDir = fs.mkdtempSync(path.join(os.tmpdir(), "layout-pack-"));
const packed = spawnSync("npm", ["pack", "--pack-destination", packDir], { cwd: repoRoot, encoding: "utf8" });
assert.equal(packed.status, 0, packed.stderr);
const tarball = fs.readdirSync(packDir).find((name) => name.endsWith(".tgz"));
assert(tarball, `npm pack produced no tarball: ${packed.stdout}`);
assert.equal(spawnSync("tar", ["-xzf", path.join(packDir, tarball), "-C", packDir], { encoding: "utf8" }).status, 0);

const shipped = fs.readdirSync(path.join(packDir, "package"), { recursive: true }).map(String);
assert(shipped.includes(path.join("src", "layout.mjs")), `the tarball has no CLI: ${shipped.join(", ")}`);
assert.equal(shipped.some((name) => name.startsWith("tests")), false,
  "an install carries the tool, not its test suite — `files` in package.json says so");

const consumer = path.join(packDir, "tree");
fs.mkdirSync(path.join(consumer, "src"), { recursive: true });
fs.writeFileSync(path.join(consumer, "src/index.js"), "");
fs.writeFileSync(path.join(consumer, "repo.layout"), "repo.layout                            # The contract\nsrc/                                   # Code\n  {}\n");
const installed = spawnSync(process.execPath, [path.join(packDir, "package/src/layout.mjs"), "."], {
  cwd: consumer, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" },
});
assert.equal(installed.status, 0, `the packaged CLI must run from its own files alone\n${installed.stdout}${installed.stderr}`);
fs.rmSync(packDir, { recursive: true, force: true });

// "No dependencies" is the README's headline install claim and the reason there is
// no lockfile, no build and no `npm install` step. A claim that load-bearing should
// not rest on nobody having added one.
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
  assert.equal(manifest[field], undefined, `package.json declares ${field}; layout ships with none, and the README says so`);
}

// A fixture that only works in the working tree is not a fixture. Git tracks no
// empty directory and no ignored file, so either one makes a suite pass here and
// fail from a clone — which is exactly what happened: two fixtures whose subject was
// an EMPTY directory arrived with no `fs/` at all, and one whose subject was a
// `.DS_Store` could never be committed, because `.gitignore` says so.
//
// Skipped without a .git, so a tarball download still runs the suite.
if (fs.existsSync(path.join(repoRoot, ".git"))) {
  const ignored = spawnSync("git", ["ls-files", "--others", "--ignored", "--exclude-standard", "--", "tests"], {
    cwd: repoRoot, encoding: "utf8",
  });
  assert.equal(ignored.stdout.trim(), "", "these files under tests/ are gitignored, so no clone has them");

  const dirs = spawnSync("find", ["tests", "-type", "d", "-empty"], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(dirs.stdout.trim(), "", "git tracks no empty directory, so no clone has these");

  // And every tracked name must be the name on disk, byte for byte. Git on macOS
  // rewrites a decomposed filename to its composed form on the way in — so a fixture
  // whose subject WAS that difference passed here and failed from a clone, with the
  // file present under a name that is not the one the case is about.
  const tracked = spawnSync("git", ["ls-files", "-z", "--", "tests"], { cwd: repoRoot, encoding: "utf8" });
  for (const file of tracked.stdout.split("\0").filter(Boolean)) {
    assert.equal(fs.existsSync(path.join(repoRoot, file)), true,
      `git tracks ${JSON.stringify(file)} but no file of that exact name is on disk — a name git rewrote on the way in`);
  }
}

// `layout check` on a SYMLINK to a directory. The CLI followed the link to decide
// it was a directory; the tree reader lstat'd it, saw a link rather than a
// directory, read no children, and reported every rule in the contract missing.
// A fault names the contract by a path the reader can actually use. The label was
// `path.relative(cwd, file)` unconditionally, so a contract outside the cwd — the
// normal case for a shared contract, or any absolute `--config` — was announced as
// `../../../../../../../var/folders/…/bad.layout:2:`. That is longer than the path
// the user typed, meaningless from any other directory, and a string that appears
// nowhere in their command. Inside the cwd it must STAY relative, because that is
// the compiler spelling an editor jumps to, so both directions are asserted.
const away = fs.mkdtempSync(path.join(os.tmpdir(), "layout-away-"));
fs.writeFileSync(path.join(away, "bad.layout"), "a\n   b\n");
fs.mkdirSync(path.join(away, "tree"), { recursive: true });
const abroad = spawnSync(process.execPath, [bin, path.join(away, "tree"), "--config", path.join(away, "bad.layout")], {
  cwd: repoRoot, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" },
});
assert.equal(abroad.status, 2, abroad.stdout);
assert.equal(
  abroad.stderr.trim(),
  `${path.join(away, "bad.layout")}:2: indentation must use two-space steps`,
  "a contract outside the cwd is named by its own path, not by a climb out of the cwd",
);
const athome = spawnSync(process.execPath, [bin, "tree", "--config", "bad.layout"], {
  cwd: away, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" },
});
assert.equal(
  athome.stderr.trim(),
  "bad.layout:2: indentation must use two-space steps",
  "a contract inside the cwd keeps the short relative name an editor can jump to",
);

// `layout help render` promises that "any tool that can emit a path and a severity
// gets layout's output for free". The strongest instance of that claim is layout's
// own output, and it was the one nobody ran: `--format=json` drawn back by `render -`
// must be the same bytes `--format=text` printed. If the two disagree the JSON is not
// an interchange format, it is a second report — and the disagreement would show up
// in someone else's CI, not here. A mixed tree, because an all-OK report exercises
// none of the level colouring, the ✗ rows, or the ordering between them.
const trip = fs.mkdtempSync(path.join(os.tmpdir(), "layout-trip-"));
fs.mkdirSync(path.join(trip, "sub"), { recursive: true });
for (const file of ["a.md", "stray.txt", "sub/b.md", "sub/extra.md"]) fs.writeFileSync(path.join(trip, file), "");
fs.symlinkSync("a.md", path.join(trip, "link.md"));
fs.writeFileSync(path.join(trip, "repo.layout"), "repo.layout\na.md\nlink.md -> a.md\nsub/\n  b.md\n");
const asText = spawnSync(process.execPath, [bin, "."], { cwd: trip, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
const asJson = spawnSync(process.execPath, [bin, ".", "--format=json"], { cwd: trip, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
const redrawn = spawnSync(process.execPath, [bin, "render", "-"], {
  cwd: trip, input: asJson.stdout, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" },
});
assert.equal(asText.status, 1, "the round-trip tree is meant to have findings, or this proves nothing");
assert.match(asText.stdout, /✗/, "and at least one of them must be an error row");
// Same exit code too, and it is 1 rather than 0: `render` reports the level it was
// handed, so a redrawn ERROR report fails exactly as the run that produced it did.
// A tool that pipes layout into layout gets the same verdict either way.
assert.equal(redrawn.status, asText.status, "the redrawn report carries the same verdict as the run that produced it");
assert.equal(redrawn.stdout, asText.stdout, "check's own JSON, drawn by render, is check's own text");
fs.rmSync(trip, { recursive: true, force: true });

const linked = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "layout-link-")), "here");
fs.symlinkSync(repoRoot, linked);
const throughLink = spawnSync(process.execPath, [bin, linked, "--filter=error"], {
  cwd: repoRoot, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" },
});
assert.equal(throughLink.status, 0, `checking through a symlink to this repo must match checking it directly\n${throughLink.stdout}${throughLink.stderr}`);
fs.rmSync(path.dirname(linked), { recursive: true, force: true });

// The README states which Node versions CI runs. Two files, one fact, and the one
// that runs is the workflow — so the page is checked against it rather than the
// other way round.
const workflow = fs.readFileSync(path.join(repoRoot, ".github/workflows/test.yml"), "utf8");
// And that the workflow still RUNS the gate. It was read here only for its Node
// matrix, so deleting `npm test` from it left every suite in this repo passing
// locally, CI green on a job that checks nothing, and the badge at the top of the
// README — the most public claim the project makes — reporting it. The self-check
// is the second step for the same reason: a repo whose shape drifts from
// repo.layout is the one thing this tool exists to catch.
assert(/^\s*- run: npm test$/m.test(workflow), ".github/workflows/test.yml must run `npm test` — the badge says it does");
assert(/^\s*run: node src\/layout\.mjs \.$/m.test(workflow), ".github/workflows/test.yml must check this repo against its own contract");
assert(/^\s*pull_request:$/m.test(workflow), ".github/workflows/test.yml must run on pull requests, or the badge only ever describes main");

const matrix = workflow.match(/node:\s*\[([^\]]+)\]/);
assert(matrix, ".github/workflows/test.yml no longer declares a node matrix");
const versions = matrix[1].split(",").map((v) => v.trim());
const readme = fs.readFileSync(path.join(repoRoot, "README.md"), "utf8");
assert(readme.includes(`Requires Node ${versions[0]} or newer`),
  `README.md must say "Requires Node ${versions[0]} or newer" — that is what the workflow runs`);
assert(readme.includes(`on ${versions.join(" and ")}`),
  `README.md must name the workflow's matrix, ${versions.join(" and ")}`);
// And package.json, which is what actually warns someone on an older Node.
assert.equal(manifest.engines?.node, `>=${versions[0]}`,
  `package.json must declare engines.node ">=${versions[0]}" — the floor the workflow proves`);

// The fixture-shape table in AGENTS.md is what an agent reads before adding a test.
// Every suite that owns fixtures is listed, with the files each case actually holds.
const doctrine = fs.readFileSync(path.join(repoRoot, "AGENTS.md"), "utf8");
const directoriesIn = (dir) => fs.readdirSync(dir).filter((name) => fs.statSync(path.join(dir, name)).isDirectory());
for (const suite of directoriesIn(path.join(repoRoot, "tests"))) {
  for (const topic of directoriesIn(path.join(repoRoot, "tests", suite))) {
    const dir = path.join(repoRoot, "tests", suite, topic, "fixtures");
    if (!fs.existsSync(dir)) continue;
    const owned = new Set(fs.readdirSync(dir).flatMap((c) => fs.readdirSync(path.join(dir, c))));
    const row = doctrine.split("\n").find((line) => line.includes(`\`${suite}/${topic}\``) && line.startsWith("  |"));
    assert(row, `AGENTS.md's fixture table does not list ${suite}/${topic}, which owns fixtures`);
    for (const file of owned) {
      assert(row.includes(file), `AGENTS.md's row for ${suite}/${topic} does not name ${file}`);
    }
  }
}

console.log(JSON.stringify({ level: "PASS", code: "SELF_LAYOUT_OK" }));
