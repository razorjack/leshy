<script lang="ts">
  import { session } from '../../state/session.svelte.ts'
  import { splitInput } from '../segments.ts'

  // A paste scrubs immediately; typing is debounced. `onpaste` fires before the
  // value updates, so flag it and let the following `oninput` run immediately.
  let pasted = false

  let area = $state<HTMLTextAreaElement>()
  let mirror = $state<HTMLDivElement>()

  // Source ranges index the input they were computed from, so while an edit is
  // in flight the mirror shows the new text unmarked instead of smearing the
  // previous run's highlights over it.
  const marks = $derived(session.input === session.scrubbedFrom ? session.replacements : [])
  const segments = $derived(splitInput(session.input, marks))

  const sync = (): void => {
    if (!mirror || !area) return
    mirror.scrollTop = area.scrollTop
    mirror.scrollLeft = area.scrollLeft
  }

  // A mirror whose text shrinks past its scroll offset has that offset clamped,
  // and it would stay clamped once the text grows back.
  $effect(() => {
    void segments
    sync()
  })
</script>

<section class="flex min-h-0 flex-col bg-background">
  <h2 class="px-6 pt-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
    Paste anything
  </h2>
  <div class="relative flex min-h-0 flex-1 flex-col">
    <!--
      The mirror: the same text in the same box one layer down, its own glyphs
      invisible, carrying the highlights a textarea cannot hold. Everything that
      moves a line break has to match the textarea exactly — font, padding, wrap
      rules, and the width a scrollbar takes away, which is why both scroll and
      the mirror's own scrollbar sits hidden behind the textarea's. The trailing
      newline matches the empty last line a textarea keeps for the caret.
    -->
    <!-- prettier-ignore -->
    <div
      bind:this={mirror}
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 overflow-x-hidden overflow-y-scroll whitespace-pre-wrap break-words p-6 font-mono text-sm text-transparent"
      >{#each segments as seg}{#if seg.kind === 'text'}{seg.text}{:else}<mark
            class="box-decoration-clone rounded-xs bg-mark text-transparent underline decoration-mark-border decoration-dotted underline-offset-2"
            >{seg.text}</mark
          >{/if}{/each}{'\n'}</div>
    <!--
      Nothing but Leshy may read what is pasted here (invariant 1). CSP does not
      cover the browser itself: Chrome's enhanced spell check uploads the text of
      a spellchecked field to Google, and Grammarly-style extensions read it out
      of the DOM. The Electron shell disables spellcheck on the whole session
      (electron/main.ts); the PWA has to say so per field.
    -->
    <textarea
      bind:this={area}
      class="relative flex-1 resize-none overflow-y-scroll whitespace-pre-wrap break-words bg-transparent p-6 font-mono text-sm outline-none"
      placeholder="JSON, Ruby inspect, logs — anything with secrets in it."
      spellcheck="false"
      autocapitalize="off"
      autocorrect="off"
      autocomplete="off"
      data-gramm="false"
      data-gramm_editor="false"
      data-enable-grammarly="false"
      value={session.input}
      onscroll={sync}
      onpaste={() => (pasted = true)}
      oninput={(e) => {
        session.setInput(e.currentTarget.value, pasted)
        pasted = false
      }}
    ></textarea>
  </div>
</section>
