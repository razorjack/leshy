<script lang="ts">
  import { session } from '../../state/session.svelte.ts'
  import { markClass } from '../marks.ts'
  import { tabulate, type Column, type Row } from '../table.ts'

  let filter = $state('')
  let sortBy = $state<Column>('count')
  let descending = $state(true)

  const rows = $derived(
    tabulate(session.scrubbedFrom, session.replacements, { filter, sortBy, descending }),
  )

  const sort = (column: Column): void => {
    if (sortBy === column) descending = !descending
    else {
      sortBy = column
      descending = column === 'count'
    }
  }

  const columns: Array<[Column, string]> = [
    ['original', 'Original'],
    ['fake', 'Fake'],
    ['label', 'Type'],
    ['count', 'Count'],
  ]

  const arrow = (column: Column): string => {
    if (sortBy !== column) return ''
    return descending ? ' ↓' : ' ↑'
  }
  const keep = (row: Row): void => session.keep(row.original)
</script>

<div class="flex min-h-0 flex-1 flex-col gap-3">
  <input
    type="search"
    placeholder="Filter by original, fake or type"
    class="rounded-md border border-input bg-transparent px-3 py-1.5 font-sans text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    value={filter}
    spellcheck="false"
    autocomplete="off"
    oninput={(event) => (filter = event.currentTarget.value)}
  />
  <div class="min-h-0 flex-1 overflow-auto">
    <table class="w-full border-collapse text-left text-sm">
      <thead class="sticky top-0 bg-background font-sans text-xs text-muted-foreground">
        <tr>
          {#each columns as [column, title] (column)}
            <th class="border-b border-border py-1.5 pr-4 font-medium">
              <button type="button" class="hover:text-foreground" onclick={() => sort(column)}>
                {title}{arrow(column)}
              </button>
            </th>
          {/each}
          <th class="border-b border-border py-1.5"></th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.original + '\0' + row.fake + '\0' + row.type)}
          <tr class="align-top hover:bg-muted/40">
            <td class="max-w-64 break-all border-b border-border py-1.5 pr-4">{row.original}</td>
            <td class="max-w-64 break-all border-b border-border py-1.5 pr-4">
              <span class="{markClass(row.type)} rounded-xs bg-mark px-0.5">{row.fake}</span>
            </td>
            <td class="border-b border-border py-1.5 pr-4 font-sans text-xs text-muted-foreground">
              {row.label}
            </td>
            <td class="border-b border-border py-1.5 pr-4 tabular-nums">{row.count}</td>
            <td class="border-b border-border py-1.5 text-right">
              <button
                type="button"
                class="font-sans text-xs text-muted-foreground hover:text-foreground"
                onclick={() => keep(row)}
              >
                Keep
              </button>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="5" class="py-3 font-sans text-xs text-muted-foreground">
              {session.replacements.length === 0 ? 'Nothing replaced' : 'No match'}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
