import { readFileSync } from "node:fs";
import path from "node:path";
import * as ort from "onnxruntime-node";
import { Tokenizer } from "@huggingface/tokenizers";
import { Gliner } from "../../src/core/detect/semantic/gliner/runtime.ts";
import type { MakeTensor, OrtSession } from "../../src/core/detect/semantic/gliner/types.ts";
import { glinerTokenizer } from "../../src/core/detect/semantic/tokenizer.ts";
import { models } from "../../src/core/detect/semantic/models.ts";

/**
 * Node twin of the worker's model bootstrap: same vendored engine, same
 * tokenizer wiring, onnxruntime-node instead of onnxruntime-web. Model quality
 * is runtime-independent, so this validates the browser path's detection.
 */
export const loadGlinerNode = async (modelId: string): Promise<Gliner> => {
  const spec = models[modelId];
  if (!spec) throw new Error(`unknown model '${modelId}'`);
  const dir = path.join("public", "models", spec.id);

  const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(dir, file), "utf8")) as T;
  const tokenizer = new Tokenizer(read(spec.files.tokenizer), read(spec.files.tokenizerConfig));

  const session = await ort.InferenceSession.create(path.join(dir, spec.files.weights));
  const makeTensor: MakeTensor = (kind, data, dims) =>
    new ort.Tensor(kind, data as unknown as bigint[], dims);

  // ort's own value types are wider than the engine needs; the structural
  // subset in OrtSession is what both web and node sessions actually provide
  return new Gliner(
    session as unknown as OrtSession,
    makeTensor,
    glinerTokenizer(tokenizer, spec.tokenizerStyle),
    { maxWidth: spec.maxWidth, clsTokenId: spec.clsTokenId },
  );
};
