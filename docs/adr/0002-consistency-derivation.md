# ADR-0002: Consistent fakes by derivation, not storage

Status: accepted

## Decision

The same real value always maps to the same fake **by construction**, with nothing
sensitive persisted:

```
normalise(value, type)                     → identity key
SHA-256("leshy:v1:" salt ":" scope ":" key) via crypto.subtle
first 4 bytes, big-endian                  → uint32 seed
new Faker({ locale }) + faker.seed(seed)   → fake value for that entity type
```

- `scope` is the entity type (or a named sub-scope like `email:domain`) so different types
  derive independent randomness from the same source value.
- `salt` defaults to the fixed string `leshy-v1` — out of the box, everyone gets the same
  reproducible mapping (goldens, docs, debugging all benefit). A user-set salt (config or
  settings UI, kept in localStorage) makes the mapping private without changing semantics.
  The salt is not a secret input to any security property; it only decorrelates mappings.
- `@faker-js/faker` is pinned **exactly** (10.5.0): fake outputs are a function of seed AND
  faker's data files, so a version bump silently reshuffles every mapping. Bumping it is
  allowed but must be called out as a mapping-breaking change.

### Normalisation (per type)

- all types: trim, NFC, collapse internal whitespace
- email: lowercase everything
- person: casefold for the identity key only (fake keeps natural casing); diacritics are
  KEPT (`Łukasz` ≠ `Lukasz` as identities — folding them together risks linking two people)
- digit types (phone, PESEL, SSN, card, IBAN): strip separators

### Linked identities

Person identity is a token sequence. `nameTokens("jan.kowalski")` = `["jan","kowalski"]`
matches `normalise("Jan Kowalski")`, so an email generator derives its local part from the
**same person seed** as the standalone name — `jan.kowalski@gmail.com` and `"Jan Kowalski"`
stay one person after scrubbing, which is exactly what an LLM needs to follow the data.

### Collisions

Within a run the engine keeps an in-memory fake→source map (rendering + collision checks
only, discarded after). If two distinct sources derive the same fake, the loser reseeds
via scope suffix `:retry:1`, `:retry:2`… Deterministic for identical pastes; across
different pastes a collision victim may differ — accepted (probability ~n²/2·10⁻⁹ for
n values in a paste; the alternative is a persistent registry, rejected below).

### Idempotence (scrub twice = scrub once)

- **Structured types are fixed by namespace**: fakes are generated inside reserved ranges
  no real value occupies — emails under the RFC 2606 `.example` TLD, public IPv4 in
  RFC 5737 TEST-NET, IPv6 in `2001:db8::/32`, MAC locally-administered, SSN group `00`,
  PESEL birth months 41–52 (the 2100s century band: checksum-valid, structurally real,
  humanly impossible). Preserve rules recognise these namespaces at the highest tier
  (TIER.PRESERVE_FAKE), so re-scrubbing output is a no-op for these types.
- **Semantic types (person/address/org) are idempotent within a run** via the run map.
  Across sessions, re-scrubbing an already-fake name yields a different fake name. This is
  a deliberate limitation: any recognise-our-fakes list for names (pool membership,
  markers) either leaks real values that collide with the pool or pollutes output with
  markers. No PII is at risk — only consistency drift on double-scrubbed text.

## Alternatives rejected

- **Vault / real↔fake store** — reversibility is explicitly unwanted; a persisted mapping
  is itself a PII store and contradicts invariant #1's spirit.
- **Invisible watermarks in fakes** (zero-width chars) — corrupts the one thing users copy
  out; breaks "structure otherwise untouched".
- **Fake-pool membership preserve for names** — a real person whose name collides with a
  pool entry would be _preserved_, i.e. leaked. Recall-first forbids trading a real leak
  for cosmetic idempotence.
- **Per-install random salt as default** — breaks reproducibility of docs/tests/support
  ("why do we get different fakes?"). Opt-in instead.

## Consequences

- No storage of user data anywhere, ever — consistency survives restarts by construction.
- Generators must be pure functions of (seed, source shape); anything time- or
  locale-environment-dependent is a bug.
- Golden-file tests can assert exact output bytes for the default salt.
