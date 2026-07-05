# ADR-0004: Preserve vs redact — precedence tiers, recall first

Status: accepted (validated by spike)

## Decision

Every span carries a **tier**; overlaps resolve top tier first, and losers are **trimmed
to their uncovered remainder, never dropped** — total redaction coverage can only grow.

| tier | name          | what sits here                                                   |
| ---- | ------------- | ---------------------------------------------------------------- |
| 500  | PRESERVE_FAKE | Leshy's own fake namespaces (ADR-0002) — idempotence             |
| 400  | VALIDATED     | structural spans whose validator passed (PESEL/Luhn/mod-97/date) |
| 350  | PRESERVE_RULE | preserve rules: values under id-ish keys, timestamps             |
| 300  | STRUCTURAL    | regex-only structural matches (email, IP, …)                     |
| 200  | KEY_CONTEXT   | values under PII-suggesting keys                                 |
| 100  | SEMANTIC      | model spans                                                      |

The ordering encodes the policy questions:

- **A checksummed PESEL under an `id:` key is redacted** — VALIDATED (400) beats
  PRESERVE_RULE (350). A leak costs more than an over-scrub, always.
- **`user_id=98123` is preserved** even if the model tags it — PRESERVE_RULE beats
  SEMANTIC and KEY_CONTEXT. Debugging value survives.
- **A fake from a previous run is never re-scrubbed** — PRESERVE_FAKE beats everything.

### Semantic noise filters (before tiering; all rule-based, spike-validated)

1. Pure timestamps and digits-only spans are never PII by themselves.
2. A span in key position (immediately before `:`⁄`=>`⁄`=`) names a field, not a value.
3. **Corroboration**: for types the model does not own (no enabled semantic detector —
   email, phone, ip…), a lone model guess needs an overlapping structural match, else it
   is dropped. Types with a semantic owner (person, address, org) trust the model.
4. Same-type spans separated by ≤6 chars of glue (space/digits/punctuation) merge —
   models return `street | building | city` as fragments; a partial replacement would
   leak the remainder. The merged span inherits its highest-tier constituent.

### Defaults

- Preserve keys: `/(^|_)(id|uuid|guid)$/i`; timestamps under `*_at`/`timestamp` keys and
  ISO-shaped values.
- The `uuid` detector ships **disabled** — bare UUIDs in debug output are database ids.
  Enabling it for token-heavy domains is one line: `enable: ['uuid']`.
- Everything above is data, not code: `PreserveRule { keys?, match?, isFake? }` in
  `leshy.config.ts` extends the same machinery (worked example in CLAUDE.md).

## Alternatives rejected

- **Confidence-weighted scoring** (blend model score with rules): opaque, untestable,
  and impossible to document ("why was this kept?"). Tiers are auditable.
- **Preserve winning over validated checksums**: turns a mislabeled column into a leak;
  contradicts recall-first.
- **Dropping overlapped lower-tier spans** (instead of trimming): a short high-tier match
  inside a long semantic span would silently un-redact the rest of it.

## Consequences

- Adding a detector or preserve rule cannot reduce existing coverage (trim-not-drop, and
  corroboration keys off detector declarations, not hardcoded type lists).
- The spike (`npm run spike`) locks all of this behaviour: 22/22 catches, 0 preserve
  violations, both with and without key hints.
