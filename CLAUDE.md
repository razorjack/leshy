# Leshy

Local-first installable PWA that scrubs PII out of debugging data before it is pasted
into an LLM. Paste messy production output (JSON, Ruby inspect, logs, anything) → get the
same text back with every piece of PII replaced by a stable, realistic fake, replaced
tokens subtly highlighted → copy it out. Named for the Slavic forest spirit that watches
over everything in its woods. Tagline: **"Nothing leaves the woods."**

**Status**: implemented (plan steps 1–18 complete). Detection + generation + scrub are
built and validated: `npm run check` + `npm run test` (unit + gold fixtures) green,
`npm run spike` PASS (30/30 detection, scrub leak/preserve/idempotence/chunking). UI, the
in-worker model, PWA/offline wiring, settings, theming are in place; a checklist of
browser-only QA (PWA install, offline reload, visual theme) lives in the final report.
Decisions remain fixed (`docs/adr/`); deviations from the scaffold are recorded in the
relevant ADR Consequences sections — do not re-decide.

## Invariants (violating any of these is a bug, not a trade-off)

1. **Privacy**: user-pasted content never crosses the network. No server, no cloud API,
   no telemetry. CSP is `connect-src 'self'`; model weights are self-hosted and fetched
   same-origin. Nothing sensitive is ever persisted.
2. **Recall first**: a false negative leaks PII; a false positive merely over-scrubs.
   When a rule must choose, it redacts (e.g. a checksummed PESEL under an `id:` key).
3. **Determinism**: same input ⇒ same fake, across sessions, by derivation (ADR-0002) —
   never by storage. Reversibility is unwanted.
4. **Byte fidelity**: output equals input except inside replaced spans (ADR-0003).
5. **Web-platform-first**: prefer `crypto.subtle`, Clipboard API, Workers, `Intl`,
   `<dialog>`, structuredClone over dependencies. New deps need an ADR-0006 note.

## Commands

Node per `.node-version` (24.18.0; mise picks it up automatically). Then:

```
npm install               # vp toolchain is a local devDep, nothing global
npm run models:fetch      # one-time, ~190 MB → public/models/ (gitignored)
npm run dev / build / preview
npm run desktop           # Electron shell: build + launch (adr/0007)
npm run desktop:pack      # release/mac-arm64/Leshy.app; :dist makes .dmg / .AppImage
npm run desktop:install   # Linux: pack, then install under ~/.local/share + launcher
npm run icons:macos       # regenerate committed Assets.car + ICNS; needs Xcode 26
npm run check             # oxfmt + oxlint + type-aware lint + svelte-check + tsc
npm run test              # vitest unit tests (no model needed, CI-safe)
npm run spike             # full-pipeline validation incl. the real model → must PASS
```

Definition of done for any change: `check` + `test` green; `spike` PASS if detection was
touched. Formatting is oxfmt's opinion: run `vp check --fix`, don't fight it.

## Stack (pinned versions in package.json; details & gotchas in docs/adr/0006)

Vite Plus 0.2.2 (local `vp`) · Svelte 5 runes, plain Vite SPA (no SvelteKit) ·
Tailwind 4 + shadcn-svelte (tokens in `src/app.css`, never stock) · TypeScript strict ·
onnxruntime-web + vendored GLiNER engine + `@huggingface/tokenizers` ·
`@faker-js/faker` **pinned exactly** (mapping-breaking if bumped, ADR-0002) ·
vite-plugin-pwa. Scripts run on Node's native type stripping — relative imports carry
`.ts`, only erasable TS syntax (no enums/namespaces/param-properties).

## Directory map

```
src/core/       pure engine — types.ts is the contract surface, start reading there
  detect/       structural + key-context + semantic layers, resolve (tiers, ADR-0004)
  packs/        country packs: rules that only apply inside one country (ADR-0008)
  generate/     derivation + generators (locales.ts lists what Leshy generates in)
  engine.ts     detect() and scrub()
src/worker/     protocol + RPC client · detect.worker.ts (config, model bootstrap, loop)
src/state/      session.svelte.ts runes store
src/lib/        components (App shell; ui/ = generated shadcn, lint-exempt)
electron/       desktop shell: main.ts only, serves dist/ from app://leshy (adr/0007)
leshy.config.ts user detector config — code, statically imported by the worker
scripts/        fetch-model, icons, linux-install, spike/ (the validation harness — keep PASSing)
tests/          vitest + gold fixtures (tests/fixtures/samples.ts)
docs/           architecture.md · implementation-plan.md · adr/0001–0008
```

