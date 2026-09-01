import * as ort from "onnxruntime-web";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url";
import mjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.jsep.mjs?url";
import { Tokenizer } from "@huggingface/tokenizers";
import userConfig from "../../leshy.config.ts";
import type { Span } from "../core/types.ts";
import type { ResolvedConfig } from "../core/config.ts";
import { resolveConfig } from "../core/config.ts";
import { scrub } from "../core/engine.ts";
import { detectSemantic } from "../core/detect/semantic/detect.ts";
import { models } from "../core/detect/semantic/models.ts";
import { Gliner } from "../core/detect/semantic/gliner/runtime.ts";
import { glinerTokenizer } from "../core/detect/semantic/tokenizer.ts";
import type { MakeTensor, OrtSession } from "../core/detect/semantic/gliner/types.ts";
import type { WorkerRequest, WorkerResponse, WorkerStage } from "./protocol.ts";

// wasm + mjs are bundled same-origin via ?url (CSP connect-src 'self'); the
// service worker precaches them. JSEP build → WebGPU with a wasm fallback.
ort.env.wasm.wasmPaths = { wasm: wasmUrl, mjs: mjsUrl };

const baseConfig = resolveConfig(userConfig);

// The model is heavy (~180 MB): load it once, lazily, and share the promise.
let glinerPromise: Promise<Gliner> | undefined;
let glinerReady = false;

const loadGliner = async (): Promise<Gliner> => {
  const model = models[baseConfig.semantic.model];
  if (!model) throw new Error(`unknown model '${baseConfig.semantic.model}'`);
  const modelDirectory = `/models/${model.id}`;
  const json = <T>(file: string): Promise<T> =>
    fetch(`${modelDirectory}/${file}`).then((response) => response.json() as Promise<T>);
  const [tokenizerData, tokenizerConfig, weights] = await Promise.all([
    json<ConstructorParameters<typeof Tokenizer>[0]>(model.files.tokenizer),
    json<ConstructorParameters<typeof Tokenizer>[1]>(model.files.tokenizerConfig),
    fetch(`${modelDirectory}/${model.files.weights}`).then((response) => response.arrayBuffer()),
  ]);
  const session = await ort.InferenceSession.create(weights, {
    executionProviders: ["webgpu", "wasm"],
  });
  const makeTensor: MakeTensor = (kind, data, dims) =>
    new ort.Tensor(kind, data as unknown as bigint[], dims);
  return new Gliner(
    session as unknown as OrtSession,
    makeTensor,
    glinerTokenizer(new Tokenizer(tokenizerData, tokenizerConfig), model.tokenizerStyle),
    { maxWidth: model.maxWidth, clsTokenId: model.clsTokenId },
  );
};

const getGliner = (): Promise<Gliner> =>
  (glinerPromise ??= loadGliner().then(
    (gliner) => {
      glinerReady = true;
      return gliner;
    },
    (error: unknown) => {
      // Forget the failure so the next scrub retries. Caching the rejected
      // promise would disable the model until the page reloads, even when the
      // cause was a cold cache or a dropped connection.
      glinerPromise = undefined;
      throw error;
    },
  ));

type ScrubRequest = Extract<WorkerRequest, { kind: "scrub" }>;

const post = (response: WorkerResponse): void => self.postMessage(response);
const progress = (id: number, stage: WorkerStage): void => post({ id, kind: "progress", stage });
const fail = (id: number, error: unknown): void =>
  post({ id, kind: "error", message: message(error) });

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

interface SemanticState {
  semantic?: (input: string) => Promise<Span[]>;
  warning?: string;
}

const prepareSemantic = async (
  config: ResolvedConfig,
  requestId: number,
): Promise<SemanticState> => {
  if (!config.semantic.enabled) return {};
  if (!glinerReady) progress(requestId, "loading-model");

  try {
    const gliner = await getGliner();
    return {
      semantic: (input) =>
        detectSemantic(input, config.detectors, gliner, config.semantic.threshold),
    };
  } catch (error: unknown) {
    // Recall first: the rule-based layers still catch most of the fixture
    // set, so a failed download (offline first launch, dropped connection)
    // degrades detection instead of disabling it.
    return {
      warning: `Model unavailable, names and addresses were not scanned (${message(error)})`,
    };
  }
};

const runScrub = async (request: ScrubRequest): Promise<void> => {
  const config = resolveConfig(userConfig, request.overrides);
  const semanticState = await prepareSemantic(config, request.id);

  progress(request.id, "detecting");
  const scrubResult = await scrub(request.input, { config, semantic: semanticState.semantic });
  if (semanticState.warning === undefined) {
    post({ id: request.id, kind: "result", result: scrubResult });
  } else {
    post({
      id: request.id,
      kind: "result",
      result: scrubResult,
      warning: semanticState.warning,
    });
  }
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
      const request = queued;
      queued = undefined;
      await runScrub(request).catch((error: unknown) => fail(request.id, error));
    }
  } finally {
    busy = false;
  }
};

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.kind === "warmup") {
    // Warmup never runs inference, so it is safe outside the scrub queue.
    if (!glinerReady) progress(request.id, "loading-model");
    getGliner().then(
      () => post({ id: request.id, kind: "ready" }),
      (error: unknown) => fail(request.id, error),
    );
    return;
  }
  queued = request;
  void drain();
});
