# Help Output

Diffs every page the CLI can print, byte for byte. Each fixture owns `args.txt`
(literal CLI args), `expected.txt`, and an optional `status.txt` (default 0); the
runner spawns the real CLI with `NO_COLOR=1` and compares stdout on success, stderr
on failure. The count is in the `PASS` line below, because that one is checked.

- `help-overview` — `layout help`, the page a stranger sees first.
- `help-check`, `help-lint`, `help-render` — one per command.
- `help-bogus` — `layout help bogus` goes to stderr and exits 2, so an unknown topic
  is never mistaken for success.
- `version` — `layout --version` prints the version from `package.json`.
- `unknown-command` — `layout banana` exits 2. It used to print the overview and
  exit 0, so a typo looked like a successful run that checked nothing.
- `render-contract-with-report-flags` — `layout render repo.layout --format=json`
  exits 2 saying so. `render` has two modes, and in the one that prints a contract
  as written those flags mean nothing; accepted in silence, they made
  `layout render x.layout --format=json | jq` return text at exit 0.
- `value-with-equals` — `layout . --config=x=y.layout` names the whole value. The
  inline form split on every `=` and kept the first field, so `--ignore=a=b.md`
  compiled to a glob for `a`. A filename may contain an `=`; an option name may not.
- `single-dash-option` — `layout . -v` exits 2 naming `-v`. Only a `--` prefix
  counted as an option, so a mistyped version flag answered `No such directory: -v`.
  A bare `-` is still stdin, and a path that starts with a dash is `./-thing`.
- `misspelled-option` — `layout . --confg repo.layout` exits 2 naming `--confg`.
  argv used to be read twice and the second reader did not know the option NAMES, so
  a value-taking option spelled wrong left its value looking like a second path, and
  the answer pointed at the one token that was right.

## Asserted directly, not through a golden

A golden file proves a page matches itself, and nothing more.

- Bare `layout` and `layout help` print the same page.
- Every option in `OPTIONS` — the table `layout.mjs` parses — is documented on the
  page of each command that reads it, and no page names an option its command does
  not read. Checked both ways, so a new option that nobody wrote down fails here
  while every golden still passes.
- Every `layout/…` finding code the tool emits is named in the lint page's RULES,
  and every code that page names is one the tool emits. A code is what a reader
  greps for after a run; renaming one in `src/lib` leaves every page byte-identical.
- The default each option falls back to. It is written five times — once per help
  page, once in the README's flag table — and `DEFAULTS` is the only copy the tool
  obeys. This is why a suite about the CLI's help reads `README.md`.
- Every `%` example on every page is a command the CLI would accept, checked against
  `OPTIONS` so there is no second list of which flag belongs to which command. A
  pipeline is split first: these pages document `layout` on one side of a `|`.
- The findings JSON the render page teaches is findings `render` can read, proven by
  drawing it. The page taught `"level": "ERROR"`, and an unrecognized level becomes
  `error` on purpose, so a tool author following the page had every `OK` and `WARN`
  row turn into an ✗ and the exit code flip, silently.
- Colour: the painted page and the plain one differ only by escape codes — same
  words, same line breaks. Every golden above runs plain, so the half of `help.mjs`
  that paints had nothing behind it.
- The comment column the lint page names is the one `commentColumn` returns. It is
  the only number the help states, and a golden would happily pin a page that says
  40 while the linter warns at 44.

Passes as `{"level":"PASS","code":"HELP_OUTPUT_OK","fixtures":11}`.
