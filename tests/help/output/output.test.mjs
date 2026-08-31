#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OPTIONS, renderHelpPage } from "../../../src/lib/help.mjs";
import { DEFAULTS, renderFindings } from "../../../src/lib/renderer.mjs";
import { commentColumn } from "../../../src/lib/lint.mjs";
import { ANSI, stripAnsi } from "../../../src/lib/ansi.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const fixturesDir = path.join(__dirname, "fixtures");
const bin = path.join(repoRoot, "src/layout.mjs");

let count = 0;
for (const name of fs.readdirSync(fixturesDir).sort()) {
  const fixtureDir = path.join(fixturesDir, name);
  if (!fs.statSync(fixtureDir).isDirectory()) continue;
  const args = readArgs(path.join(fixtureDir, "args.txt"));
  const expectedStatus = readStatus(path.join(fixtureDir, "status.txt"));
  const expected = fs.readFileSync(path.join(fixtureDir, "expected.txt"), "utf8").trimEnd();
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  assert.equal(result.status, expectedStatus, result.stderr);
  const actual = expectedStatus === 0 ? result.stdout : result.stderr;
  assert.equal(actual.trimEnd(), expected, name);
  count += 1;
}

// `layout` and `layout help` must be the SAME page. A second golden copy would only
// prove each file matches itself; diffing the two runs is the claim.
const bare = run([]);
assert.equal(bare.status, 0, bare.stderr);
assert.equal(bare.stdout, run(["help"]).stdout, "bare `layout` and `layout help` differ");

// The pages and the option table the CLI parses, checked against each other in both
// directions. A golden cannot catch either half: an option added to OPTIONS and
// never written down leaves every page byte-identical, and so does a documented
// option no command reads.
for (const [command, page] of [["check", "check"], ["lint", "lint"], ["render", "render"]]) {
  const documented = optionsIn(renderHelpPage(page, { color: false }));
  const parsed = Object.keys(OPTIONS).filter((name) => OPTIONS[name].commands.includes(command)).sort();
  assert.deepEqual(documented, parsed, `layout help ${command} OPTIONS`);
}
assert.deepEqual(optionsIn(renderHelpPage("overview", { color: false })), Object.keys(OPTIONS).sort(), "layout help OPTIONS");

// The same check, one list over: every `layout/…` code the tool can emit is named in
// the lint page's RULES, and every code that page names is one the tool emits. A
// finding code is what a reader greps for after a run, and renaming one in `src/lib`
// leaves every page byte-identical.
const emittedCodes = new Set();
for (const file of fs.readdirSync(path.join(repoRoot, "src/lib")).sort()) {
  if (file === "help.mjs") continue; // the page is the other side of this comparison
  for (const [, code] of fs.readFileSync(path.join(repoRoot, "src/lib", file), "utf8").matchAll(/"(layout\/[a-z-]+)"/g)) {
    emittedCodes.add(code);
  }
}
const rules = (renderHelpPage("lint", { color: false }).split(/^RULES$/m)[1] ?? "").split(/^OPTIONS$/m)[0];
assert.deepEqual(
  [...emittedCodes].sort(),
  [...new Set(rules.match(/layout\/[a-z-]+/g) ?? [])].sort(),
  "the codes src/lib emits and the codes `layout help lint` documents",
);

// Every `%` example on every page is a command the CLI would accept. They are the
// lines a reader copies, and a golden pins them without reading them. Checked
// against `OPTIONS`, the table `layout.mjs` parses, so there is no second list of
// what a flag belongs to.
const COMMANDS = new Set(["check", "lint", "render", "help"]);
for (const page of ["overview", "check", "lint", "render"]) {
  const text = renderHelpPage(page, { color: false });
  for (const line of text.split("\n")) {
    const shown = /^\s*% (.*)$/.exec(line);
    if (!shown) continue;
    // A pipeline documents layout on one side and something else on the other.
    for (const stage of shown[1].split("|").map((part) => part.trim())) {
      if (!stage.startsWith("layout ") && stage !== "layout") continue;
      const args = stage.split(/\s+/).slice(1);
      const command = COMMANDS.has(args[0]) ? args[0] : "check";
      for (const arg of args) {
        if (!arg.startsWith("--")) continue;
        const name = `--${arg.slice(2).split("=")[0]}`;
        const spec = OPTIONS[name];
        assert(spec, `layout help ${page}: the example "${stage}" passes ${name}, which is not an option`);
        assert(spec.commands.includes(command),
          `layout help ${page}: the example "${stage}" passes ${name} to ${command}, which does not read it`);
      }
    }
  }
}

