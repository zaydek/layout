# Renderer Output Test

Fixture cases prove the `layout render` output shape. The count is in the `PASS`
line below rather than in a sentence here, because that one is checked.

Each fixture owns:

- `input.json`: generic findings.
- `args.txt`: `--key=value` pairs, parsed into the options object the runner hands
  `renderFindings` — the library directly, not the CLI. Anything else is refused
  rather than skipped: an `args.txt` written `--as actual`, the spelling the CLI
  accepts, would otherwise have tested the DEFAULT view while its name said
  otherwise. An option `renderFindings` does not read is refused too, and `--color`
  is handed across as the boolean the CLI passes rather than the string `on`.
- `expected.txt`: expected stdout.

They cover a list-style error filter, a tree with warn and error rows, a layout tree
carrying a regex rule, and a schema tree carrying the contract's own `#` comments —
where an OK row shows its comment (why the rule exists), a violating row shows the
finding instead, and a row marked `directory: true` renders a trailing `/`.

`colored-tree` is the only golden that runs with colour on, and it covers the
connectors, the placeholder painting and the `?` mark — the painting half of this
module previously had no golden at all.

`strongest-at-a-path`: one path can carry several findings — `ok` from the rule that
matched it, `warn` from a rule about its contents — and the tree drew `findings[0]`,
so a ✓ was painted over a warning and its message dropped. A row's glyph is the
worst thing anywhere beneath it; a row's message is the worst finding AT its own
path.

## Asserted directly, not through a golden

- An optional `?` prefix is dimmed in the row's own level colour, and a `warn` row
  uses a yellow `!` glyph. Plain-text snapshots hold neither.
- A rule addressed by `segments` renders as ONE line, while the same rule addressed
  only by its joined text splits on `/` into a fake subtree — which is why segments
  exist.
- A backslash means two different things and the report tells them apart: in a
  finding from another tool it is a Windows separator and becomes `/`; in a path this
  checker produced it is part of a NAME. The two look identical in the JSON, and are
  told apart by whether the row carries its segments. `../../checker/virtual-fs`
  holds the filesystem half.
- Order is taken from the SEGMENTS a row is drawn by, not from its path field, and it
  runs segment by segment so it agrees with the tree it is drawn as. A whole-string
  compare put `src-x` between `src` and `src/bad.md`, which `--filter=error` then made
  visible — a flag documented as not changing the verdict changing the order of a
  report people diff.
- Report order does not read the environment. `localeCompare` uses the ambient
  locale, so under `LC_ALL=sv_SE` a path moved from the top of a report to the
  bottom. Case-insensitive then exact now, which is deterministic; the pair asserted
  here sorts one way under that rule and the other way under every Latin locale.
- Two findings at one path draw one row, in `list` style as in `tree`. The list
  printed everything it was handed, so a directory that satisfied `{:x}/` and failed
  a file rule `docs` drew `✗ docs` above `✓ docs` — two rows contradicting each other
  in the view `--as actual` documents as one row per real path. `render` takes
  findings from any tool and cannot assume they were deduplicated, so the decision
  lives here rather than in the checker.
- Both styles reduce to one row per path BEFORE filtering. The tree did not, so a
  path carrying `ok` and `warn` drew a ✓ under `--filter=ok` — the
  green-over-a-warning bug arriving through the filter.
- Two rules that address the same text — `{:n}/` and `{:n}`, which the parser
  deliberately allows — draw two rows in `list` and one in `tree`: a tree cannot hold
  two nodes at one address, and the list keys on the kind as well. README's Limits
  says so, and these two assertions keep that sentence true.
- A control character in a filename is escaped on the way to the screen. POSIX allows
  a newline in a name and this output is read as one row per entry, so `a\nb.md` drew
  TWO rows, neither of which exists. `--format=json` still carries the name verbatim;
  what a name may not do is forge a row.
- Every comment starts at one column, measured in code POINTS. Three places line a
  comment up — the linter, the contract printer and this — and this one used
  `.length`, which counts an emoji as two. One `columns()` in `ansi.mjs` now, and all
  three ask it.
- A finding with no address at all draws at `.`, in both styles, the same `.` the
  report carries as its root. Unaddressed, it landed on the root NODE, which the tree
  only walks the children of, so `layout . --filter=error` printed nothing and exited
  1.
- An empty `layout` array is no schema view, not an empty one — it drew nothing while
  the roll-up still counted `items`.
- The verdict is the worst finding in the report, both lists together, and it is
  asserted through `normalizeFindings`, where the roll-up happens. It rolled up from
  `items` alone while `--as schema` — the default — draws `layout`, so a report
  carrying its errors only there printed a tree of ✗ and exited 0.
- The built-in example's two views report the same faults, and no row above `ok` is
  left without a message. It is the page that shows another tool what a well-formed
  report looks like, written by hand as two lists describing one run with nothing
  making them agree — and they had drifted.

Passes as `{"level":"PASS","code":"RENDER_OUTPUT_OK","fixtures":6}`.
