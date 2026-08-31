# Layout

[![test](https://github.com/zaydek/layout/actions/workflows/test.yml/badge.svg)](https://github.com/zaydek/layout/actions/workflows/test.yml)

**Write your repo's shape down as an executable contract, and check the working
tree against it.**

Where does a new test go? Which files are required? That knowledge lives in
your head, so it drifts — and agents drift faster, inventing a new path every
session. Layout makes the shape a contract that reads like a directory listing:
`layout .` checks the tree against it, and drift becomes a failing exit code.

```text
✓ repo.layout
✓ src/
├─ ✓ layout.mjs
└─ ✓ lib/
   └─ ✓ {:module}.mjs
✗ tests/
├─ ✗ parser/
│  └─ ✗ notes.md                            # Unexpected by layout
└─ ✓ {:slug}/
   └─ ✓ {:slug}.test.mjs
```

Every test directory matched the rule; one stray file did not. Exit `1`. A row
that matched shows the RULE it matched — `{:slug}/` — and a row that failed
shows the real path, `parser/`, because no rule claimed it. `{:slug}` is a
slot: it matches any one path segment and remembers it, so writing `{:slug}`
twice forces the directory and the file inside it to share a name.
[Syntax](#syntax) has the rest.

## Examples

Copy it, change the names:

```layout
# Contract for this project. `layout .` checks the tree against it.

package.json                           # Name, scripts, dependencies
package-lock.json                      # Whatever your installer writes
README.md                              # What this is
repo.layout                            # The shape, checked by `layout .`
public/                                # Static assets, served as-is
  {}
src/                                   # Application code
  index.ts                             # Entry point
  components/                          # One file per component, PascalCase
    {/[A-Z][A-Za-z]*/}.tsx
  utils/                               # Pure helpers, no framework imports
    {:util}.ts
tests/                                 # One test per surface
  {:name}.test.ts
```

`layout .` there exits 0. Add `src/components/helpers.ts` and it exits 1,
naming the file. Your first run in a real project will report something — a
lockfile, a `dist/`, a forgotten dotfile: decide what belongs, add it,
`--ignore` or delete the rest. `public/` takes `{}` because nobody wants to
enumerate images; `components/` takes a regex because the casing is the rule.

A monorepo, where every package must carry the same four things — the slot
repeats, so a new package needs no edit here and a half-made one fails:

```layout
# Contract for a monorepo. Every package carries the same shape.

package.json                           # The workspace root
packages/                              # One directory per package
  {:pkg}/                              # Named for what it publishes
    package.json                       # Its manifest
    README.md                          # Its front door
    src/                               # Its source
      {}
    tests/                             # Its tests, beside the source
      {}
```

A content site, where the filename IS the policy — date first so posts sort,
and a post's assets live in a directory carrying the same name:

```layout
# Contract for a blog. Chronology and slugs are enforced by name.

$post: /\d{4}-\d{2}-\d{2}-[a-z0-9-]+/

posts/                                 # One markdown file per post, date-first
  {$post}.md
?assets/                               # A post's files, under the post's own name
  {$post}/                             # Same name as the post it belongs to
    {}
```

**The comment column is the point.** A contract opens with a banner comment —
what repo this is, and that it is a contract rather than a listing. The shape
says what an agent may write; the trailing `#` comment says *why the slot is
there*. "What the suite proves, in prose" is an instruction, and an agent that
reads it stops emitting an empty stub.

## Install

```sh
npx github:zaydek/layout .
```

Or pin it in the project, so every run and every CI job uses one version:

```sh
npm install --save-dev github:zaydek/layout
npx layout .
```

No dependencies — plain ESM on Node's standard library.
Requires Node 22 or newer — that is what CI runs, on 22 and 23.
It is not on npm; GitHub is the distribution.

Start small and grow it. A contract is legal as soon as it names one thing, and
`{}` says "anything else here is fine". Name the contract file itself, or the
first run will tell you it is unexpected — it is a file in the tree like any
other:

```layout
package.json                           # Name, scripts, dependencies
repo.layout                            # This file
src/                                   # Application code
  {}
```

And in CI — silent on success, non-zero on drift:

```yaml
- run: npx --yes github:zaydek/layout . --filter=error
```

## Syntax

One entry per line, two spaces of indentation per level. `layout .` reads
`repo.layout` in that directory, or the only `*.layout` there, or whatever
`--config` names — several with none called `repo.layout` is refused as
ambiguous. Exit `0` when the tree matches, `1` when it does not, `2` when the
run could not proceed.

```text
literal             Required file or folder
?literal            Optional file or folder
{:name}             Any segment, bound to `name`
{a,b,c}             Enum — the value must be one of these
{/re/}              Regex — the value must match this shape
{:name;a,b,c}       Enum, bound to `name`
{:name;/re/}        Regex, bound to `name`
{$name}             A hoisted pattern, bound to `name`
{:x;$name}          A hoisted pattern, bound to `x`
$name: /re/         Hoist a pattern for the whole file (top of file)
$name: a,b,c        Hoist a value list for the whole file (top of file)
{}                  Outlet: anything else here is fine, unchecked
A -> B              Symlink A must point at B
# comment           Comment-only line
literal # comment   Inline comment
a\{b\}.md           Escape a literal `#`, `{` or `}` in a name
```

A slot matches one whole path segment — any characters except `/`, dots
included, so `{:route}.ts` accepts `v1.recipes.ts`; write a regex when you mean
less than that. `?` marks any entry optional. Regexes are implicitly anchored,
so `^` and `$` are errors. There are no case rules: write the shape as a regex.

<details>
<summary>Hoisting and repeated names</summary>

Hoisting names a pattern once; definitions may reference each other:

```layout
$date:     /\d{4}-\d{2}-\d{2}/
$slug:     /[a-z0-9.-]+/
$incident: /INCIDENT_{$date}_{$slug}\.md/

incidents/                             # One file per incident, named by date
  {$incident}
```

Repeated names bind to the same value inside the same rule path:

```layout
{:slug}/                               # One directory per tool, named for it
  {:slug}.tool.md
  {:slug}.tool.mjs
```

A contract that does not resolve — an unknown `{$ref}`, a regex that does not
compile, a cycle — exits `2`. It never degrades into a slot that matches
anything.

</details>

<details>
<summary>The contract this repo checks itself against</summary>

This is `repo.layout`, byte for byte — a test asserts it:

```layout
# Contract for layout — the tool that checks a tree against a file like this one.
# `layout .` checks this repo against it; `checker/self` keeps it green in CI.
#
# This is a contract, not a directory listing. A directory whose membership grows
# (lib modules, test suites) carries a slot; a fixed set is spelled out, so a new
# member there costs a deliberate line.

AGENTS.md                              # Repo doctrine — an agent reads this first
CLAUDE.md -> AGENTS.md                 # Symlink: one source of truth, many harnesses
README.md                              # The public front door
LICENSE
package.json                           # The bin, the test gate, and what an install ships
?package-lock.json                     # Written by `npm install`; layout needs none
.gitignore
.github/                               # CI only: the test gate, run on push and PR
  workflows/                           # One workflow; there is nothing else to automate
    test.yml
repo.layout                            # This file. `layout .` checks the repo against it

src/                                   # The engine
  layout.mjs                           # CLI entry: check / lint / render / help
  lib/                                 # One concern per module; no barrel file
    {:module}.mjs

tests/                                 # The oracle — every suite is a directory
  run.mjs                              # The gate: discovers and runs every suite below
  snapshot.mjs                         # Writes one fixture's expected.json, by name
  {:topic}/                            # Surface under test: checker, renderer, help…
    {:slug}/                           # One case; :slug must bind across all three
      {:slug}.test.md                  # What the suite proves, in prose
      {:slug}.test.mjs                 # The executable assertion
      ?fixtures/                       # Optional; a directory so it stays auditable
        {}
```

So the comments are checked: `layout lint` warns on a directory with no comment
and on a comment off the alignment column; `--strict` makes those warnings exit
`1`, and [Render](#render) formats them so you never count columns.

</details>

<details>
<summary>Commands, flags, and rendering other tools' findings</summary>

```text
layout [check] [path]   compare a tree against its contract
layout lint <file>      read a contract's own syntax and house style
layout render [file]    print a contract, or draw findings JSON
layout help [command]   the reference pages
```

Five flags shape the report and none changes the verdict:

```text
--filter <list>   Severities, comma-separated. Default: ok,warn,error.
--format <mode>   text (default) | json — the whole report as data
--as <view>       schema (default) draws the CONTRACT, one row per rule;
                  actual draws the TREE, one row per real path — and the RULE
                  for anything missing, which has no path to draw
--style <mode>    tree (default) | list
--color <mode>    auto (default) | on | off
```

`layout help check` has the rest.

### Render

`layout render <file>` reprints a contract with every comment on the alignment
column — the formatter for the warning `lint` gives you. Running it twice
changes nothing more, and what it prints checks a tree exactly as the input
did. Pointed at findings JSON instead, it draws any tool's path-addressed
results in the same tree:

```json
{
  "root": ".",
  "items": [
    { "level": "warn", "path": "docs/INDEX.md", "message": "Stale entry" }
  ]
}
```

```text
! docs/
└─ ! INDEX.md                               # Stale entry
```

</details>

<details>
<summary>Traps — none of these looks wrong on the page</summary>

## Traps

- **Some entries are invisible.** `.git` and `node_modules` are never read, at
  any depth. Dot-files are skipped too, unless a rule at that level asks for
  one — a rule asks when it would not match the same name with the dot removed:
  `.gitignore` asks; `{:route}.ts` does not, so it is not a request for
  `.hidden.ts`. An unlisted `.env` is not "unexpected", it is unseen. Name the
  dot-files you care about; `.git` stays invisible however you name it.
- **A bare `{name}` is a one-value enum, not a named slot.** `{name}` matches
  the literal text `name`; the slot is `{:name}`. Casing words look like rules
  and are not: `{kebab-case}` and `{:x;PascalCase}` both compile, and then
  require a file named literally `kebab-case` or `PascalCase`. Only the colon
  spelling `{:x:PascalCase}` is refused.
- **A rule names one entry, never a path.** `docs/api.md` on one line can never
  match — a rule is compared against one segment — so it is refused, exit `2`.
  Nest it. The same goes for a symlink's source; its target is a path on
  purpose.
- **A rule matches a name AND a kind**, and a file named `docs` does not
  satisfy `docs/`; when nothing else claims it you get `Expected a directory,
  found a file`. A link satisfies a plain file rule; a FIFO or a socket does
  not.
- **The more a rule says, the earlier it claims a file.** One name first — a
  literal, a symlink, or a `{:s}` whose `s` a parent already bound — then a
  constrained pattern, then `{:name}`, then `{}`. So rule order does not change
  what a contract means, except between two equally constrained rules that
  match the same file: see Limits. `?` excuses a rule for being absent, not for
  losing a claim.
- **A repeated `{:name}` binds down, not across.** `{:v}.a` and `{:v}.b`
  written as siblings accept `x.a` and `y.b`. Give them a shared parent —
  `{:v}/` with `{:v}.a` and `{:v}.b` inside it — and the binding holds.

</details>

<details>
<summary>Limits — what a green check does not promise</summary>

- A directory rule with no children only says the directory exists: `src/` on
  its own accepts `src/junk.exe`. Write the entries, or `{}` out loud.
- Binding equality has no backtracking: the regex commits to a greedy split
  first, so `{:v}a{:v}` rejects `aaaaa`. A false FAIL, loud, never a silent
  pass.
- Two equally general rules can race for one file, and order can move the
  verdict: `{:a}/` with a `{}` child above a childless `?{:d}/` exits 0; the
  same two lines swapped exit 1, the loser reporting `Nothing left to match`
  and naming the winner.
- A slot regex has no timeout. You write both the regex and the filenames, but
  `{/(a+)+b/}` against twenty-six `a`s already costs a second of matching, and
  forty would take minutes.
- Names are compared byte for byte, so composed and decomposed `café` are
  different names — as they are to the filesystem. When that is why a rule
  failed, the message says so.
- The comment column counts code points, not display columns, so CJK and emoji
  entries look ragged in a terminal. Measuring display width needs a width
  table, and this tool has no dependencies.
- Symlinks are compared by the text they point at, never followed. `A -> B`
  passes whether or not `B` exists — list `B` itself if it must be there.
- A control character or bidi override in a filename is escaped in the report;
  `--format=json` carries the name verbatim.
- `--ignore <glob>` hides paths from the TREE; it does not relax the contract.
  `*` matches within one segment, `**` across segments, and the pattern must
  match a whole entry name or a whole path from the root. So `--ignore
  'vendor/**'` empties `vendor/` but still reports `vendor` itself; `--ignore
  vendor` skips the tree outright, and so does `--ignore vendor/`. Repeatable
  and comma-separated, so a filename containing a comma cannot be ignored.
- `check` and `render` print a path-addressed tree (`items[]`); `lint` prints a
  flat list (`findings[]`). Two rules can address the same text — `{:n}/` and
  `{:n}` — and the default tree view draws them as one row with the worse
  verdict; `--style list` shows both.

Not in scope, and not coming: checking inside files, glob-heavy policy,
rewriting a tree to match a contract.

</details>

## Tests

`npm test`. This page is executable, so it cannot rot: every contract on it is
compiled and linted, both terminal outputs are produced by the real CLI and
diffed byte for byte, and every claim in [Traps](#traps) and Limits is a
contract, a tree and an exit code the suite runs — each asserting its sentence
is still on the page. `AGENTS.md` has the rest.

## License

MIT © Zaydek Michels-Gualtieri. See [LICENSE](LICENSE).
