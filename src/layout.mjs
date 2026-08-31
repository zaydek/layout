#!/usr/bin/env node
// layout.mjs — the CLI: argv in, a report and an exit code out.
//
//   layout [check] [path]   walk a tree and compare it to its contract
//   layout lint <file>      read a contract's own syntax and house style
//   layout render [file]    print a contract, or draw findings JSON
//   layout help [command]   the reference pages
//
// This file decides which COMMAND ran, which OPTIONS it may read, and what EXIT
// CODE the result deserves: 0 is a match, 1 a violation (or a warning under
// --strict), 2 a run that could not proceed. Nothing here knows the notation.

import fs from "node:fs";
import path from "node:path";
import { checkLayout } from "./lib/checker.mjs";
import { DEFAULTS, normalizeStyle, normalizeView, parseFilter, renderFindings } from "./lib/renderer.mjs";
import { normalizeFindings, printable } from "./lib/findings.mjs";
import { exampleFindings } from "./lib/examples.mjs";
import { showLayout } from "./lib/layout-view.mjs";
import { OPTIONS, isHelpFlag, knownHelpPage, parseHelpRequest, renderHelpPage } from "./lib/help.mjs";
import { lintLayout } from "./lib/lint.mjs";

// A usage fault — "that is not how this command is spelled" — not a fault in the
// tree or the contract.
class UsageError extends Error {}

// A consumer that closes early (`layout . | head`) makes remaining writes fail
// with EPIPE. Drop the write and let the run finish, so the exit code stays the
// one the check reached — exiting here would discard the verdict.
process.stdout.on("error", (error) => {
  if (error.code !== "EPIPE") throw error;
});

// `process.exitCode` throughout, never `process.exit`: stdout to a pipe is
// asynchronous, and an exit beside a write truncates the report. Setting the
// code and letting the process end lets Node flush.
const args = process.argv.slice(2);
if (args[0] === "--version" || args[0] === "-V") {
  const manifest = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  process.stdout.write(`${manifest.version}\n`);
} else {
  await run(args);
}

async function run(args) {
  try {
    const command = readCommand(args);
    if (command === "overview") process.stdout.write(renderHelpPage("overview"));
    else if (command === "help") runHelp(args);
    else if (command === "check") await runCheck(args);
    else if (command === "lint") await runLint(args);
    else if (command === "render") await runRender(args);
    else throw new UsageError(`Unknown command: ${command}`);
  } catch (error) {
    // A usage fault prints its own line and the way back. It is thrown rather than
    // exiting where found, so nothing after the fault runs.
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\nRun \`layout help\` for usage.\n`);
      process.exitCode = 2;
      return;
    }
    // An errno reaching the user names the syscall and not the mistake; this is the
    // last place to translate one. A tree that cannot be read is exit 2.
    console.error(error.code && error.syscall
      ? `Cannot read ${printable(error.path)}: ${describeErrno(error.code)}`
      : `${faultAt(error)}${error.message}`);
    process.exitCode = 2;
  }
}

// `file:line: ` when both are known, `file: ` or `line: ` when one is — the
// compiler spelling, so an editor can jump to it. The line is a FIELD on the
// error, never text inside its message.
function faultAt(error) {
  if (error.contract && error.line) return `${error.contract}:${error.line}: `;
  if (error.contract) return `${error.contract}: `;
  return error.line ? `Line ${error.line}: ` : "";
}

// What to call the contract in a fault: relative to the cwd while it stays inside
// it — `repo.layout:2:`, the compiler spelling an editor jumps to — and its own path
// once it does not. `path.relative` alone names a contract in /var by a climb out of
// the cwd, which is longer than the absolute path and meaningless from anywhere else.
function nameContract(file) {
  const here = path.relative(process.cwd(), file);
  return here && !here.startsWith("..") ? here : file;
}

function describeErrno(code) {
  if (code === "EACCES" || code === "EPERM") return "permission denied";
  if (code === "ENOENT") return "no such file or directory";
  if (code === "ENOTDIR") return "not a directory";
  if (code === "ELOOP") return "too many levels of symbolic links";
  if (code === "ENAMETOOLONG") return "the path is too long for this filesystem";
  if (code === "EMFILE" || code === "ENFILE") return "too many open files";
  return code; // a rarer errno keeps its name, which still beats a stack trace
}

