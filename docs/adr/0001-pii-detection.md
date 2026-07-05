# ADR-0001: PII detection — GLiNER zero-shot NER in the browser, three-layer pipeline

Status: accepted (validated by spike, 2026-07-05)

## Decision

Detection is a three-layer pipeline, resolved by precedence (ADR-0004):

1. **Structural detectors** — regex + validator (checksums) for machine-checkable types:
   email, phone, IPv4/6, MAC, credit card (Luhn), IBAN (mod-97), JWT, API-key shapes, UUID,
   SSN, PESEL, and a Polish street-address pattern (`ul./al./os./pl. …`).
2. **Key-context detectors** — a single format-agnostic key-value scanner over the raw text;
   values under PII-suggesting keys (`first_name`, `email`, `pesel`…) become spans without
   any model involvement.
3. **Semantic model** — **`knowledgator/gliner-x-small`**, quantized ONNX (**172.7 MB**,
   Apache-2.0, mT5-small encoder, GLiNER span-mode `markerV0`), run via **onnxruntime-web**
   (WASM, WebGPU optional) in a Web Worker, with **zero-shot labels** owned by semantic
   detectors (`person`, `organization`, `address`, `location`…). Default threshold **0.35**
   (recall-first; the resolve stage absorbs the noise this admits).

The inference engine is **vendored** (~450 lines TS in `src/core/detect/semantic/gliner/`),
adapted from `@lmoe/gliner-onnx` 0.1.0 (MIT), itself a refactor of Knowledgator/GLiNER.js
(Apache-2.0). Tokenization uses **`@huggingface/tokenizers`** (pure JS, no ort dependency),
verified token-for-token against transformers.js.

## Why zero-shot GLiNER

- **Non-prose contexts.** Prose-trained BIO models collapse on `"full_name": "Jan Kowalski"`.
  GLiNER matches label embeddings against enumerated spans and demonstrably handles
  key-value contexts (spike: catches `Bob Smith` under a neutral `assignee` key).
- **Polish + English.** gliner-x-small lists Polish among its training languages. It was the
  only candidate ≤300 MB with explicit Polish and an open license.
- **`address` as a first-class label** — regex cannot recall free-form street addresses; the
  fixed-label alternatives (PER/ORG/LOC) have no address concept at all.
- **Extensible by construction**: a new semantic entity type is a new label string in a
  detector declaration, not a new model.

## Spike evidence (scripts/spike, kept as a smoke test)

Corpus: the brief's five samples (gold: 15 catches, 5 preserves) plus three hard samples
with no key hints (7 catches, 1 preserve), incl. Polish freeform log/exception text.

| configuration                                     | catches (full)                       | partial | miss  | preserve violations |
| ------------------------------------------------- | ------------------------------------ | ------- | ----- | ------------------- |
| structural + key-context, no model                | 15/15 (easy set)                     | 0       | 0     | 0                   |
| gliner_multi_pii-v1 int8 @0.3, model only         | hard set: 2/7                        | 0       | 5     | 0                   |
| gliner_multi_pii-v1 int8 @0.1, model only         | hard set: 3/7                        | 1       | 3     | 0                   |
| gliner-x-small q8 @0.3, model only                | hard set: 7/7 covered (2 fragmented) | –       | 0     | 4 (raw)             |
| **full pipeline, gliner-x-small @0.35 + resolve** | **22/22**                            | **0**   | **0** | **0**               |

- gliner_multi_pii-v1 (mdeberta, PII-tuned, Polish only via transfer) missed Polish names,
  orgs and addresses in freeform text at any usable threshold. gliner-x-small caught them
  all; its extra noise (`42` as email, keys as values, timestamps) is deterministic garbage
  the resolve stage removes by rule, not by luck (ADR-0004).
- Latency: 9–24 ms per sample (Node, M-series CPU, quantized). Model load <1 s from disk.
- Two upstream engine bugs found and fixed in the vendored copy:
  (a) ASCII-only word splitter fragmented `Marszałkowska` at `ł` — now `\p{L}\p{N}` aware;
  (b) hardcoded CLS token id 1 — mT5 has no CLS; now configurable per model spec.

## Alternatives rejected

- **`@lmoe/gliner-onnx` / `gliner` npm as dependencies** — the former is Node-hardwired and
  experimental; the latter is stale (last publish 2025-03, ort-web 1.19.2, open browser
  breakage issues) and carries the splitter bug. Both are thin; vendoring gives us the
  browser/node session injection and the fixes. Attribution retained in file headers.
- **`onnx-community/gliner_multi_pii-v1`** (349 MB int8) — best label fidelity, but the spike
  falsified its Polish freeform recall (table above). Kept as a config-swap alternative in
  `src/core/detect/semantic/models.ts` (`npm run models:fetch -- gliner-multi-pii`).
- **transformers.js + `Xenova/bert-base-multilingual-cased-ner-hrl`** (q8, 178 MB, AFL-3.0) —
  best-maintained runtime, but PER/ORG/LOC only (no address), Polish not in its ten training
  languages. This is the **fallback floor**, not a peer.
- **piiranha-v1** (CC-BY-NC-ND) and **wikineural** (CC-BY-NC-SA) — license-blocked for a
  shippable product despite good label sets.
- **GLiNER2 / fastino models** — Python-only tooling, no Polish in the multilingual model,
  larger ONNX; re-evaluate in a year.
- **wink-nlp / compromise** — English lexicons; no path to `ul. Piękna 12/4`.
- **Microsoft Presidio** — no JS/WASM runtime exists; server-only, violates invariant #1.

## Fallback plan

1. Same engine, swap model to `gliner-multi-pii` (one `models.ts`/config change) — if
   gliner-x-small underperforms on real-world English PII.
2. Same pipeline, semantic layer replaced by transformers.js token-classification
   (mBERT-HRL) — if the GLiNER path breaks entirely. Structural + key-context layers are
   unaffected; Polish freeform recall degrades to the structural nets, which the spike
   shows still catch `ul.`-style addresses and all keyed values.
3. Model off — the pipeline runs structural + key-context only (already 15/15 on keyed
   samples); the UI must surface "model disabled" honestly.

## Known false-negative risks (document in UI copy)

- Names/addresses in freeform text scoring below 0.35 — mitigated by the threshold dial
  and over-scrub-friendly resolve; never claim complete coverage: the user reviews output.
- Obfuscated structured values (`jan(at)gmail`) — structural regex misses; semantic `email`
  claims without structural corroboration are dropped by design (they were 90% noise).
- Non-Polish/English languages: untested; mT5 transfer may help but is unverified.
- Inputs longer than the model's 384-token window need chunking (implementation-plan
  step 8) — until then the worker must chunk or the tail of a long paste is unscanned.
