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

## Example

<img src="examples/features-dark.svg" alt="examples/features.layout, highlighted">

## Commands

```sh
layout .                   # Check this tree; exit 1 on drift
layout lint                # Check the contract's own syntax
layout format              # Rewrite the contract to house style
```
