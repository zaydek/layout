// renderer.mjs — findings as text: the OK/WARN/ERROR trees and lists layout draws.
//
//   renderFindings(findings, options) -> string
//
// Two VIEWS of the same run, chosen by `--as`: "schema" draws the CONTRACT, one
// row per rule; "actual" draws the TREE, one row per real path. Two STYLES, chosen
// by `--style`: a tree with connectors, or a flat list. Every unknown value is
// refused rather than defaulted. Color is the caller's decision and arrives as a
// boolean; `stripAnsi` at the end means an uncolored run and a colored one differ
// by escape codes alone, never by layout.

import { ANSI, columns, stripAnsi } from "./ansi.mjs";
import { normalizeFindings, normalizePath, printable, rankLevel } from "./findings.mjs";
import { findClose } from "./scan.mjs";

// What each report option means when nobody said. Imported by the CLI too, so the
// defaults have one copy.
export const DEFAULTS = { as: "schema", style: "tree", filter: "ok,warn,error", color: "auto", format: "text" };

export function renderFindings(input, options = {}) {
  const findings = normalizeFindings(input);
  const color = options.color ?? false;
  const view = normalizeView(options.as ?? DEFAULTS.as);
  const style = normalizeStyle(options.style ?? DEFAULTS.style);
  // The CLI hands the parsed Set down; tests hand the literal CLI string. Both are
  // the same three severities either way.
  const filters = options.filter instanceof Set ? options.filter : parseFilter(options.filter ?? DEFAULTS.filter);
  const lines = [];
  // An EMPTY `layout` is not a schema view, it is no schema view — drawing it
  // would print nothing while the roll-up still counted `items`.
  const schema = view === "schema" && Array.isArray(findings.layout) && findings.layout.length > 0;
  // Reduced to one row per path BEFORE filtering, in both styles, so the filter
  // sees a path's worst finding rather than whichever row survives.
  const items = oneRowPerPath(schema ? findings.layout : findings.items);

  if (style === "list") {
    for (const item of items.filter((entry) => filters.has(entry.level))) lines.push(renderListItem(item, color));
  } else {
    lines.push(...renderTree(items, { color, include: filters }));
  }

  const body = lines.join("\n").replace(/\n+$/, "");
  const text = body ? `${body}\n` : "";
  return color ? text : stripAnsi(text);
}

// ── Option values, refused rather than defaulted ─────────────────────────────
export function normalizeStyle(value) {
  if (value === "tree" || value === "list") return value;
  throw new Error(`Unknown render style: ${value}`);
}

export function normalizeView(value) {
  if (value === "actual" || value === "schema") return value;
  throw new Error(`Unknown render view: ${value}`);
}

// A comma-separated subset of ok,warn,error, and nothing else — a typo must fail
// rather than silently narrow the report.
export function parseFilter(value) {
  const filters = new Set();
  for (const raw of String(value).split(",")) {
    const name = raw.trim();
    if (!name) continue;
    if (!["ok", "warn", "error"].includes(name)) throw new Error(`Unknown filter: ${name}`);
    filters.add(name);
  }
  return filters;
}

// ── Laying out the rows ──────────────────────────────────────────────────────
// The trailing `/` a directory rule is written with, so both styles spell one
// rule one way.
function renderListItem(item, color) {
  const slash = item.directory ? "/" : "";
  return colorizeLine(`${glyph(item.level)} ${printable(addressOf(item).join("/"))}${slash}`, annotation(item), color, item.level);
}

// Where a finding sits, as the segments both styles draw it by. A finding with no
// address at all belongs to the root, whose address is `.` — otherwise it would
// vanish from the report while still counting toward the verdict. A rule that
// carries segments is addressed by them: splitting its joined text on "/" would
// explode one regex rule into a fake subtree.
function addressOf(item) {
  const parts = Array.isArray(item.segments)
    ? item.segments.filter(Boolean)
    : normalizePath(item.path).split("/").filter(Boolean);
  return parts.length > 0 ? parts : ["."];
}

// What the row says after the `#`. A violation displaces the contract's own
// comment: when something is wrong the row says what, and when nothing is wrong
// the comment — why this rule exists — is the most useful thing it can carry.
function annotation(item) {
  return item?.message || item?.comment || "";
}

function renderTree(items, { color, include }) {
  const root = { children: new Map(), findings: [] };
  for (const item of items.filter((entry) => include.has(entry.level))) {
    const parts = addressOf(item);
    let node = root;
    // Keyed by the segment. Two rules CAN address the same string — `{:n}/` and
    // `{:n}`, which the parser deliberately allows — and a tree cannot hold two
    // nodes at one address, so those share a row. `--style list` keys on the kind
    // as well and shows both. README's Limits says so.
    for (const part of parts) {
      if (!node.children.has(part)) node.children.set(part, { name: part, children: new Map(), findings: [], directory: false });
      node = node.children.get(part);
    }
    // An empty directory has no children to give it away, so the finding says so.
    if (item.directory) node.directory = true;
    node.findings.push(item);
  }
  return renderNodeChildren(root, "", color);
}

function renderNodeChildren(node, prefix, color, depth = 0) {
  const entries = [...node.children.values()];
  const lines = [];
  entries.forEach((child, index) => {
    const last = index === entries.length - 1;
    const level = strongestLevel(child);
    const own = ownFinding(child);
    const marker = depth === 0 ? "" : last ? "└─ " : "├─ ";
    const slash = child.children.size || child.directory ? "/" : "";
    const line = `${prefix}${marker}${glyph(level)} ${printable(child.name)}${slash}`;
    lines.push(colorizeLine(line, annotation(own), color, level));
    const nextPrefix = depth === 0 ? "" : `${prefix}${last ? "   " : "│  "}`;
    lines.push(...renderNodeChildren(child, nextPrefix, color, depth + 1));
  });
  return lines;
}

