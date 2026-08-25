import { session } from "../state/session.svelte.ts";
import { clipboard } from "../state/clipboard.svelte.ts";

/**
 * Mod+Shift+C copies the scrubbed text; Mod+Shift+X copies it and clears both
 * panes, the "done with this one" gesture. Plain Mod+C stays the browser's.
 */
export const onShortcut = (e: KeyboardEvent): void => {
  const mod = navigator.platform.startsWith("Mac") ? e.metaKey : e.ctrlKey;
  if (!mod || !e.shiftKey || session.output === "") return;
  const key = e.key.toUpperCase();
  if (key !== "C" && key !== "X") return;
  e.preventDefault();
  void clipboard.copy(session.output).then((ok) => {
    if (ok && key === "X") session.setInput("");
  });
};
