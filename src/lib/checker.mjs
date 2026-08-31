// checker.mjs — a contract against a real tree.
//
//   checkLayout({ root, layoutSource, ignore }) -> { level, root, items[], layout[] }
//
// Two VIEWS of one run come back: `items` addresses real paths, one row per thing
// on disk; `layout` addresses RULES, one row per line of the contract. The whole
// contract compiles before a single directory is read — a contract that does not
// resolve is a compile error (exit 2), never a finding. Dotfiles are invisible
// unless a rule names one outright, and `{}` is a LAST resort, taking only what no
// named rule claimed.

import { parseLayout, validateContract } from "./parser.mjs";
import { NEVER_READ, readFsTree } from "./fs-tree.mjs";
import { normalizeFindings, printable, sortFindings } from "./findings.mjs";
import { UNICODE, compilePattern, parseSlotSpec, tokenizeRule } from "./scan.mjs";

export function checkLayout({ root, layoutSource, ignore = [] }) {
  const layout = parseLayout(layoutSource);
  // Before a single directory is read: a broken rule the tree never reaches must
  // still be a compile error, not a matter of what happens to be on disk.
  validateContract(layout);
  const compile = patternCompiler(layout.definitions);
  const tree = readFsTree(root, ignore);
  const items = [];
  const layoutItems = [];
  checkChildren({ layoutChildren: layout.children, fsNode: tree, bindings: {}, items, layoutItems, segments: [], compile });
  // No `root` here: this function is handed a resolved absolute path; the caller
  // knows the name the user typed, which is the one worth printing.
  return normalizeFindings({
    items: sortFindings(items),
    layout: sortFindings(withoutRepeats(layoutItems)),
  });
}

