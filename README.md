# Layout

`layout` checks a repo's tree against `repo.layout`, a contract that reads like a
directory listing, and exits 1 on drift.

## Install

Releases and an installer will be published here.

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

## Example

<img src="examples/features-dark.svg" alt="examples/features.layout, highlighted">

## Commands

```sh
layout .                   # Check this tree; exit 1 on drift
layout lint                # Check the contract's own syntax
layout format              # Rewrite the contract to house style
```
