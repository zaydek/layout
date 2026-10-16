# Layout

`layout` checks a repo's tree against `repo.layout`, a contract that reads like a
directory listing, and exits 1 on drift.

## Install

Releases and an installer will be published here.

## Grammar

```text
$component: [A-Z][a-zA-Z0-9]*
$hook:      use[A-Z][a-zA-Z0-9]*
$code:      <=400

README.md                              # One: a plain name is exactly one file
package.json
?CHANGELOG.md                          # ? marks an entry optional
src/
  main.tsx
  components/
    $component.tsx $code               # Many: a pattern matches any number
    ?$component.test.tsx               # An optional test beside it        
  hooks/
    $hook.ts $code                     # A hoisted cap
public/
  {}                                   # Anything goes here
docs -> ../docs                        # A symlink
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
