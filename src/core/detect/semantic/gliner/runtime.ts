import { SpanDecoder } from "./decoder.ts";
import { SpanProcessor } from "./processor.ts";
import type {
  GlinerConfig,
  GlinerEntity,
  GlinerTokenizer,
  MakeTensor,
  OrtSession,
  RawSpan,
} from "./types.ts";

const DEFAULT_THRESHOLD = 0.5;
const ONNX_OUTPUT_LOGITS = "logits";

export class Gliner {
  private readonly session: OrtSession;
  private readonly makeTensor: MakeTensor;
  private readonly processor: SpanProcessor;
  private readonly decoder: SpanDecoder;

  constructor(
    session: OrtSession,
    makeTensor: MakeTensor,
    tokenizer: GlinerTokenizer,
    config: GlinerConfig,
  ) {
    this.session = session;
    this.makeTensor = makeTensor;
    this.processor = new SpanProcessor(config, tokenizer);
    this.decoder = new SpanDecoder(config);
  }

  async extractEntities(
    text: string,
    labels: readonly string[],
    options: { threshold?: number } = {},
  ): Promise<GlinerEntity[]> {
    const threshold = options.threshold ?? DEFAULT_THRESHOLD;
    const rawSpans = await this.runInference([text], [...labels], threshold);
    return (rawSpans[0] ?? []).map((span: RawSpan) => ({
      text: span[0],
      start: span[1],
      end: span[2],
      label: span[3],
      score: span[4],
    }));
  }

  private async runInference(
    texts: string[],
    entities: string[],
    threshold: number,
  ): Promise<RawSpan[][]> {
    const processorBatch = this.processor.prepareBatch(texts, entities);
    const tensorFeeds = this.buildTensors(processorBatch);
    const modelOutputs = await this.session.run(tensorFeeds);
    const logits = modelOutputs[ONNX_OUTPUT_LOGITS];
    if (!logits) throw new Error(`model output missing '${ONNX_OUTPUT_LOGITS}'`);
    const batchSize = processorBatch.batchTokens.length;
    const inputLength = Math.max(...processorBatch.textLengths);
    return this.decoder.decode({
      batchSize,
      inputLength,
      entityCount: entities.length,
      texts,
      charStartOffsets: processorBatch.batchWordsStartIdx,
      charEndOffsets: processorBatch.batchWordsEndIdx,
      idToClass: processorBatch.idToClass,
      modelOutput: logits.data,
      threshold,
      flatNer: true,
    });
  }

  private buildTensors(
    processorBatch: ReturnType<SpanProcessor["prepareBatch"]>,
  ): Record<string, unknown> {
    const batchSize = processorBatch.inputsIds.length;
    const tokenCount = processorBatch.inputsIds[0]?.length ?? 0;
    const spanCount = processorBatch.spanIdxs[0]?.length ?? 0;
    return {
      input_ids: this.makeTensor("int64", processorBatch.inputsIds.flat().map(BigInt), [
        batchSize,
        tokenCount,
      ]),
      attention_mask: this.makeTensor("int64", processorBatch.attentionMasks.flat().map(BigInt), [
        batchSize,
        tokenCount,
      ]),
      words_mask: this.makeTensor("int64", processorBatch.wordsMasks.flat().map(BigInt), [
        batchSize,
        tokenCount,
      ]),
      text_lengths: this.makeTensor("int64", processorBatch.textLengths.map(BigInt), [
        batchSize,
        1,
      ]),
      span_idx: this.makeTensor("int64", processorBatch.spanIdxs.flat(2).map(BigInt), [
        batchSize,
        spanCount,
        2,
      ]),
      span_mask: this.makeTensor("bool", processorBatch.spanMasks.flat(), [batchSize, spanCount]),
    };
  }
}
