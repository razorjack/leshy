import type { GlinerConfig, RawSpan } from "./types.ts";

const DEFAULT_THRESHOLD = 0.5;
const ENTITY_ID_OFFSET = 1;

const sigmoid = (x: number): number => {
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const expX = Math.exp(x);
  return expX / (1 + expX);
};

const spansOverlap = (
  start1: number,
  end1: number,
  start2: number,
  end2: number,
  allowNested: boolean,
): boolean => {
  if (start1 === start2 && end1 === end2) return true;
  if (start1 > end2 || start2 > end1) return false;
  if (allowNested) {
    const isNested = (start1 <= start2 && end1 >= end2) || (start2 <= start1 && end2 >= end1);
    if (isNested) return false;
  }
  return true;
};

const greedySearch = (spans: RawSpan[], flatNer: boolean): RawSpan[] => {
  const sorted = spans.slice().sort((left, right) => right[4] - left[4]);
  const selected: RawSpan[] = [];
  for (const span of sorted) {
    const hasOverlap = selected.some((existing) =>
      spansOverlap(span[1], span[2], existing[1], existing[2], !flatNer),
    );
    if (!hasOverlap) selected.push(span);
  }
  return selected.sort((left, right) => left[1] - right[1]);
};

interface DecodeOptions {
  batchSize: number;
  inputLength: number;
  entityCount: number;
  texts: string[];
  charStartOffsets: number[][];
  charEndOffsets: number[][];
  idToClass: Record<number, string>;
  modelOutput: ArrayLike<number>;
  threshold?: number;
  flatNer?: boolean;
}

/** Decoder for span-enumeration models. Logits shape: [batch, words, maxWidth, entities]. */
export class SpanDecoder {
  private readonly maxWidth: number;

  constructor(config: GlinerConfig) {
    this.maxWidth = config.maxWidth;
  }

  decode({
    batchSize,
    inputLength,
    entityCount,
    texts,
    charStartOffsets,
    charEndOffsets,
    idToClass,
    modelOutput,
    threshold = DEFAULT_THRESHOLD,
    flatNer = true,
  }: DecodeOptions): RawSpan[][] {
    const spans: RawSpan[][] = Array.from({ length: batchSize }, () => []);
    const batchStride = inputLength * this.maxWidth * entityCount;
    const tokenStride = this.maxWidth * entityCount;
    const widthStride = entityCount;

    for (let outputIndex = 0; outputIndex < modelOutput.length; outputIndex++) {
      const probability = sigmoid(modelOutput[outputIndex] ?? Number.NEGATIVE_INFINITY);
      if (probability < threshold) continue;

      const batchIndex = Math.floor(outputIndex / batchStride);
      const startToken = Math.floor(outputIndex / tokenStride) % inputLength;
      const endToken = startToken + (Math.floor(outputIndex / widthStride) % this.maxWidth);
      const entityIndex = outputIndex % entityCount;
      const starts = charStartOffsets[batchIndex];
      const ends = charEndOffsets[batchIndex];
      if (!starts || !ends || startToken >= starts.length || endToken >= ends.length) continue;
      const text = texts[batchIndex] ?? "";
      const startChar = starts[startToken] ?? 0;
      const endChar = ends[endToken] ?? 0;
      spans[batchIndex]?.push([
        text.slice(startChar, endChar),
        startChar,
        endChar,
        idToClass[entityIndex + ENTITY_ID_OFFSET] ?? "",
        probability,
      ]);
    }
    return spans.map((batchSpans) => greedySearch(batchSpans, flatNer));
  }
}
