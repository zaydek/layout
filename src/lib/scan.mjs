// scan.mjs — the scanner and slot grammar, in one place.
//
// No raw string op may run on a rule line before it is tokenized here — a `#`,
// ` -> `, or trailing `/` inside a regex span is not structure. One copy of each
// structural primitive, and nothing in src/ defines a second function by any of
// these names: duplicated copies drift, and drift ships false passes.
//
// Exports, in dependency order:
//   maskRegexSpans(line)              same-length string, /regex/ spans blanked
//   commentIndex(mask)                index of the first unescaped `#`, or -1
//   findClose(src, braceIdx)          matching `}` for the `{` at braceIdx, or -1
//   withoutBom(source)                a contract's text without a leading BOM
//   unescapeHash(text)                `\#` -> `#` in a literal name
//   tokenizeRule(pattern)             ordered literal/slot tokens, brace-balanced
//   parseSlotSpec(spec)               the slot grammar (what is between the braces)
//   parseHoistLine(text)              `$name: value` -> {name, value}, else null
//   looksLikeHoistLine(text)          true for any line SHAPED like a definition
//   resolveDefinition(name, defs)     one `$name:` -> a regex source fragment
//   validateDefinitions(defs)         eager compile of every `$name:` in a file
//   compilePattern(pattern, defs)     one rule -> {source, slots} for the matcher
//   commentBody(text)                 a `# comment` without its hash
//   UNICODE                           the regex flag every slot compiles with
//   PASTED                            line art or a code fence — document, not contract
//   TAB_INDENT                        a tab in a line's indentation
//   escapeRegex(value)                literal text as regex source (fs-tree too)
//   LayoutContractError               a contract that does not resolve (exit 2)

// A contract that cannot be compiled. `layout.mjs` catches it and exits 2 — this is
// never a finding about the tree: a typo is a hard failure, because the program
// cannot be compiled.
export class LayoutContractError extends Error {
  constructor(message, code = "layout/slot-syntax", line = null) {
    super(message);
    this.name = "LayoutContractError";
    this.code = code; // the matching lint code, so `lint` names the same fault early
    this.line = line; // where in the contract, when the thrower knows — `lint` reports it
  }
}

// Slot regexes compile in UNICODE mode, and both places that build one say so
// here. Filenames are Unicode: without the flag `\p{L}` reads as a literal and
// `🎉+` quantifies half a surrogate pair. The flag also refuses a pointless
// escape like `\-`, which is a fair trade — that failure is loud.
export const UNICODE = "u";

// What counts as a /regex/ span, anchored at the start of what it is given. Every
// scan below runs through this one pattern.
const RE_REGEX = /^\/(?:\\.|[^/\n])*\//;

const RE_NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const RE_HOIST = /^\$([A-Za-z_][A-Za-z0-9_-]*)[ \t]*:[ \t]*(.*)$/;

// ── Scanning ─────────────────────────────────────────────────────────────────

// Blank every `/regex/` span, preserving length so the mask indexes back into the
// original. A `/` is only a regex delimiter INSIDE braces — outside them it is a
// path separator, so `a/ -> b/` must not read as one regex span.
export function maskRegexSpans(line) {
  let out = "";
  let depth = 0;
  let i = 0;
  while (i < line.length) {
    const char = line[i];
    if (char === "\\") {
      out += line.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}" && depth > 0) depth -= 1;
    else if (char === "/" && depth > 0) {
      const match = RE_REGEX.exec(line.slice(i));
      if (match) {
        out += " ".repeat(match[0].length);
        i += match[0].length;
        continue;
      }
    }
    out += char;
    i += 1;
  }
  return out;
}

// The first `#` that starts a comment — `\#` does not, and neither does a `#` that
// the mask has blanked out because it sits inside a regex.
export function commentIndex(mask) {
  let escaped = false;
  for (let i = 0; i < mask.length; i += 1) {
    const char = mask[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "#") return i;
  }
  return -1;
}

// `braceIdx` points at a slot's `{`. Returns the index of its matching `}`, or -1.
// Counts `{` up and `}` down; steps over a /regex/ span whole (so `\d{4}` does not
// close the slot); honors `\`-escapes. A span is ALWAYS stepped over, never only
// when it carries a brace, so this agrees with `maskRegexSpans`.
export function findClose(src, braceIdx) {
  let depth = 1;
  let i = braceIdx + 1;
  while (i < src.length) {
    const char = src[i];
    if (char === "\\") { i += 2; continue; }
    if (char === "/") {
      const match = RE_REGEX.exec(src.slice(i));
      if (match) { i += match[0].length; continue; }
    }
    if (char === "{") { depth += 1; i += 1; continue; }
    if (char === "}") { depth -= 1; if (depth === 0) return i; i += 1; continue; }
    i += 1;
  }
  return -1;
}

