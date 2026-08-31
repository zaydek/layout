// lint.mjs — check a contract's own syntax and house style.
//
//   lintLayout(source) -> { level, findings }
//
// This reads the .layout file's own FORM. It reads exactly the notation
// `layout check` reads — two-space indentation, one step per level (parser.mjs) —
// so a file the linter calls clean is a file the checker can parse. Line art
// (├── └── │) is OUTPUT, drawn by renderer.mjs; it is never input, and a contract
// that contains it is rejected here by name rather than misread.
//
// Rules — the complete style set, nothing else is emitted here:
//   layout/indent            an indent that is not a two-space step        (error)
//   layout/comment-missing   a directory entry with no trailing comment     (warn)
//   layout/comment-align     a comment's `#` not at col max(40, longest+3)  (warn)
//   layout/comment-caps      a comment not Uppercase-led                    (warn)
//   layout/comment-unspaced  a `#` not followed by a space                  (warn)
//
// It also names, EARLY, the faults that make a contract uncompilable — `check`
// refuses those outright with exit 2 (scan.mjs), so the lint is the warning shot,
// not the guarantee:
//   layout/bad-regex            a slot regex that does not compile            (error)
//   layout/unknown-ref          a `{$name}` with no `$name:` definition       (error)
//   layout/ref-cycle            `$a` -> `$b` -> `$a`                          (error)
//   layout/slot-syntax          any other slot the grammar rejects            (error)

import { columns } from "./ansi.mjs";
import { levelForItems } from "./findings.mjs";
import { parseLayout, parseNode } from "./parser.mjs";
import { LayoutContractError, PASTED, TAB_INDENT, commentBody, commentIndex, compilePattern, looksLikeHoistLine, maskRegexSpans, parseHoistLine, resolveDefinition, withoutBom } from "./scan.mjs";

