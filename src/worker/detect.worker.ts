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

const getGliner = (): Promise<Gliner> => (glinerPromise ??= loadGliner());

/** Fold serialisable UI overrides over the code-defined config (adr/0006). */
const configFor = (o: ScrubOverrides | undefined): ResolvedConfig => {
  const merged: LeshyConfig = {
    ...userConfig,
    disable: [...(userConfig.disable ?? []), ...(o?.disable ?? [])],
    enable: [...(userConfig.enable ?? []), ...(o?.enable ?? [])],
    salt: o?.salt ?? userConfig.salt,
    semantic: {
      ...userConfig.semantic,
      ...(o?.semanticEnabled === undefined ? {} : { enabled: o.semanticEnabled }),
    },
  };
  return resolveConfig(merged);
};

const post = (msg: WorkerResponse): void => self.postMessage(msg);
const progress = (id: number, stage: WorkerStage): void => post({ id, kind: "progress", stage });

const handle = async (msg: WorkerRequest): Promise<WorkerResponse> => {
  if (msg.kind === "warmup") {
    progress(msg.id, "loading-model");
    await getGliner();
    return { id: msg.id, kind: "ready" };
  }

  const config = configFor(msg.overrides);
  let semantic: ((input: string) => Promise<Span[]>) | undefined;
  if (config.semantic.enabled) {
    if (!glinerPromise) progress(msg.id, "loading-model");
    const gliner = await getGliner();
    semantic = (input) =>
      detectSemantic(input, config.detectors, gliner, config.semantic.threshold);
  }
  progress(msg.id, "detecting");
  const result = await scrub(msg.input, { config, semantic });
  return { id: msg.id, kind: "result", result };
};

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const { id } = event.data;
  // Errors are always replied, never thrown out of the handler.
  void handle(event.data).then(post, (e: unknown) => {
    post({ id, kind: "error", message: e instanceof Error ? e.message : String(e) });
  });
});
