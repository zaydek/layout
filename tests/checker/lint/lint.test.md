# Lint Test

Fixture cases prove the linter (`src/lib/lint.mjs`) flags a contract's own syntax
and house-style violations. It reads the same two-space notation `layout check`
reads, so a file this linter calls clean is a file the checker can parse.

Each fixture owns:

- `input.layout`: the contract under lint.
- `expected.json`: the expected `lintLayout(source)` result.

The runner discovers every fixture directory and compares the JSON result. The
count is in the `PASS` line at the bottom, because that one is checked; the
fixtures are named for what they hold, and grouped here by the rule they exercise.

## Contracts that lint clean

- `pass-clean` — a plain tree.
- `pass-hoist` — `$date:`/`$slug:` definitions used by a `{$ref}` entry.
- `pass-outlet` — `{}` nested under an optional directory. The shape `repo.layout`
  itself uses, and the shape that must never reach `compilePattern`, which refuses
  the empty slot.

## House style, one fixture per warn rule

`fail-caps`, `fail-align`, `fail-missing`, `fail-unspaced` — `layout/comment-caps`,
`layout/comment-align`, `layout/comment-missing`, `layout/comment-unspaced`.

`fail-caps-unicode` is the caps rule reading more than ASCII: the rule is "starts
with a lowercase letter", and `/^[a-z]/` let `# über alles` pass while
`# lowercase ascii` warned.

`fail-align-hoist` is the same rule over a `$name:` line. The linter aligned to the
widest commented ENTRY and `render` aligns to the widest commented LINE, definitions
included, so a long definition moved one column and not the other — `render`
emitting a file this linter warns about.

`fail-unused-definition` is a `$name:` no rule reaches: a line that looks like part
of the contract and enforces nothing. Reachability, not mention — `$a` used only by
an unused `$b` is unused too, and `$b: $a-y` mentions `$a` while referring to
nothing, because a reference is `{$a}`. So the check watches the lookups
`resolveDefinition` makes as the rules compile, which is the transitive answer by
construction rather than a second reading of the grammar.

## Contracts that cannot compile

`fail-bad-regex` and `fail-unknown-ref` — `layout/bad-regex` and
`layout/unknown-ref`. The lint names an uncompilable contract EARLY, rather than
leaving it to `check`'s exit 2.

## Structure, which is the parser's to judge

`fail-hoist-after-entry`, `fail-hoist-indented`, `fail-outlet-children` — a
`$name:` after the first entry, a `$name:` indented, and rules nested under `{}`.
The linter used to keep its own partial copy of those rules and called clean two
contracts `check` exits 2 on, while the lint help page promised it "names every
fault at once". There is no copy now, at either level: when the indentation is sound
the linter runs the parser over the whole file and reports what it objects to, and
each line's KIND — directory, outlet, symlink — is `parseNode`'s answer rather than a
string test here. Identical findings from the two passes are collapsed.

Indentation is the one exception to that promise: a file whose nesting cannot be
read has no shape to report structural faults against.

## Indentation

`fail-line-art` feeds the box-drawing tree this tool *emits* back in as source:
`layout check` would read `├── README.md` as a filename at depth 0 and pass on a
lie, so `layout/indent` refuses it by name. `fail-indent-odd` and `fail-indent-tab`
are the other two spellings of the rule, and they are here because they were
UNREPORTABLE — the parser threw a bare `Error`, so `lint` exited 2 with no findings
and `lint --format=json` printed no JSON at all, while the help page listed
`layout/indent` as a finding. `fail-indent-odd` holds two bad lines, because the
parser stops at the first and this linter must name both.

## Asserted directly, not through a snapshot

Three fixtures also go through the CLI with `--format=json` and must print exactly
what the library returns, in the shape the README documents for `lint`: a flat
`findings[]`, where `check` and `render` print a path-addressed tree. Every other
case calls `lintLayout` directly, so the emission itself was never run — the library
could be right and `--format=json` print anything.

Passes as `{"level":"PASS","code":"LINT_OK","fixtures":18}`.
