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

### Implementation notes (plan steps 1–6 — deviations from the scaffold)

- **Sub-scope seeds are a synchronous mixer, not SHA-256.** The primary `ctx.seed` is the
  SHA-256 derivation above (async, `crypto.subtle`), but the `GenerateContext` contract
  makes `seedFor(scope)` and `personSeed(tokens)` **synchronous**, so they use a fast
  deterministic FNV-1a mix (`generate/context.ts`) instead. It is not a security input —
  it only decorrelates independent draws — and every required property (determinism,
  salt-decorrelation, no storage, person↔email linkage) still holds.
- **Collision retry perturbs `personSeed` too.** Reseeding via `:retry:n` (on a charset
  violation or a within-run fake collision) changes `personSeed`, so a colliding person
  and their linked email may lose linkage for that one value. This is the collision
  consequence already accepted above ("a collision victim may differ"), traded for
  guaranteed loop termination.
- **A fake equal to its source counts as a collision.** The within-run map compared fakes
  only to other fakes, so a generator that failed to substitute emitted the source verbatim
  and still reported a replacement (phone numbers written without separators kept every
  digit as "country code"). `engine.ts` now rejects `fake === span.text` and reseeds, which
  makes "a generator must change its input" an engine invariant rather than a per-generator
  obligation.
- **Only recognised vendor prefixes survive an api-key fake.** The generator fell back to
  the source's first four characters when no prefix in its list matched, which leaked the
  head of every secret caught by key context (`secret`, `token`, `api_key`) — those have no
  vendor prefix by definition. Unrecognised keys are now replaced whole; `AKIA…`/`ghp_…`
  keep their prefix so the fake still reads as the kind of credential it replaced.
- **The locale set is a table, not a union.** `generate/locales.ts` holds one entry per
  locale Leshy ships — label, faker fallback chain, optional marker patterns — and `Locale`
  is its key set, so adding a locale is a data line rather than a change to `fakerFor`.
  Latin script only: `email` strips its local part to `[a-z0-9._+-]`, which would collapse
  a Cyrillic or CJK name to `user@…`. Auto-detection scores marker hits per locale and
  falls back to `en`, so a locale with no markers is reachable only by naming it — from
  `config.locale` or the settings dialog. The whole set is bundled, since locale data is
  data and lazy-loading it would make `fakerFor` async, which is why the table is a
  curated list rather than all ~70 faker locales.
- **Locale is a config input, not only a per-value guess.** `config.locale` defaults to
  `'auto'`, which keeps the marker sniff described above; naming a locale (`locale: 'pl'`)
  applies it to every value in the document. Generators read it only through
  `GenerateContext.localeFor(hint)`, which ignores the hint when the locale is explicit —
  so the linkage below holds by construction in that case.
- **Person locale from the name tokens.** The `GenerateContext` exposes only the matched
  value, so under `locale: 'auto'` the locale comes from the name itself rather than from
  surrounding context: a diacritic-free Polish name (`Jan Kowalski`) gets an `en` fake
  unless the document locale says otherwise. It is resolved from the
  same token sequence the person seed is, though. Reading it off the raw value instead
  handed one shared `personSeed` to two different faker locales, so `Łukasz Nowak` and
  `łukasz.nowak@…` — same seed — became two different people. Linkage, not Polishness, is
  the invariant the fixtures assert.
