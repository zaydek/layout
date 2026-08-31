# Self Test

Proves this repo conforms to its own `repo.layout` file. This is the bootstrap
credibility loop: layout should manage its own home before it manages anyone
else's.

It checks the repo root four ways. Once through `checkLayout` directly,
asserting level `OK`. Once through the real CLI, asserting
`layout . --filter=error --format=text` exits 0 and prints nothing. Once as
`layout --config=repo.layout --filter=error --format=text`, with no positional
path — the explicit spelling of the same check, so the two cannot drift apart.
And once with the contract arriving on STDIN, `layout . --config - --format=json`
fed `repo.layout`, compared against the same run reading the same contract from
the file. `--config -` is documented on the check page with its own example,
`cat draft.layout | layout check . --config -`, and no suite ran it: the `-` path
was proven for `lint` and `render` only, so the command most likely to be handed
a contract through a pipe was the one whose pipe was never opened. The comparison
is against the file spelling rather than against exit 0, because the claim is that
where a contract came from changes nothing about the report, and an exit code does
not say that.

Everything below rides along on that one case. Each has silently regressed
before, or could regress without anything noticing, and each fails this suite.

## The CLI surface

- `layout . --as=schema` renders the RULE tree, so its output must still contain
  `{:module}.mjs` and `repo.layout`.
- `layout render --example=stress --format=json --color=on` emits parseable JSON
  with an `items` array and no `"rendered"` key — `--format=json` wins over
  `--color=on`.
- An option belongs to the commands that read it. `--example` is render's, so
  `layout --example` must exit 2 and say so; and a leading flag is not a command
  word, so `layout --filter=error .` is the same run as `layout . --filter=error`.
- `layout check` through a SYMLINK to this repo gives the same answer as checking
  it directly. The CLI followed the link to decide it was a directory while the
  tree reader lstat'd it — saw a link rather than a directory, read no children,
  and reported every rule in the contract missing.

## The contract, and render's round trip

- `layout lint repo.layout --strict` exits 0. This is the command AGENTS.md tells
  a reader to run instead of trusting its paragraph about comments, and no suite
  ran it — the round trip below lints render's OUTPUT, which is re-aligned on the
  way through, so an alignment fault in the file itself was invisible.
- `layout render repo.layout` piped into `layout lint - --strict` exits 0. Both
  align trailing comments to the same column, and they share one function for it;
  this is what would fail if a second copy of that rule appeared.
- The same round trip over a contract that HOISTS. `repo.layout` has no `$name:`
  definitions, so the check above never exercised one — and render was dropping
  every definition it was given, printing the entries that use a `{$name}` and
  none of the lines that make it resolve. Its output was a contract that exits 2,
  from an input that checks clean.

- A failing run keeps its exit code when the reader closes the pipe. `layout . |
  head` makes every remaining write fail with EPIPE, which used to `process.exit(0)`
  and throw the verdict away — a failing tree piped into `head` reported success.
  The report used here is 5,000 findings, because the first version of this gate
  used the repo's own, which fits in one pipe buffer: no EPIPE ever fired and it
  passed with the bug restored.
- `layout . --format=json`, captured through a PIPE, is whole. stdout to a pipe is
  asynchronous, and `process.exit` beside a `console.log` cuts the buffer where it
  stands: this ~15KB report came back 8190 bytes long and unparseable to anything
  that captured it, while the same command redirected to a file was whole —
  invisible from a terminal and certain in CI. The CLI sets `process.exitCode` and
  lets the process end, so Node flushes. The row count is compared against the same
  run made in-process at the top of the suite, and the report has to stay bigger
  than a pipe buffer for the gate to mean anything, which is asserted too.
- **A fault names the contract by a path the reader can use.** The label was
  `path.relative(cwd, file)` unconditionally, so a contract outside the cwd — any
  absolute `--config`, or a contract shared between repos — was announced as
  `../../../../../../../var/folders/…/bad.layout:2:`: longer than what the user
  typed, useless from any other directory, and a string appearing nowhere in their
  command. It stays relative while it is inside the cwd, because that is the
  compiler spelling an editor jumps to, so both directions are asserted. Same fault
  as the tree name below, one field over.
- **`--format=json` drawn back by `render` is `--format=text`.** The render help
  page promises that "any tool that can emit a path and a severity gets layout's
  output for free", and the strongest instance of that claim — layout's own output —
  was the one nobody ran. If the two disagree then the JSON is not an interchange
  format, it is a second report, and the disagreement surfaces in someone else's CI
  rather than here. Over a tree with real findings, because an all-OK report
  exercises none of the ✗ rows or the ordering between them; the exit code is
  compared too, and it is 1 on both sides, because `render` reports the level it was
  handed.
