# Virtual FS Test

Fixture cases prove layout's checking against small, auditable filesystems.

Each fixture owns:

- `layout.layout`: the contract under test.
- `fs/`: a real tree, materialized on disk.
- `expected.json`: the expected result, in the shape `layout check --format=json`
  prints, with paths relative to `fs/`.
- `ignore.txt`, optional: the `--ignore` globs, one per line. The glob compiler had
  no test at all until these, which is how it came to read `?` as a regex quantifier
  and hide a file nobody had named.

The runner discovers every fixture directory, calls `checkLayout` directly (not the
CLI), and deep-compares the result to the snapshot. These are GENERATED snapshots:
they prove the output is stable, not that it is right. `../regex-slots` re-reads
most of the same fixtures against a hand-written table of intent, so a wrong answer
shows up there while snapshot drift shows up here. (Counts are deliberately absent
from this prose: the count that matters is in the `PASS` line, and that one is
checked.)

Passes as `{"level":"PASS","code":"VIRTUAL_FS_OK","fixtures":88}`.

## Properties asserted over EVERY fixture, not pinned per case

- **Order does not change the verdict.** Each contract is rewritten with its rules
  in the opposite order at every depth, each rule carrying its own subtree, and must
  reach the same verdict — the promise the tiers exist to keep. Not the same
  findings: two rules in one tier still race for a child and the first written wins,
  so the loser's message legitimately differs. Four fixture pairs pin specific
  shapes; this is the general claim, and it is where the last violation hid.
- **Rendering preserves meaning.** Each contract is rendered by `showLayout`,
  re-checked against its own tree, and must reach the identical result — and
  rendering the rendered contract must not move it again. A contract can lint clean
  while saying something else (a dropped `?`, an unescaped `#`), so `checker/self`'s
  "renders to something that lints clean" is the weaker half of this.
- **`lint` accepts what `check` compiles.** No fixture may produce a lint ERROR.
  `../exit-codes` holds the other direction — every contract `check` refuses, `lint`
  refuses too — so the two cannot drift either way. Warnings are exempt: house
  style, which `check` does not judge.
- **Only `ok` and `error` levels.** A check has no warnings, which is why `--strict`
  is not a check option.
- **No row is ever repeated exactly**, in either list. Every rule speaks once per
  thing it has to say, and three separate edits have reopened this.

## Cases built at run time rather than as fixtures

Each is here because git cannot carry the file the case is about:

- **Unicode encoding** — `café.md` composed (U+00E9) against decomposed
  (e + U+0301). macOS hands out the second and most editors type the first, so a
  contract can miss a file whose name is the same glyphs while a diff shows nothing;
  the message says so rather than reporting an entry the reader can see. Built here
  because git on macOS has `core.precomposeunicode` on and rewrites the name on the
  way in.
- **`.git` and `node_modules`** — skipped before any rule sees them, at every depth,
  with no option to turn that off, so a rule naming one can never be satisfied and
  must say that rather than report a directory that is plainly there missing. They
  are also invisible rather than merely unmatched: an outlet over them finds nothing
  to claim. `node_modules/` is gitignored and a `.git` inside a fixture would be a
  repository.
- **A control character in a name** — a name reaches the reader through the row's
  address and through any message that quotes it, and only the address was escaped.
- **A bidi override** — `gpj.<U+202E>txt.md` displays as `gpj.dm.txt` in any
  terminal that honours it. Escaped on the way to the screen; a zero-width joiner is
  not, because it composes one glyph and reorders nothing.
- **A FIFO** — a special file carrying the right name is a near miss, not a match.
  Git stores no FIFO.
- **A backslash in a filename** — `normalizePath` rewrites `\` to `/` for findings
  from tools that use Windows separators, which turned `a\b.md` into an invented
  directory. A repo carrying that name is a trap on Windows.
- **Two near misses of different kinds** — a directory rule beside both a file and a
  symlink says both things; deduping by the rule kept only the first.
- **What a rule says when it matched nothing**, as a ten-row table: whether it lost
  a candidate and to whom, whether it near-missed one, and whether it is optional.
  One decision, so one table — edits have repeatedly fixed one row by breaking
  another. Lost to an EQUAL rule: it says so, and `?` excuses it only when it has no
  children, since a subtree would otherwise go unchecked. Lost to a MORE SPECIFIC
  rule: it says so, and `?` does excuse it, because that rule carved the child out.
  Lost nothing: the near-miss pass speaks, or "Required entry missing", and `?`
  excuses it either way.