export function lintLayout(source) {
  const parsed = withoutBom(source).split(/\r?\n/).map((line, i) => ({ ...parseLine(line, i + 1), no: i + 1 }));
  const findings = [];

  const definitions = readDefinitions(parsed, findings);
  compileRules(parsed, definitions, findings);
  checkComments(parsed, findings);
  checkUnusedDefinitions(parsed, definitions, findings);

  // STRUCTURE — where a `$name:` may sit, what may carry children — is the
  // parser's; asking it keeps lint and `check` in agreement. It runs LAST, and
  // only when the indentation is sound: the parser stops at the first bad indent,
  // while checkComments reports every one of them.
  if (!findings.some((item) => item.code === "layout/indent")) {
    contractFault(() => parseLayout(source), 1, findings);
  }

  // Not `localeCompare`: nothing the tool prints may depend on the ambient locale.
  findings.sort((a, b) => a.line - b.line || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  // The same fault found twice is one fault: the per-line pass and the parser can
  // overlap on one finding, word for word.
  const seen = new Set();
  return {
    level: levelForItems(findings),
    findings: findings.filter((item) => {
      const key = `${item.line}\u0000${item.code}\u0000${item.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  };
}

// The `$name:` map, and a finding for any name defined twice. Placement is not
// checked here — that is the parser's, asked for at the end of lintLayout.
function readDefinitions(parsed, findings) {
  const definitions = Object.create(null); // contract-supplied names; see parseLayout
  for (const hoist of parsed.filter((line) => line.kind === "hoist")) {
    if (definitions[hoist.name] === undefined) definitions[hoist.name] = { value: hoist.value, line: hoist.no };
    else findings.push(f("error", hoist.no, "layout/slot-syntax", `"$${hoist.name}:" is already defined on line ${definitions[hoist.name].line}`));
  }
  return definitions;
}

// Every definition and every rule compiled, so a contract that cannot be used is
// named line by line here rather than one-at-a-time by `check`'s exit 2.
function compileRules(parsed, definitions, findings) {
  for (const [name, definition] of Object.entries(definitions)) {
    contractFault(() => resolveDefinition(name, definitions, new Set()), definition.line, findings);
  }
  for (const entry of parsed.filter((line) => line.kind === "entry")) {
    // The parser already read this line — its objection is the one to report, and
    // a line it refuses must not also be compiled here.
    if (entry.fault) {
      findings.push(f("error", entry.no, entry.fault.code ?? "layout/slot-syntax", entry.fault.message));
      continue;
    }
    // Only an entry has a pattern. An outlet is a whole rule and a symlink is two
    // literal names; neither is ever compiled, by the checker or by this.
    if (entry.node.type !== "entry") continue;
    contractFault(() => compilePattern(entry.node.pattern, definitions), entry.no, findings);
  }
}

// A `$name:` no rule reaches enforces nothing. WHICH definitions a contract
// reaches only the resolver can answer, so this watches the reads the resolver
// actually makes rather than keeping a second copy of its grammar — recording the
// lookups IS the transitive answer. Only the RULES are compiled here:
// `compileRules` above resolves every definition eagerly, which would mark them
// all as reached.
function checkUnusedDefinitions(parsed, definitions, findings) {
  const reached = new Set();
  const watched = new Proxy(definitions, {
    get(target, name) {
      if (typeof name === "string") reached.add(name);
      return target[name];
    },
  });
  for (const line of parsed) {
    if (line.kind !== "entry" || line.node?.type !== "entry") continue;
    // A rule that does not compile was already reported by compileRules; what it
    // reached before failing still counts, which is why this swallows.
    try {
      compilePattern(line.node.pattern, watched);
    } catch { /* reported already */ }
  }
  for (const [name, definition] of Object.entries(definitions)) {
    if (reached.has(name)) continue;
    findings.push(f("warn", definition.line, "layout/unused-definition", `"$${name}:" is defined and no rule uses it`));
  }
}

// House style: the indentation, and where each `#` sits. One alignment column for
// the whole file — every commented line, entries and definitions alike, the same
// set layout-view measures — or `render` could emit a file this linter warns
// about.
function checkComments(parsed, findings) {
  const commented = parsed.filter((line) => (line.kind === "entry" || line.kind === "hoist") && hasComment(line));
  const alignCol = commentColumn(commented.map((line) => line.contentLen));
  const aligned = (line) => {
    if (line.hashCol !== alignCol) {
      findings.push(f("warn", line.no, "layout/comment-align", `Comment "#" should be at column ${alignCol} (is ${line.hashCol})`));
    }
  };

  // A definition's comment is checked for its column only: `comment-missing` is a
  // rule about directories, and the other two are about an entry's prose.
  for (const hoist of parsed.filter((line) => line.kind === "hoist" && hasComment(line))) aligned(hoist);

  for (const e of parsed.filter((line) => line.kind === "entry")) {
    if (e.indentFault) findings.push(f("error", e.no, "layout/indent", e.indentFault));
    if (!hasComment(e)) {
      // A DIRECTORY rule, as the parser reads one — a symlink or outlet ending in
      // `/` is not a directory.
      if (e.node?.type === "entry" && e.node.directory) {
        findings.push(f("warn", e.no, "layout/comment-missing", `Directory "${e.entry}" should carry a trailing # comment`));
      }
      continue;
    }
    if (!/^#( |$)/.test(e.comment)) {
      findings.push(f("warn", e.no, "layout/comment-unspaced", "A comment is `# ` (hash then a space)"));
    }
    // `\p{Ll}` rather than `[a-z]`: the rule is "starts with a lowercase letter",
    // and `ü` or `é` are lowercase letters ASCII cannot see.
    if (/^\p{Ll}/u.test(commentBody(e.comment))) {
      findings.push(f("warn", e.no, "layout/comment-caps", "Comment should start with an uppercase letter"));
    }
    aligned(e);
  }
}

// Where a file's trailing comments line up: the widest commented entry plus three,
// never left of column 40. One function because two things obey it — the linter
// WARNS off this column and layout-view EMITS on it; a second copy would let
// `render` write a file its own linter rejects.
export function commentColumn(widths) {
  return Math.max(40, Math.max(0, ...widths) + 3);
}

function parseLine(line, no) {
  if (!line.trim()) return { kind: "blank" };
  if (/^\s*#/.test(line)) return { kind: "comment" }; // a standalone comment line — names no entry

  const indent = /^ */.exec(line)[0].length;
  const rest = line.slice(indent);

  // A `#` inside a slot's regex is not a comment, so the split runs on the mask.
  const hashIdx = commentIndex(maskRegexSpans(rest));
  let entry, comment = null, hashCol = null;
  if (hashIdx >= 0) {
    entry = rest.slice(0, hashIdx).replace(/\s+$/, "");
    comment = rest.slice(hashIdx);
    hashCol = indent + columns(rest.slice(0, hashIdx)) + 1; // 1-based column of '#'
  } else {
    entry = rest.replace(/\s+$/, "");
  }

  // `$name: …` hoists a pattern for the whole file. It is a definition, not an
  // entry, so `comment-missing` does not apply — but its comment is a comment, and
  // it carries the same fields so it lands in the same alignment column render
  // uses.
  if (looksLikeHoistLine(entry)) {
    const hoist = parseHoistLine(entry);
    if (hoist) return { kind: "hoist", name: hoist.name, value: hoist.value, comment, hashCol, contentLen: indent + columns(entry) };
  }
  // What KIND of rule this is — directory, outlet, symlink — is the parser's
  // answer, asked for here rather than guessed at from the text. A line the parser
  // refuses carries its objection instead, so every bad line is reported rather
  // than only the first.
  let node = null;
  let fault = null;
  try {
    node = parseNode(entry, no);
  } catch (error) {
    if (!(error instanceof LayoutContractError)) throw error;
    fault = error;
  }
  return {
    kind: "entry",
    entry,
    node,
    fault,
    comment,
    hashCol,
    contentLen: indent + columns(entry),
    indentFault: indentFault(line, indent, entry),
  };
}

// The one indentation rule, stated the same way parser.mjs states it. Line art is
// called out by name because it is what a person copies out of `tree` or out of
// this tool's own rendered output, and it would otherwise read as a filename.
function indentFault(line, indent, entry) {
  if (TAB_INDENT.test(line)) return "Indentation must use spaces — a tab is not a level";
  // PASTED, from the module that owns it, so lint and check test the same pattern.
  if (PASTED.test(entry)) return "Rendered output or Markdown, not contract source — a contract indents with two spaces per level";
  if (indent % 2 !== 0) return `Indentation must use two-space steps (found ${indent})`;
  return null;
}

// Run one compile step; a LayoutContractError becomes the matching lint finding.
// Anything else is a real bug and is left to throw.
function contractFault(step, line, findings) {
  try {
    step();
  } catch (error) {
    if (!(error instanceof LayoutContractError)) throw error;
    findings.push(f("error", error.line ?? line, error.code, error.message));
  }
}

// A `#` with nothing after it is not a comment — the same call parser.mjs makes,
// so lint and render feed the same widths into the shared commentColumn.
function hasComment(entry) {
  return entry.comment !== null && commentBody(entry.comment).trim() !== "";
}

function f(level, line, code, message) { return { level, line, code, message }; }