// ── Which command ────────────────────────────────────────────────────────────
function readCommand(args) {
  if (args.length === 0) return "overview";
  if (isHelpFlag(args[0])) {
    args.shift();
    return "help";
  }
  // No command word (`layout .`, `layout --strict .`, `layout`) means `check`.
  // Unknown flags are left for the option parser, which knows the option names;
  // this function only decides the command.
  const first = args[0] && !args[0].startsWith("-") ? args[0] : null;
  // A bare word that is neither a command nor a path is a typo, not a no-op run.
  if (first && !isCommand(first) && !isPathLike(first)) {
    throw new UsageError(`Unknown command: ${first} (not a command, and no such path)`);
  }
  const command = isCommand(first) ? args.shift() : "check";
  const helpIndex = args.findIndex(isHelpFlag);
  if (helpIndex !== -1) {
    args.splice(helpIndex, 1);
    args.unshift(command);
    return "help";
  }
  return command;
}

function isCommand(value) {
  return value === "help" || value === "check" || value === "render" || value === "lint";
}

function isPathLike(value) {
  if (value === ".") return true;
  if (value === "..") return true;
  if (value.startsWith("./") || value.startsWith("../") || value.startsWith("/") || value.startsWith("~/")) return true;
  return fs.existsSync(path.resolve(value));
}

// ── The four commands ────────────────────────────────────────────────────────
function runHelp(args) {
  const request = parseHelpRequest(args);
  // An unknown topic's page goes to stderr with exit 2, so it is a failure in a
  // pipeline rather than a page that looks like an answer.
  if (!knownHelpPage(request)) {
    process.stderr.write(renderHelpPage(request));
    process.exitCode = 2;
    return;
  }
  process.stdout.write(renderHelpPage(request));
}

async function runCheck(args) {
  const { positional, options } = readArgs(args, "check");
  const target = positional ?? ".";
  const output = resolveOutput(options);
  const resolved = path.resolve(target);
  // Validated here in words rather than left to fs's raw errno. statSync FOLLOWS a
  // link — the root of a check must be treated as a directory even when it is a
  // symlink to one; the tree reader below it lstats, because it must see a link as
  // a link.
  const stat = fs.existsSync(resolved) ? fs.statSync(resolved) : null;
  if (!stat) throw new Error(`No such directory: ${target}`);
  if (!stat.isDirectory()) throw new Error(`${target} is a file. layout checks a directory against its contract — point it at the directory, or pass the contract with --config.`);

  const fromStdin = options.config === "-";
  const contractFile = fromStdin ? null : resolveConfigFile(resolved, options.config);
  const contract = fromStdin ? "<stdin>" : nameContract(contractFile);
  const layoutSource = fromStdin ? await readStdin() : fs.readFileSync(contractFile, "utf8");
  // The contract's name rides on the fault: `layout .` picks a *.layout for you,
  // so the error must say which file it is talking about.
  let findings;
  try {
    findings = checkLayout({ root: fs.realpathSync(resolved), layoutSource, ignore: options.ignore ?? [] });
  } catch (error) {
    if (error.contract === undefined) error.contract = contract;
    throw error;
  }
  emit({ ...findings, root: target }, output);
  process.exitCode = failsUnder(findings.level, options) ? 1 : 0;
}