// A byte-order mark is an encoding artifact, not a character in the contract.
// Stripped once, where the text enters, by both readers.
export function withoutBom(source) {
  return source.charCodeAt(0) === 0xFEFF ? source.slice(1) : source;
}

// `\#` says "this `#` is part of the name, not the start of a comment".
// `commentIndex` honors the escape; this is where the backslash is dropped.
// Applied to LITERAL text only — a `#` inside a `/regex/` is protected by
// `maskRegexSpans` instead and must not be unescaped a second time.
export function unescapeHash(text) {
  return text.replaceAll("\\#", "#");
}

// The same idea for a rule's LITERAL text, where `{` opens a slot as surely as
// `#` opens a comment. Only these three are escapes; any other `\X` is left
// exactly as written, so a name that really contains a backslash still matches
// itself.
function unescapeLiteral(text) {
  return text.replaceAll(/\\([#{}])/g, "$1");
}

// One rule pattern -> an ordered list of literal and slot tokens. A literal token's
// `text` is the name to MATCH, not the source slice: `\#`, `\{` and `\}` have already
// become `#`, `{` and `}`.
export function tokenizeRule(pattern) {
  const tokens = [];
  let literal = "";
  let i = 0;
  while (i < pattern.length) {
    // Stepped over, exactly as findClose steps over it — the two must read the
    // same characters the same way.
    if (pattern[i] === "\\" && i + 1 < pattern.length) {
      literal += pattern.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (pattern[i] === "{") {
      const close = findClose(pattern, i);
      // In this notation `{` opens a slot, always, so an unmatched one is a
      // broken rule rather than an unusual filename.
      if (close < 0) {
        throw new LayoutContractError(`unclosed "{" in "${pattern}" — a slot is {…}; nothing closes this one`);
      }
      if (literal) { tokens.push({ kind: "literal", text: unescapeLiteral(literal) }); literal = ""; }
      tokens.push({ kind: "slot", text: pattern.slice(i, close + 1), spec: pattern.slice(i + 1, close) });
      i = close + 1;
      continue;
    }
    literal += pattern[i];
    i += 1;
  }
  if (literal) tokens.push({ kind: "literal", text: unescapeLiteral(literal) });
  return tokens;
}

// The text of a trailing comment, with its `#` and the space after it removed.
// One copy, so the parser and the linter agree on what a comment is.
export function commentBody(text) {
  return String(text).replace(/^#+\s*/, "");
}

// Text that came out of a document rather than out of a contract: the box-drawing
// characters `layout render` and `tree` emit, and a Markdown code fence. Neither
// is a filename, and both arrive by copy-paste.
export const PASTED = /^(?:[│├└─┌┐┘┬┴┼]|```)/;

// A tab anywhere in a line's indentation. Both the parser and the linter refuse
// it — from here, rather than each from its own copy of the pattern.
export const TAB_INDENT = /^[ \t]*\t/;

// ── The slot grammar ─────────────────────────────────────────────────────────
//
//   {}                the outlet — only ever a whole rule of its own
//   {:name}           any segment, bound to `name`
//   {:name;a,b}       enum, bound
//   {:name;/re/}      regex, bound
//   {:name;$ref}      hoisted pattern, bound to `name`
//   {a,b}             enum, unbound
//   {/re/}            regex, unbound
//   {$ref}            hoisted pattern, bound to `ref`
//
// Returns { form, name, values?, source?, ref? } with
// form ∈ "empty" | "any" | "enum" | "regex" | "ref".
export function parseSlotSpec(spec) {
  if (spec === "") return { form: "empty", name: null };

  if (spec.startsWith(":")) {
    const body = spec.slice(1);
    const mask = maskRegexSpans(body);
    const semi = mask.indexOf(";");
    if (semi === -1) {
      const colon = mask.indexOf(":");
      // A binding name is a WORD — anything else becoming the name would compile
      // the slot to "any segment" and enforce nothing.
      if (colon === -1) {
        if (body !== "" && !RE_NAME.test(body)) {
          throw new LayoutContractError(`"{:${body}}" is not a binding — a name is a word. Write "{${body}}" to match that shape, or "{:name;${body}}" to bind it.`);
        }
        return { form: "any", name: body || null };
      }
      // `{:name:ANYTHING}` is not syntax — refused rather than read as part of
      // the name, which would compile to "any segment" and enforce nothing.
      const name = body.slice(0, colon) || "name";
      throw new LayoutContractError(`"{${spec}}" has no rule after the colon — there are no case rules; write the shape as a regex, e.g. {:${name};/[a-z0-9-]+/}`);
    }
    const name = body.slice(0, semi) || null;
    // Same rule as the branch above: a binding name is a word.
    if (name !== null && !RE_NAME.test(name)) {
      throw new LayoutContractError(`"{${spec}}" does not bind — "${name}" is not a name. A name is a letter or _ then letters, digits, _ or -.`);
    }
    const payload = body.slice(semi + 1);
    return { ...parsePayload(payload, spec), name };
  }

  const parsed = parsePayload(spec, spec);
  if (parsed.form === "ref") return { ...parsed, name: parsed.ref }; // `{$slug}` binds to `slug`
  return { ...parsed, name: null };
}

function parsePayload(payload, spec) {
  if (payload.startsWith("$")) {
    const ref = payload.slice(1);
    if (!RE_NAME.test(ref)) {
      throw new LayoutContractError(`bad pattern reference "{${spec}}" — a name is a letter or _ then letters, digits, _ or -`, "layout/unknown-ref");
    }
    return { form: "ref", ref };
  }
  const match = RE_REGEX.exec(payload);
  if (match && match[0].length === payload.length) return { form: "regex", source: payload.slice(1, -1) };
  // A payload that opens with `/` is a regex the writer failed to close. Falling
  // through to the enum branch would make a value list that can never match — no
  // path segment contains a `/`.
  if (payload.startsWith("/")) {
    throw new LayoutContractError(`unclosed regex in "{${spec}}" — a slot regex is /…/, and a literal / cannot appear in a path segment`, "layout/bad-regex");
  }
  return { form: "enum", values: enumValues(payload, `"{${spec}}"`) };
}

// A comma list, `a,b,c`, whether it was written inline as `{a,b,c}` or hoisted as
// `$name: a,b,c`. One function because it is one grammar. A `/` in a value is
// dead on arrival: no path segment contains one.
function enumValues(payload, where) {
  const values = payload.split(",").map(unescapeHash);
  for (const value of values) {
    if (value === "") throw new LayoutContractError(`${where} has an empty value in its list — drop the stray comma`);
    if (value.includes("/")) {
      throw new LayoutContractError(`value "${value}" in ${where} contains a / — a path segment never does, so this can never match; write a regex slot instead`, "layout/bad-regex");
    }
    // A list is literal text — a `{$a}` inside one must not silently become the
    // six literal characters.
    if (value.includes("{")) {
      throw new LayoutContractError(`value "${value}" in ${where} carries a slot — a value list is literal text. Write a regex, e.g. {/(${value.replace(/[{}$]/g, "")}|…)/}, or hoist the alternatives into one list.`);
    }
  }
  return values;
}

// ── Hoisting ─────────────────────────────────────────────────────────────────

// `$name: /re/` or `$name: a,b,c`. Returns null when the line is not a definition.
export function parseHoistLine(text) {
  const match = RE_HOIST.exec(text);
  if (!match) return null;
  return { name: match[1], value: match[2].trim() };
}

// True for any line SHAPED like a definition, so a misplaced one is an error rather
// than a silently mis-read entry.
export function looksLikeHoistLine(text) {
  return /^\$[A-Za-z_][A-Za-z0-9_-]*[ \t]*:/.test(text);
}

// Compile every definition in the file, whether or not a rule references it. A
// broken definition is a broken contract even when unused, and compiling them all
// is what catches a cycle between two definitions nothing points at.
export function validateDefinitions(definitions, at = (line, step) => step()) {
  for (const name of Object.keys(definitions)) {
    at(definitions[name].line, () => resolveDefinition(name, definitions, new Set()));
  }
}

// Resolve `$name` to a regex source fragment. The caller wraps it in `(?:…)`; a
// comma list resolves to `a|b`, a regex to its own source with `{$ref}` expanded.
export function resolveDefinition(name, definitions, visiting) {
  const definition = definitions[name];
  if (definition === undefined) {
    throw new LayoutContractError(`unknown pattern reference "{$${name}}" — this contract has no "$${name}:" definition`, "layout/unknown-ref");
  }
  if (visiting.has(name)) {
    throw new LayoutContractError(`pattern reference cycle: ${[...visiting, name].map((step) => `$${step}`).join(" -> ")}`, "layout/ref-cycle");
  }
  visiting.add(name);
  const source = definitionSource(name, definition, definitions, visiting);
  visiting.delete(name);
  return source;
}

function definitionSource(name, definition, definitions, visiting) {
  const value = definition.value ?? "";
  // Just the name: the line is the caller's to add.
  const where = `$${name}`;
  const match = RE_REGEX.exec(value);
  if (match && match[0].length === value.length) {
    return expandReferences(compileRegexSource(value.slice(1, -1), where), definitions, visiting);
  }
  if (value === "") throw new LayoutContractError(`${where} has no value — write "$${name}: /re/" or "$${name}: a,b,c"`);
  if (value.startsWith("/")) throw new LayoutContractError(`${where} looks like a regex but is not closed: ${value}`, "layout/bad-regex");
  return enumValues(value, where).map(escapeRegex).join("|");
}

// `{$ref}` inside a definition's regex. `{` + `$` is a reference; `{` + anything
// else (a quantifier such as `\d{4}`) is left alone, and `\$` is a literal dollar.
function expandReferences(source, definitions, visiting) {
  let out = "";
  let i = 0;
  while (i < source.length) {
    if (source[i] === "\\") {
      out += source.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (source[i] === "{" && source[i + 1] === "$") {
      const close = source.indexOf("}", i + 2);
      const ref = close === -1 ? null : source.slice(i + 2, close);
      if (ref !== null && RE_NAME.test(ref)) {
        out += `(?:${resolveDefinition(ref, definitions, visiting)})`;
        i = close + 1;
        continue;
      }
    }
    out += source[i];
    i += 1;
  }
  return out;
}

// ── Compiling a rule ─────────────────────────────────────────────────────────

// One rule pattern -> { source, slots }. `source` is anchored `^…$` over the whole
// path segment; each slot captures into a named group so a user regex's own groups
// cannot shift the numbering.
export function compilePattern(pattern, definitions) {
  const tokens = tokenizeRule(pattern);
  let source = "^";
  const slots = [];
  for (const token of tokens) {
    if (token.kind === "literal") {
      source += escapeRegex(token.text);
      continue;
    }
    const spec = parseSlotSpec(token.spec);
    if (spec.form === "empty") {
      // A bare `{}` never reaches here — it is its own node type, and every
      // caller skips it. So this is `{}` written INSIDE something: `a{}b`. The
      // `?{}` and `{}/` spellings are refused in parser.mjs, the only place that
      // still knows which of them was written.
      throw new LayoutContractError(`"{}" is the outlet and must stand alone on its own line — found it inside "${pattern}"`);
    }
    const group = `_s${slots.length}`;
    source += `(?<${group}>${slotSource(spec, definitions, pattern)})`;
    slots.push({ group, name: spec.name ?? null });
  }
  source += "$";
  // Each piece compiled on its own above; the assembled whole has to compile too
  // — a reference spliced into a character class can produce a regex neither half
  // is guilty of, and the failure must be a named fault, not a raw SyntaxError.
  try {
    new RegExp(source, UNICODE);
  } catch (error) {
    const shown = source.replace(/\(\?<_s\d+>/g, "(?:");
    throw new LayoutContractError(`"${pattern}" does not compile to a valid regex — ${shown}: ${error.message.replace(/^Invalid regular expression: [^:]*: /, "")}`, "layout/bad-regex");
  }
  return { source, slots };
}

function slotSource(spec, definitions, pattern) {
  if (spec.form === "regex") return `(?:${compileRegexSource(spec.source, `"${pattern}"`)})`;
  if (spec.form === "ref") return `(?:${resolveDefinition(spec.ref, definitions, new Set())})`;
  // An enum compiles into the regex, the same way the HOISTED spelling of the
  // same list does, so the matcher can backtrack across it and both spellings
  // give one verdict.
  if (spec.form === "enum") return `(?:${spec.values.map(escapeRegex).join("|")})`;
  return "[^/]+"; // "any": one whole segment
}

// A slot regex matches its own slice of the segment and nothing else, so `^`/`$`
// are implicit — `compilePattern` anchors the assembled rule — and a numeric
// backreference cannot mean what it looks like, because the slot's own capture
// group opens first. Both are refused out loud.
function compileRegexSource(source, where) {
  if (source === "") throw new LayoutContractError(`empty regex // in ${where}`, "layout/bad-regex");
  if (source.startsWith("^") || endsWithUnescapedDollar(source)) {
    throw new LayoutContractError(`regex in ${where} is anchored with ^ or $ — slots are anchored to the whole segment already, so drop them`, "layout/bad-regex");
  }
  if (hasBackreference(source)) {
    throw new LayoutContractError(`regex in ${where} uses a numeric backreference — slot regexes do not support them`, "layout/bad-regex");
  }
  try {
    new RegExp(`^(?:${source})$`);
  } catch (error) {
    throw new LayoutContractError(`bad regex /${source}/ in ${where}: ${error.message}`, "layout/bad-regex");
  }
  return source;
}

function endsWithUnescapedDollar(source) {
  if (!source.endsWith("$")) return false;
  let backslashes = 0;
  for (let i = source.length - 2; i >= 0 && source[i] === "\\"; i -= 1) backslashes += 1;
  return backslashes % 2 === 0;
}

function hasBackreference(source) {
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] !== "\\") continue;
    if (/[1-9]/.test(source[i + 1] ?? "")) return true;
    i += 1; // skip the escaped character
  }
  return false;
}

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
