import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app, BrowserWindow, nativeTheme, net, protocol, session } from "electron";

// Leshy's desktop shell does one thing: serve the built SPA from a stable
// custom origin with the headers the engine needs, and refuse everything else.
// No preload, no IPC, no Node in the renderer: the same web app, minus the
// dev server (adr/0007).

const HOST = "leshy";
const ORIGIN = `app://${HOST}`;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "dist");
const icon = path.join(root, "icons", "icon-512.png");

// Mirrors the meta CSP in index.html. Serving it as a header too is the
// defence in depth architecture.md asks for; keep the two identical.
const CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; " +
  "object-src 'none'; base-uri 'none'; form-action 'none'";

const MIME: Record<string, string> = {
  ".css": "text/css",
  ".html": "text/html",
  ".ico": "image/x-icon",
  ".js": "text/javascript",
  ".json": "application/json",
  ".mjs": "text/javascript",
  ".onnx": "application/octet-stream",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

// COOP/COEP is what lets onnxruntime-web use worker threads. Without it ORT
// falls back to a single thread and WebGPU carries the model, so this is a
// performance floor, not a correctness one.
const headersFor = (file: string): Record<string, string> => ({
  "content-type": MIME[path.extname(file)] ?? "application/octet-stream",
  "content-security-policy": CSP,
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-embedder-policy": "require-corp",
  "cross-origin-resource-policy": "same-origin",
});

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

const serve = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  if (url.host !== HOST) return new Response("not found", { status: 404 });
  const rel = path.normalize(decodeURIComponent(url.pathname));
  const file = rel === path.sep ? path.join(root, "index.html") : path.join(root, rel);
  if (file !== root && !file.startsWith(root + path.sep)) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    const res = await net.fetch(pathToFileURL(file).toString());
    if (!res.ok) return new Response("not found", { status: res.status });
    return new Response(res.body, { status: 200, headers: headersFor(file) });
  } catch {
    return new Response("not found", { status: 404 });
  }
};

// Invariant #1 as an enforced boundary rather than a promise: the renderer has
// no route to the network at all, even if the CSP were wrong.
const lockDown = (): void => {
  const s = session.defaultSession;
  s.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (_details, callback) => {
    callback({ cancel: true });
  });
  const allowed = new Set(["clipboard-read", "clipboard-sanitized-write"]);
  s.setPermissionRequestHandler((_contents, permission, callback) => {
    callback(allowed.has(permission));
  });
  s.setPermissionCheckHandler((_contents, permission) => allowed.has(permission));
};

// Matches --background in src/app.css so the window does not flash before paint.
const background = (): string => (nativeTheme.shouldUseDarkColors ? "#07110c" : "#f9f6f0");

const createWindow = (): BrowserWindow => {
  const win = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 560,
    minHeight: 420,
    icon,
    backgroundColor: background(),
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.once("ready-to-show", () => win.show());
  void win.loadURL(`${ORIGIN}/`);
  return win;
};

// LESHY_SMOKE=1 launches, reports what the renderer actually got, and exits.
// Cheap check that the custom origin still carries isolation and WebGPU, and
// that the 172 MB weights still stream through protocol.handle intact.
const SMOKE = `(async () => {
  const head = async (p) => {
    const r = await fetch(p);
    const b = await r.arrayBuffer();
    return { bytes: b.byteLength, type: r.headers.get('content-type') };
  };
  return {
    origin: location.origin,
    crossOriginIsolated,
    webgpu: 'gpu' in navigator,
    workers: typeof Worker === 'function',
    subtle: !!crypto.subtle,
    weights: await head('/models/gliner-x-small/model_quantized.onnx'),
  };
})()`;

const smokeTest = async (win: BrowserWindow): Promise<void> => {
  const report = (await win.webContents.executeJavaScript(SMOKE)) as Record<string, unknown>;
  console.log("leshy shell:", JSON.stringify(report));
  app.quit();
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setName("Leshy");

  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.on("web-contents-created", (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event, url) => {
      if (!url.startsWith(ORIGIN)) event.preventDefault();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  void app.whenReady().then(() => {
    protocol.handle("app", serve);
    lockDown();
    if (process.platform === "darwin" && !app.isPackaged) app.dock?.setIcon(icon);
    const win = createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
    if (process.env["LESHY_SMOKE"] === "1") {
      win.webContents.once("did-finish-load", () => void smokeTest(win));
    }
  });
}
