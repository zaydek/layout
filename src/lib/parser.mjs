// parser.mjs — read a `*.layout` file into the tree of rules the checker walks.
//
//   parseLayout(source) -> { type: "root", children: Node[], definitions: {} }
//
// One entry per line; two spaces per level of nesting, and nothing else. Line art
// (the `├── └── │` that `layout render` draws) is output, never source — reading it
// back would take `└── index.ts` for a filename at depth 0 and pass on a lie, which
// is why `layout lint` refuses it by name.
//
// A node is an `entry` (a pattern, optionally with `?` and a trailing `/`), an
// `outlet` (`{}`), or a `symlink` (`A -> B`). `$name:` lines at the top of the file
// hoist reusable rules into `definitions` and produce no node. Trailing `#` comments
// are kept on the node: a comment is the only place a contract says WHY a slot
// exists, and both `render` and `--as=schema` draw it.
//
// Slot syntax inside a pattern is not this file's business — scan.mjs owns it, and
// owns brace matching and regex-span masking so no second copy of either can drift.

import { LayoutContractError, PASTED, TAB_INDENT, commentBody, commentIndex, compilePattern, looksLikeHoistLine, maskRegexSpans, parseHoistLine, unescapeHash, validateDefinitions, withoutBom } from "./scan.mjs";

// Does this contract RESOLVE — every `$name:` definition, and every rule pattern.
// Parsing is not enough: `{:x:PascalCase}` and `{$missing}` parse and cannot
// compile, and a rule under a directory the tree never reaches must still be
// refused, or a broken contract passes depending on what is on disk. Both `check`
// and `render` ask, so the commands agree on "can this contract be used".
export function validateContract(layout) {
  validateDefinitions(layout.definitions, at);
  walk(layout.children, (node) => at(node.line, () => compilePattern(node.pattern, layout.definitions)));
}

function walk(children, visit) {
  for (const node of children) {
    if (node.type === "entry") visit(node);
    walk(node.children, visit);
  }
}

// A fault raised while compiling knows what is wrong and not where. The line is the
// caller's to add, and only if nothing has added one already.
function at(line, step) {
  try {
    step();
  } catch (error) {
    if (error instanceof LayoutContractError && error.line == null) error.line = line;
    throw error;
  }
}

export function parseLayout(source) {
  // A prototype-less map, because every name in it comes from the contract file —
  // `$toString:` must be definable and `{$constructor}` must not resolve to an
  // inherited member. `trivia` is every line that is not a rule (blank, or only a
  // `#` comment): the checker never sees it, but `render` re-emits the file and
  // must not delete section headers and blank lines.
  const root = { type: "root", children: [], definitions: Object.create(null), trivia: [] };
  const stack = [{ indent: -1, node: root }];
  let sawEntry = false;

  for (const [index, rawLine] of withoutBom(source).split(/\r?\n/).entries()) {
    const { code: withoutComment, comment } = splitComment(rawLine);
    if (!withoutComment.trim()) {
      root.trivia.push({ line: index + 1, text: rawLine.trimEnd() });
      continue;
    }
    // A tab is not a level — refused, never counted as zero indent.
    if (TAB_INDENT.test(withoutComment)) {
      throw new LayoutContractError(`indentation must use spaces — a tab is not a level`, "layout/indent", index + 1);
    }
    const indent = countIndent(withoutComment);
    if (indent % 2 !== 0) {
      throw new LayoutContractError(`indentation must use two-space steps`, "layout/indent", index + 1);
    }

    const text = withoutComment.trim();
    // Pasted line art must be refused by name here too — one rule, both commands.
    if (PASTED.test(text)) {
      throw new LayoutContractError(`"${text}" is rendered output or Markdown, not contract source — a contract indents with two spaces per level`, "layout/indent", index + 1);
    }

    // `$name: …` hoists a pattern for the whole file. It is recognized by shape at
    // any indent, so a misplaced one is an error rather than a silently mis-read
    // entry — `$` cannot start a real path here, so nothing legitimate collides.
    if (looksLikeHoistLine(text)) {
      define(root.definitions, text, indent, sawEntry, comment, index + 1);
      continue;
    }

    sawEntry = true;
    const node = parseNode(text, index + 1);
    node.comment = comment;
    while (stack.at(-1).indent >= indent) stack.pop();
    attach(stack.at(-1), node, indent, index + 1);
    stack.push({ indent, node });
  }

  // A contract with no rules forbids everything, so a tree that is perfectly fine
  // would come back with every entry "Unexpected by layout" — the report blaming the
  // tree for a fault in the contract. Usually an empty pipe. No line, because no line
  // is wrong; `faultAt` prints `<file>: ` for that.
  if (root.children.length === 0) {
    throw new LayoutContractError(
      'this contract has no rules, so it forbids everything — write an entry, or "{}" to allow anything',
      "layout/empty",
    );
  }

  return root;
}

