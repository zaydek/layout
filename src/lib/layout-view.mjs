// layout-view.mjs — print a contract as layout parsed it.
//
//   showLayout(source) -> string
//
// This is what `layout render <file>.layout` prints. It is a re-emission of the
// parse tree, not a copy of the input: what you see here is what the checker
// will act on. Trailing comments are part of that — a comment is the only place
// a contract says why a slot exists — so they are re-emitted, re-aligned to the
// column lint enforces rather than to wherever they happened to sit.

import { columns } from "./ansi.mjs";
import { parseLayout, validateContract } from "./parser.mjs";
import { commentColumn } from "./lint.mjs";

export function showLayout(source) {
  const layout = parseLayout(source);
  // Printed only if it RESOLVES — render must not exit 0 over a broken contract.
  validateContract(layout);
  // Definitions are emitted too: without the `$name:` lines the output would not
  // resolve, and the README calls this a round trip.
  const definitions = Object.entries(layout.definitions)
    .map(([name, definition]) => ({ line: definition.line, text: `$${name}: ${definition.value}`, comment: definition.comment ?? null }));
  const rows = flatten(layout.children, 0);
  // The alignment column is lint's, imported rather than repeated: emitting at
  // a different one would mean `render` produced a file its own linter warns about.
  const column = commentColumn([...definitions, ...rows].filter((r) => r.comment).map((r) => columns(r.text)));
  // A trivia row has no comment field at all — it IS its text, `#` included.
  const draw = (r) => (r.comment ? `${pad(r.text, column)}# ${r.comment}` : r.text);
  // Emitted in the order the file was written, trivia included. A `$name:` can
  // only sit above the first entry, so line order already puts definitions first.
  const body = [...definitions, ...rows, ...layout.trivia].sort((a, b) => a.line - b.line);
  // Trailing blank lines are not structure the author is keeping — the closing
  // newline is added below.
  while (body.length > 0 && body.at(-1).text === "") body.pop();
  return body.map(draw).join("\n") + "\n";
}

// Pad so the next character lands on `column` (1-based). Only commented rows are
// padded, and `commentColumn` is the widest commented row plus three, so the `1`
// is a floor nothing can reach.
function pad(text, column) {
  return text + " ".repeat(Math.max(1, column - 1 - columns(text)));
}

function flatten(children, depth) {
  const rows = [];
  for (const node of children) {
    rows.push({ line: node.line, text: `${"  ".repeat(depth)}${renderNode(node)}`, comment: node.comment ?? null });
    rows.push(...flatten(node.children ?? [], depth + 1));
  }
  return rows;
}

function escapeHash(value) {
  return value.replaceAll("#", "\\#");
}

function renderNode(node) {
  if (node.type === "outlet") return "{}";
  // Re-escaped, because parseNode unescapes both sides — a bare `#` would read as
  // a comment on the way back in, changing what the contract means.
  if (node.type === "symlink") return `${node.optional ? "?" : ""}${escapeHash(node.source)} -> ${escapeHash(node.target)}`;
  if (node.type === "entry") return `${node.optional ? "?" : ""}${node.rawPattern}`;
  // The parser makes outlets, symlinks and entries, and nothing else reaches here
  // — an unknown node must be loud, never a silently dropped rule.
  throw new Error(`render: unknown layout node type "${node.type}"`);
}
