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
export const glinerTokenizer = (tok: HfTokenizerLike, style: TokenizerStyle): GlinerTokenizer => {
  const ids = (text: string, addSpecial: boolean): number[] =>
    Array.from(tok.encode(text, { add_special_tokens: addSpecial }).ids, Number);
  return style === "mdeberta"
    ? { encode: (w) => ids(w, true).slice(1, -1), sepTokenId: 2 }
    : { encode: (w) => ids(w, false), sepTokenId: 1 };
};
