# Lint findings

`layout lint` prints `<contract>:<line>: <message>` for each finding, with its code. Errors stop
`layout .` from running (exit 2) and make `layout lint` exit 1; warnings are style only and change
no exit code unless `layout lint --strict` asks. Most
warnings are fixed by `layout format`.

| Code | Level | What it means | Fix |
| ---- | ----- | ------------- | --- |
| `layout/slot-syntax` | error | A line that is not a valid entry, or a hoist defined twice | Rewrite the line as `name`, `name/`, `?name`, `{}`, `A -> B` or `$name: regex`; remove the second definition |
| `layout/bad-regex` | error | A hoist's regex does not compile | Fix the regex; it is a JavaScript regex without `/` delimiters |
| `layout/unknown-ref` | error | An entry or hoist uses `$name` that is never defined | Define `$name:` at the top, or escape a literal dollar as `\$` |
| `layout/ref-cycle` | error | Hoists refer to each other in a loop | Break the loop; a hoist may use only hoists that do not use it back |
| `layout/indent` | error | Indentation that is not two spaces per level, or an entry indented under a file | Indent by two spaces, only under a folder line |
| `layout/lines` | error | A cap that is not `<`, `<=`, `>`, `>=` or `==` and a number; a cap on a symlink; a cap hoist used anywhere but the end of a file entry | Write `<=2,000` or `$code` at the end of a file line; symlinks take no cap |
| `layout/empty` | error | The contract has no entries | Add at least one entry |
| `layout/unused-definition` | warning | A hoist no rule uses | Use it, or delete it |
| `layout/number-commas` | warning | A cap of four digits or more without commas | Write `<=2,000`; `layout format` does |
| `layout/hoist-align` | warning | Hoist values do not start one space after the longest `$name:` | `layout format` |
| `layout/comment-align` | warning | Trailing comments are not on one column | `layout format` |
| `layout/comment-unspaced` | warning | A comment without a space after `#` | Write `# text` |
| `layout/comment-caps` | warning | A comment starts with a lowercase letter | Start it with a capital, unless it opens with a code symbol, path or filename |
| `layout/comment-missing` | warning | A folder line has no trailing comment | Say what the folder is for |
| `layout/comment-wide` | warning | A line too long to leave room for a comment carries one | Move the comment to its folder's line, or to the README |
| `layout/line-long` | warning | A line runs past the wrap width | `layout format` wraps comments; shorten a long entry or name it with a hoist |
