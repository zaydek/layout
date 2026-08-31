// help.mjs — the reference pages, written out as text.
//
//   renderHelpPage(topic) -> string        (ANSI-colored on a TTY, plain otherwise)
//   knownHelpPage(topic)  -> boolean
//
// These pages are prose, so they are prose here: plain template strings at a
// fixed 80 columns — editing a page means editing the page. tests/help/output
// diffs every page byte-for-byte, and OPTIONS lives here so the table the CLI
// parses and the text that documents it are one edit apart.

import { ANSI, stripAnsi } from "./ansi.mjs";

// Every option, whether it takes a value, and which commands READ it. The last
// column is the point: an option a command does not read is refused, never
// silently ignored.
export const OPTIONS = {
  "--as": { value: true, commands: ["check", "render"] },
  "--color": { value: true, commands: ["check", "render"] },
  "--config": { value: true, commands: ["check"] },
  "--example": { value: true, commands: ["render"] },
  "--filter": { value: true, commands: ["check", "render"] },
  "--format": { value: true, commands: ["check", "lint", "render"] },
  "--ignore": { value: true, commands: ["check"] },
  // Not `check`: the checker emits only ok and error, so --strict there could
  // never fire. `lint` warns about house style and `render` draws whatever levels
  // it is handed, so both mean something by it.
  "--strict": { value: false, commands: ["lint", "render"] },
  "--style": { value: true, commands: ["check", "render"] },
};

const OVERVIEW = `layout  filesystem shape contracts, checked

A .layout file states the shape a tree is supposed to have — which files and
folders exist, where, and what they may be named — and layout proves the tree
still matches it.

USAGE

  layout                    This page
  layout .                  Check the current directory
  layout <path>             Check that directory
  layout check [path]       The same, with the command named outright
  layout lint <file>        Check a .layout file's own syntax and style
  layout render [file]      Print a contract, or draw findings JSON
  layout help [command]     This page, or one command's page

OPTIONS

  --config <path|->   The contract to check against. \`-\` reads it from stdin.
                      Default: repo.layout in <path>, or the only *.layout
                      there. More than one, and none named repo.layout, is
                      refused — name the one you mean.

  --ignore <glob>     Skip paths matching <glob>: * within one path segment, **
                      across segments, matched against a whole entry name or a
                      whole path from the root. Comma-separated, repeatable.

  --format <mode>     text (default) | json

  --filter <list>     Severities, comma-separated. Default: ok,warn,error.

  --style <mode>      tree (default) | list

  --as <view>         schema (default) | actual — print the contract's own slot
                      spellings, or the paths they matched. A missing entry has
                      no path, so actual draws its rule.

  --color <mode>      auto (default) | on | off

  --strict            lint, render: exit 1 on a warning, not just an error.

  --example <name>    render only: draw a built-in findings example. One name,
                      stress.

  -h, --help          Print a help page.
  -V, --version       Print the version.

EXIT CODES

  0   The tree matches the contract.
  1   It does not, or lint/render found a warning under --strict.
  2   The contract could not be resolved, or the command was not understood.

EXAMPLES

  Check this repo against its own contract:
  % layout .

  Try a contract before committing it:
  % layout check . --config draft.layout

  Check a .layout file's own syntax:
  % layout lint repo.layout

  Show only what is wrong, in color:
  % layout . --filter=error --color=on

  Pipe another tool's path findings through the renderer:
  % my-tool --json | layout render --filter=error

ENVIRONMENT

  NO_COLOR    Disable ANSI color.`;

const CHECK = `layout check  compare a tree against its contract

Walks the target, compares it against the contract, and prints one OK or ERROR
finding per entry. Exits 1 if anything mismatched.

The target is a directory, and the contract is the *.layout found in it —
repo.layout by default, or whatever --config names.

USAGE

  layout check [path] [--config <path|->] [--ignore <glob>]
               [--format <mode>] [--filter <list>] [--style <mode>]
               [--as <view>] [--color <mode>]

OPTIONS

  --config <path|->   The contract to check against. \`-\` reads it from stdin.
                      Default: repo.layout in <path>, or the only *.layout
                      there. More than one, and none named repo.layout, is
                      refused — name the one you mean.

  --ignore <glob>     Skip paths matching <glob>: * within one path segment, **
                      across segments, matched against a whole entry name or a
                      whole path from the root. Comma-separated, repeatable.

  --format <mode>     text (default) | json
  --filter <list>     Severities, comma-separated. Default: ok,warn,error.
  --style <mode>      tree (default) | list
  --as <view>         schema (default) | actual
  --color <mode>      auto (default) | on | off

  A check has no warnings — a tree either matches a rule or does not — so there
  is no --strict here. \`layout lint\` has one.

EXAMPLES

  Check this repo:
  % layout .

  Check a sibling repo against a contract that is not at its root:
  % layout check ../other --config ../other/skills.layout

  Try a contract from stdin without writing it down:
  % cat draft.layout | layout check . --config -

  Ignore two trees:
  % layout . --ignore 'vendor/**' --ignore 'build/**'

  Emit JSON for another tool:
  % layout check . --format=json`;