// Two different questions about one row. The GLYPH is the worst thing anywhere
// beneath it, so a collapsed directory still shows that something inside is wrong.
// The MESSAGE is this path's own — a parent must not borrow a child's.
function strongestLevel(node) {
  let level = ownFinding(node).level;
  for (const child of node.children.values()) {
    const childLevel = strongestLevel(child);
    if (rankLevel(childLevel) > rankLevel(level)) level = childLevel;
  }
  return level;
}

// The worst finding AT this path, not the first of them — one path can carry
// several, e.g. `ok` from the rule that matched it and `warn` from a rule about
// its contents.
function worst(findings) {
  return findings.reduce((a, b) => (rankLevel(b.level) > rankLevel(a.level) ? b : a));
}

function ownFinding(node) {
  if (node.findings.length === 0) return { level: "ok", message: "" };
  return worst(node.findings);
}

// How many rows one path gets is the RENDERER's decision, because render draws
// findings from any tool and cannot assume the tool deduplicated them. Order is
// first appearance, which is the order the caller sorted them into.
function oneRowPerPath(items) {
  const byPath = new Map();
  for (const item of items) {
    // The kind is part of the identity here for the same reason it is in the tree.
    const key = `${item.path}${item.directory ? "/" : ""}`;
    const seen = byPath.get(key);
    byPath.set(key, seen ? worst([seen, item]) : item);
  }
  return [...byPath.values()];
}

function glyph(level) {
  return level === "error" ? "✗" : level === "warn" ? "!" : "✓";
}

// ── Painting them ────────────────────────────────────────────────────────────
function colorizeLine(line, message, color, level) {
  const [body, comment] = splitAnnotation(line, message);
  const plain = comment ? `${body}${comment}` : body;
  if (!color) return plain;
  return `${colorizeBody(body, levelColor(level))}${comment ? `${ANSI.dim}${comment}${ANSI.reset}` : ""}`;
}

function levelColor(level) {
  return level === "error" ? ANSI.red : level === "warn" ? ANSI.yellow : ANSI.green;
}

// The body and the message arrive already separated — searching the finished line
// for a `#` could find one inside a slot's regex or a filename.
function splitAnnotation(rawBody, message) {
  const body = rawBody.trimEnd();
  const comment = String(message ?? "").trim();
  if (!comment) return [rawBody, ""];
  const bodyLength = columns(body);
  if (bodyLength >= ANNOTATION_COLUMN) {
    return [body, "\n" + wrapComment(comment, ANNOTATION_COLUMN, body)];
  }
  const spacing = " ".repeat(ANNOTATION_COLUMN - bodyLength);
  return [`${body}${spacing}`, wrapComment(comment, ANNOTATION_COLUMN, body, { firstLinePrefix: "" })];
}

// Where a rendered row's `#` annotation starts. Not lint's commentColumn: that
// is where comments align in a contract FILE, and a drawn row carries a glyph and
// tree connectors ahead of the same text.
const ANNOTATION_COLUMN = 44;

// 100, not 80: comments start at column 44 and the tree adds indentation, so an
// 80 budget would wrap nearly every row. Anything genuinely long still wraps.
const RENDER_WIDTH = 100;

function wrapComment(comment, commentColumn, body, options = {}) {
  const prefix = "# ";
  const width = RENDER_WIDTH - commentColumn - columns(prefix);
  const lines = [];
  let current = "";
  for (const word of comment.split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (columns(next) <= width) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines
    .map((line, index) => {
      const indent = index === 0 ? options.firstLinePrefix ?? continuationPrefix(body, commentColumn) : "\n" + continuationPrefix(body, commentColumn);
      return `${indent}${prefix}${line}`;
    })
    .join("");
}

function continuationPrefix(body, width) {
  let out = "";
  for (let i = 0; i < width; i += 1) {
    const char = body[i] || " ";
    out += char === "│" ? char : " ";
  }
  return out;
}

// The row's colour is passed in, never recovered by parsing the string this file
// just built.
function colorizeBody(line, textColor) {
  let out = "";
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === "{") {
      // Brace-balanced, so a quantifier inside a slot regex (`\d{4}`) does not end
      // the placeholder early and leave the rest of the rule uncolored.
      const close = findClose(line, i);
      if (close > i + 1) { // a non-empty interior
        const placeholder = line.slice(i, close + 1);
        out += colorizePlaceholder(placeholder, textColor);
        i += placeholder.length - 1;
        continue;
      }
    }
    const char = line[i];
    if ("│├└─".includes(char)) out += `${ANSI.dim}${char}${ANSI.reset}`;
    else if (char === "✓") out += `${ANSI.green}${char}${ANSI.reset}`;
    else if (char === "?") out += `${ANSI.dim}${textColor}${char}${ANSI.reset}`;
    else if (char === "!") out += `${ANSI.yellow}${char}${ANSI.reset}`;
    else if (char === "✗") out += `${ANSI.red}${char}${ANSI.reset}`;
    else out += char;
  }
  return out;
}

function colorizePlaceholder(value, textColor) {
  let out = "";
  const syntaxColor = `${ANSI.dim}${textColor}`;
  for (const char of value) {
    if ("{}:;,".includes(char)) out += `${syntaxColor}${char}${ANSI.reset}`;
    else out += `${textColor}${char}${ANSI.reset}`;
  }
  return out;
}
