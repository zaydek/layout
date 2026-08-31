#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lintLayout } from "../../../src/lib/lint.mjs";
import { readSnapshot } from "../../snapshot.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, "fixtures");

let count = 0;
for (const name of fs.readdirSync(fixturesDir).sort()) {
  const fixtureDir = path.join(fixturesDir, name);
  if (!fs.statSync(fixtureDir).isDirectory()) continue;
  const source = fs.readFileSync(path.join(fixtureDir, "input.layout"), "utf8");
  const actual = lintLayout(source);
  const expected = JSON.parse(readSnapshot(fixtureDir, name));
  assert.deepEqual(actual, expected, name);
  count += 1;
}

// The CLI's own JSON, which the README documents as lint's shape — a flat
// `findings[]`, where `check` and `render` print a path-addressed tree. Every
// fixture above calls `lintLayout` directly, so the emission itself would otherwise
// never run: the library could be right and `--format=json` print anything.
const bin = path.resolve(__dirname, "../../../src/layout.mjs");
for (const name of ["pass-clean", "fail-caps", "fail-bad-regex"]) {
  const dir = path.join(fixturesDir, name);
  const emitted = spawnSync(process.execPath, [bin, "lint", "input.layout", "--format=json"], {
    cwd: dir, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" },
  });
  const report = JSON.parse(emitted.stdout);
  assert.deepEqual(report, lintLayout(fs.readFileSync(path.join(dir, "input.layout"), "utf8")), `${name}: the CLI prints what the library returns`);
  assert.deepEqual(Object.keys(report).sort(), ["findings", "level"], `${name}: lint's shape is a flat findings list`);
}

console.log(JSON.stringify({ level: "PASS", code: "LINT_OK", fixtures: count }));