## Detection model in one paragraph

Three layers produce spans over the raw text: structural regex+validators (email, phone,
IP, Luhn…, credential material such as auth headers, cookies and private keys, plus the
national ids and address grammars of the selected country packs — PESEL, Steuer-ID, SSN),
a format-agnostic key-value scanner that flags values under PII-ish keys, and a zero-shot
GLiNER model (gliner-x-small, in-worker) for names, addresses, orgs. `resolve()` filters
model noise by rule, merges fragments, applies preserve rules (db ids, timestamps,
Leshy's own fake namespaces) and settles overlaps by precedence tier (500 fake-preserve >
400 validated > 350 preserve > 300 structural > 200 key-context > 100 semantic), merging
same-type overlaps and trimming the rest so coverage never shrinks. A validator that only
checks plausibility instead of proving the match marks its detector `heuristic` and stays
at 300. Validated: 30/30 catches, 0 preserve violations (`npm run spike`).

## Extending detection (the PESEL-class worked example)

A detector is data. Adding a Polish NIP tax id to `leshy.config.ts`:

```ts
export default defineConfig({
  detectors: [
    {
      id: "nip",
      label: "NIP (PL tax id)",
      type: "nip",
      kind: "structural",
      enabled: true,
      match: /(?<!\d)\d{10}(?!\d)/g,
      keys: /^nip$/i,
      validate: (nip) => nipChecksum(nip), // reject false candidates → tier 400
      generate: (ctx) => fakeNip(ctx.seed), // checksum-valid, deterministic
    },
  ],
  enable: ["uuid"], // opt-in built-in
  preserve: [{ id: "shas", keys: /^commit$/i, enabled: true }],
});
```

Same shape for built-ins: one file in `src/core/detect/detectors/` + registry line +
fixture lines in tests. Semantic entities are a label string on a `kind: 'semantic'`
detector — no model work. A field recognisable only by its name (`city`, `zip`) is a
`kind: 'key'` detector: `keys` plus `generate`, no pattern.

A detector that only means something inside one country (a national id, a local address
grammar) goes in `src/core/packs/<iso2>/` with a `CountryPack` manifest and one line in
`packs/index.ts` — never in the always-on `detectors/` list (ADR-0008). Its generator and
its fake-namespace preserve rule live in the pack too. All packs load unless `countries`
says otherwise.

## Code conventions

- Names: as short as possible while unambiguous — `detectByKey` not
  `detectEntitiesByKeyContext`; `spanTier` not `getSpanPrecedenceTier`; `kvs` is fine for
  a local, `keyValues` for an export.
- Comments explain non-obvious _why_ only (a checksum's century bands, a lint
  workaround). Never _what_, never restating the code. Doc-comments on exported
  contracts are the exception and should earn their lines.
- Small focused modules; `src/core` stays pure (no DOM/fetch/Date.now); UI is a thin
  shell over it. Arrow-function exports, `type`-only imports, no `any`, no default
  exports except Svelte components and config files.
- Tests: pure logic gets unit tests + gold fixtures; UI behaviour is verified manually
  per plan step (one optional Playwright smoke test at step 17).

## Where answers live

Why GLiNER / thresholds / fallbacks → adr/0001 · fake derivation & idempotence →
adr/0002 · why no parsers → adr/0003 · preserve-vs-redact tiers → adr/0004 · palette,
type, the eye → adr/0005 · toolchain quirks (amaro regex bug, tsgolint limits,
allowScripts) → adr/0006 · desktop shell → adr/0007 · country packs & locales →
adr/0008 · module boundaries & worker contract → architecture.md ·
what to build next → implementation-plan.md.