// The findings JSON the render page teaches must be findings render can read. It
// taught `"level": "ERROR"`, and an unrecognized level becomes `error` on purpose,
// so a tool author following the page had every `OK` and `WARN` row turn into an ✗
// and the exit code flip. Asserted by drawing the page's own example.
const taught = /\{\s*"items".*?\]\s*\}/s.exec(renderHelpPage("render", { color: false }));
assert(taught, "layout help render: the findings JSON example is gone");
const example = JSON.parse(taught[0].replace(/\s+/g, " "));
for (const item of example.items) {
  const drawn = renderFindings({ items: [item] }, {}).trimEnd();
  const glyph = { ok: "✓", warn: "!", error: "✗" }[item.level.toLowerCase()];
  assert(glyph, `layout help render: the example names a level layout has no glyph for: ${item.level}`);
  assert(drawn.includes(glyph), `layout help render: the example's "${item.level}" row does not draw as ${glyph}\n${drawn}`);
}

// The default is the part a reader acts on without running anything, and it is
// written five times — once per help page, once in the README's copy of the flag
// table. `DEFAULTS` is the only copy the tool obeys, so changing it would otherwise
// leave five sentences describing the old behaviour and every golden still passing.
const documentedDefaults = (text, where) => {
  for (const line of text.split("\n")) {
    const option = /^\s*--([a-z]+) </.exec(line);
    if (!option) continue;
    const stated = /(\S+) \(default\)/.exec(line) ?? /Default: ([^.\s]+)\./.exec(line);
    if (!stated) continue;
    assert.equal(
      stated[1], String(DEFAULTS[option[1]]),
      `${where}: --${option[1]} is documented as defaulting to ${stated[1]}, but DEFAULTS says ${DEFAULTS[option[1]]}`,
    );
  }
};
for (const page of ["overview", "check", "lint", "render"]) {
  documentedDefaults(renderHelpPage(page, { color: false }), `layout help ${page}`);
}
documentedDefaults(fs.readFileSync(path.join(repoRoot, "README.md"), "utf8"), "README.md");

// The one number the help pages state. `commentColumn([])` IS the floor, so the page
// cannot name a column the linter does not use.
const floor = commentColumn([]);
assert.match(renderHelpPage("lint", { color: false }), new RegExp(`left of column ${floor}\\b`),
  `layout help lint must name column ${floor}, which is what commentColumn returns`);

// Colour. Every golden above runs plain, so the half of help.mjs that paints —
// section headings, the tool's own name, flag names — had nothing behind it. The two
// must differ only by escape codes: same page, same words, same line breaks.
const plain = renderHelpPage("overview", { color: false });
const painted = renderHelpPage("overview", { color: true });
assert.notEqual(painted, plain, "renderHelpPage({ color: true }) must paint something");
assert.equal(stripAnsi(painted), plain, "colour must change only the escape codes, never the text");
assert(painted.includes(`${ANSI.bold}${ANSI.green}USAGE${ANSI.reset}`), "a section heading is bold and green");

console.log(JSON.stringify({ level: "PASS", code: "HELP_OUTPUT_OK", fixtures: count }));

// The option names a page's OPTIONS section documents. A section runs from its
// heading to the next — a heading being a non-blank line in column 0, which is what
// tells it apart from the blank lines between entries.
function optionsIn(page) {
  const body = page.split(/^OPTIONS$/m)[1] ?? "";
  const section = body.split(/^\S.*$/m)[0];
  return [...new Set(section.match(/^ {2}(--[a-z]+)/gm)?.map((line) => line.trim()) ?? [])].sort();
}

function run(args) {
  return spawnSync(process.execPath, [bin, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

function readArgs(file) {
  const source = fs.readFileSync(file, "utf8").trim();
  return source ? source.split(/\s+/) : [];
}

function readStatus(file) {
  if (!fs.existsSync(file)) return 0;
  return Number(fs.readFileSync(file, "utf8").trim());
}
