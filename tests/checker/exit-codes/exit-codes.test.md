# Exit Codes Test

Three outcomes, kept distinct:

```text
0   the contract resolved and the tree conforms
1   the contract resolved and the tree has findings
2   the contract is broken — it never ran against the tree
```

Exit 2 is the guarantee behind the rule that a typo in a contract is a hard
failure, not a lint: none of these may degrade into a slot that quietly matches
anything, so every fixture here stops the run before the tree is read.

Each fixture owns:

- `layout.layout`: the broken contract.
- `fs/`: a real tree, present so the failure is provably the contract and not a
  missing directory.
- `expected.txt`: the exact stderr.

Every message names its file and its line, in the `file:line:` spelling an editor
can jump to.

## What a contract is refused for

- **Unresolvable references** — an unknown `{$ref}`, a cycle, a cycle between two
  definitions no rule points at.
- **Bad regex** — one that does not compile, one anchored with `^`/`$`, a numeric
  backreference, a pointless identity escape (slot regexes compile in Unicode mode,
  which is what makes `\p{L}` a property escape rather than a literal), and a broken
  regex under a directory the tree never reaches — the contract compiles first.
- **Misplaced definitions** — a `$name:` after the first entry, a duplicate, an
  indented one, and one no rule reaches.
- **A rule no tree can satisfy** — children under a rule with no trailing `/`; a
  path written on one line (`docs/api.md`); a symlink source carrying a `/`; a rule
  that names nothing (`?` or `/` alone); a whole contract with no rules at all.
- **Two rules for one entry** — `a.md` twice, `CLAUDE.md` beside
  `CLAUDE.md -> AGENTS.md`, `d` beside `d/`, a repeated line, two `{}` at one level.
  Whichever rule claims the entry leaves the other reporting it missing, which
  blames the tree for a fault in the contract. Patterns may still overlap; only
  exact names collide.
- **Slot syntax** — an unclosed `{`, an outlet inside a larger pattern, `?{}`, a
  stray comma in a value list, a slot inside one, a rule after the colon
  (`{:n:kebab-case}` — there are no case rules), and a binding name that is not a
  word (`{:/[A-Z]+/}`, where the whole regex became the name and the slot matched
  everything).
- **Bad indentation** — a tab, a four-space step, a three-space step nested under a
  rule. Two spaces per level is the rule every document states, and it has to be the
  rule being run.
- **Text pasted out of a document** — a Markdown code fence, and the box-drawing
  characters this tool draws. Read as filenames they pass on a lie.
- **Malformed symlink rules** — `a ->`, `a -> b -> c`, and a slot on either side of
  the arrow. A bare `a->b.txt`, with no spaces, is a real filename and stays one.

## Asserted directly, not as a fixture

- All three commands agree about what a valid contract is: every fixture here makes
  `check` exit 2, so `lint` must report at least one ERROR and `render` must refuse
  to print it. `render` used to only parse, so it reformatted contracts the other two
  refuse and exited 0 over them.
- The controls, from `../virtual-fs/fixtures`: `pass-hoist-nested` exits 0 and
  `fail-hoist-nested` exits 1 with `Required entry missing` on stdout.
- A bad option VALUE, nine of them, all under `--format=json` — the path that never
  reaches the renderer, and so the path where validation living in the renderer was
  no validation at all. Four are an option that takes a value and is given none:
  written bare it carried `true` into whatever read it, and written `--config=` it
  carried `""`, which is falsy, so the run silently fell back to auto-discovery.
- A bare word the CLI cannot use — `layout . strict`, `layout ""`, `layout banana`.
- `render` handed findings JSON in six shapes, including the two a real tool emits
  and a contract whose first line opens with `[`, which must still draw as a
  contract.
- Which contract a bare `layout .` reads: one `*.layout` under any name is the
  contract, `repo.layout` wins outright however many sit beside it, and several with
  no `repo.layout` is refused BY NAME rather than resolved by sort order. The names
  it lists come off the disk, so they are escaped like every other name in a message
  — a file called `evil\n. Everything is fine.layout` would otherwise forge a line
  in the middle of the diagnostic.

Passes as `{"level":"PASS","code":"EXIT_CODES_OK","fixtures":35}`.
