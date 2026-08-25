# Implementation plan

> **Status: done.** Steps 1–18 shipped. This file is the record of what was built in what
> order, not a description of the current code — read `docs/architecture.md` and CLAUDE.md
> for that. Two things moved afterwards: `fakerFor` takes any locale from
> `generate/locales.ts`, not `'pl' | 'en'` (step 2), and the national ids and address
> grammars of steps 3–5 now live in country packs under `src/core/packs/<iso2>/`
> (ADR-0008).

Execute top to bottom. Every architectural and policy decision is already made — if a
step seems to need a new decision, the answer is in the referenced ADR. After **every**
step: `npm run check && npm run test` must pass; after any detection-related step,
`npm run spike` must print PASS. Do not reorder tiers, thresholds, or namespaces.

Setup once: Node per `.node-version` (mise picks it up), `npm install`,
`npm run models:fetch`, then confirm the baseline: `npm run check`, `npm run test`,
`npm run spike` (expect PASS 22/22).

Conventions for every step: strict TS (no `any`), relative imports carry `.ts`, comments
only for non-obvious _why_ (see CLAUDE.md), formatting via `vp check --fix`.

---

### 1. Derivation core — `src/core/generate/derive.ts` (ADR-0002)

Implement `normalise`, `deriveSeed`, `nameTokens` exactly per the contracts in the file
and ADR-0002 (SHA-256 via `crypto.subtle` over `leshy:v1:${salt}:${scope}:${normalized}`,
first 4 bytes big-endian → uint32).
**Verify**: new `tests/derive.test.ts` — determinism (same in → same seed), salt and scope
independence, normalisation table per type, `nameTokens('jan.kowalski')` ≡ tokens of
`normalise('Jan Kowalski', 'person')`, `nameTokens('x9$q')` → null.

### 2. Seeded faker plumbing — `src/core/generate/faker.ts` (new)

`fakerFor(seed, locale: 'pl' | 'en')` returning a seeded Faker instance
(`new Faker({ locale: [pl, en, base] })` / en equivalents, `.seed(seed)`), plus the locale
heuristic: Polish diacritics in the source value, or a Polish-address-shaped context ⇒
'pl', else 'en'.
**Verify**: same seed twice ⇒ identical values; pl instance yields Polish names.

### 3. Generators: namespace-fixed structured types (ADR-0002 table in `generators.ts`)

email (`.example` TLD, local part via `nameTokens`/`personSeed` when name-like), ipv4
(TEST-NET for public, prefix-preserving hash for private), ipv6 (`2001:db8::/32`), mac
(locally-administered), ssn (group `00`), pesel (month 41–52, checksum recomputed, sex
digit parity kept). Replace the matching `todoGenerate` uses.
**Verify**: unit tests per generator — format shape, namespace membership, and the
idempotence property: for each fake, `detect()` yields zero spans (the fake-namespace
preserve rules recognise it). Determinism: fixed salt ⇒ exact expected strings.

### 4. Generators: shape-preserving digit types

phone (keep `+CC` and separator layout, replace subscriber digits), credit-card (keep
first digit, hash middle, fix Luhn), iban (keep country, hash BBAN, recompute mod-97),
jwt (three base64url pseudoword segments), api-key (keep prefix, hash tail, same length),
uuid (v4-shaped from hash).
**Verify**: validators accept every fake (Luhn/mod-97 pass); layout preserved
byte-for-byte where specified (`+48 601 234 567` keeps the `+48 ### ### ###` shape).

### 5. Generators: semantic types

person (word-count preserving, locale per step 2, casing follows source), address
(faker pl `ul. X N/M, DD-DDD City` shape for pl contexts, en shape otherwise), org
(keep legal suffix like `Sp. z o.o.`/`GmbH`/`Inc.` verbatim, fake the name).
**Verify**: unit tests incl. linking — the email fake for `jan.kowalski@gmail.com` and the
person fake for `Jan Kowalski` share first/last (same personSeed).

### 6. Engine `scrub()` — `src/core/engine.ts` (contract in the stub)

