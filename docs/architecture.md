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
config = resolveConfig(leshy.config.ts) + overrides
raw spans = structural(input) ∪ keyContext(input) ∪ semantic(input)
  │            src/core/detect/{structural,keyContext}.ts, semantic/detect.ts (GLiNER)
  ▼
resolve: noise filters → merge fragments → preserve rules → tier overlap resolution
  │            src/core/detect/resolve.ts          (ADR-0004; spans now non-overlapping)
  ▼
scrub: per span — normalise → seed → detector.generate → collision/charset check
  │            src/core/engine.ts + generate/      (ADR-0002; TODO(opus) steps 8–11)
  ▼
{ output, replacements[] }  ── postMessage ──▶  OutputPane renders text + <TokenMark>
                                                copy button writes raw output to clipboard
```

`src/core` is pure and side-effect-free: no DOM, no fetch, no globals beyond
`crypto.subtle`. It runs identically in the worker (app), in Node (spike/tests), and in
vitest — that's what makes the detection quality testable offline.

## Module map

```
src/core/
  types.ts                  every contract: Span, Detector, PreserveRule, LeshyConfig, TIER
  config.ts                 defineConfig / resolveConfig (builtins + user config + overrides)
  engine.ts                 detect() [real] and scrub() [stub with contract]
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
  generate/
    todo.ts                 stub generator factory (every use = a plan step)
    derive.ts               normalise/deriveSeed/nameTokens — contracts, TODO(opus)
    generators.ts           per-type generator spec table, TODO(opus)
src/worker/
  protocol.ts               request/response message types; ScrubOverrides
  client.ts                 ScrubWorker RPC wrapper (UI side)
  detect.worker.ts          worker entry — bootstrap contract in comments, TODO(opus)
src/state/session.svelte.ts runes store: input/output/replacements/stage
src/lib/components/         App shell parts + shadcn-svelte ui/ (generated)
leshy.config.ts             user detector config (code, bundled into the worker)
scripts/
  fetch-model.ts            downloads pinned model files → public/models/ (gitignored)
  spike/                    the validation spike, kept as smoke test (npm run spike)
  icons.ts                  derives runtime sizes from assets/brand/ → public/icons/
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

Model bootstrap in the worker (contract in `detect.worker.ts`): onnxruntime-web with
`wasmPaths` resolved via Vite `?url` imports (same-origin), EPs `['webgpu','wasm']`,
weights fetched from `/models/<id>/…` (SW-cached), tokenizer via `@huggingface/tokenizers`,
engine = vendored `Gliner` class with injected session — identical wiring to
`scripts/spike/gliner-node.ts`, which is the working reference.

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

One runes store (`session.svelte.ts`) owns input, output, replacements, stage, error, and
(step 12) the worker lifecycle. Components are thin: `InputPane` (textarea, paste),
`OutputPane` (renders output split around replacements into text + `TokenMark` marks;
copy = `navigator.clipboard.writeText(session.output)`), `ThemeToggle`, settings dialog
(step 14). No router, no global stores beyond `session`.

## Testing

- `vp test` — pure-core unit tests: validators, KV scanner, resolve behaviours, engine
  detection over the gold fixtures (no model, CI-safe). Generators and scrub get golden
  fixtures as they land (plan steps).
- `npm run spike` — the full pipeline including the real model, PASS/FAIL gated
  (22/22 catches, 0 preserve violations). Run after any change to detection or the model.
- Extension points are covered by construction: a new detector is data; its tests are
  new fixture lines.