// Record one `$name:` definition, or say why it cannot be one. Placement is the
// whole of it: a definition holds for the entire file, so it sits at the left
// margin above every entry, and is written once.
function define(definitions, text, indent, sawEntry, comment, line) {
  const hoist = parseHoistLine(text);
  if (!hoist) throw new LayoutContractError(`malformed definition — write "$name: /re/" or "$name: a,b,c"`, "layout/slot-syntax", line);
  if (indent !== 0) throw new LayoutContractError(`"$${hoist.name}:" must sit at the left margin, above the entries`, "layout/slot-syntax", line);
  if (sawEntry) throw new LayoutContractError(`"$${hoist.name}:" must come before the first entry`, "layout/slot-syntax", line);
  if (definitions[hoist.name] !== undefined) {
    throw new LayoutContractError(`"$${hoist.name}:" is already defined on line ${definitions[hoist.name].line}`, "layout/slot-syntax", line);
  }
  // The comment rides along so `render` can put it back. A definition is a rule like
  // any other, and the reason it exists is the half a name cannot carry.
  definitions[hoist.name] = { value: hoist.value, line, comment };
}

// Hang a node under its parent, or say why it cannot hang there. Each rule below
// refuses a contract that would otherwise parse clean while enforcing nothing, or
// while blaming the TREE for a fault in itself.
function attach({ node: parent, indent: parentIndent }, node, indent, line) {
  // Exactly one step deeper — two spaces per level, not merely "more indented".
  if (indent > parentIndent + 2) {
    // The root's indent is -1: a file whose FIRST rule is indented has no line
    // above it to nest under.
    throw new LayoutContractError(parentIndent < 0
      ? `indented ${indent} spaces with nothing above it to nest under — the first rule sits at column 0`
      : `indented ${indent} spaces under a line at ${parentIndent} — one level is two spaces`, "layout/indent", line);
  }
  // Only an ENTRY that names a DIRECTORY can have children: `{}` already means
  // "anything below", a symlink names one link, and a rule with no trailing `/`
  // cannot be satisfied by a directory — children under any of the three would
  // never be checked.
  if (parent.type === "outlet") {
    throw new LayoutContractError(`"{}" takes no children — it already means "anything below here"`, "layout/slot-syntax", line);
  }
  if (parent.type === "symlink") {
    throw new LayoutContractError(`"${parent.source} -> ${parent.target}" takes no children — a symlink is one entry, not a directory to describe`, "layout/slot-syntax", line);
  }
  if (parent.type === "entry" && !parent.directory) {
    throw new LayoutContractError(`"${parent.rawPattern}" takes children, so it names a directory — write "${parent.rawPattern}/"`, "layout/slot-syntax", line);
  }
  // Two rules at one level naming the SAME thing contradict each other: a tree
  // holds one entry per name, so whichever claims it first leaves the other
  // reporting it missing. Two PATTERNS may legitimately overlap.
  const exact = exactName(node);
  const clash = exact !== null && parent.children.find((sibling) => exactName(sibling) === exact);
  if (clash) {
    throw new LayoutContractError(`"${exact}" is already named on line ${clash.line} — two rules at one level cannot name the same entry`, "layout/slot-syntax", line);
  }
  // Two rules with the identical pattern AND kind: the first claims whatever they
  // both match, so the second can never match anything. The kind is part of it:
  // `{:n}/` beside `?{:n}` is two rules for two different kinds of entry, and both
  // can be satisfied at once.
  const twin = node.type === "entry" && parent.children.find((sibling) => sibling.type === "entry"
    && sibling.pattern === node.pattern && sibling.directory === node.directory);
  if (twin) {
    throw new LayoutContractError(`"${node.rawPattern}" repeats the rule on line ${twin.line} — the first claims everything they both match, so this one can never match`, "layout/slot-syntax", line);
  }
  // Two outlets at one level are the same contradiction: the first already claims
  // everything left over. `exactName` returns null for an outlet, so the check
  // above cannot catch this.
  const outlet = node.type === "outlet" && parent.children.find((sibling) => sibling.type === "outlet");
  if (outlet) {
    throw new LayoutContractError(`"{}" is already on line ${outlet.line} — one outlet claims everything left at this level, so a second can never match`, "layout/slot-syntax", line);
  }
  parent.children.push(node);
}

// The one entry a rule names, or null when it names a shape rather than a thing.
// A trailing `/` is not part of the name: `d` and `d/` are two rules for one entry.
function exactName(node) {
  if (node.type === "symlink") return node.source;
  if (node.type !== "entry" || node.pattern.includes("{")) return null;
  return node.pattern;
}

// A trailing comment is the only place a contract says WHY a slot exists, so it
// is kept on the node rather than dropped here. The masked scan is what tells a
// real comment from a `#` inside a slot's regex.
function splitComment(value) {
  const cut = commentIndex(maskRegexSpans(value));
  if (cut === -1) return { code: value, comment: null };
  return { code: value.slice(0, cut), comment: commentBody(value.slice(cut)).trimEnd() || null };
}

