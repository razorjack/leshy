# ADR-0007: Desktop shell (Electron)

Status: accepted

## Context

Running Leshy meant running `npm run preview` first. The app is local-first but not
launchable: it needs an origin that serves `dist/` with COOP/COEP so onnxruntime-web can
use worker threads, and a PWA install still depends on a host being reachable at least
once. A packaged desktop app removes the dev server without changing the app.

## Decision

- **Electron 43** (devDependency) wraps the unchanged SPA. The renderer is the same web
  app: no preload, no IPC, no Node, `contextIsolation` + `sandbox` on.
- **Custom `app://leshy` origin**, registered privileged (`standard`, `secure`,
  `supportFetchAPI`, `corsEnabled`, `stream`) and served by `protocol.handle` from
  `dist/`. The origin is stable across launches, so `localStorage` (theme, salt,
  detector overrides) survives restarts. `file://` was never an option: opaque origins
  break module workers and same-origin `fetch` of `/models/`.
- **Headers on every response**: COOP `same-origin`, COEP `require-corp`, CORP
  `same-origin`, and the same CSP `index.html` carries in its meta tag. Content types
  come from an explicit extension map so `.wasm` is served as `application/wasm`.
- **Invariant #1 is enforced, not just declared.** `webRequest.onBeforeRequest` cancels
  every `*://*/*` request, so the renderer has no route to the network even if the CSP
  were wrong. Permissions are denied except `clipboard-read` and
  `clipboard-sanitized-write`, window opening is denied, and navigation off `app://leshy`
  is blocked.
- **No service worker in the desktop build.** `LESHY_DESKTOP=1` drops `VitePWA` from the
  plugin list: precaching local files buys nothing and the update path cannot apply.
- **`asar: false`.** 180 MB of ONNX weights do not belong in an archive, and a local
  build gains nothing from one.
- **electron-builder** produces a macOS `.dmg` and a Linux `AppImage`; `--dir` gives the
  plain `.app` / app tree, which is what a local install actually needs.
- The main process is TypeScript compiled by `tsc` (`tsconfig.electron.json`) into
  `electron/out/`. No bundler, no new toolchain; `npm run check` type-checks it.

## Verified

`LESHY_SMOKE=1` launches the shell, reports what the renderer got, and exits. From
source and from the packaged `.app`:

```
{"origin":"app://leshy","crossOriginIsolated":true,"webgpu":true,"workers":true,
 "subtle":true,"weights":{"bytes":172716978,"type":"application/octet-stream"}}
```

Cross-origin isolation does hold on a custom scheme, so ORT keeps its worker threads.
A full scrub driven through the packaged app returns the expected output: `"id":42`
preserved, email replaced under `.example`, name, phone, address and PESEL faked.

Sizes: `Leshy.app` 496 MB, `.dmg` 265 MB, Linux tree 532 MB, AppImage 274 MB. 220 MB of that is
`dist/`, dominated by the weights and the 26 MB ORT wasm.

## Gotchas

1. **`allowScripts` needs `"electron": true`** or npm blocks the postinstall that
   downloads the binary and `electron/dist` never appears. On an already-installed tree
   npm will not re-run it: `node node_modules/electron/install.js`.
2. **ESM main.** package.json is `"type": "module"`, so `electron/out/main.js` is ESM.
   `protocol.registerSchemesAsPrivileged` runs at module top level, which is still
   before `app.whenReady()`.
3. **`npmRebuild: false`** and an explicit `!node_modules/**/*` in `files`. Nothing in
   `dependencies` is needed at runtime (Vite bundles it all into `dist/`), and
   `onnxruntime-node` must never be rebuilt against the Electron ABI.
4. **The bundle is only ad-hoc signed** (Electron's own linker signature; resources are
   not sealed). Fine for a locally built copy. Distribution needs a Developer ID plus a
   separate notarization step.
5. **Linux builds cross-compile from macOS.** `--linux dir` and `--linux AppImage --x64`
   both work without Docker; electron-builder downloads the Linux runtime and AppImage
   tooling on demand.
6. The CSP lives in two places now, `index.html` and `electron/main.ts`. Keep them
   identical.

## Alternatives rejected

- **Deno desktop** (`deno desktop`, Deno 2.9, experimental). Its size advantage exists
  only with the system-webview backend (WKWebView on macOS, WebKitGTK on Linux), which
  puts the one subsystem that needed a spike harness onto engines ORT's WebGPU EP is not
  developed against. Its CEF backend removes that risk and is no smaller than Electron.
  It also serves from `http://127.0.0.1:<port>` with a port chosen per launch, so the
  origin, and with it every `localStorage` setting, changes on every start.
- **Tauri.** Smallest binary, same system-webview problem, and a Rust toolchain for a
  shell that serves static files.
- **Loopback HTTP server inside Electron.** Works, but opens a port and buys nothing over
  a custom scheme now that isolation is confirmed to hold on `app://`.
- **PWA install only.** Cheapest, but needs a reachable host to install and update from,
  and 180 MB in CacheStorage is evictable without `navigator.storage.persist()`.
