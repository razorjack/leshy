import { session } from "../state/session.svelte.ts";
import { clipboard } from "../state/clipboard.svelte.ts";

/**
 * Mod+Shift+C copies the scrubbed text; Mod+Shift+X copies it and clears both
 * panes, the "done with this one" gesture. Plain Mod+C stays the browser's.
 */
export const onShortcut = (event: KeyboardEvent): void => {
  const modifierPressed = navigator.platform.startsWith("Mac") ? event.metaKey : event.ctrlKey;
  if (!modifierPressed || !event.shiftKey || session.output === "") return;
  const key = event.key.toUpperCase();
  if (key !== "C" && key !== "X") return;
  event.preventDefault();
  void clipboard.copy(session.output).then((copied) => {
    if (copied && key === "X") session.setInput("");
  });
};