// A rule under a slotted parent is evaluated once per directory the parent
// matched, and the layout view is documented as one row per RULE — so exact
// repeats are dropped. Exact repeats only: two DIFFERENT things said about one
// rule are two facts and both survive.
function withoutRepeats(items) {
  const seen = new Set();
  return items.filter((item) => {
    // Every field a row carries. `segments` is in the key even though it is
    // derived from `path`, because two segment arrays CAN join to one string.
    const key = [item.level, item.path, item.message, item.directory, item.comment, item.segments].join("\u0000");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// One compiled RegExp per distinct rule pattern, per run.
function patternCompiler(definitions) {
  const cache = new Map();
  return (pattern) => {
    let compiled = cache.get(pattern);
    if (!compiled) {
      const { source, slots } = compilePattern(pattern, definitions);
      compiled = { regex: new RegExp(source, UNICODE), slots };
      cache.set(pattern, compiled);
    }
    return compiled;
  };
}

// ── Walking one directory: which rule claims what ────────────────────────────
// `run` is everything the recursion carries — the two findings lists, the bindings
// in scope, the rule address so far, the pattern cache — and `claimed` is what this
// level learns as it goes: which rules claim which children, and what is left over.
function checkChildren(run) {
  const children = run.fsNode.children;
  // `consumed` maps a claimed name to the TIER of the rule that took it: the name
  // answers "is this child spoken for", the tier distinguishes a carve-out by a
  // more specific rule from a race between equals.
  const claimed = { children, consumed: new Map(), nearMisses: [], spokenFor: new Set(), explainedEmpty: new Set() };

  // The more a rule SAYS, the earlier it claims. Four tiers:
  //
  //   0  names one thing            index.md, a symlink
  //   1  constrains what it matches {a,b}.md, {/re/}, {$ref}, {:page}.md
  //   2  says anything              a lone {:name}
  //   3  says anything else         {}   (claimOutlets, below)
  //
  // Claiming by tier is what makes the contract mean the same thing whatever order
  // its lines are written in. Within a tier, written order still decides, and two
  // same-tier rules can still race for one child — the README's Limits carries that gap.
  const named = run.layoutChildren.filter((node) => node.type !== "outlet");
  for (const node of [...named].sort((a, b) => tier(a, run.bindings) - tier(b, run.bindings))) {
    if (node.type === "symlink") checkSymlink(node, run, claimed);
    else checkEntry(node, run, claimed);
  }

  claimOutlets(run, claimed);
  reportNearMisses(run, claimed);
  reportUnclaimed(run, claimed);
}

// A symlink rule: `A -> B` asserts that A is a link and that it points at B.
function checkSymlink(node, run, claimed) {
  // The `?` travels with the rule's address, as it does for an entry — the schema
  // row must state the contract as written.
  const nodeSegments = [...run.segments, `${node.optional ? "?" : ""}${node.source}`];
  // No `consumed` check and no visibility check: a symlink rule names one exact
  // entry, so it is tier 0 and runs before anything general, the parser refuses
  // two rules at one level naming the same entry, and a dot-name it asks for by
  // spelling it out.
  const child = claimed.children.find((entry) => entry.name === node.source);
  if (!child) {
    // An absent `?A -> B` is satisfied. Only its ABSENCE is excused: a link that
    // IS there still has to point at B, optional or not.
    if (node.optional) return run.layoutItems.push(noted(ok(nodeSegments), node));
    run.items.push(fsError(`${run.fsNode.path ? `${run.fsNode.path}/` : ""}${node.source}`, "Required symlink missing"));
    return run.layoutItems.push(noted(error(nodeSegments, "Required symlink missing"), node));
  }
  // The name fits and the kind does not — a near miss, deferred exactly as
  // checkEntry defers one, so both rule kinds treat the same tree the same way.
  if (child.kind !== "symlink") {
    claimed.nearMisses.push({ node, child, nodeSegments, message: `Expected a symlink, found ${describeKind(child.kind)}`, missing: "Required symlink missing" });
    return;
  }
  claimed.consumed.set(child.name, 0);
  // A link that IS a link but points elsewhere is not a near miss: the entry is the
  // right kind and the contract's claim about it is false. Nothing else may claim it.
  if (child.symlinkTarget !== node.target) {
    const fault = `Expected symlink target ${node.target}`;
    run.items.push(fsError(child, fault));
    return run.layoutItems.push(noted(error(nodeSegments, fault), node));
  }
  run.items.push(fsOk(child));
  run.layoutItems.push(noted(ok(nodeSegments), node));
}

// Does this child's KIND answer this rule. A directory rule wants a directory; a
// file rule wants a file or a symlink (a link satisfies one, as the README says).
// Anything else — a FIFO, a socket, a device — is a near miss, not a match.
function satisfies(node, child) {
  return node.directory ? child.kind === "directory" : child.kind === "file" || child.kind === "symlink";
}

// What this rule can see, split three ways: what it can take, what an earlier rule
// already took, and what it NEARLY took (a child whose name fits and whose kind
// does not — kept apart so the report can name it). The kind is tested BEFORE the
// consumed check, so a wrong-kind child an earlier rule already took still
// registers.
function candidates(node, run, claimed) {
  const matches = [];
  const wrongKind = [];
  const taken = [];
  for (const child of claimed.children) {
    if (!visibleTo(node, child.name, run)) continue;
    const bindings = matchPattern(node.pattern, child.name, run.bindings, run.compile);
    if (!bindings) continue;
    if (!satisfies(node, child)) { wrongKind.push(child); continue; }
    // A child an earlier rule took is not a match — but it is the answer to "why
    // did this rule find nothing", so it is kept rather than dropped.
    if (claimed.consumed.has(child.name)) { taken.push(child); continue; }
    matches.push({ child, bindings });
  }
  return { matches, wrongKind, taken };
}

function checkEntry(node, run, claimed) {
  const nodeSegments = [...run.segments, layoutPatternForNode(node)];
  const { matches, wrongKind, taken } = candidates(node, run, claimed);
  // How much this rule says HERE, with the bindings in scope. Tokenizes the
  // pattern to answer, so it is asked once.
  const ownTier = tier(node, run.bindings);

  // A near miss is remembered, not claimed — the child stays in reach of later
  // rules, and whether it is worth reporting is decided at the end, once every
  // rule has had its turn. Recorded even when the rule DOES have a real match.
  const expected = `Expected ${node.directory ? "a directory" : "a file"}, found `;
  for (const child of wrongKind) {
    claimed.nearMisses.push({ node, child, nodeSegments, message: expected + describeKind(child.kind), missing: "Required entry missing" });
  }

  if (matches.length === 0) {
    // The child this rule would have taken, and did not. Prefer the child an
    // EQUALLY general rule took: a carve-out by a more specific rule is not the
    // reason this rule found nothing.
    const lost = taken.find((child) => claimed.consumed.get(child.name) === ownTier) ?? taken[0];
    const lostToEqual = lost !== undefined && claimed.consumed.get(lost.name) === ownTier;
    // `?` excuses a rule for being ABSENT, and a child that fits it is not absent.
    // Both conditions required: it lost to an EQUAL rule (a MORE specific rule
    // taking the child is a carve-out, not a race, and "any OTHER directory" is
    // vacuously true), and it had a subtree whose assertions then never ran — a
    // rule without children asserted nothing beyond existence.
    const raced = lostToEqual && node.children.length > 0;
    // WHO SPEAKS turns only on whether this rule lost anything at all: a near miss
    // belongs to `reportNearMisses` — unless a candidate was also taken, in which
    // case THAT is why the rule found nothing and the near miss is a coincidence.
    if (lost === undefined && wrongKind.length > 0) return;
    if (node.optional && !raced) {
      // Marked as having spoken, like every other branch that pushes a row, so
      // the near-miss pass does not speak for this rule again.
      claimed.spokenFor.add(node);
      return run.layoutItems.push(noted(ok(nodeSegments), node));
    }
    // `explainedEmpty` is the narrower fact: this rule explained why it matched
    // NOTHING. A rule that matched something and near-missed something else owes
    // both rows, so the success path below must not set it.
    claimed.spokenFor.add(node);
    claimed.explainedEmpty.add(node);
    // What the rule asked for, with any bindings in scope filled in — the address
    // the finding is reported at, and the name the explanations below compare.
    const wanted = materializePattern(node.pattern, run.bindings);
    const message = whyMissing(node, wanted, lost, run, claimed);
    // The "missing" address is a real directory plus an unmatched RULE, and a rule
    // may carry `/` or `\` inside a regex — so it gets segments like a layout
    // finding does.
    const segments = [...(run.fsNode.path ? run.fsNode.path.split("/") : []), wanted];
    // `directory` for the same reason a real row carries it: this rule names one.
    run.items.push(withSegments({ level: "error", path: segments.join("/"), message, ...(node.directory ? { directory: true } : {}) }, segments));
    return run.layoutItems.push(noted(error(nodeSegments, message), node));
  }

  claimed.spokenFor.add(node);
  run.layoutItems.push(noted(ok(nodeSegments), node));
  for (const match of matches) {
    claimed.consumed.set(match.child.name, ownTier);
    run.items.push(fsOk(match.child));
    if (node.children.length > 0) {
      checkChildren({ ...run, layoutChildren: node.children, fsNode: match.child, bindings: match.bindings, segments: nodeSegments });
    }
  }
}

// A rule matched nothing. "Required entry missing" is the answer only when the
// entry really is missing — three cases below deserve a truer message.
function whyMissing(node, wanted, lost, run, claimed) {
  // `.git` and `node_modules` never reach the checker, at any depth, so a rule
  // naming one asks for something no rule can be given.
  if (NEVER_READ.includes(wanted)) {
    return `${wanted} is never read — it is skipped at every depth, before any rule sees it, and no option turns that off`;
  }
  // The entry EXISTS and another rule took it: name the file it lost.
  if (lost) return `Nothing left to match — "${printable(lost.name)}" fits this rule and an earlier rule at this level claimed it`;
  // Two names can be the same glyphs and different code points (NFC vs NFD). The
  // comparison itself stays exact — the filesystem's bytes are the fact;
  // normalizing here only explains the failure.
  const encoded = claimed.children.find((child) => !claimed.consumed.has(child.name)
    && visibleTo(node, child.name, run)
    && matchPattern(node.pattern.normalize("NFC"), child.name.normalize("NFC"), run.bindings, run.compile)
    && node.directory === (child.kind === "directory"));
  if (encoded) return `Required entry missing — "${printable(encoded.name)}" looks the same but is encoded differently (compare the bytes, not the glyphs)`;
  // Case, likewise: names are compared exactly, so `readme.md` for `README.md` is
  // a real miss, but worth naming. Only for a rule that names one literal entry —
  // lowercasing a pattern would change what a regex slot means.
  const literal = literalName(node.pattern);
  if (literal !== null) {
    const miscased = claimed.children.find((child) => !claimed.consumed.has(child.name)
      && visibleTo(node, child.name, run)
      && child.name.toLowerCase() === literal.toLowerCase()
      && node.directory === (child.kind === "directory"));
    if (miscased) return `Required entry missing — "${printable(miscased.name)}" differs only in case`;
  }
  return "Required entry missing";
}

// `{}` claims whatever is left, which is why it runs after every named rule — and
// never a dot-entry, because "anything else" is not a request for one.
function claimOutlets(run, claimed) {
  for (const node of run.layoutChildren) {
    if (node.type !== "outlet") continue;
    run.layoutItems.push(noted(ok([...run.segments, "{}"]), node));
    for (const child of claimed.children) {
      // Whatever is LEFT — never a child a named rule already took, whose record
      // and rows must stand.
      if (child.name.startsWith(".") || claimed.consumed.has(child.name)) continue;
      claimed.consumed.set(child.name, 3);
      // What the outlet took, by name, so `--as actual` can show it. Its subtree
      // is not walked: the outlet said the inside is not its business.
      run.items.push(fsOk(child));
    }
  }
}

// A near miss only matters if nothing else took the child: `?docs/` over a file
// named `docs` is not an error when a later rule accepts that file. But a rule
// that deferred every candidate has said NOTHING, so every rule speaks exactly
// once here, whether or not its near miss survived.
function reportNearMisses(run, claimed) {
  const spoken = new Set();
  // Per (rule, CHILD), not per rule — every unclaimed near-missed child gets its
  // own items row.
  for (const miss of claimed.nearMisses) {
    if (claimed.consumed.has(miss.child.name)) continue;
    claimed.consumed.set(miss.child.name, tier(miss.node, run.bindings));
    run.items.push(fsError(miss.child, miss.message));
    // The items row above is about the CHILD and is always owed. The RULE row is
    // one per distinct thing this rule has to say, and only if it has not already
    // explained why it matched nothing.
    const said = `${miss.nodeSegments.join("/")}\u0000${miss.message}`;
    if (!spoken.has(said) && !claimed.explainedEmpty.has(miss.node)) {
      run.layoutItems.push(noted(error(miss.nodeSegments, miss.message), miss.node));
    }
    spoken.add(said);
    spoken.add(miss.node);
  }
  // A rule whose every near miss was taken by someone else has said nothing at all.
  for (const miss of claimed.nearMisses) {
    if (spoken.has(miss.node) || claimed.spokenFor.has(miss.node)) continue;
    spoken.add(miss.node);
    // An absent optional rule is satisfied, exactly as it is in checkEntry.
    if (miss.node.optional) {
      run.layoutItems.push(noted(ok(miss.nodeSegments), miss.node));
      continue;
    }
    // Naming the near miss is the useful half: the entry the rule asked for is not
    // there, and something with that name is, wearing the wrong kind.
    const message = `${miss.missing} — "${printable(miss.child.name)}" is here, but it is ${describeKind(miss.child.kind)}`;
    const address = miss.node.type === "symlink" ? miss.node.source : materializePattern(miss.node.pattern, run.bindings);
    const segments = [...(run.fsNode.path ? run.fsNode.path.split("/") : []), address];
    const directory = miss.node.type === "entry" && miss.node.directory;
    run.items.push(withSegments({ level: "error", path: segments.join("/"), message, ...(directory ? { directory: true } : {}) }, segments));
    run.layoutItems.push(noted(error(miss.nodeSegments, message), miss.node));
  }
}

// Whatever no rule claimed. An outlet consumed everything above, so this loop
// finding something IS the absence of an outlet. The layout row is addressed by
// PATH rather than by a rule: no rule in the contract names this file.
function reportUnclaimed(run, claimed) {
  for (const child of claimed.children) {
    if (claimed.consumed.has(child.name)) continue;
    // A dot-entry no rule asked for is not "unexpected", it is unseen — the reason
    // a contract does not have to enumerate .DS_Store and .venv.
    if (child.name.startsWith(".")) continue;
    run.items.push(fsError(child, "Unexpected by layout"));
    run.layoutItems.push(fsError(child, "Unexpected by layout"));
  }
}

// ── What a rule says, and what it can see ────────────────────────────────────
// A FIFO, a socket or a device is not a file and must not be called one.
function describeKind(kind) {
  if (kind === "directory") return "a directory";
  if (kind === "symlink") return "a symlink";
  return kind === "other" ? "a special file" : "a file";
}

// The one name a rule can only be, or null when it names a shape. Every token is a
// literal exactly when no brace opened a slot — escaped ones do not — and the text
// is already unescaped, so `a\{b\}.md` answers `a{b}.md`. Both callers must ask
// this same question the same way.
function literalName(pattern) {
  const tokens = tokenizeRule(pattern);
  return tokens.every((token) => token.kind === "literal") ? tokens.map((token) => token.text).join("") : null;
}

// How much a rule says about what it matches, WITH the bindings in scope — a slot
// already bound by the parent names exactly one entry. Sorting by this is what
// makes the contract mean the same thing whatever order its lines are written in.
function tier(node, bindings) {
  if (node.type === "symlink") return 0;
  if (literalName(node.pattern) !== null) return 0;
  // Asked of the CONTRACT's text, never of the materialized one — a filename must
  // never be run through the slot grammar. The bound case needs only whether every
  // slot is filled in.
  const slots = tokenizeRule(node.pattern).filter((token) => token.kind === "slot");
  const bound = (token) => {
    const { name } = parseSlotSpec(token.spec);
    return Boolean(name) && Object.hasOwn(bindings, name);
  };
  if (slots.every(bound)) return 0;
  return constrains(node.pattern) ? 1 : 2;
}

function layoutPatternForNode(node) {
  return `${node.optional ? "?" : ""}${node.pattern}`;
}

// A dot-entry is invisible unless a rule at this level ASKS for it by requiring the
// dot — otherwise every contract would have to enumerate `.DS_Store`, `.venv` and
// the rest. The test is exact and needs no heuristic: a rule asks when it matches
// the name AND would not match the same name with the leading dot removed.
//
//   .gitignore              matches ".gitignore", not "gitignore"       → asks
//   {:rc;/\.[a-z]+rc/}      matches ".eslintrc", not "eslintrc"          → asks
//   {:route}.ts             matches ".hidden.ts" AND "hidden.ts"        → does not
//   {:name}, {}             match everything                            → do not
//
// Asked at the CLAIM, once per rule — not once per level — so a dot-entry is
// visible only to the rules that ask for it.
function visibleTo(node, name, run) {
  return !name.startsWith(".") || asksFor(node, name, run.bindings, run.compile);
}

// Does this rule say anything about what it matches? A lone `{:name}` does not — it
// is one slot with no constraint, which is "any segment" written down. That is what
// puts it in its own claiming tier, below every rule that names a shape.
function constrains(pattern) {
  const tokens = tokenizeRule(pattern);
  if (tokens.length !== 1 || tokens[0].kind !== "slot") return true;
  return parseSlotSpec(tokens[0].spec).form !== "any";
}

// Only ever asked about an entry rule: checkChildren routes a symlink to
// checkSymlink, which needs no visibility test, and filters an outlet out — an
// outlet says "anything", which is never a request for a dot-entry.
function asksFor(node, name, bindings, compile) {
  // matchPattern, and the BINDINGS in scope — the same call checkEntry makes, so
  // there is one answer to "does this rule match this name". A bound slot names
  // exactly one entry, and may thereby ask for a dot-entry.
  const matches = (candidate) => matchPattern(node.pattern, candidate, bindings, compile) !== null;
  return matches(name) && !matches(name.slice(1));
}

// ── Does this rule match this name ───────────────────────────────────────────
function matchPattern(pattern, name, bindings, compile) {
  const { regex, slots } = compile(pattern);
  const result = name.match(regex);
  if (!result) return null;

  // Prototype-less, because every key here is a name the CONTRACT chose — reads
  // and writes must both bypass Object.prototype (`{:__proto__}` is a legal slot).
  const next = Object.assign(Object.create(null), bindings);
  for (const slot of slots) {
    const value = result.groups[slot.group];
    // The match above has already decided everything except the BINDING below.
    if (!slot.name) continue;
    // "Has this name already been bound?" is a question about PRESENCE: a binding
    // may hold the empty string, and a name may collide with Object.prototype.
    if (Object.hasOwn(next, slot.name)) {
      if (next[slot.name] !== value) return null;
      continue;
    }
    next[slot.name] = value;
  }
  return next;
}

// The pattern with every already-bound slot filled in, for the "Required entry
// missing" path. Unbound slots keep their source text.
function materializePattern(pattern, bindings) {
  let out = "";
  for (const token of tokenizeRule(pattern)) {
    if (token.kind === "literal") {
      out += token.text;
      continue;
    }
    const name = parseSlotSpec(token.spec).name;
    // Presence, not truthiness — the same distinction matchPattern draws above.
    out += name && Object.hasOwn(bindings, name) ? bindings[name] : token.text;
  }
  return out;
}

// ── Findings ─────────────────────────────────────────────────────────────────
// A layout finding addresses a RULE, not a path. A rule may contain `/` (inside a
// regex), so the joined string alone cannot be split back into a tree — the segment
// array is the truth and travels with the finding whenever the join is lossy.

// Two things the checker knows that a rule's address does not carry: why the rule
// exists (its comment) and whether it names a directory. `--as=schema` draws the
// contract, so both must ride on the row.
function noted(item, node) {
  if (node?.comment) item.comment = node.comment;
  if (node?.directory) item.directory = true;
  return item;
}

function ok(segments) {
  return withSegments({ level: "ok", path: segments.join("/"), message: "" }, segments);
}

function error(segments, message) {
  return withSegments({ level: "error", path: segments.join("/"), message }, segments);
}

function withSegments(item, segments) {
  if (segments.some((segment) => segment.includes("/") || segment.includes("\\"))) {
    item.segments = segments;
  }
  return item;
}

// A row about something ON DISK. It carries `directory` so `--as actual` can draw
// `docs/` and `docs` differently, and is addressed by SEGMENTS because a filename
// may contain a backslash, which `normalizePath` would otherwise rewrite into `/`.
// `withSegments` attaches them only when a segment needs it.
function fsOk(child) {
  return withSegments({ level: "ok", path: child.path, message: "", ...(child.kind === "directory" ? { directory: true } : {}) }, child.path.split("/"));
}

// One caller has no child to point at: a required symlink that is not there. It
// passes the address it wanted, which is a string and never a directory.
function fsError(child, message) {
  const path = typeof child === "string" ? child : child.path;
  const directory = typeof child !== "string" && child.kind === "directory";
  return withSegments({ level: "error", path, message, ...(directory ? { directory: true } : {}) }, path.split("/"));
}