async function runRender(args) {
  const { positional, options } = readArgs(args, "render");
  const output = resolveOutput(options);
  // The built-in example is a picture of the renderer, not a run against a tree,
  // so it exits 0 whatever levels it draws; --strict does not change that.
  if (options.example) {
    emit(exampleFindings(options.example), output);
    return;
  }
  const source = await readRenderInput(positional);
  const parsed = tryParseJson(source);
  if (parsed && Array.isArray(parsed.items)) {
    const findings = normalizeFindings(parsed);
    emit(findings, output);
    process.exitCode = failsUnder(findings.level, options) ? 1 : 0;
    return;
  }
  // Findings JSON that render cannot draw must not fall through to the CONTRACT
  // pretty-printer, which accepts anything and would echo it back at exit 0.
  // A contract never opens `{"` — a slot opens `{:`, `{$`, `{/`, `{a,` or `{}` —
  // so that spelling is unambiguously intended as findings JSON. A bare `[` is
  // NOT: `[id].tsx` is a legitimate first line of a contract, so an array is
  // caught by having parsed as JSON, not by how it opens.
  if (Array.isArray(parsed)) {
    throw new Error('render: JSON input needs an "items" array of path-addressed findings — this is a bare array. Wrap it: {"items": [ … ]}.');
  }
  if (/^\s*\{\s*"/.test(source)) {
    throw new Error(parsed
      ? `render: JSON input needs an "items" array of path-addressed findings.${Array.isArray(parsed.findings) ? ' This carries "findings", the flat list `lint` prints, which render does not draw.' : ""}`
      : "render: input opens like JSON but does not parse.");
  }
  // Reached only when the input is a CONTRACT, which is printed as written — none
  // of the report flags shape it, so accepting them here would be silent no-ops.
  const inert = Object.keys(options).filter((name) => name !== "example");
  if (inert.length > 0) {
    const one = inert.length === 1;
    throw new Error(`render prints a contract as written; ${inert.map((name) => `--${name}`).join(", ")} ${one ? "belongs" : "belong"} to a findings report and ${one ? "does" : "do"} nothing here. Drop ${one ? "it" : "them"}, or pass findings JSON.`);
  }
  process.stdout.write(showLayout(source));
}

async function runLint(args) {
  const { positional, options } = readArgs(args, "lint");
  const source = positional === "-"
    ? await readStdin()
    : readContract(path.resolve(requirePath(positional, "lint")), positional);
  const result = lintLayout(source);
  emitLintReport(result, positional, resolveOutput(options).format);
  process.exitCode = failsUnder(result.level, options) ? 1 : 0;
}

// ── Exit code ────────────────────────────────────────────────────────────────
// The single rule for exit 1: an error always fails; a warning fails under
// --strict. Every command exits through this.
function failsUnder(level, options) {
  return level === "ERROR" || (!!options.strict && level === "WARN");
}

// ── Reading input ────────────────────────────────────────────────────────────
// Reading a named file, with the missing/not-a-file cases said in words rather
// than as a raw errno.
function readContract(file, label) {
  if (!fs.existsSync(file)) throw new Error(`No such file: ${label}`);
  if (!fs.statSync(file).isFile()) throw new Error(`Not a file: ${label}`);
  return fs.readFileSync(file, "utf8");
}

function requirePath(value, verb) {
  if (!value) throw new Error(`${verb}: a path is required (a *.layout file, or - for stdin).`);
  return value;
}

async function readRenderInput(value) {
  if (value) return value === "-" ? await readStdin() : readContract(path.resolve(value), value);
  if (!process.stdin.isTTY) return await readStdin();
  return fs.readFileSync(resolveConfigFile(process.cwd()), "utf8");
}

function resolveConfigFile(target, configArg) {
  if (configArg) {
    const file = path.resolve(configArg);
    if (!fs.existsSync(file)) throw new Error(`No such contract file: ${configArg}`);
    if (!fs.statSync(file).isFile()) throw new Error(`Not a file: ${configArg}. --config names one *.layout file.`);
    return file;
  }
  // `statSync`, which FOLLOWS a link, so discovery and the `--config` branch above
  // answer "is this a file" the same way — a symlinked contract counts as a file.
  const usable = (name) => {
    const file = path.join(target, name);
    return fs.existsSync(file) && fs.statSync(file).isFile();
  };
  const entries = fs.readdirSync(target)
    .filter((name) => name.endsWith(".layout") && usable(name))
    .sort(); // code-unit order, like every other order this tool prints
  if (entries.length === 0) {
    // Often the first thing the tool ever says to a new user, so the message names
    // the next step, not just what is missing.
    throw new Error(
      `No layout file found in ${target}. Expected repo.layout or another *.layout file.\n`
      + `Next: write a repo.layout describing the shape you expect — one entry per line, two spaces per level — then run \`layout .\` again.\n`
      + `Run \`layout help\` for the notation.`,
    );
  }
  // `repo.layout` wins outright. Without one, several candidates is an AMBIGUOUS
  // request, not a request for the alphabetically first.
  if (entries.includes("repo.layout")) return path.join(target, "repo.layout");
  if (entries.length > 1) {
    throw new Error(
      `More than one contract in ${target}: ${entries.map(printable).join(", ")}.\n`
      + `Name the one you mean with --config, or call it repo.layout.`,
    );
  }
  return path.join(target, entries[0]);
}

// A leading `[` counts too: a bare array of findings must parse so the caller can
// refuse it with a message rather than echo it back as a contract.
function tryParseJson(source) {
  if (!/^\s*[[{]/.test(source)) return null;
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
}

async function readStdin() {
  return await new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

// ── Writing the report ───────────────────────────────────────────────────────
// `lint` reports on a contract file, so it takes a format and none of the tree
// options; the format still comes through resolveOutput so the default has one
// answer.
function emitLintReport(result, label, format) {
  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const where = label && label !== "-" ? label : "<stdin>";
  if (result.findings.length === 0) {
    process.stdout.write(`OK  ${where}\n`);
    return;
  }
  for (const f of result.findings) {
    const loc = f.line != null ? `:${f.line}` : "";
    process.stdout.write(`${f.level.toUpperCase().padEnd(5)} ${where}${loc}  ${f.code}  ${f.message}\n`);
  }
  const n = result.findings.length;
  process.stdout.write(`\n${result.level}  ${n} ${n === 1 ? "finding" : "findings"}\n`);
}

// Normalized HERE so the text and JSON branches emit the same report — the JSON
// branch does not go through renderFindings, which normalizes its own input.
function emit(findings, output) {
  const report = normalizeFindings(findings);
  if (output.format === "json") {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  process.stdout.write(renderFindings(report, {
    color: output.color,
    as: output.view,
    style: output.style,
    filter: output.filter,
  }));
}

// Every output option is read and refused HERE, before the run does any work —
// the JSON path never reaches the renderer, so validating there would miss it.
function resolveOutput(options) {
  return {
    format: normalizeFormat(options.format ?? DEFAULTS.format),
    style: normalizeStyle(options.style ?? DEFAULTS.style),
    view: normalizeView(options.as ?? DEFAULTS.as),
    color: normalizeColor(options.color ?? DEFAULTS.color),
    filter: parseFilter(options.filter ?? DEFAULTS.filter),
  };
}

function normalizeFormat(value) {
  if (value === "text" || value === "json") return value;
  throw new Error(`Unknown format: ${value}`);
}

function normalizeColor(value) {
  // `auto`: a TTY unless NO_COLOR says otherwise.
  if (value === "auto") return !process.env.NO_COLOR && process.stdout.isTTY;
  if (value === "on") return true;
  if (value === "off") return false;
  throw new Error(`Unknown color mode: ${value}`);
}

// ── Options ──────────────────────────────────────────────────────────────────
// One pass over argv, so "is this token an option's value or the path" has one
// answer. The path is whatever is not an option and not an option's value; a
// second bare word is a typo, not an argument.
function readArgs(args, command) {
  const options = {};
  let positional;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      // A single dash is stdin, and a real path can be written `./-thing`.
      // Anything else that opens with `-` is a misspelled option, not a path.
      if (arg.startsWith("-") && arg !== "-") throw new Error(`Unknown option: ${arg}`);
      if (positional !== undefined) {
        throw new Error(`Unexpected argument: ${arg} (${positional} is already the path)`);
      }
      // An empty path is an unset variable, not a request for the current
      // directory.
      if (arg === "") throw new Error("The path is empty. Pass a directory, or nothing at all for the current one.");
      positional = arg;
      continue;
    }
    // Split at the FIRST `=` only: a filename may contain an `=`; the option name
    // may not.
    const body = arg.slice(2);
    const at = body.indexOf("=");
    const rawKey = at === -1 ? body : body.slice(0, at);
    const inlineValue = at === -1 ? undefined : body.slice(at + 1);
    const optionName = `--${rawKey}`;
    const spec = OPTIONS[optionName];
    if (!spec) throw new Error(`Unknown option: ${optionName}`);
    if (!spec.commands.includes(command)) {
      throw new Error(`${optionName} is not a ${command} option (it belongs to ${spec.commands.join(", ")}).`);
    }
    let value = inlineValue;
    if (value === undefined) {
      const next = spec.value ? args[i + 1] : undefined;
      if (next && !next.startsWith("--")) {
        value = next;
        i += 1;
      } else {
        value = true;
      }
    }
    // A value-taking option must get a real value — `true` and `""` (an unset
    // shell variable) are both refused rather than passed downstream.
    if (spec.value && (value === true || value === "")) throw new Error(`${optionName} needs a value.`);
    // And the converse: a flag given any inline value (even "false") is refused,
    // since the string would otherwise be read as truthy or silently falsy.
    if (!spec.value && inlineValue !== undefined) throw new Error(`${optionName} takes no value.`);
    // --ignore is repeatable AND comma-separated, like --filter. The cost is that
    // a filename containing a comma cannot be ignored — README's Limits says so.
    if (rawKey === "ignore") {
      (options.ignore ??= []).push(...String(value).split(",").map((glob) => glob.trim()).filter(Boolean));
    } else options[rawKey] = value;
  }
  return { positional, options };
}
