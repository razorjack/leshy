# ADR-0004: Preserve vs redact — precedence tiers, recall first

Status: accepted (validated by spike)

## Decision

Every span carries a **tier**; overlaps resolve top tier first, and losers are **trimmed
to their uncovered remainder, never dropped** — total redaction coverage can only grow.

| tier | name          | what sits here                                                       |
| ---- | ------------- | -------------------------------------------------------------------- |
| 500  | PRESERVE_FAKE | Leshy's own fake namespaces (ADR-0002) — idempotence                 |
| 400  | VALIDATED     | structural spans whose validator proved it (checksum, rule, grammar) |
| 350  | PRESERVE_RULE | preserve rules: values under id-ish keys, timestamps                 |
| 300  | STRUCTURAL    | regex-only structural matches (email, IP, …)                         |
| 200  | KEY_CONTEXT   | values under PII-suggesting keys                                     |
| 100  | SEMANTIC      | model spans                                                          |

The ordering encodes the policy questions:

- **A checksummed PESEL under an `id:` key is redacted** — VALIDATED (400) beats
  PRESERVE_RULE (350). A leak costs more than an over-scrub, always.
- **`user_id=98123` is preserved** even if the model tags it — PRESERVE_RULE beats
  SEMANTIC and KEY_CONTEXT. Debugging value survives.
- **A plausibility check does not reach VALIDATED.** A validator that only makes a
  candidate likely rather than proving it declares `heuristic: true`, and its spans stay at
  STRUCTURAL (300), below preserve rules. Phone's validator counts digits and rejects date
  shapes, so `{"trace_id": "1234 5678 9012"}` is preserved rather than scrubbed as a phone
  number, while a checksummed PESEL under an `id` key is still redacted.
- **A fake from a previous run is never re-scrubbed** — PRESERVE_FAKE beats everything.
  The `fake-*` rules for a country's own namespace ship with its pack (ADR-0008), so they
  load and unload with the detector that produced the value.

### Semantic noise filters (before tiering; all rule-based, spike-validated)

1. Pure timestamps and digits-only spans are never PII by themselves.
2. A span in key position (immediately before `:`⁄`=>`⁄`=`) names a field, not a value.
3. **Corroboration**: for types the model does not own (no enabled semantic detector —
   email, phone, ip…), a lone model guess needs an overlapping structural match, else it
   is dropped. Types with a semantic owner (person, address, org) trust the model.
4. Same-type spans merge, in two shapes. **Overlapping**: two detectors found one value at
   different extents (a structural email inside the key-context span for the whole field).
   **Adjacent across ≤6 chars of glue** (space/digits/punctuation): models return
   `street | building | city` as fragments, and a partial replacement would leak the
   remainder. The merged span covers the union and inherits its highest-tier constituent.

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

### Implementation notes (plan steps 3, 7 — deviations from the scaffold)

- **Fake values define preserve _regions_, not self-drops.** `resolve.ts` originally
  filtered out only the spans whose own text matched an `isFake` rule. That left a gap:
  the semantic model, on a second scrub, tags a fragment _inside_ a fake (a fake email's
  local part reads as a person/org). Since the email span is dropped as fake, that model
  span survived and got re-scrubbed — breaking idempotence and corrupting the fake. Now
  any span overlapping a fake-namespace span is dropped, so a fake's whole extent is
  inert on re-scrub. This is what makes `scrub(scrub(x)) === scrub(x)` hold with the
  model on (asserted in the spike's scrub pass).
- **Overlapping same-type spans merge instead of trimming.** Trim-not-drop re-typed the
  leftover when the shorter span was the higher-tier one: the remainder was emitted as
  another span of the _loser's_ type and generated as that entity, so
  `"email": "foo@bar.com/extra"` produced two fake emails spliced together and
  `?email=…&token=abc` turned `&token=abc` into an email address. Merging settles the
  same-type case; trim-not-drop still governs spans of different types, where the remainder
  genuinely is a different entity and redacting it is the point.
- **Region sets are indexed, not scanned.** Every stage of `resolve()` asks "does this span
  hit that set of ranges?" once per span, and each answered by scanning its whole set, so
  the stage was quadratic in span count: a 460 KB paste spent 26.7 s of its 29.6 s in
  resolve. The preserve, fake-namespace, corroboration and already-chosen sets are now
  sorted, merged once and queried by binary search — same result, 29 ms on that input.
  Tier semantics are unchanged; only the lookup is.
- **`fake-mac` and `fake-ipv6` preserve rules added** to complete the idempotence
  namespaces ADR-0002 already names. Accepted recall cost, per ADR-0002's namespace
  choice: a _real_ locally-administered MAC (second nibble 2/6/A/E) under a MAC key is
  preserved rather than scrubbed. Universally-administered MACs (the common case) are
  unaffected; the `2001:db8::/32` IPv6 range is documentation-only, so no real value is
  ever preserved by `fake-ipv6`.
