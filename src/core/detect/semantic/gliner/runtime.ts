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
    const raw = await this.runInference([text], [...labels], threshold);
    return (raw[0] ?? []).map((span: RawSpan) => ({
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
    const batch = this.processor.prepareBatch(texts, entities);
    const feeds = this.buildTensors(batch);
    const results = await this.session.run(feeds);
    const logits = results[ONNX_OUTPUT_LOGITS];
    if (!logits) throw new Error(`model output missing '${ONNX_OUTPUT_LOGITS}'`);
    const batchSize = batch.batchTokens.length;
    const inputLength = Math.max(...batch.textLengths);
    return this.decoder.decode(
      batchSize,
      inputLength,
      entities.length,
      texts,
      batch.batchWordsStartIdx,
      batch.batchWordsEndIdx,
      batch.idToClass,
      logits.data,
      { threshold, flatNer: true },
    );
  }

  private buildTensors(batch: ReturnType<SpanProcessor["prepareBatch"]>): Record<string, unknown> {
    const batchSize = batch.inputsIds.length;
    const tokenCount = batch.inputsIds[0]?.length ?? 0;
    const spanCount = batch.spanIdxs[0]?.length ?? 0;
    return {
      input_ids: this.makeTensor("int64", batch.inputsIds.flat().map(BigInt), [
        batchSize,
        tokenCount,
      ]),
      attention_mask: this.makeTensor("int64", batch.attentionMasks.flat().map(BigInt), [
        batchSize,
        tokenCount,
      ]),
      words_mask: this.makeTensor("int64", batch.wordsMasks.flat().map(BigInt), [
        batchSize,
        tokenCount,
      ]),
      text_lengths: this.makeTensor("int64", batch.textLengths.map(BigInt), [batchSize, 1]),
      span_idx: this.makeTensor("int64", batch.spanIdxs.flat(2).map(BigInt), [
        batchSize,
        spanCount,
        2,
      ]),
      span_mask: this.makeTensor("bool", batch.spanMasks.flat(), [batchSize, spanCount]),
    };
  }
}
