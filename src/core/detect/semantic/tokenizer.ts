import type { GlinerTokenizer } from "./gliner/types.ts";

export type TokenizerStyle = "mdeberta" | "mt5";

interface HfTokenizerLike {
  encode: (
    text: string,
    options?: { add_special_tokens?: boolean },
  ) => { ids: ArrayLike<number | bigint> };
}

/**
 * Adapts a @huggingface/tokenizers Tokenizer to the vendored GLiNER engine.
 * mdeberta wraps every encode in [CLS]…[SEP] (strip both); mT5 appends nothing
 * when special tokens are off. Verified against transformers.js in the spike.
 */
export const glinerTokenizer = (
  tokenizer: HfTokenizerLike,
  style: TokenizerStyle,
): GlinerTokenizer => {
  const tokenIds = (text: string, addSpecialTokens: boolean): number[] =>
    Array.from(tokenizer.encode(text, { add_special_tokens: addSpecialTokens }).ids, Number);

  if (style === "mdeberta") {
    return { encode: (word) => tokenIds(word, true).slice(1, -1), sepTokenId: 2 };
  }
  return { encode: (word) => tokenIds(word, false), sepTokenId: 1 };
};
