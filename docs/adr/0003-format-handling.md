# ADR-0003: Format handling — raw-text spans, never parsers

Status: accepted

## Decision

Leshy never parses the input. All detection works on the raw string; the only output
operation is **span splicing**: replace `input.slice(start, end)` for each resolved span,
copy every other byte through verbatim. Format preservation is therefore a theorem, not a
test matrix — JSON stays JSON, Ruby inspect stays Ruby inspect, malformed garbage stays
malformed garbage with its PII gone.

Structure still informs detection, without parsing:

- The **key-value scanner** (`src/core/detect/keyContext.ts`) is one regex pass that
  recognises the pair shapes of JSON, Ruby inspect, Ruby hashes (`:sym => v`), JS object
  literals and logfmt simultaneously. It yields `{key, value, valueStart, valueEnd}` used
  by both key-context detection and preserve rules. Unrecognised syntax degrades to "no
  key hints", never to a failure.
- Span boundaries always exclude the quotes: replacing an email inside `"…"` keeps the
  string literal intact.

### Generator output constraints

A fake spliced into a quoted string must not break the quoting. Generators must not emit
`"`, `'`, `\`, or newlines; the engine validates and reseeds (`:retry:n`) on violation.
This is cheaper and more robust than context-aware escaping, at the cost of excluding
names like `O'Brien` from the fake pool — invisible in practice.

### Long inputs

Structural and key-context layers are O(input) regex passes — they always see the whole
text. The semantic model has a 384-token window; the worker chunks text into overlapping
word windows and remaps offsets (implementation-plan step 8). Overlap-region duplicates
dedupe naturally in the resolve stage (identical spans merge; overlapping ones resolve).

## Alternatives rejected

- **Per-format parsers** (JSON.parse → walk → re-serialize): breaks on the primary use
  case (truncated/mixed/hand-mangled debug output), loses byte fidelity (key order,
  whitespace, escapes), and needs a parser per dialect forever.
- **tree-sitter / lenient parsers in WASM**: heavy, still per-grammar, and the value they
  add (key paths) is 95% covered by the one-regex scanner.
- **Escaping fakes per context** instead of constraining generators: requires knowing the
  quoting dialect of every span — i.e. parsing, see above.

## Consequences

- Exact-output golden tests are meaningful (byte-for-byte).
- The scanner's KV regex is a curated, tested asset — new syntaxes (e.g. XML attributes)
  are additions to it, with fixtures, not new subsystems.
- Nothing anywhere assumes valid input. Fuzzing the pipeline with garbage must never
  throw (test in the suite).
