# ADR-0006: Stack and toolchain specifics

Status: accepted

## Decision

- **Vite Plus 0.2.2** (beta, MIT) as a **local devDependency** — `vp` runs via npm scripts;
  no global installer, no machine takeover. `vite` is aliased to
  `@voidzero-dev/vite-plus-core` via package.json `overrides` (the vp-native layout).
  Escape hatch: the config surface is standard Vite 8 — if Vite+ beta churn bites,
  swapping devDeps back to `vite@^8` + `vitest` + eslint/prettier is mechanical.
- **Node ≥ 22.18 / 24.11** (`engines`, `.node-version` = 24.18.0 for mise/vp). Repo
  scripts run TypeScript directly on Node's type stripping — no tsx/ts-node.
- **Svelte 5.56** (runes) on `@sveltejs/vite-plugin-svelte` 7. Plain Vite SPA — **no
  SvelteKit**: no server runtime exists to accidentally receive data, which makes
  invariant #1 structural. Routing needs are zero (one screen).
- **Tailwind 4** via `@tailwindcss/vite`; **shadcn-svelte 1.3** components vendored under
  `src/lib/components/ui/` with hand-managed `components.json` (its interactive init was
  bypassed; add components with `npx shadcn-svelte@latest add <name> --yes --no-deps`,
  then install the peer deps it names).
- **@huggingface/tokenizers** (standalone, pure JS) for tokenization — NOT full
  transformers.js, which would drag onnxruntime-node + sharp into the app graph. Token
  parity with transformers.js was verified in the spike (identical ids incl. `<<ENT>>`).
- **onnxruntime-web 1.27** for inference (WASM baseline, `['webgpu','wasm']` EP list).
  COOP/COEP headers are set in dev/preview and **required on the production host**;
  the CSP needs `wasm-unsafe-eval` (already in index.html).
- **PWA**: vite-plugin-pwa 1.3 generateSW. App shell + ort wasm precached
  (`maximumFileSizeToCacheInBytes` raised to 40 MB); model files are **excluded from
  precache** and cached at first use by a CacheFirst runtime route on `/models/`.
  Models are **self-hosted** (fetched to `public/models/` by `npm run models:fetch`,
  gitignored, shipped in `dist/`) so the running app never contacts a third party.

## Gotchas (all hit during scaffolding — do not rediscover them)

1. **Node type stripping (amaro)** mis-parses a class field initialized with a regex
   literal when a generator method follows — hoist such regexes to module consts
   (see `gliner/processor.ts`).
2. **tsgolint** (vp check's type-aware pass) cannot see named exports of `.svelte`
   modules; the generated `ui/` barrels are excluded from lint
   (`lint.ignorePatterns`) and owned by `svelte-check`. It also ignores
   `compilerOptions.baseUrl` — the `$lib` paths deliberately avoid baseUrl.
3. **`vp test` runs once** (not watch); `vp run <script>` for package scripts;
   built-in `vp build`/`vp test` cannot be overridden.
4. **npm allowScripts**: `onnxruntime-node` and `protobufjs` postinstalls are allowlisted
   in package.json; new native deps will need the same.
5. **oxfmt** owns formatting (double quotes, semicolons) — never argue with it, run
   `vp check --fix`.
6. `@faker-js/faker` is **pinned exactly** — see ADR-0002.
7. **Per-file `vp check` (the staged pre-commit hook) does not apply
   `tsconfig.node.json`.** A node script checked in isolation loses its `types: ["node"]`,
   so `process`/`node:*` fail to resolve — `scripts/spike/run.ts` carries a
   `/// <reference types="node" />` to self-type. The project gate `npm run check` (which
   runs `tsc -p tsconfig.node.json`) is authoritative for the scripts.
8. **The e2e smoke test (`e2e/`, `playwright.config.ts`) is authored but Playwright is
   NOT installed** — the no-new-deps rule. Those paths are in `lint.ignorePatterns` and
   outside both tsconfig includes so the build stays green. To run `npm run test:e2e`:
   `npm i -D @playwright/test && npx playwright install` first.

## Alternatives rejected

- **SvelteKit + adapter-static**: adds a server-shaped framework to a one-screen app and
  weakens the "no server anywhere" story.
- **Global `vp` install (curl)**: takes over the machine's Node/package-manager
  environment; unacceptable as a repo requirement.
- **transformers.js as the tokenizer/runtime**: 3× the dependency surface for the same
  tokenizer output; its GLiNER support does not exist (upstream issue open since 2024).
