import type { TokenizerStyle } from "./tokenizer.ts";

export interface ModelSpec {
  id: string;
  /** Filenames under /models/<id>/, fetched by scripts/fetch-model.ts. */
  files: { weights: string; tokenizer: string; tokenizerConfig: string };
  tokenizerStyle: TokenizerStyle;
  /** Prepended sequence token; null for encoders without CLS (mT5). */
  clsTokenId: number | null;
  maxWidth: number;
  approxSizeMB: number;
  /** Pinned HuggingFace source. Weights are self-hosted, never fetched from HF at runtime. */
  source: { repo: string; revision: string; paths: string[] };
}

/**
 * Primary and alternative are both GLiNER span-mode models — swapping is a
 * config change, not a refactor. Benchmarked in scripts/spike; decision and
 * numbers in docs/adr/0001-pii-detection.md.
 */
export const models: Record<string, ModelSpec> = {
  "gliner-x-small": {
    id: "gliner-x-small",
    files: {
      weights: "model_quantized.onnx",
      tokenizer: "tokenizer.json",
      tokenizerConfig: "tokenizer_config.json",
    },
    tokenizerStyle: "mt5",
    clsTokenId: null,
    maxWidth: 12,
    approxSizeMB: 173,
    source: {
      repo: "knowledgator/gliner-x-small",
      revision: "main",
      paths: ["onnx/model_quantized.onnx", "tokenizer.json", "tokenizer_config.json"],
    },
  },
  "gliner-multi-pii": {
    id: "gliner-multi-pii",
    files: {
      weights: "model_quantized.onnx",
      tokenizer: "tokenizer.json",
      tokenizerConfig: "tokenizer_config.json",
    },
    tokenizerStyle: "mdeberta",
    clsTokenId: 1,
    maxWidth: 12,
    approxSizeMB: 349,
    source: {
      repo: "onnx-community/gliner_multi_pii-v1",
      revision: "main",
      paths: ["onnx/model_quantized.onnx", "tokenizer.json", "tokenizer_config.json"],
    },
  },
};

export const DEFAULT_MODEL = "gliner-x-small";