function countIndent(value) {
  const match = value.match(/^ */);
  return match ? match[0].length : 0;
}

// One line of contract into one node: an outlet, a symlink, or an entry.
export function parseNode(text, line) {
  if (text === "{}") return { type: "outlet", line, children: [] };
  // `?{}` and `{}/` are the outlet wearing a mark it cannot carry: an outlet
  // already matches zero or more entries of any kind. Refused HERE because this is
  // the only place that still knows which spelling was written.
  if (text === "?{}" || text === "{}/" || text === "?{}/") {
    throw new LayoutContractError(`"${text}" is not a rule — an outlet already matches anything, so write "{}" on its own line`, "layout/slot-syntax", line);
  }

  // `?` marks ANY entry optional, a symlink included, so the optional mark is read
  // off BEFORE the symlink branch — both branches describe the same remainder.
  const optional = text.startsWith("?");
  const body = optional ? text.slice(1) : text;

  // Every structural scan below runs on the mask, so a ` -> ` or a trailing `/`
  // inside a slot's regex is not mistaken for a symlink arrow or a directory mark.
  const mask = maskRegexSpans(body);
  if (mask.includes(" -> ") || /(^|\s)->(\s|$)/.test(mask)) {
    return { ...parseSymlink(body, mask, text, line), optional };
  }

  const directory = mask.endsWith("/");
  // A rule that names nothing — `?`, `/`, `?/` — parses into a pattern of "" that
  // no filename can equal. A line that cannot be satisfied is a fault in the
  // contract, so it is refused here.
  if (directory ? mask.length === 1 : mask.length === 0) {
    throw new LayoutContractError(`"${text}" names nothing — a rule needs an entry name, a slot, or "{}"`, "layout/slot-syntax", line);
  }
  // A path written on one line. A rule is matched against ONE segment name, and a
  // name never contains a `/`, so `docs/api.md` can never match anything. The
  // trailing `/` is the directory mark and is not part of the name, and a `/`
  // inside a regex slot is masked out before we look.
  if ((directory ? mask.slice(0, -1) : mask).includes("/")) {
    throw new LayoutContractError(`"${text}" contains a / — a rule names ONE entry, so write a path as nested lines, two spaces per level`, "layout/slot-syntax", line);
  }
  return {
    type: "entry",
    line,
    optional,
    rawPattern: body,
    directory,
    pattern: rulePattern(text),
    children: [],
  };
}

// The compilable half of an entry line: `?` and a trailing `/` are marks ON the
// rule, not part of the name it matches.
function rulePattern(text) {
  const body = text.startsWith("?") ? text.slice(1) : text;
  return maskRegexSpans(body).endsWith("/") ? body.slice(0, -1) : body;
}

// `A -> B`, one space each side, both sides literal. Anything that reaches for
// that spelling and misses — `a ->`, `-> b`, `a -> b -> c` — is refused rather
// than read as a literal filename. (A bare `a->b.txt`, with no spaces, is a real
// filename and never gets here.)
function parseSymlink(body, mask, text, line) {
  const at = mask.indexOf(" -> ");
  if (at === -1) {
    throw new LayoutContractError(`"${text}" is not a symlink rule — write "A -> B", one space each side`, "layout/slot-syntax", line);
  }
  if (mask.indexOf(" -> ", at + 4) !== -1) {
    throw new LayoutContractError(`"${text}" has two " -> " arrows — a symlink rule names one source and one target`, "layout/slot-syntax", line);
  }
  // Both sides are compared with `===` against a real name and a real link target,
  // and neither is ever compiled — so `\#` has to be unescaped here or nowhere.
  // Trimmed, because `indexOf(" -> ")` finds the FIRST arrow-with-one-space-each-
  // side and any surplus space would otherwise stay on a name: space around the
  // arrow is spacing, not part of either side.
  const source = unescapeHash(body.slice(0, at).trim());
  const target = unescapeHash(body.slice(at + 4).trim());
  for (const [side, value] of [["source", source], ["target", target]]) {
    if (value.includes("{")) {
      throw new LayoutContractError(`a symlink's ${side} is a literal name, not a pattern — "${value}" carries a slot`, "layout/slot-syntax", line);
    }
  }
  // The SOURCE names one entry at this level and is compared against a real name,
  // which never contains a `/` — so `docs/ -> ../x` can never match and is
  // refused. The TARGET is a path on purpose — a link legitimately points at
  // `docs/AGENTS.md` — so only the source is read here.
  if (source.includes("/")) {
    throw new LayoutContractError(`a symlink's source names ONE entry, and "${source}" contains a / — nest the rule instead, two spaces per level`, "layout/slot-syntax", line);
  }
  return { type: "symlink", line, source, target, children: [] };
}
