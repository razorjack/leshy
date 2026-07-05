/**
 * Vendored GLiNER1 span-mode engine. Origin: @lmoe/gliner-onnx 0.1.0 (MIT),
 * itself a refactor of Knowledgator/GLiNER.js (Apache-2.0).
 *
 * Local changes (see docs/adr/0001-pii-detection.md):
 *  - ONNX session and Tensor factory are injected, so the identical code runs
 *    on onnxruntime-web (app worker) and onnxruntime-node (spike, tests)
 *  - Unicode-aware word splitter (upstream \w+ broke on "Marszałkowska")
 *  - configurable clsTokenId: mdeberta prepends CLS=1, mT5 prepends nothing
 *  - tokenizer.encode must return word ids WITHOUT special tokens
 */

export interface GlinerTokenizer {
  /** Ids for one word, no special tokens. */
  encode: (word: string) => number[];
  /** Appended after the input sequence: 2 for mdeberta [SEP], 1 for mT5 </s>. */
  sepTokenId: number;
}

export interface GlinerConfig {
  /** Max span width in words. All shipped models use 12. */
  maxWidth: number;
  /** Token prepended to the sequence; null for encoders without CLS (mT5). */
  clsTokenId: number | null;
}

/** Minimal structural view of an ort InferenceSession — web or node. */
export interface OrtSession {
  run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: ArrayLike<number> }>>;
}

export type TensorKind = "int64" | "bool";

/** Wraps `new ort.Tensor(...)` of whichever ort build is in use. */
export type MakeTensor = (kind: TensorKind, data: bigint[] | boolean[], dims: number[]) => unknown;

export interface GlinerEntity {
  text: string;
  start: number;
  end: number;
  label: string;
  score: number;
}

/** [text, startChar, endChar, label, score] */
export type RawSpan = [string, number, number, string, number];

export interface ProcessorBatch {
  inputsIds: number[][];
  attentionMasks: number[][];
  wordsMasks: number[][];
  textLengths: number[];
  spanIdxs: number[][][];
  spanMasks: boolean[][];
  idToClass: Record<number, string>;
  batchTokens: string[][];
  batchWordsStartIdx: number[][];
  batchWordsEndIdx: number[][];
}
