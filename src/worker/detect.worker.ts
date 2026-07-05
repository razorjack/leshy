import type { WorkerRequest, WorkerResponse } from "./protocol.ts";

/**
 * TODO(opus): docs/implementation-plan.md steps 6–7. Contract:
 *
 * 1. Statically import leshy.config.ts + resolveConfig (custom detectors are
 *    code and live in this bundle — never postMessaged).
 * 2. On 'warmup' (and lazily on first 'scrub'):
 *    - init onnxruntime-web: `import * as ort from 'onnxruntime-web'`;
 *      wasmPaths via `?url` imports so everything is same-origin and the
 *      service worker can cache it; executionProviders ['webgpu', 'wasm']
 *      with wasm as the guaranteed fallback.
 *    - fetch(`/models/${spec.id}/${spec.files.weights}`) → ArrayBuffer →
 *      InferenceSession.create (the SW's CacheFirst route makes this offline).
 *    - build Tokenizer from the model's tokenizer.json via
 *      @huggingface/tokenizers, wrap with glinerTokenizer(spec.tokenizerStyle),
 *      construct Gliner(session, makeTensor, tokenizer, spec).
 *    - reply { kind: 'ready' }.
 * 3. On 'scrub': apply overrides over resolveConfig(config), emit 'progress'
 *    stages, run engine.scrub, reply 'result' (or 'error' with a message —
 *    never let a rejection escape the handler).
 */
self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  const reply: WorkerResponse = {
    id: msg.id,
    kind: "error",
    message: "worker not implemented — docs/implementation-plan.md step 6",
  };
  self.postMessage(reply);
});
