# Leshy architecture

One invariant outranks everything: **pasted data never leaves the browser tab.**
Everything below is shaped by it — no server, CSP `connect-src 'self'`, self-hosted model
weights, detection in a Web Worker inside the same origin.

## Data flow

```
paste
  │  (UI thread: src/state/session.svelte.ts, debounced)
  ▼
ScrubWorker.scrub(input, overrides)          src/worker/client.ts   — typed postMessage RPC
  │
  ▼  Web Worker                              src/worker/detect.worker.ts
config = resolveConfig(leshy.config.ts) + overrides   (built-ins + country packs)
raw spans = structural(input) ∪ keyContext(input) ∪ semantic(input)
  │            src/core/detect/{structural,keyContext}.ts, semantic/detect.ts (GLiNER)
  ▼
resolve: noise filters → merge fragments → preserve rules → tier overlap resolution
  │            src/core/detect/resolve.ts          (ADR-0004; spans now non-overlapping)
  ▼
scrub: per span — normalise → seed → detector.generate → collision/charset check
  │            src/core/engine.ts + generate/      (ADR-0002)
  ▼
{ output, replacements[] }  ── postMessage ──▶  OutputPane renders text + <TokenMark>
                                                InputPane marks what each fake replaced
                                                copy button writes raw output to clipboard
```

`src/core` is pure and side-effect-free: no DOM, no fetch, no globals beyond
`crypto.subtle`. It runs identically in the worker (app), in Node (spike/tests), and in
vitest — that's what makes the detection quality testable offline.

## Module map

```
src/core/
  types.ts                  every contract: Span, Detector, PreserveRule, LeshyConfig, TIER
  config.ts                 defineConfig / resolveConfig (builtins + packs + user + overrides)
  engine.ts                 detect() and scrub()
  preserve.ts               default preserve rules incl. fake namespaces
  detect/
    structural.ts           runs StructuralDetector/CustomDetector regexes + validators
    keyContext.ts           one-pass KV scanner (JSON/Ruby/JS/logfmt) + key-hint spans
    resolve.ts              noise filters, merging, tiers, trim-not-drop (ADR-0004)
    detectors/              one file per built-in; index.ts fixes tie-break order
    semantic/
      models.ts             ModelSpec registry (primary + alternative, pinned HF sources)
      tokenizer.ts          @huggingface/tokenizers → GLiNER tokenizer adapter
      detect.ts             enabled semantic detectors → one model pass → typed spans
      gliner/               vendored inference engine (see header of types.ts)
  packs/<iso2>/             one country: its national ids, address grammar, generators
                            and fake-namespace preserve rules (ADR-0008)
  generate/
    derive.ts               normalise / deriveSeed / nameTokens (ADR-0002)
    context.ts              GenerateContext assembly and sub-scope seed mixing
    faker.ts                seeded Faker instances; picks the locale
    locales.ts              the locale table — what Leshy can write fakes in
    generators.ts           per-type generator table
    shape.ts                shape helpers shared with the pack generators
src/worker/
  protocol.ts               request/response message types; ScrubOverrides
  client.ts                 ScrubWorker RPC wrapper (UI side)
  detect.worker.ts          worker entry: config import, model bootstrap, message loop
src/state/session.svelte.ts runes store: input/output/replacements/stage + worker lifecycle
src/lib/
  theme.ts                  light / dark / system, applied before first paint
  segments.ts               splits input and output into verbatim runs and marks
  components/               App shell parts + shadcn-svelte ui/ (generated)
src/App.svelte, main.ts     shell layout; main.ts sets the theme, then mounts
electron/main.ts            desktop shell — serves dist/ from app://leshy (ADR-0007)
leshy.config.ts             user detector config (code, bundled into the worker)
scripts/
  fetch-model.ts            downloads pinned model files → public/models/ (gitignored)
  spike/                    the validation spike, kept as smoke test (npm run spike)
  icons.ts, macos-icon.ts   derive runtime icon sizes and the macOS bundle assets
tests/                      vitest unit tests + shared gold fixtures
```

## The worker boundary

Detection (including ~180 MB of model state) lives in a module Web Worker so large pastes
never block the UI thread. Two rules make the boundary sound:

1. **Config is code and stays in the worker bundle.** `leshy.config.ts` may contain
   functions (validators, generators, custom matchers) — it is statically imported by
   `detect.worker.ts`, never serialised. The UI sends only `ScrubOverrides` (detector id
   toggles, salt, model on/off) — plain data.
2. **The protocol is tiny and typed** (`protocol.ts`): `warmup`, `scrub` in; `ready`,
   `progress`, `result`, `error` out, correlated by numeric id. No library — postMessage
   with a 60-line wrapper (`client.ts`).

Model bootstrap in the worker (`detect.worker.ts`): onnxruntime-web with
`wasmPaths` resolved via Vite `?url` imports (same-origin), EPs `['webgpu','wasm']`,
weights fetched from `/models/<id>/…` (SW-cached), tokenizer via `@huggingface/tokenizers`,
engine = vendored `Gliner` class with injected session — identical wiring to
`scripts/spike/gliner-node.ts`, which is the working reference.

## Country packs

A rule that only means something inside one country — a national id, a local address
grammar — lives in `src/core/packs/<iso2>/` together with its generator and its
fake-namespace preserve rule, never in the always-on built-in list (ADR-0008).
`resolveConfig` merges the selected packs into the detector and preserve lists, so
deselecting a country in the settings dialog takes its rules out of the run entirely.

## Model assets & offline

- `npm run models:fetch` downloads pinned files from HuggingFace **at dev time** into
  `public/models/` (gitignored). The build ships them in `dist/models/` — the deployed
  app serves its own weights; the only network the app ever touches is its own origin.
- Service worker (vite-plugin-pwa, generateSW): app shell + ort wasm precached; `/models/`
  under a CacheFirst runtime route → after the first scrub, fully offline.
- CSP (index.html meta): `default-src 'self'`, `connect-src 'self'`,
  `script-src 'self' 'wasm-unsafe-eval'`. A dev-only Vite plugin widens connect-src for
  the HMR websocket; production bytes stay strict.

## Hosting requirements

Any static host, with two response-header requirements (already set for `vp dev`/`vp preview`
in vite.config.ts):

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Required for multithreaded WASM. Serving the CSP as a header (mirroring the meta tag) is
recommended defence-in-depth.

The desktop shell (adr/0007) is its own host: `electron/main.ts` serves `dist/` from
`app://leshy` with both headers and the CSP, so no external host is involved.

## State & UI

One runes store (`session.svelte.ts`) owns input, output, replacements, the input those
replacements were computed from, stage, error and the worker lifecycle. Components are
thin: `InputPane` (textarea over a mirror div that carries the highlights a textarea
cannot hold, paste, spellcheck and extensions off so nothing but Leshy reads the paste),
`OutputPane` (output split around
replacements into text + `TokenMark` marks, a tally by entity type, and copy =
`navigator.clipboard.writeText(session.output)`), `ThemeToggle` (light / dark / system),
and the settings dialog (detectors, countries, locale, salt, model on/off). No router, no
global stores beyond `session`.

## Testing

- `vp test` — pure-core unit tests: validators, KV scanner, resolve behaviours, engine
  detection over the gold fixtures, and committed golden outputs for scrub (no model,
  CI-safe).
- `npm run spike` — the full pipeline including the real model, PASS/FAIL gated
  (30/30 catches, 0 preserve violations). Run after any change to detection or the model.
- Extension points are covered by construction: a new detector is data; its tests are
  new fixture lines.
