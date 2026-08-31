#!/usr/bin/env node
// snapshot.mjs — write the `expected.json` for a named fixture, so a new case can
// be added without reverse-engineering the shape by hand.
//
//   npm run snapshot -- <fixture> [<fixture>…]   writes it
//   readSnapshot(dir, name)                      reads it, or says how to make it
//
// By NAME, never in bulk: a blanket regeneration turns a suite into a record of
// whatever the code happens to do. Naming the fixture you added is the safeguard,
// and reading what this wrote is the other half.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkLayout } from "../src/lib/checker.mjs";
import { lintLayout } from "../src/lib/lint.mjs";

const testsDir = path.dirname(fileURLToPath(import.meta.url));

// The two suites whose fixtures carry a generated `expected.json`. The others pin
// exact stdout or stderr, written by hand, which is the point of them.
const SUITES = {
  "checker/virtual-fs": (dir) => checkLayout({
    root: path.join(dir, "fs"),
    layoutSource: fs.readFileSync(path.join(dir, "layout.layout"), "utf8"),
    ignore: fs.existsSync(path.join(dir, "ignore.txt"))
      ? fs.readFileSync(path.join(dir, "ignore.txt"), "utf8").split("\n").map((line) => line.trim()).filter(Boolean)
      : [],
  }),
  "checker/lint": (dir) => lintLayout(fs.readFileSync(path.join(dir, "input.layout"), "utf8")),
};

// A fixture's snapshot, or the way to make one. Both snapshot suites read it from
// here: the module that writes them is the one that knows what to say when there is
// nothing to read, and a raw ENOENT stack names the syscall rather than the mistake.
export function readSnapshot(dir, name) {
  const file = path.join(dir, "expected.json");
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  throw new Error(
    `${name} has no expected.json. A snapshot is generated from the code, then READ:\n`
    + `  npm run snapshot -- ${name}\n`
    + "Then look at what it wrote. A snapshot nobody read is a record of whatever the code did.",
  );
}

// Imported by the suites for `readSnapshot`; run directly, it writes. Without the
// guard the usage message would print on every import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const names = process.argv.slice(2);
  if (names.length === 0) {
    process.stderr.write(
      "Usage: npm run snapshot -- <fixture> [<fixture>…]\n"
      + `Writes expected.json for a fixture under ${Object.keys(SUITES).join(" or ")}.\n`,
    );
    process.exitCode = 2;
  }
  for (const name of names) write(name);
}

function write(name) {
  const found = Object.entries(SUITES)
    .map(([suite, build]) => ({ suite, build, dir: path.join(testsDir, suite, "fixtures", name) }))
    .filter(({ dir }) => fs.existsSync(dir));
  if (found.length === 0) {
    process.stderr.write(`No fixture named ${name} under ${Object.keys(SUITES).join(" or ")}.\n`);
    process.exitCode = 2;
    return;
  }
  // Picking one silently is how the wrong file gets written while the message says
  // it worked.
  if (found.length > 1) {
    process.stderr.write(`${name} exists in ${found.map(({ suite }) => suite).join(" and ")}. Rename one.\n`);
    process.exitCode = 2;
    return;
  }
  const [{ suite, build, dir }] = found;
  const file = path.join(dir, "expected.json");
  const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  const after = `${JSON.stringify(build(dir), null, 2)}\n`;
  fs.writeFileSync(file, after);
  const what = before === null ? "wrote" : before === after ? "unchanged" : "CHANGED";
  process.stdout.write(`${what}  ${suite}/fixtures/${name}/expected.json\n`);
}