detect → derive per span → generate → enforce charset (no `"'\\`/newlines) and within-run
fake uniqueness (reseed `:retry:n`) → splice left-to-right building output-coordinate
`Replacement[]`.
**Verify**: `tests/scrub.test.ts` golden fixtures (default salt) for all five brief
samples — exact output strings committed; bytes outside spans identical; JSON samples
still `JSON.parse`-able; idempotence `scrub(scrub(x)) === scrub(x)` for the structured
samples; consistency: same value in two pastes ⇒ same fake.

### 7. Extend the spike to full scrub

Add a scrub pass to `scripts/spike/run.ts`: after detection PASS, scrub each sample and
assert (a) no original gold catch text survives in the output, (b) preserves survive
verbatim, (c) re-scrubbing the output changes nothing (structured samples).
**Verify**: `npm run spike` PASS with the new assertions.

### 8. Semantic chunking for long inputs (ADR-0003)

In `semantic/detect.ts`: word-window chunks ~250 words with ~40-word overlap, offsets
remapped, duplicate spans deduped before resolve.
**Verify**: synthetic 5k-word log with PII at start/middle/end — all caught; chunk-border
PII (place one name straddling a window edge) caught via overlap.

### 9. Worker bootstrap — `src/worker/detect.worker.ts` (contract in the stub)

Implement exactly the bootstrap contract: config import, ort-web session (`?url`
wasmPaths, `['webgpu','wasm']`), model fetch from `/models/`, tokenizer, `Gliner`
construction (mirror `scripts/spike/gliner-node.ts`), message handling with `progress`
stages, errors always replied never thrown.
**Verify**: `vp dev`, paste brief sample 1 in the browser with devtools network open —
result arrives, ONLY same-origin requests, worker survives malformed input (paste binary
garbage).

### 10. Session wiring — `src/state/session.svelte.ts`

Lazy ScrubWorker creation, `warmup()` on first interaction, ~150 ms debounce, stale
responses ignored (id check), stage/error propagation.
**Verify**: typing rapidly produces one final result; model-loading state visible on
first scrub.

### 11. OutputPane rendering + copy

Split `output` around `replacements` into text nodes + `TokenMark` (label from
replacement); copy button → `navigator.clipboard.writeText(session.output)` with a quiet
"copied" confirmation; empty state shows the tagline.
**Verify**: marks align exactly with fakes (no off-by-one against `Replacement` ranges —
test with multi-byte input: `"Łukasz"`); copied text has no markup.

### 12. TokenMark tooltip

Replace `title` with the shadcn-svelte tooltip showing the detector label (`Email
address`, `PESEL`…). Keyboard-focusable.
**Verify**: hover + focus show labels in both themes.

### 13. Settings dialog

shadcn dialog listing built-in detectors (from `resolveConfig().detectors`) with switches
→ `ScrubOverrides.disable/enable`; salt input (persist in `localStorage['leshy-salt']`);
semantic on/off. Changes re-scrub current input.
**Verify**: disabling `email` leaves emails intact; custom salt changes fakes
deterministically; toggles survive reload.

### 14. Theme init + persistence

`prefers-color-scheme` on first load; toggle persists to `localStorage['leshy-theme']`;
`<meta name="theme-color">` follows.
**Verify**: both themes across reloads; mark highlight legible in both.

### 15. Scanning indicator

The header eye blinks slowly (CSS) while `stage === 'working' || 'loading-model'`;
static under `prefers-reduced-motion`.
**Verify**: visible during a large paste; motionless with reduced-motion emulated.

### 16. PWA/offline verification

`vp build && vp preview`: install the app, scrub once, go offline (devtools), reload —
scrub still works (model from SW cache). Confirm `dist/models` served, precache ≈ app
shell + ort wasm only.
**Verify**: the above, plus Lighthouse PWA installability pass.

### 17. Optional Playwright smoke test

One test: paste brief sample 1 → output contains `"id":42`, does not contain
`jan.kowalski@gmail.com`, contains an `@…example` email. Wire as `vp run test:e2e`.

### 18. Docs touch-up

Update CLAUDE.md "Status" line (scaffold → implemented), record any deviations in the
relevant ADR's Consequences section (do not rewrite decisions).

---

Deliberately **not** in scope: reversibility/vault, telemetry of any kind, server
features, i18n of the UI, streaming scrub of files. Do not add dependencies without a
note in ADR-0006 — prefer the platform (`crypto.subtle`, Clipboard API, `<dialog>` via
shadcn, structuredClone).