- A report names the tree it is about. `checkLayout` hard-coded `"root": "."`, so
  `layout check src --format=json` answered `"."` about a run over `src` — the one
  field whose whole job is naming the tree, naming the wrong one. The checker is
  handed a resolved absolute path and the CLI knows the name the user typed, so the
  CLI is where it is stamped.
- `layout render repo.layout` reproduces `repo.layout` byte for byte. This is the
  formatter claim on the file the command is most likely to be pointed at, and it
  used to fail: the parse tree had no record of blank lines or standalone `#`
  comments, so rendering deleted four blank lines from the repo's own contract. The
  round trip above only lints the output, and a file with its blank lines removed
  lints perfectly well.

`../virtual-fs` holds the stronger halves of that claim: every contract there is
rendered and re-checked against its own tree, so render must preserve what a
contract MEANS and not merely emit something that lints — and rendering it twice
must not move it again, because a formatter that keeps moving the file is one
nobody can put in a pre-commit hook.

## Claims `repo.layout` cannot express

- **The package a consumer installs actually runs.** The README's install line is
  `npx github:zaydek/layout .`, and nothing proved that. It is not the repo:
  `files` narrows an install to `src/`, so a module reaching outside it would break
  every install while every suite here passed — and before `files` existed, an
  install carried all 493 files of this test tree. The package is built with
  `npm pack`, unpacked, and RUN against a tree of its own.
- **No dependencies**, the README's headline and the reason there is no lockfile,
  no build step and no `npm install`. `package.json` is read here and asserted to
  declare none of the four dependency fields.
- **Every module says what it is on line one**, `// <filename> — <what it is>`:
  the contract can require that a file exists, not that it introduces itself. The
  rule held by habit until three of the most-read files in the repo turned out
  never to have had a header — `checker.mjs` and `parser.mjs`, found when this
  gate was written, and `layout.mjs`, which the gate itself missed at first
  because it only walked `src/lib`.
- **Every `// ── ` section rule is exactly 80 columns wide** and ends in its rule.
  Six of seventeen had drifted, a column each, which the eye reads as a mistake in
  the file rather than in the rule. Columns are code points, not bytes: `─` is
  three of those, which is how they drifted.
- **`scan.mjs`'s header lists its exports, and the list matches them.** Every other
  module's header names its one entry point; that file opens with "Exports, in
  dependency order" and then enumerates them, which is a complete claim — and it had
  drifted: `UNICODE`, the flag every slot regex compiles with, was exported and not
  listed.
- **No module imports a name it never uses.** Moving the contract validation out of
  `checker.mjs` left two behind, and the export gate below could not see them: it
  reads the module that DECLARES a name, not the one that asked for it.
- **No module under `src/lib/` exports something nothing imports.** `ansi.mjs`
  kept a `cyan` for months after its last caller went, and the only reason it was
  found is that someone read the file. Imports are matched by name out of the
  `import { … } from "./module.mjs"` lists, so a mention in a comment does not
  keep an export alive.

## Claims in the docs, read out of the thing they describe

- **The workflow still runs the gate.** It was read here only for its Node matrix,
  so deleting `npm test` from it left every suite passing locally, CI green on a job
  that checks nothing, and the badge at the top of the README — the most public
  claim this project makes — reporting that green. The self-check step is asserted
  for the same reason, and so is the `pull_request:` trigger, without which the
  badge only ever describes main.
- The README's "Requires Node 22 or newer … on 22 and 23" is read out of
  `.github/workflows/test.yml`, because the workflow is the half that runs — and
  so is `package.json`'s `engines.node`, which is the half that warns someone
  installing on an older one.
- `AGENTS.md`'s fixture-shape table — the thing an agent reads before adding a
  test — must list every suite that owns fixtures and name every file those
  fixtures actually hold, so a suite that grows a new input file cannot leave the
  table describing the old shape.

## The test tree itself

No file under `tests/` is gitignored, no directory under it is empty, and every
name git tracks is the name on disk byte for byte. Git tracks neither an empty
directory nor an ignored file, so either one makes a suite pass here and fail from
a clone. All three had happened — two fixtures whose subject was an empty
directory arrived with no `fs/` at all, one whose subject was a `.DS_Store` could
never be committed, and one whose subject was a decomposed filename was rewritten
to the composed form by git on the way in, so the file in a clone was not the file
the case was about. Skipped when there is no `.git`, so a tarball download still
runs.

Passes as `{"level":"PASS","code":"SELF_LAYOUT_OK"}` — no count; the repo is the
single case.
