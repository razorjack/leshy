<script lang="ts">
  import { onMount } from 'svelte'
  import { SlidersHorizontal } from '@lucide/svelte'
  import { session } from '../../state/session.svelte.ts'
  import { resolveConfig } from '../../core/config.ts'
  import { packs } from '../../core/packs/index.ts'
  import { LOCALES, locales } from '../../core/generate/locales.ts'
  import type { LocaleSetting } from '../../core/types.ts'
  import * as Dialog from './ui/dialog/index.ts'
  import { Switch } from './ui/switch/index.ts'

  const SALT_KEY = 'leshy-salt'
  const OVERRIDES_KEY = 'leshy-overrides'

  const base = resolveConfig()
  const defaults: Record<string, boolean> = Object.fromEntries(
    base.detectors.map((d) => [d.id, d.enabled]),
  )

  let enabled = $state<Record<string, boolean>>({ ...defaults })
  let countries = $state<string[]>([...base.countries])
  let locale = $state<LocaleSetting>(base.locale)
  let semantic = $state(true)
  let salt = $state('')

  // Deselecting a country takes its detectors out of the config, so the list
  // below shows exactly what is running rather than every rule Leshy ships.
  const detectors = $derived(resolveConfig({ countries }).detectors)

  // Derive the serialisable overrides from the toggle state relative to the
  // built-in defaults, push them to the session (re-scrubs) and persist them.
  const apply = (): void => {
    const all = base.detectors
    const disable = all.filter((d) => defaults[d.id] && !enabled[d.id]).map((d) => d.id)
    const enable = all.filter((d) => !defaults[d.id] && enabled[d.id]).map((d) => d.id)
    const saved = { disable, enable, countries, locale, semanticEnabled: semantic }
    session.setOverrides({ ...saved, ...(salt ? { salt } : {}) })
    localStorage.setItem(OVERRIDES_KEY, JSON.stringify(saved))
    if (salt) localStorage.setItem(SALT_KEY, salt)
    else localStorage.removeItem(SALT_KEY)
  }

  onMount(() => {
    salt = localStorage.getItem(SALT_KEY) ?? ''
    try {
      const saved = JSON.parse(localStorage.getItem(OVERRIDES_KEY) ?? '{}') as {
        disable?: string[]
        enable?: string[]
        countries?: string[]
        locale?: LocaleSetting
        semanticEnabled?: boolean
      }
      if (saved.semanticEnabled === false) semantic = false
      if (saved.countries) countries = saved.countries.filter((id) => packs.some((p) => p.id === id))
      if (saved.locale && (saved.locale === 'auto' || locales.includes(saved.locale))) {
        locale = saved.locale
      }
      for (const id of saved.disable ?? []) enabled[id] = false
      for (const id of saved.enable ?? []) enabled[id] = true
    } catch {
      // ignore malformed storage
    }
    apply()
  })

  // Typing a salt would otherwise re-scrub (model pass included) per keystroke.
  let saltTimer: ReturnType<typeof setTimeout> | undefined
  const setSalt = (value: string): void => {
    salt = value
    clearTimeout(saltTimer)
    saltTimer = setTimeout(apply, 300)
  }

  const setDetector = (id: string, value: boolean): void => {
    enabled[id] = value
    apply()
  }

  const setCountry = (id: string, value: boolean): void => {
    countries = value ? [...countries, id] : countries.filter((c) => c !== id)
    apply()
  }
</script>

<Dialog.Root>
  <Dialog.Trigger
    class="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
    aria-label="Settings"
  >
    <SlidersHorizontal class="size-3.5" />
  </Dialog.Trigger>
  <Dialog.Content class="max-h-[85svh] overflow-auto sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>Settings</Dialog.Title>
      <Dialog.Description>
        Everything runs locally. Toggles and salt are stored only in this browser.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-2">
      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">Salt</span>
        <input
          type="text"
          value={salt}
          placeholder="leshy-v1 (default)"
          class="rounded-md border border-input bg-transparent px-3 py-1.5 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          oninput={(e) => setSalt(e.currentTarget.value)}
        />
        <span class="text-xs text-muted-foreground">Changes every fake deterministically.</span>
      </label>

      <label class="flex flex-col gap-1">
        <span class="text-sm font-medium">Locale</span>
        <select
          value={locale}
          class="rounded-md border border-input bg-transparent px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onchange={(e) => { locale = e.currentTarget.value as LocaleSetting; apply() }}
        >
          <option value="auto">Automatic (from the text)</option>
          {#each locales as id (id)}
            <option value={id}>{LOCALES[id].label}</option>
          {/each}
        </select>
        <span class="text-xs text-muted-foreground">Which language the fakes are written in.</span>
      </label>

      <div class="flex items-center justify-between gap-4">
        <span class="text-sm font-medium">Semantic model (names, addresses, orgs)</span>
        <Switch checked={semantic} onCheckedChange={(v) => { semantic = v; apply() }} />
      </div>

      <div class="space-y-2">
        <span class="text-sm font-medium">Countries</span>
        <p class="text-xs text-muted-foreground">
          National ids and local address formats. Off means those rules do not run.
        </p>
        <ul class="divide-y divide-border rounded-md border border-border">
          {#each packs as p (p.id)}
            <li class="flex items-center justify-between gap-4 px-3 py-2">
              <span class="flex flex-col">
                <span class="text-sm">{p.label}</span>
                <span class="font-mono text-xs text-muted-foreground">
                  {p.detectors.map((d) => d.id).join(' · ')}
                </span>
              </span>
              <Switch
                checked={countries.includes(p.id)}
                onCheckedChange={(v) => setCountry(p.id, v)}
                aria-label={p.label}
              />
            </li>
          {/each}
        </ul>
      </div>

      <div class="space-y-2">
        <span class="text-sm font-medium">Detectors</span>
        <ul class="divide-y divide-border rounded-md border border-border">
          {#each detectors as d (d.id)}
            <li class="flex items-center justify-between gap-4 px-3 py-2">
              <span class="flex flex-col">
                <span class="text-sm">{d.label}</span>
                <span class="font-mono text-xs text-muted-foreground">{d.id}</span>
              </span>
              <Switch
                checked={enabled[d.id]}
                onCheckedChange={(v) => setDetector(d.id, v)}
                aria-label={d.label}
              />
            </li>
          {/each}
        </ul>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
