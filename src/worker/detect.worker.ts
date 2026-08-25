import * as ort from "onnxruntime-web";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url";
import mjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs?url";
import { Tokenizer } from "@huggingface/tokenizers";
import userConfig from "../../leshy.config.ts";
import type { LeshyConfig, Span } from "../core/types.ts";
import { resolveConfig, type ResolvedConfig } from "../core/config.ts";
import { scrub } from "../core/engine.ts";
import { detectSemantic } from "../core/detect/semantic/detect.ts";
import { models } from "../core/detect/semantic/models.ts";
import { Gliner } from "../core/detect/semantic/gliner/runtime.ts";
import { glinerTokenizer } from "../core/detect/semantic/tokenizer.ts";
import type { MakeTensor, OrtSession } from "../core/detect/semantic/gliner/types.ts";
import type { ScrubOverrides, WorkerRequest, WorkerResponse, WorkerStage } from "./protocol.ts";

// wasm + mjs are bundled same-origin via ?url (CSP connect-src 'self'); the
// service worker precaches them. JSEP build → WebGPU with a wasm fallback.
ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };

const base = resolveConfig(userConfig);

// The model is heavy (~180 MB): load it once, lazily, and share the promise.
let glinerPromise: Promise<Gliner> | undefined;
let glinerReady = false;

const loadGliner = async (): Promise<Gliner> => {
  const spec = models[base.semantic.model];
  if (!spec) throw new Error(`unknown model '${base.semantic.model}'`);
  const dir = `/models/${spec.id}`;
  const json = <T>(file: string): Promise<T> =>
    fetch(`${dir}/${file}`).then((r) => r.json() as Promise<T>);
  const [tok, tokCfg, weights] = await Promise.all([
    json<ConstructorParameters<typeof Tokenizer>[0]>(spec.files.tokenizer),
    json<ConstructorParameters<typeof Tokenizer>[1]>(spec.files.tokenizerConfig),
    fetch(`${dir}/${spec.files.weights}`).then((r) => r.arrayBuffer()),
  ]);
  const session = await ort.InferenceSession.create(weights, {
    executionProviders: ["webgpu", "wasm"],
  });
  const makeTensor: MakeTensor = (kind, data, dims) =>
    new ort.Tensor(kind, data as unknown as bigint[], dims);
  return new Gliner(
    session as unknown as OrtSession,
    makeTensor,
    glinerTokenizer(new Tokenizer(tok, tokCfg), spec.tokenizerStyle),
    { maxWidth: spec.maxWidth, clsTokenId: spec.clsTokenId },
  );
};

const getGliner = (): Promise<Gliner> =>
  (glinerPromise ??= loadGliner().then(
    (g) => {
      glinerReady = true;
      return g;
    },
    (e: unknown) => {
      // Forget the failure so the next scrub retries. Caching the rejected
      // promise would disable the model until the page reloads, even when the
      // cause was a cold cache or a dropped connection.
      glinerPromise = undefined;
      throw e;
    },
  ));

/** Fold serialisable UI overrides over the code-defined config (adr/0006). */
const configFor = (o: ScrubOverrides | undefined): ResolvedConfig => {
  const merged: LeshyConfig = {
    ...userConfig,
    disable: [...(userConfig.disable ?? []), ...(o?.disable ?? [])],
    enable: [...(userConfig.enable ?? []), ...(o?.enable ?? [])],
    countries: o?.countries ?? userConfig.countries,
    locale: o?.locale ?? userConfig.locale,
    salt: o?.salt ?? userConfig.salt,
    semantic: {
      ...userConfig.semantic,
      ...(o?.semanticEnabled === undefined ? {} : { enabled: o.semanticEnabled }),
    },
  };
  return resolveConfig(merged);
};

type ScrubRequest = Extract<WorkerRequest, { kind: "scrub" }>;

const post = (msg: WorkerResponse): void => self.postMessage(msg);
const progress = (id: number, stage: WorkerStage): void => post({ id, kind: "progress", stage });
const fail = (id: number, e: unknown): void => post({ id, kind: "error", message: message(e) });

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const runScrub = async (msg: ScrubRequest): Promise<void> => {
  const config = configFor(msg.overrides);
  let semantic: ((input: string) => Promise<Span[]>) | undefined;
  let warning: string | undefined;
  if (config.semantic.enabled) {
    if (!glinerReady) progress(msg.id, "loading-model");
    try {
      const gliner = await getGliner();
      semantic = (input) =>
        detectSemantic(input, config.detectors, gliner, config.semantic.threshold);
    } catch (e: unknown) {
      // Recall first: the rule-based layers still catch most of the fixture
      // set, so a failed download (offline first launch, dropped connection)
      // degrades detection instead of disabling it.
      warning = `Model unavailable, names and addresses were not scanned (${message(e)})`;
    }
  }
  progress(msg.id, "detecting");
  const result = await scrub(msg.input, { config, semantic });
  post({ id: msg.id, kind: "result", result, ...(warning === undefined ? {} : { warning }) });
};

// The ONNX session is not reentrant, so scrubs run one at a time. While one is
// running only the latest queued request survives — intermediate ones are
// dropped (the client has already superseded them).
let busy = false;
let queued: ScrubRequest | undefined;

const drain = async (): Promise<void> => {
  if (busy) return;
  busy = true;
  try {
    while (queued) {
      const job = queued;
      queued = undefined;
      await runScrub(job).catch((e: unknown) => fail(job.id, e));
    }
  } finally {
    busy = false;
  }
};

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.kind === "warmup") {
    // Warmup never runs inference, so it is safe outside the scrub queue.
    if (!glinerReady) progress(msg.id, "loading-model");
    getGliner().then(
      () => post({ id: msg.id, kind: "ready" }),
      (e: unknown) => fail(msg.id, e),
    );
    return;
  }
  queued = msg;
  void drain();
});
