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
  const model = models[modelId];
  if (!model) throw new Error(`unknown model '${modelId}'`);
  const modelDirectory = path.join("public", "models", model.id);

  const readJson = <T>(file: string): T =>
    JSON.parse(readFileSync(path.join(modelDirectory, file), "utf8")) as T;
  const tokenizer = new Tokenizer(
    readJson(model.files.tokenizer),
    readJson(model.files.tokenizerConfig),
  );

  const session = await ort.InferenceSession.create(path.join(modelDirectory, model.files.weights));
  const makeTensor: MakeTensor = (kind, data, dims) =>
    new ort.Tensor(kind, data as unknown as bigint[], dims);

  // ort's own value types are wider than the engine needs; the structural
  // subset in OrtSession is what both web and node sessions actually provide
  return new Gliner(
    session as unknown as OrtSession,
    makeTensor,
    glinerTokenizer(tokenizer, model.tokenizerStyle),
    { maxWidth: model.maxWidth, clsTokenId: model.clsTokenId },
  );
};
