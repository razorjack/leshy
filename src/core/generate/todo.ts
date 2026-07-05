import type { Generate } from "../types.ts";

/** Stub generator. Every use is a task in docs/implementation-plan.md. */
export const todoGenerate = (id: string): Generate => {
  return () => {
    throw new Error(`generator not implemented: ${id} — see docs/implementation-plan.md`);
  };
};
