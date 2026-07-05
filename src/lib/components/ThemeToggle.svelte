<script lang="ts">
  import { Moon, Sun } from '@lucide/svelte'
  import { currentTheme, toggleTheme, type Theme } from '../theme.ts'

  // initTheme() (main.ts) has already applied the class before mount.
  let theme = $state<Theme>('light')
  $effect(() => {
    theme = currentTheme()
  })
</script>

<button
  type="button"
  class="rounded-md border border-border px-2.5 py-1 text-muted-foreground hover:text-foreground"
  aria-label="Toggle theme"
  onclick={() => (theme = toggleTheme())}
>
  {#if theme === 'dark'}
    <Sun class="size-3.5" />
  {:else}
    <Moon class="size-3.5" />
  {/if}
</button>
