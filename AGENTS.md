# Agents

`layout` checks a tree against a contract. `CLAUDE.md` symlinks here, so every
harness reads one file.

## Read order

1. `README.md` — what the tool is for and how the notation works.
2. `repo.layout` — this repo's own contract, and the only map of the tree. There
   is no second copy to keep in sync, and there should not be one.
3. `src/layout.mjs` for command dispatch, `src/lib/` for behavior.
4. The `*.test.md` beside a suite, before changing that suite. Each states what
   its suite proves.

## Rules

- **`repo.layout` is executable, not decorative.** `layout .` must stay green, so
  adding a file to this repo means adding it to the contract — or `checker/self`
  fails, which is the point.

- **Every *directory* entry in `repo.layout` carries a trailing `#` comment**
  saying why the slot exists. That comment is the part an agent reads, and a
  directory without one is the only absence `layout lint` warns about — an outlet
  says "anything", which is the whole comment, and a file's name is usually its
  own explanation. Most files here carry one anyway; where a comment exists the
  linter also checks its column, spacing and capitalization. Run
  `layout lint repo.layout --strict` rather than trusting this paragraph.

- **Two-space indentation is the only contract notation** — exactly two per
  level, not four, not a tab. Line art (`├── └── │`) is what `layout render`
  draws; reading it back would take `└── index.ts` for a filename at depth 0 and
  pass on a lie, so both `check` and `lint` refuse it by name, along with a
  Markdown code fence. Do not paste `tree` output, or a fenced block out of the
  README, into a `.layout` file.

- **Fixture tests stay directory-based**: one directory per case, no shared setup
  and no hidden state. The shape is per suite, not uniform, because each suite
  needs different inputs:

  | Suite | Owns |
  | --- | --- |
  | `checker/virtual-fs` | `layout.layout` + `fs/` + `expected.json` + an optional `ignore.txt` |
  | `checker/exit-codes` | `layout.layout` + `fs/` + `expected.txt` (the exact stderr) |
  | `checker/lint` | `input.layout` + `expected.json` |
  | `renderer/output` | `args.txt` + `input.json` + `expected.txt` |
  | `help/output` | `args.txt` + `expected.txt` + an optional `status.txt` |
  | `checker/regex-slots`, `checker/self`, `docs/examples` | nothing — table-driven |

- **A test is worth what it fails on.** After adding one, break the thing it
  watches and watch it fail; if it stays green, it is describing rather than
  checking.

- **`layout render` takes path-addressed findings from any tool.** Do not bake
  line-count or unrelated tool logic into layout itself.

- **What `repo.layout` cannot express, `checker/self` does.** Each of these fails
  the suite, so you hear about it before you push:

  - every file under `src/` opens with `// <filename> — <what it is>`, and every
    `// ── ` section rule inside one is exactly 80 columns wide;
  - no module under `src/lib/` exports a name nothing imports, and `scan.mjs`'s
    header lists exactly what it exports;
  - no line of `src/` outside a comment calls `localeCompare` — report order may
    not depend on the ambient locale;
  - `package.json` declares no dependencies of any kind;
  - `npm pack` produces a package that carries `src/` and no tests, and the CLI
    inside it runs against a tree of its own — the install path the README
    documents;
  - nothing under `tests/` is gitignored and no directory under it is empty — git
    tracks neither, so such a fixture passes here and fails from a clone;
  - `repo.layout` lints clean under `--strict`, survives a round trip through
    `layout render` into `layout lint - --strict`, and is reproduced by
    `layout render` byte for byte;
  - `layout . --format=json` captured through a PIPE carries every row — stdout to
    a pipe is asynchronous, so an exit beside a write truncates it;
  - the README's Node versions, and `package.json`'s `engines.node`, are the ones
    `.github/workflows/test.yml` runs;
  - the fixture-shape table above names every suite that owns fixtures, and every
    file those fixtures hold.

- Do not commit generated dot-prefixed output such as `.artifacts/`.
- Do not push unless explicitly asked.

## Verification

```sh
npm test
node src/layout.mjs . --filter=error --format=text
```

The check prints nothing and exits 0 — output there is the failure.

`npm test` runs `tests/run.mjs`, which discovers every `*.test.mjs` under
`tests/` and prints one `PASS` line per suite plus a final count. Nothing lists
the suites by hand, so a new suite runs the moment it exists.

It also fails a suite whose sibling `.test.md` has drifted, five ways: the suite
exits 0 without printing a `PASS` line at all; the doc no longer quotes the line
it does print; the doc restates that count in prose and gets it wrong; the doc
names a `pass-…`/`fail-…` fixture that exists nowhere in the repo; or the doc
says the same paragraph twice. When you add or rename a fixture, update the doc;
the gate will tell you if you forget.

Adding a fixture to `checker/virtual-fs` or `checker/lint` means writing its
`expected.json`, which is generated:

```sh
npm run snapshot -- <fixture-name>
```

By name, never in bulk, and then READ. A blanket regeneration turns a snapshot
suite into a record of whatever the code happens to do — which is why
`checker/regex-slots` re-reads the same fixtures against a hand-written table of
intent. The other suites pin exact stdout or stderr, and those you write by hand:
that is the point of them.
