// findings.mjs — the one shape every findings list is coerced into.
//
//   normalizeFindings(input) -> { level, root, items[], layout? }
//   printable(name)          a name with its control characters made visible
//
// `layout render` accepts findings from any tool, so nothing about the input can be
// trusted: an unrecognized level becomes "error", a missing message becomes "", a
// `\`-separated path becomes `/`-separated with a leading `./` dropped, and the
// top-level `level` is the worst finding across BOTH lists. `normalizePath` and
// `sortFindings` are exported as well: the renderer and the checker have to address
// and order items the same way.

export function normalizeFindings(findings) {
  const items = Array.isArray(findings?.items) ? findings.items : [];
  const layout = Array.isArray(findings?.layout) ? findings.layout : null;
  const normalized = {
    // The worst finding in the REPORT, both lists together — the verdict must
    // never come from a different list than the one being drawn.
    level: levelForItems(layout ? [...items, ...layout] : items),
    root: findings?.root ?? ".",
    items: items.map(normalizeItem),
  };
  if (layout) normalized.layout = layout.map(normalizeItem);
  return normalized;
}

function normalizeItem(item) {
  // A finding that carries segments is addressed by them, and its joined string
  // must survive untouched — normalizePath would rewrite a regex's `\` into a path
  // separator.
  const segments = Array.isArray(item.segments) ? item.segments.map(String) : null;
  const next = {
    level: normalizeLevel(item.level),
    path: segments ? String(item.path ?? "") : normalizePath(item.path ?? ""),
    message: item.message ?? "",
  };
  // Kept, never drawn: a finding from another tool may arrive with a code, and the
  // report is that tool's to read back out of `--format=json`.
  if (item.code) next.code = item.code;
  if (segments) next.segments = segments;
  // Two things the address cannot say: WHY the rule exists (its `#` comment) and
  // whether it names a DIRECTORY — an absent optional directory has no children,
  // so nothing else would tell the renderer to draw `?fixtures/`.
  if (item.comment) next.comment = item.comment;
  if (item.directory) next.directory = true;
  return next;
}

// Severity lives here, in one copy, because everything that reports has to agree
// on it — the linter, the checker, and the renderer.
export function levelForItems(items) {
  if (items.some((item) => normalizeLevel(item.level) === "error")) return "ERROR";
  if (items.some((item) => normalizeLevel(item.level) === "warn")) return "WARN";
  return "OK";
}

// An unrecognized level becomes "error", because a report whose levels cannot be
// read is not a report to pass. Case is not what makes one unreadable — layout's
// own JSON prints the roll-up as "ERROR" beside items spelled "error" — so levels
// are read case-insensitively; anything else stays loud.
function normalizeLevel(level) {
  const spelled = typeof level === "string" ? level.toLowerCase() : level;
  if (spelled === "ok" || spelled === "warn" || spelled === "error") return spelled;
  return "error";
}

// error > warn > ok, for "which of these two findings wins".
export function rankLevel(level) {
  return normalizeLevel(level) === "error" ? 3 : normalizeLevel(level) === "warn" ? 2 : 1;
}

// A filename may hold a newline, a tab, or any other control character — POSIX
// allows all of them — and this output is read as one row per entry, so a name
// must not forge a row or shift a column. Escaped on the way to the screen only;
// `--format=json` carries it verbatim.
export function printable(name) {
  // Control characters, plus the bidi formatting characters that reorder the text
  // AROUND them. Zero-width joiners are left alone — they compose one glyph out of
  // several and reorder nothing, and an emoji filename is legitimate to print.
  return name.replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, (char) => (
    { "\n": "\\n", "\r": "\\r", "\t": "\\t" }[char]
      ?? (char.charCodeAt(0) < 0x100
        ? `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`
        : `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`)
  ));
}

export function normalizePath(value) {
  return String(value).replaceAll("\\", "/").replace(/^\.\//, "");
}

// Case-insensitively, then exactly — never `localeCompare`, which reads the
// ambient locale, and a report people diff cannot depend on that. Compared
// segment by segment, because the report is drawn as a tree and a whole-string
// compare does not agree with one (`-` sorts below `/`). The segments compared
// are the SEGMENTS the renderer draws a row by, so the order and the drawing
// agree.
function addressSegments(item) {
  return Array.isArray(item.segments) ? item.segments : normalizePath(item.path).split("/");
}

function comparePaths(left, right) {
  for (let depth = 0; depth < Math.max(left.length, right.length); depth += 1) {
    if (left[depth] === undefined) return -1; // a is a parent of b, and parents come first
    if (right[depth] === undefined) return 1;
    const order = compareNames(left[depth], right[depth]);
    if (order !== 0) return order;
  }
  return 0;
}

function compareNames(a, b) {
  const lowerA = a.toLowerCase();
  const lowerB = b.toLowerCase();
  if (lowerA !== lowerB) return lowerA < lowerB ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortFindings(items) {
  return [...items].sort((a, b) => {
    const pathCompare = comparePaths(addressSegments(a), addressSegments(b));
    if (pathCompare !== 0) return pathCompare;
    // By SEVERITY, not by spelling: the first finding at a path must be its worst.
    return rankLevel(b.level) - rankLevel(a.level);
  });
}
