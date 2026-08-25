<script lang="ts">
  import { session } from '../../state/session.svelte.ts'

  // A paste scrubs immediately; typing is debounced. `onpaste` fires before the
  // value updates, so flag it and let the following `oninput` run immediately.
  let pasted = false
</script>

<section class="flex flex-col bg-background">
  <h2 class="px-6 pt-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
    Paste anything
  </h2>
  <!--
    Nothing but Leshy may read what is pasted here (invariant 1). CSP does not
    cover the browser itself: Chrome's enhanced spell check uploads the text of
    a spellchecked field to Google, and Grammarly-style extensions read it out
    of the DOM. The Electron shell disables spellcheck on the whole session
    (electron/main.ts); the PWA has to say so per field.
  -->
  <textarea
    class="flex-1 resize-none bg-transparent p-6 font-mono text-sm outline-none"
    placeholder="JSON, Ruby inspect, logs — anything with secrets in it."
    spellcheck="false"
    autocorrect="off"
    autocapitalize="off"
    autocomplete="off"
    data-gramm="false"
    data-gramm_editor="false"
    data-enable-grammarly="false"
    value={session.input}
    onpaste={() => (pasted = true)}
    oninput={(e) => {
      session.setInput(e.currentTarget.value, pasted)
      pasted = false
    }}
  ></textarea>
</section>
