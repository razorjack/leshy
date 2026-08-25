<script lang="ts">
  import { session } from '../../state/session.svelte.ts'
  import type { Replacement } from '../../core/types.ts'
  import { splitOutput } from '../segments.ts'
  import TokenMark from './TokenMark.svelte'
  import ReplacementsTable from './ReplacementsTable.svelte'
  import { markClass } from '../marks.ts'
  import { download, scrubbedName } from '../files.ts'
  import { Button } from './ui/button/index.ts'
  import * as Tooltip from './ui/tooltip/index.ts'

  // A fake becomes a <TokenMark>; everything else is verbatim text (see splitOutput).
  const segments = $derived(splitOutput(session.output, session.replacements))
  const hasOutput = $derived(session.output.length > 0)
  const original = (rep: Replacement): string =>
    session.scrubbedFrom.slice(rep.sourceStart, rep.sourceEnd)

  // A tally by entity type. On a long paste the marks scroll out of sight, so
  // this is the only place that says how much was replaced, and the quickest
  // way to notice a detector that over-fired.
  const byType = $derived.by(() => {
    const counts = new Map<string, number>()
    for (const rep of session.replacements) counts.set(rep.type, (counts.get(rep.type) ?? 0) + 1)
    return [...counts].sort(([a, na], [b, nb]) => nb - na || a.localeCompare(b))
  })
  const total = $derived(session.replacements.length)
  const detail = $derived(byType.map(([type, n]) => `${n} ${type}`).join(', '))
  const summary = $derived(total > 0 ? `${total} replaced: ${detail}` : 'Nothing replaced')

  // The text view is the deliverable; the table answers "what became what"
  // when the marks have scrolled out of sight.
  let view = $state<'text' | 'table'>('text')

  // The Clipboard API rejects when the permission is denied or the document is
  // not focused; say so on the button rather than failing silently.
  let copyState = $state<'idle' | 'copied' | 'failed'>('idle')
  let copyTimer: ReturnType<typeof setTimeout> | undefined
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(session.output)
      copyState = 'copied'
    } catch {
      copyState = 'failed'
    }
    clearTimeout(copyTimer)
    copyTimer = setTimeout(() => (copyState = 'idle'), 1600)
  }
</script>

<section class="flex min-h-0 flex-col bg-background">
  <div class="flex items-center justify-between gap-3 px-6 pt-4">
    <div class="flex min-w-0 items-baseline gap-3">
      <h2 class="text-xs font-medium uppercase tracking-widest text-muted-foreground">Scrubbed</h2>
      {#if hasOutput}
        <p class="flex min-w-0 items-center gap-2 truncate text-xs text-muted-foreground" title={summary}>
          {#if total > 0}
            <span><span class="font-medium text-foreground">{total}</span> replaced</span>
            {#each byType as [type, n] (type)}
              <span class="{markClass(type)} inline-flex shrink-0 items-center gap-1">
                <span class="size-2 rounded-full border border-mark-border bg-mark"></span>
                {n} {type}
              </span>
            {/each}
          {:else}
            Nothing replaced
          {/if}
        </p>
      {/if}
    </div>
    {#if hasOutput}
      <div class="flex items-center gap-1">
        <div class="-my-1 flex rounded-md border border-border p-0.5 text-xs" role="tablist">
          {#each [['text', 'Text'], ['table', 'Table']] as const as [id, title] (id)}
            <button
              type="button"
              role="tab"
              aria-selected={view === id}
              class="rounded-sm px-2 py-0.5 {view === id
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground'}"
              onclick={() => (view = id)}
            >
              {title}
            </button>
          {/each}
        </div>
        <Button
          variant="ghost"
          size="sm"
          class="-my-1 h-7 text-xs"
          onclick={() => download(session.output, scrubbedName(session.fileName))}
        >
          Save
        </Button>
        <Button variant="ghost" size="sm" class="-my-1 h-7 text-xs" onclick={copy}>
          {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy'}
        </Button>
      </div>
    {/if}
  </div>
  {#if session.kept.length > 0}
    <ul class="flex flex-wrap items-center gap-1.5 px-6 pt-3 text-xs text-muted-foreground">
      <li>Kept:</li>
      {#each session.kept as value (value)}
        <li>
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 font-mono hover:text-foreground"
            title="Scrub it again"
            onclick={() => session.restore(value)}
          >
            <span class="max-w-48 truncate">{value}</span>
            <span aria-hidden="true">×</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  <div class="flex min-h-0 flex-1 flex-col overflow-auto p-6 font-mono text-sm">
    {#if hasOutput && view === 'table'}
      <ReplacementsTable />
    {:else if hasOutput}
      <Tooltip.Provider delayDuration={200}>
        <!-- prettier-ignore -->
        <div class="whitespace-pre-wrap break-words"
          >{#each segments as seg}{#if seg.kind === 'text'}{seg.text}{:else}<TokenMark
                fake={seg.rep.fake}
                label={seg.rep.label}
                type={seg.rep.type}
                original={original(seg.rep)}
                onkeep={() => session.keep(original(seg.rep))}
              />{/if}{/each}</div>
      </Tooltip.Provider>
    {:else if session.error}
      <span class="text-destructive">{session.error}</span>
    {:else}
      <span class="text-muted-foreground">Nothing leaves the woods.</span>
    {/if}
  </div>
</section>
