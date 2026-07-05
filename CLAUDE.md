# Leshy

Local-first installable PWA that scrubs PII out of debugging data before it is pasted
into an LLM. Paste messy production output (JSON, Ruby inspect, logs, anything) → get the
same text back with every piece of PII replaced by a stable, realistic fake, replaced
tokens subtly highlighted → copy it out. Named for the Slavic forest spirit that watches
over everything in its woods. Tagline: **"Nothing leaves the woods."**

**Status**: scaffolded + detection validated. Implement by executing
`docs/implementation-plan.md` top to bottom. All decisions are made (`docs/adr/`); do not
re-decide, do not ask.

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
npm run check             # oxfmt + oxlint + type-aware lint + svelte-check + tsc(node)
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
  generate/     derivation + generators (stubs with contracts — plan steps 1–5)
  engine.ts     detect() real · scrub() stub (plan step 6)
src/worker/     protocol + RPC client real · detect.worker.ts bootstrap stub (step 9)
src/state/      session.svelte.ts runes store (step 10)
src/lib/        components (App shell stubs; ui/ = generated shadcn, lint-exempt)
leshy.config.ts user detector config — code, statically imported by the worker
scripts/        fetch-model, icons, spike/ (the validation harness — keep PASSing)
tests/          vitest + gold fixtures (tests/fixtures/samples.ts)
docs/           architecture.md · implementation-plan.md · adr/0001–0006
```

## Detection model in one paragraph

Three layers produce spans over the raw text: structural regex+validators (email, phone,
IP, PESEL checksum, Luhn…), a format-agnostic key-value scanner that flags values under
PII-ish keys, and a zero-shot GLiNER model (gliner-x-small, in-worker) for names,
addresses, orgs. `resolve()` filters model noise by rule, merges fragments, applies
preserve rules (db ids, timestamps, Leshy's own fake namespaces) and settles overlaps by
precedence tier (500 fake-preserve > 400 validated > 350 preserve > 300 structural >
200 key-context > 100 semantic), trimming losers so coverage never shrinks. Validated:
22/22 catches, 0 preserve violations (`npm run spike`).

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
detector — no model work.

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
allowScripts) → adr/0006 · module boundaries & worker contract → architecture.md ·
what to build next → implementation-plan.md.
