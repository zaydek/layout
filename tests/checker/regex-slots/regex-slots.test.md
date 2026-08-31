# Regex Slots Test

The slot grammar, asserted by intent. 30 cases.

`virtual-fs` re-checks the same fixture directories against generated
`expected.json` snapshots — that proves the output is *stable*, not that it is
*right*, because the snapshots were produced by the implementation under test.

This suite reads the same fixtures and asserts a hand-written table instead:
for each case, the level the run must reach, the entries that must be OK on
disk, and the entries that must be reported unexpected. Snapshot drift shows up
in `virtual-fs`; a wrong answer shows up here. The table is 15 pass/fail pairs —
a regex slot over a whole segment, `\d{4}` not closing the slot early, a `#` and
a ` -> ` and an escaped slash inside a regex, a trailing `/` still demanding a
directory, an optional slot, a binding reused across a rule path, an unbound
enum, a hoisted regex, a hoisted comma list, a nested definition, a comma list
spliced into a regex, whole-segment anchoring, and two adjacent regex slots.

It also pins the finding address: a rule whose text carries `/` or `\` travels
as a segment array and is never path-normalized, and a rule without either
carries no segments at all — so no existing fixture shape moves.

Fixtures live in `../virtual-fs/fixtures/` — most of the slot-grammar cases, plus
`pass-date-hoisted` as the control for a rule that carries no segments. The
`sha256` and binding/prototype fixtures are not in the table; `virtual-fs`
snapshots them and nothing asserts their intent by hand. This suite owns no
`fixtures/` directory of its own.

Passes as `{"level":"PASS","code":"REGEX_SLOTS_OK","cases":30}`.
