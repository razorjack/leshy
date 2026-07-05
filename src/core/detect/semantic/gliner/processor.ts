import type { GlinerConfig, GlinerTokenizer, ProcessorBatch } from "./types.ts";

const ENTITY_MARKER = "<<ENT>>";
const SEPARATOR_MARKER = "<<SEP>>";
const PAD_VALUE = 0;

// Module-level (not a class field): Node's type stripping mis-parses a regex
// field initializer followed by a generator method.
const WORD = /[\p{L}\p{N}]+(?:[-_][\p{L}\p{N}]+)*|\S/gu;

export class WordSplitter {
  *split(text: string): Generator<[string, number, number]> {
    WORD.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WORD.exec(text)) !== null) {
      yield [match[0], match.index, WORD.lastIndex];
    }
  }
}

export class SpanProcessor {
  private readonly maxWidth: number;
  private readonly clsTokenId: number | null;
  private readonly tokenizer: GlinerTokenizer;
  private readonly splitter = new WordSplitter();

  constructor(config: GlinerConfig, tokenizer: GlinerTokenizer) {
    this.maxWidth = config.maxWidth;
    this.clsTokenId = config.clsTokenId;
    this.tokenizer = tokenizer;
  }

  prepareBatch(texts: string[], entities: string[]): ProcessorBatch {
    const [batchTokens, batchWordsStartIdx, batchWordsEndIdx] = this.tokenizeTexts(texts);
    const idToClass: Record<number, string> = {};
    entities.forEach((entity, i) => {
      idToClass[i + 1] = entity;
    });
    const [inputTokens, textLengths, promptLengths] = this.buildInputSequences(
      batchTokens,
      entities,
    );
    const [inputsIds, attentionMasks, wordsMasks] = this.encodeInputs(inputTokens, promptLengths);
    const { spanIdxs, spanMasks } = this.buildSpans(batchTokens);
    return {
      inputsIds: padArrays(inputsIds, PAD_VALUE),
      attentionMasks: padArrays(attentionMasks, PAD_VALUE),
      wordsMasks: padArrays(wordsMasks, PAD_VALUE),
      textLengths,
      spanIdxs: padSpanArrays(spanIdxs),
      spanMasks: padArrays(spanMasks, false),
      idToClass,
      batchTokens,
      batchWordsStartIdx,
      batchWordsEndIdx,
    };
  }

  private tokenizeTexts(texts: string[]): [string[][], number[][], number[][]] {
    const batchTokens: string[][] = [];
    const batchStarts: number[][] = [];
    const batchEnds: number[][] = [];
    for (const text of texts) {
      const tokens: string[] = [];
      const starts: number[] = [];
      const ends: number[] = [];
      for (const [token, start, end] of this.splitter.split(text)) {
        tokens.push(token);
        starts.push(start);
        ends.push(end);
      }
      batchTokens.push(tokens);
      batchStarts.push(starts);
      batchEnds.push(ends);
    }
    return [batchTokens, batchStarts, batchEnds];
  }

  private buildInputSequences(
    batchTokens: string[][],
    entities: string[],
  ): [string[][], number[], number[]] {
    const inputTexts: string[][] = [];
    const promptLengths: number[] = [];
    const textLengths: number[] = [];
    for (const tokens of batchTokens) {
      textLengths.push(tokens.length);
      const inputText: string[] = [];
      for (const entity of entities) {
        inputText.push(ENTITY_MARKER, entity);
      }
      inputText.push(SEPARATOR_MARKER);
      promptLengths.push(inputText.length);
      inputText.push(...tokens);
      inputTexts.push(inputText);
    }
    return [inputTexts, textLengths, promptLengths];
  }

  private encodeInputs(
    inputTexts: string[][],
    promptLengths: number[],
  ): [number[][], number[][], number[][]] {
    const inputsIds: number[][] = [];
    const attentionMasks: number[][] = [];
    const wordsMasks: number[][] = [];
    for (let batchIdx = 0; batchIdx < inputTexts.length; batchIdx++) {
      const promptLength = promptLengths[batchIdx] ?? 0;
      const tokens = inputTexts[batchIdx] ?? [];
      const inputIds = this.clsTokenId === null ? [] : [this.clsTokenId];
      const attentionMask = this.clsTokenId === null ? [] : [1];
      const wordsMask = this.clsTokenId === null ? [] : [PAD_VALUE];
      let wordCounter = 1;
      for (let wordIdx = 0; wordIdx < tokens.length; wordIdx++) {
        const wordTokenIds = this.tokenizer.encode(tokens[wordIdx] ?? "");
        for (let tokenIdx = 0; tokenIdx < wordTokenIds.length; tokenIdx++) {
          inputIds.push(wordTokenIds[tokenIdx] ?? 0);
          attentionMask.push(1);
          if (wordIdx < promptLength) {
            wordsMask.push(PAD_VALUE);
          } else if (tokenIdx === 0) {
            wordsMask.push(wordCounter++);
          } else {
            wordsMask.push(PAD_VALUE);
          }
        }
      }
      inputIds.push(this.tokenizer.sepTokenId);
      attentionMask.push(1);
      wordsMask.push(PAD_VALUE);
      inputsIds.push(inputIds);
      attentionMasks.push(attentionMask);
      wordsMasks.push(wordsMask);
    }
    return [inputsIds, attentionMasks, wordsMasks];
  }

  private buildSpans(batchTokens: string[][]): {
    spanIdxs: number[][][];
    spanMasks: boolean[][];
  } {
    const spanIdxs: number[][][] = [];
    const spanMasks: boolean[][] = [];
    for (const tokens of batchTokens) {
      const textLength = tokens.length;
      const spanIdx: number[][] = [];
      const spanMask: boolean[] = [];
      for (let startIdx = 0; startIdx < textLength; startIdx++) {
        for (let width = 0; width < this.maxWidth; width++) {
          const endIdx = Math.min(startIdx + width, textLength - 1);
          spanIdx.push([startIdx, endIdx]);
          spanMask.push(endIdx < textLength);
        }
      }
      spanIdxs.push(spanIdx);
      spanMasks.push(spanMask);
    }
    return { spanIdxs, spanMasks };
  }
}

const padArrays = <T>(arrays: T[][], pad: T): T[][] => {
  const maxLength = Math.max(...arrays.map((arr) => arr.length));
  return arrays.map((arr) => [
    ...arr,
    ...Array.from({ length: maxLength - arr.length }, () => pad),
  ]);
};

const padSpanArrays = (arrays: number[][][]): number[][][] => {
  const maxLength = Math.max(...arrays.map((arr) => arr.length));
  return arrays.map((arr) => [
    ...arr,
    ...Array.from({ length: maxLength - arr.length }, () => [0, 0]),
  ]);
};
