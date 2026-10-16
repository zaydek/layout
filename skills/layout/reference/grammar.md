# The grammar

A contract is a directory listing. Each line is one entry; two spaces of indent put an entry inside the
folder above it. Every entry the tree has must match a line, and every required line must match an
entry. Anything the contract does not name is drift.

## Files and folders

A plain name is exactly one required file. A trailing `/` makes it a folder; its entries are indented
under it.

```layout
README.md
package.json
src/                                   # The app
  main.ts
```

## Optional entries

`?` marks an entry optional: it may be missing, and if present it must match.

```layout
README.md
?CHANGELOG.md                          # May be missing
?docs/                                 # The folder may be missing too
  guide.md
```

## Anything: `{}`

`{}` admits any entries, any depth, inside its folder. Use it only where the tree is not yours
(vendored code, generated output, assets someone else names).

```layout
README.md
public/                                # Static files, named by others
  {}
```

## Symlinks

`A -> B` requires `A` to be a symlink whose target is exactly `B`.

```layout
AGENTS.md
CLAUDE.md -> AGENTS.md                 # Every harness reads one file
```

## Hoisted regexes: `$name:`

At the top of the file, `$name: regex` names a bare regex. `$name` in an entry matches any text the
regex matches, so one line admits many files. The regex is anchored to the whole name segment; `|`
gives alternatives. A hoist may use other hoists.

```layout
$component: [A-Z][a-zA-Z0-9]*
$media:     png|jpg|webm

src/                                   # The app
  $component.tsx                       # Many: one file per component
assets/                                # Images and films
  $component.$media
```

`$name` ends at the first character outside `[A-Za-z0-9_]`. When a word character follows, write
`{$name}`:

```layout
$mod: [a-z][a-z0-9_]*

app/                                   # The package
  $mod.py
  ?{$mod}_test.py                      # {$mod} because _ is a word character
```

A hoist that no rule uses is a lint warning. A hoist that refers to itself, directly or through
another, is an error.

## Binding

The same `$name` twice in one subtree must match the same text each time. A folder named by a hoist
binds its children:

```layout
$tool: [a-z][a-z0-9-]*

tools/                                 # One folder per tool
  $tool/                               # The folder's name...
    $tool.mjs                          # ...is its one module's name
    ?README.md
```

`tools/deploy/deploy.mjs` matches; `tools/deploy/build.mjs` is drift.

Siblings bind too: a pattern on a later line that reuses `$name` must match a name an earlier line in
the same folder already matched. That is how a colocated test is tied to its module:

```layout
$component: [A-Z][a-zA-Z0-9]*

components/                            # One file per component
  $component.tsx
  ?$component.test.tsx                 # Only beside a component of that name
```

`Button.test.tsx` matches only when `Button.tsx` is there; a test with no module is drift.

## Caps

A trailing cap limits a file's length in lines. No cap means no limit.

```layout
$code: <=400

README.md <=2,000                      # At most 2,000 lines
src/                                   # The app
  main.ts $code                        # A hoist can name a cap
  big.ts <1,000                        # Fewer than 1,000
  stub.ts ==1                          # Exactly one line
  notes.md >=3                         # At least three
  table.ts >10                         # More than ten
```

The operators are `<`, `<=`, `>`, `>=` and `==`. Numbers of four digits or more take commas
(`<=2,000`); `layout format` adds them. A cap applies to each file the line matches. Binary files
are not counted.

## Comments

`#` starts a comment. A full-line comment explains the contract; a trailing comment explains its
line. Trailing comments start at column 40 or later, all on one column, and wrap at the configured
width (120 by default; see `commands.md`), continuing on the next line under the first `#`.

```layout
# The contract for a small library.

README.md                              # The one doc
src/                                   # The library, one file per concern,
                                       # no barrel file
  lib.ts
```

Every folder line carries a comment; lint warns when one doesn't.

## Escapes

`\$`, `\{`, `\}`, `\#` and `\?` are literal characters in a name.

```layout
price\$.txt                            # A file named price$.txt
\#notes.md                             # A file named #notes.md
```

## What is checked

- Files git tracks plus untracked files that are not ignored; `.git` is never read. Outside a git
  repository, the disk.
- A dotfile or dot folder the contract does not name is not checked, so a contract cannot yet forbid
  a stray `.env`. A dotfile the contract names is checked like any other entry.
- An empty folder is never required to hold anything; a required entry inside it is still required.
- A symlink is checked as a link, never followed.
