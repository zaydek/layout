# Doc Examples

Every ` ```layout ` block in `README.md` is compiled through the same path
`layout check` uses, against an empty directory so the run reaches the contract and stops
there. `README.md` is the only file scanned — the runner's `DOCS` list holds nothing else.

## Why

Documentation examples rot silently. The grammar moves, the prose gets rewritten, and a
snippet three sections down goes on teaching a spelling the tool no longer accepts — which
is precisely what happened to the case rules, where a sentence saying "still accepted" was
load-bearing for as long as somebody remembered to edit it.

The fence is the contract:

- ` ```layout ` — real layout source. It compiles, or this test fails with file and line.
- ` ```text ` — a legend, a table, or terminal output. A table showing syntax that is
  *refused* would be backwards to compile, so those are read and not run. Terminal
  output is different: it is a claim about what the tool prints, and check 5 below
  runs the block that makes one.

## What it checks

1. Every ` ```layout ` block resolves — definitions validate, every rule compiles. A block
   that would exit `2` under `layout check` fails here instead. A block that is empty, or
   a fence left unterminated, fails too. Each also lints clean under `--strict`: the page
   argues that a directory's comment is the point, and then showed two contracts whose
   directories had none, so a reader copying either got a warning from the tool the page
   was teaching.
2. At least 4 such blocks exist. A docs test that silently checks nothing reports green
   while every example rots, so the floor is pinned; deleting one fails here.
3. No compiling block carries the dead colon spelling (`:kebab-case`,
   `:snake_case`, `:PascalCase`). Those are legal in prose
   and in ` ```text ` tables — that is where the refusals are documented — but a block
   claiming to compile must not teach dead syntax.
4. The README's Layout Example is byte-identical to `repo.layout`. That section claims to
   print this repo's own contract verbatim, and a hand-copied tree drifts silently — the
   drifted copy still *compiles*, so check 1 passes while the section teaches a tree
   nothing enforces. It had drifted exactly that way: the copy had lost the `{}` outlet
   under `?fixtures/`, and carried an entry in a spelling `repo.layout` had already
   moved off. The block is found by its `CLAUDE.md -> AGENTS.md` line, so deleting or
   renaming that line fails here as well.

5. Every slot spelling in the syntax table compiles. That table is the reference
   for the whole notation and a second listing of a grammar `scan.mjs` also spells
   out in its header, so a form could be documented that the grammar refuses — or
   the reverse — with nothing to say so. Verified biting by documenting `{:9bad}`
   and watching the suite name it.
6. The tree at the top of the README is what the CLI actually prints. Its contract
   and its tree are materialized in a temp directory, `layout .` is run there, and
   the output is compared byte for byte. It is the first thing a stranger sees, and
   it is output: a change to the wording, the glyphs or the comment column would
   otherwise leave the front page quietly wrong. Verified biting, by moving one
   character and watching this suite fail.
7. The ordinary-project contract — the one a reader is most likely to copy — is run
   against a tree built to match it (exit 0), against the same tree plus one stray
   file (exit 1, naming the file), and against a component whose name breaks the
   casing regex (exit 1, naming it). All three are promises the page makes in prose.
   The last one is there because the page shipped `{:/[A-Z][A-Za-z]*/}` — a colon out
   of place, which is a slot NAMED `/[A-Z][A-Za-z]*/` and matches anything. It
   compiled, so check 1 passed; the stray-file case failed on the extension rather
   than the casing. The strictest-looking rule on the page enforced nothing.
8. The findings JSON example is piped through `layout render` and its drawn output
   diffed byte for byte against the block beside it — that JSON is the input format
   the page tells another tool to emit, and the tree under it is what the page
   promises they will get.

## Pass

```json
{"level":"PASS","code":"DOC_EXAMPLES_OK","examples":7}
```

## Fail

```text
README.md:39: this documented example does not compile — unknown pattern reference
"{$slug}" — this contract has no "$slug:" definition
```

## The Traps section

Every claim in `README.md`'s Install, Traps and Limits, executed: a contract, a tree, and
the exit code the page promises. The number is deliberately not written here — it
has already drifted once, from ten to fifteen, and the `PASS` line below counts
fenced examples rather than these. They were the one part of the page taken on
trust — every other example is compiled, linted or run — and they are the part
that makes precise claims about what a notation MEANS, which is the same thing as
checkable.

Each case also asserts that the sentence it executes is still on the page, matched
against the README with its whitespace collapsed so re-wrapping a paragraph does
not fail anything. That ties the two together in both directions: reword the trap
and the test fails, break the behaviour and the test fails. Without it the table
would be a second copy of the page's claims, free to outlive them.

The contract is written outside the tree and passed with `--config`, because a
`repo.layout` sitting in the tree is an entry no rule names — the run would exit 1
on the contract file and every claim would look confirmed for the wrong reason.
`{}` sits under the rules that should not fire for the same reason.

Every `layout` invocation on the page is checked against `OPTIONS`, the table
`layout.mjs` parses — the install line, the local one and the CI line are what a
reader pastes into a terminal or a workflow, and nothing read them. `--strict` on
the CI line fails, because a check has no warnings and does not take it; so does a
flag that does not exist. The help pages' `%` examples get the same treatment in
`../../help/output`.

Every fence on the page opens and closes, and no closing fence carries a language.
An unclosed one swallows the rest of the document on GitHub — the page still
renders, as one long code block — and nothing else here would notice, because the
block reader simply stops finding blocks.


The Limits section's `--ignore` paragraph is executed too. It is the only place the
glob semantics are written down, and it draws a distinction the reader has to take
on trust: `--ignore 'vendor/**'` EMPTIES the directory and still reports it, while
`--ignore vendor` skips it outright — which turns it into `Required entry missing`
when a rule wanted it. Two characters apart, opposite answers about one tree. The
sentence is asserted alongside the behaviour, whitespace-collapsed so that
reflowing the paragraph does not fail a page that still promises exactly this, and
`--ignore vendor/` is asserted to give a report identical to `--ignore vendor` —
that trailing slash was a silent no-op once, the spelling most likely to be reached
for doing nothing and saying nothing.

Two more Limits claims are executed the same way. The binding gap — a repeated
`{:name}` is checked after the regex has committed to a greedy split, so
`{:v}a{:v}` rejects `aaaaa` — is a FAIL the page admits to, and an admission is a
claim. The same-tier race is the one place on the page where the ORDER two rules
are written in moves the verdict, so both orders are run over one tree: the rule
that says more written first exits 0, the two lines swapped exit 1, and the loser
reports `Nothing left to match`. Either order alone would confirm nothing.
