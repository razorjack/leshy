// `autocorrect` works on <textarea> in every browser Leshy runs in, but
// svelte/elements declares it for <input> only.
declare namespace svelteHTML {
  interface HTMLAttributes<T> {
    autocorrect?: "on" | "off";
  }
}
