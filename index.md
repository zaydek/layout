# layout

`layout` checks a repo's tree against `repo.layout`, a contract that reads like a directory listing, and exits 1 on drift.

Source of truth: [the README](https://github.com/zaydek/layout/blob/main/README.md). Site: https://zaydek.github.io/layout/

## Example

```text
$slug: [a-z0-9]+(-[a-z0-9]+)*
$code: <=2,000

README.md                              # What this repo is
repo.layout                            # This file
src/                                   # One module per concern
  $slug.ts $code
```

```text
$ layout .
✗ notes.txt                                 # Unexpected by layout
✓ README.md                                 # What this repo is
✓ repo.layout                               # This file
✗ src/                                      # One module per concern
├─ ✓ $slug.ts
├─ ! checker.ts                             # 2300 lines, over its cap of 2000 — a warning until
                                            # 2500, where it fails
└─ ✗ Main.ts                                # Unexpected by layout
```

Exit 1.

## Install

A plugin for your coding agent.

- Claude Code: coming soon
- Codex: coming soon
- OpenCode: coming soon
- oh-my-pi: coming soon

## Grammar

```text
$kind:    user|feedback|project|reference|threads|idea
$project: z|life|annotate|chippy
$slug:    [a-z0-9]+(-[a-z0-9]+)*
$date:    \d{4}-\d{2}-\d{2}
$memory:  {$kind}_{$project}_{$slug}_{$date}
$code:    <=2,000

memories/
  ?.archive/
    {}                                   # Anything goes here
  $memory.md                             # Many: a pattern matches any number of files
  INDEX.md                               # One: a plain name is exactly one file
  memory.md                              # No cap given, so no cap
src/
  $slug.ts $code                         # A hoisted cap
docs -> ../docs                          # A symlink
```

- `$name: regex` hoists a bare regex, `|` for alternatives, at the top only.
- `name` is required, `name/` is a folder, `?name` is optional, `{}` is anything,
  `A -> B` is a symlink.
- `$name` ends at the first character outside `[A-Za-z0-9_]`; write `{$name}` when a
  word character follows. `\$` is a literal dollar.
- The same `$name` twice in one subtree matches the same text.
- A trailing cap like `<=2,000` limits a file's lines, with `<`, `<=`, `>`, `>=` or
  `==`; a hoist like `$code` names one. No cap means no limit.
- Comments start at column 40 at least and wrap at 80, continuing under the first `#`.

## Commands

```sh
layout .                   # Check this tree; exit 1 on drift
layout lint                # Check the contract's own syntax
layout format              # Rewrite the contract to house style
```
