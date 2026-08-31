#!/usr/bin/env node
// The test gate. `npm test` runs this file, and this file runs every other suite.
//
// Suites are DISCOVERED, not listed: every `*.test.mjs` under `tests/`, sorted, one
// child process each — a suite nobody remembered to name still runs. Output is
// captured rather than inherited so the `{"level":"PASS",...}` line can be read
// here, then written through byte for byte.
//
// This file is named `run.mjs`, not `*.test.mjs`, so the walk never finds it and it
// cannot run itself.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testsDir = path.dirname(fileURLToPath(import.meta.url));

function findSuites(dir) {
  const found = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findSuites(full));
    else if (entry.name.endsWith(".test.mjs")) found.push(full);
  }
  return found;
}

const suites = findSuites(testsDir);

// Every fixture name any doc mentions, gathered once, repo-wide: a doc may name a
// fixture belonging to another suite, and a doc naming one that exists nowhere is
// describing a case nobody runs.
function findFixtures(dir) {
  const found = new Set();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "fixtures") {
      for (const fixture of fs.readdirSync(path.join(dir, entry.name))) found.add(fixture);
      continue;
    }
    for (const name of findFixtures(path.join(dir, entry.name))) found.add(name);
  }
  return found;
}
const fixtures = findFixtures(testsDir);
const failed = [];

for (const suite of suites) {
  const { status, signal, stdout, stderr } = spawnSync(process.execPath, [suite], { encoding: "utf8" });
  process.stdout.write(stdout ?? "");
  process.stderr.write(stderr ?? "");
  if (status !== 0) {
    failed.push(`${path.relative(testsDir, suite)} (${signal ? `killed by ${signal}` : `exit ${status}`})`);
    continue;
  }
  const drift = docDrift(suite, stdout ?? "");
  if (drift) failed.push(drift);
}

// Each suite prints one `{"level":"PASS",...}` line and its sibling `.test.md`
// quotes that line. A doc nothing checks is a doc that drifts, so five ways it can
// drift are checked here rather than trusted.
function docDrift(suite, stdout) {
  const doc = suite.replace(/\.mjs$/, ".md");
  const pass = stdout.split("\n").reverse().find((line) => line.includes('"level":"PASS"'));
  // A suite that exits 0 saying nothing would otherwise waive every check below.
  if (!pass) return `${path.relative(testsDir, suite)} (exited 0 without printing a PASS line)`;
  if (!fs.existsSync(doc)) return `${path.relative(testsDir, doc)} (missing; every suite documents what it proves)`;
  const text = fs.readFileSync(doc, "utf8");
  if (!text.includes(pass.trim())) return `${path.relative(testsDir, doc)} (says something other than ${pass.trim()})`;
  // The PASS line's count is the only one anything checks, so a count restated in
  // prose is a second copy that drifts. Restating it is fine; disagreeing is not.
  const counted = /"(?:fixtures|cases)":(\d+)/.exec(pass);
  const stated = [...text.matchAll(/(\d+) (?:fixtures?|cases?)\b/g)];
  // A PASS line carrying no count has nothing to check a prose count against, so
  // that doc may not state one.
  if (!counted) {
    return stated.length === 0
      ? null
      : `${path.relative(testsDir, doc)} (prose says "${stated[0][0]}", and the PASS line carries no count to check it against)`;
  }
  const wrong = stated.find((m) => m[1] !== counted[1]);
  if (wrong) return `${path.relative(testsDir, doc)} (prose says "${wrong[0]}", the PASS line says ${counted[1]})`;
  const ghost = [...text.matchAll(/`((?:pass|fail)-[a-z0-9-]+)`/g)].find((m) => !fixtures.has(m[1]));
  if (ghost) return `${path.relative(testsDir, doc)} (names \`${ghost[1]}\`, which is not a fixture in this repo)`;
  // The same paragraph twice is two explanations to keep in step — what an edit
  // leaves behind when it anchors on text an earlier edit added.
  const paragraphs = text.split(/\n\s*\n/).map((block) => block.trim().split(/\s+/).join(" ")).filter((block) => block.length >= 90);
  const twice = paragraphs.find((block, index) => paragraphs.indexOf(block) !== index);
  return twice ? `${path.relative(testsDir, doc)} (says this twice: "${twice.slice(0, 60)}…")` : null;
}

if (failed.length > 0) {
  console.error(`FAIL ${failed.length} of ${suites.length}: ${failed.join(", ")}`);
  process.exit(1);
}

console.log(`${suites.length} suites passed.`);
