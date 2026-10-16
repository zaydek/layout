# Commands

```sh
layout .                   # Check this tree against ./repo.layout
layout lint repo.layout    # Check the contract's own syntax and style
layout format              # Rewrite ./repo.layout to house style, in place
layout format --check      # Exit 1 if format would change the contract
layout --version           # Print the version
```

## layout .

Reads `repo.layout` in the current folder and checks the tree under it. It prints each entry it
judged, a check or a cross, and on a cross the reason: "Unexpected by layout" for a file no rule
admits, "Missing" for a required entry that is not there, a cap finding for a file over its limit.

Run it at the repository's top. A contract governs only its own folder and below; there is no walk up
to a parent contract, and a contract in a subfolder does not replace the root one. To check a
subproject, run `layout .` inside that folder against its own `repo.layout`.

layout never reads file contents except to count lines for a cap, and never prints them.

## layout lint

Checks a contract itself: errors (a contract that cannot be read, a bad regex, an unknown or
cyclic hoist, bad indentation) and style warnings. `reference/lint.md` lists every finding and its
fix. It exits 1 on an error; warnings change the exit code only under `--strict`. `layout .` also
lints the contract it read and prints its warnings after the tree, without changing its exit code.

## layout format

Rewrites `repo.layout` to house style: hoist values aligned one space after the longest `$name:`,
trailing comments on one column (40 or later), long comments wrapped at the configured width and
continued under the first `#`, commas in numbers of four digits or more. It changes only spacing,
wrapping and number spelling, never what the contract admits. Running it twice changes nothing the
second time. `--check` writes nothing and exits 1 when the file would change.

## The .layout.config

A YAML file beside the contract, named after it: `repo.layout.config` for `repo.layout`. Optional.

```yaml
wrap: 100                  # Where format wraps and lint measures: 80, 100 or 120 (default 120)
```

## Exit codes

| Code | Meaning |
| ---- | ------- |
| 0    | The tree matches (or lint found no error, or format had nothing to change) |
| 1    | Drift; or lint found an error (or a warning under `--strict`); or `format --check` would change the file |
| 2    | layout could not run: no contract, a broken contract, an unreadable tree, an unsupported system |

Scripts and CI should branch on these codes, not on the text.