const LINT = `layout lint  check a .layout file's own syntax and style

Reads a contract and reports what is wrong with the contract itself — before it
is ever pointed at a tree. A contract that does not resolve makes \`check\` exit 2
with one message; lint names them all at once, with line numbers.

The exception is indentation: a file whose nesting cannot be read has no shape to
report faults against, so \`layout/indent\` is named on every bad line and nothing
structural is checked until you fix it. Run lint again after.

USAGE

  layout lint <file|-> [--format <mode>] [--strict]

RULES

  Errors — the contract cannot be used as written:

    layout/indent          An indent that is not exactly two spaces per level,
                           a tab, or text pasted out of a document — the line
                           art this tool draws, or a Markdown fence.
    layout/empty           A contract with no rules at all, which forbids
                           everything — usually a pipeline that fed in nothing.
    layout/bad-regex       A slot regex that does not compile.
    layout/unknown-ref     A {$name} with no $name: definition.
    layout/ref-cycle       $a -> $b -> $a.
    layout/slot-syntax     Any other rule the grammar rejects. A rule names ONE
                           entry, so a / in one is a path written on a single
                           line — nest it instead. A rule that names nothing,
                           the same rule twice, two rules naming one entry, two
                           outlets at one level: each is a line that can never
                           match. Also a malformed symlink, and children under
                           something that is not a directory.

  Warnings — house style, so a contract stays readable:

    layout/comment-missing    A directory entry with no trailing comment.
    layout/comment-align      A comment's # off the alignment column, which is
                              three past the longest commented line and never
                              left of column 40. \`layout render <file>\` reprints
                              a contract with every comment already on it.
    layout/comment-caps       A comment not led by an uppercase letter.
    layout/comment-unspaced   A # not followed by a space.
    layout/unused-definition  A $name: no rule reaches, so it enforces nothing.

OPTIONS

  --format <mode>     text (default) | json
  --strict            Exit 1 on a warning too, not just an error.

EXAMPLES

  Lint this repo's contract:
  % layout lint repo.layout

  Lint a draft on its way in:
  % cat draft.layout | layout lint -

  Fail a pre-commit hook on style, not just on breakage:
  % layout lint repo.layout --strict`;

const RENDER = `layout render  print a contract, or draw findings JSON

With a .layout file, prints the contract as layout parsed it — the way to see
what a slot actually resolved to, and the formatter for the alignment warning
lint gives you. Blank lines and standalone # comments survive; running it twice
changes nothing more. With path-addressed findings JSON on stdin, draws them as
OK/WARN/ERROR trees, so any tool that can emit a path and a severity gets
layout's output for free.

The flags below shape a findings REPORT. Printing a contract takes none of them,
and passing one there is refused rather than ignored.

USAGE

  layout render [file|-] [--format <mode>] [--filter <list>]
                [--style <mode>] [--as <view>] [--color <mode>]
                [--example <name>] [--strict]

  With no argument and a pipe on stdin, render reads stdin. With no argument
  and a terminal, it reads the contract check would — repo.layout, or the
  only *.layout in the current directory.

FINDINGS JSON

  { "items": [ { "path": "src/index.ts", "level": "error",
                 "message": "Unexpected by layout" } ] }

  Anything on stdin that parses as JSON with an items array is drawn as
  findings; anything else is read as a contract.

OPTIONS

  --format <mode>     text (default) | json
  --filter <list>     Severities, comma-separated. Default: ok,warn,error.
  --style <mode>      tree (default) | list
  --as <view>         schema (default) | actual
  --color <mode>      auto (default) | on | off
  --example <name>    Draw a built-in example instead of reading input, and
                      exit 0 whatever it draws — it reports on nothing. One
                      name, stress.
  --strict            Exit 1 on a warning in the findings, not just an error.

EXAMPLES

  Print this repo's contract as parsed:
  % layout render repo.layout

  Draw another tool's findings, errors only:
  % my-tool --json | layout render --filter=error

  Check and draw through layout's own pipeline:
  % layout check . --format=json | layout render --filter=error

  See what the renderer can do:
  % layout render --example stress`;

const PAGES = { overview: OVERVIEW, check: CHECK, lint: LINT, render: RENDER };

export function knownHelpPage(name) {
  return Object.hasOwn(PAGES, name);
}

export function isHelpFlag(value) {
  return value === "--help" || value === "-h";
}

// `layout help` with no topic is the overview; `layout help check` is that page.
// `help` itself resolves there too: the usage line offers `layout help [command]`
// and lists `help` among the commands, so asking for it must not be an error.
export function parseHelpRequest(args = []) {
  const topic = args.find((arg) => !arg.startsWith("-")) ?? "overview";
  return topic === "help" ? "overview" : topic;
}

export function renderHelpPage(page, options = {}) {
  const text = `${knownHelpPage(page) ? PAGES[page] : unknown(page)}\n\n`;
  return shouldColor(options) ? colorize(text) : stripAnsi(text);
}

function unknown(page) {
  return [
    `Unknown help topic: ${page}`,
    `Available topics: ${Object.keys(PAGES).join(", ")}`,
    "Run: layout help <topic>",
  ].join("\n");
}

const SECTIONS = new Set([
  "USAGE", "OPTIONS", "RULES", "FINDINGS JSON", "EXAMPLES", "EXIT CODES", "ENVIRONMENT",
]);

function colorize(text) {
  return text
    .split("\n")
    .map((line) => {
      if (SECTIONS.has(line)) return `${ANSI.bold}${ANSI.green}${line}${ANSI.reset}`;
      if (/^layout\b/.test(line) || /^\s*%\s+/.test(line)) return accent(line);
      return line;
    })
    .join("\n");
}

function accent(line) {
  return line.replaceAll(/(?<![.\w-])layout(?![.\w-])/g, `${ANSI.bold}${ANSI.green}layout${ANSI.reset}`);
}

// One spelling for the color override: `options.color` wins, the TTY check is the
// fallback, and NO_COLOR beats both.
function shouldColor(options) {
  if (process.env.NO_COLOR) return false;
  return options.color ?? process.stdout.isTTY;
}
