<script lang="ts">
  import { onMount } from 'svelte'
  import { SlidersHorizontal } from '@lucide/svelte'
  import userConfig from '../../../leshy.config.ts'
  import { session } from '../../state/session.svelte.ts'
  import { resolveConfig, fakeTypes } from '../../core/config.ts'
  import type { CustomRule, FakeType, KeepRule } from '../../core/config.ts'
  import { packs } from '../../core/packs/index.ts'
  import { LOCALES, locales } from '../../core/generate/locales.ts'
  import type { LocaleSetting } from '../../core/types.ts'
  import * as Dialog from './ui/dialog/index.ts'
  import { Switch } from './ui/switch/index.ts'

  const KEY = 'leshy-settings'
  // Pre-v1 storage: overrides and salt under two keys. Read once, then dropped.
  const LEGACY = { overrides: 'leshy-overrides', salt: 'leshy-salt' }

  type Stored = {
    v: 1
    disable?: string[]
    enable?: string[]
    countries?: string[]
    locale?: LocaleSetting
    semanticEnabled?: boolean
    salt?: string
    rules?: CustomRule[]
    keepRules?: KeepRule[]
  }

  const load = (): Partial<Stored> => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) return JSON.parse(raw) as Stored
      const legacy = JSON.parse(localStorage.getItem(LEGACY.overrides) ?? '{}') as Partial<Stored>
      const salt = localStorage.getItem(LEGACY.salt)
      return salt ? { ...legacy, salt } : legacy
    } catch {
      return {} // malformed storage reads as no settings
    }
  }

  // The worker resolves the same file; the UI must diff its toggles against
  // that baseline, or a detector enabled in the config shows as off here.
  const base = resolveConfig(userConfig)
  const defaults: Record<string, boolean> = Object.fromEntries(
    base.detectors.map((d) => [d.id, d.enabled]),
  )

  let enabled = $state<Record<string, boolean>>({ ...defaults })
  let countries = $state<string[]>([...base.countries])
  let locale = $state<LocaleSetting>(base.locale)
  let semantic = $state(base.semantic.enabled)
  let salt = $state('')
  let rules = $state<CustomRule[]>([])
  let keepRules = $state<KeepRule[]>([])

  // Deselecting a country takes its detectors out of the config, so the list
  // below shows exactly what is running rather than every rule Leshy ships.
  const detectors = $derived(resolveConfig(userConfig, { countries }).detectors)

  // Derive the serialisable overrides from the toggle state relative to the
  // built-in defaults, push them to the session (re-scrubs) and persist them.
  const apply = (): void => {
    const all = base.detectors
    const disable = all.filter((d) => defaults[d.id] && !enabled[d.id]).map((d) => d.id)
    const enable = all.filter((d) => !defaults[d.id] && enabled[d.id]).map((d) => d.id)
    const overrides = {
      disable,
      enable,
      countries,
      locale,
      semanticEnabled: semantic,
      rules,
      keepRules,
    }
    session.setOverrides({ ...overrides, ...(salt ? { salt } : {}) })
    const stored: Stored = { v: 1, ...overrides, ...(salt ? { salt } : {}) }
    localStorage.setItem(KEY, JSON.stringify(stored))
    localStorage.removeItem(LEGACY.overrides)
    localStorage.removeItem(LEGACY.salt)
  }

  onMount(() => {
    const saved = load()
    salt = saved.salt ?? ''
    if (saved.semanticEnabled === false) semantic = false
    if (saved.countries) countries = saved.countries.filter((id) => packs.some((p) => p.id === id))
    if (saved.locale && (saved.locale === 'auto' || locales.includes(saved.locale))) {
      locale = saved.locale
    }
    rules = (saved.rules ?? []).filter((r) => valid(r.pattern) && valid(r.keys))
    keepRules = (saved.keepRules ?? []).filter((r) => valid(r.keys) && valid(r.match))
    for (const id of saved.disable ?? []) enabled[id] = false
    for (const id of saved.enable ?? []) enabled[id] = true
    apply()
  })

  // Typing a salt would otherwise re-scrub (model pass included) per keystroke.
  let saltTimer: ReturnType<typeof setTimeout> | undefined
  const setSalt = (value: string): void => {
    salt = value
    clearTimeout(saltTimer)
    saltTimer = setTimeout(apply, 300)
  }

  // A regex the worker cannot compile would fail every scrub, so it never
  // leaves the form. Ids are unique per browser; nothing else keys on them.
  const valid = (re: string | undefined): boolean => {
    if (!re) return true
    try {
      new RegExp(re)
      return true
    } catch {
      return false
    }
  }
  const nextId = (prefix: string): string =>
    `${prefix}-${Math.max(0, ...[...rules, ...keepRules].map((r) => Number(r.id.split('-')[1]) || 0)) + 1}`

  let draft = $state({ label: '', pattern: '', keys: '', type: 'secret' as FakeType })
  const draftError = $derived(
    !valid(draft.pattern) || !valid(draft.keys)
      ? 'Not a valid regular expression'
      : draft.pattern === '' && draft.keys === ''
        ? 'A text pattern or a key pattern is needed'
        : '',
  )
  const addRule = (): void => {
    if (draftError) return
    rules = [
      ...rules,
      {
        id: nextId('rule'),
        label: draft.label.trim() || draft.pattern || draft.keys,
        ...(draft.pattern ? { pattern: draft.pattern } : {}),
        ...(draft.keys ? { keys: draft.keys } : {}),
        type: draft.type,
        enabled: true,
      },
    ]
    draft = { label: '', pattern: '', keys: '', type: draft.type }
    apply()
  }

  let keepDraft = $state({ label: '', keys: '', match: '' })
  const keepError = $derived(
    !valid(keepDraft.keys) || !valid(keepDraft.match)
      ? 'Not a valid regular expression'
      : keepDraft.keys === '' && keepDraft.match === ''
        ? 'A key pattern or a value pattern is needed'
        : '',
  )
  const addKeep = (): void => {
    if (keepError) return
    keepRules = [
      ...keepRules,
      {
        id: nextId('keep'),
        label: keepDraft.label.trim() || keepDraft.keys || keepDraft.match,
        ...(keepDraft.keys ? { keys: keepDraft.keys } : {}),
        ...(keepDraft.match ? { match: keepDraft.match } : {}),
        enabled: true,
      },
    ]
    keepDraft = { label: '', keys: '', match: '' }
    apply()
  }

  const field =
    'min-w-0 rounded-md border border-input bg-transparent px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const addButton =
    'rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted disabled:opacity-50'

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
        Everything runs locally. Toggles, rules and salt are stored only in this browser.
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

      <div class="space-y-2">
        <span class="text-sm font-medium">Your rules</span>
        <p class="text-xs text-muted-foreground">
          A regular expression over the text, a pattern for field names, or both. Matches are
          replaced with a fake of the chosen kind.
        </p>
        {#if rules.length > 0}
          <ul class="divide-y divide-border rounded-md border border-border">
            {#each rules as r, i (r.id)}
              <li class="flex items-center justify-between gap-4 px-3 py-2">
                <span class="flex min-w-0 flex-col">
                  <span class="truncate text-sm">{r.label}</span>
                  <span class="truncate font-mono text-xs text-muted-foreground">
                    {[r.pattern ? `/${r.pattern}/` : '', r.keys ? `key /${r.keys}/i` : '']
                      .filter(Boolean)
                      .join(' · ')} → {r.type}
                  </span>
                </span>
                <span class="flex shrink-0 items-center gap-2">
                  <Switch
                    checked={r.enabled}
                    onCheckedChange={(v) => {
                      rules[i]!.enabled = v
                      apply()
                    }}
                    aria-label={r.label}
                  />
                  <button
                    type="button"
                    class="text-xs text-muted-foreground hover:text-destructive"
                    aria-label="Remove {r.label}"
                    onclick={() => {
                      rules = rules.filter((x) => x.id !== r.id)
                      apply()
                    }}
                  >
                    ×
                  </button>
                </span>
              </li>
            {/each}
          </ul>
        {/if}
        <div class="grid grid-cols-2 gap-2 rounded-md border border-dashed border-border p-3">
          <input
            type="text"
            placeholder="Label"
            class={field}
            bind:value={draft.label}
          />
          <select class={field} bind:value={draft.type}>
            {#each fakeTypes as t (t)}
              <option value={t}>fake as {t}</option>
            {/each}
          </select>
          <input
            type="text"
            placeholder="Text pattern, e.g. \bTKT-\d{6}\b"
            class="{field} font-mono"
            spellcheck="false"
            bind:value={draft.pattern}
          />
          <input
            type="text"
            placeholder="Key pattern, e.g. ^badge_no$"
            class="{field} font-mono"
            spellcheck="false"
            bind:value={draft.keys}
          />
          <span class="col-span-2 flex items-center justify-between gap-2">
            <span class="text-xs text-destructive">{draftError}</span>
            <button type="button" class={addButton} disabled={draftError !== ''} onclick={addRule}>
              Add rule
            </button>
          </span>
        </div>
      </div>

      <div class="space-y-2">
        <span class="text-sm font-medium">Keep as is</span>
        <p class="text-xs text-muted-foreground">
          Values under these keys, or of this shape, are left alone unless a checksum proves
          they are an id.
        </p>
        {#if keepRules.length > 0}
          <ul class="divide-y divide-border rounded-md border border-border">
            {#each keepRules as r, i (r.id)}
              <li class="flex items-center justify-between gap-4 px-3 py-2">
                <span class="flex min-w-0 flex-col">
                  <span class="truncate text-sm">{r.label}</span>
                  <span class="truncate font-mono text-xs text-muted-foreground">
                    {[r.keys ? `key /${r.keys}/i` : '', r.match ? `value /${r.match}/` : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span class="flex shrink-0 items-center gap-2">
                  <Switch
                    checked={r.enabled}
                    onCheckedChange={(v) => {
                      keepRules[i]!.enabled = v
                      apply()
                    }}
                    aria-label={r.label}
                  />
                  <button
                    type="button"
                    class="text-xs text-muted-foreground hover:text-destructive"
                    aria-label="Remove {r.label}"
                    onclick={() => {
                      keepRules = keepRules.filter((x) => x.id !== r.id)
                      apply()
                    }}
                  >
                    ×
                  </button>
                </span>
              </li>
            {/each}
          </ul>
        {/if}
        <div class="grid grid-cols-2 gap-2 rounded-md border border-dashed border-border p-3">
          <input
            type="text"
            placeholder="Label"
            class="{field} col-span-2"
            bind:value={keepDraft.label}
          />
          <input
            type="text"
            placeholder="Key pattern, e.g. ^support$"
            class="{field} font-mono"
            spellcheck="false"
            bind:value={keepDraft.keys}
          />
          <input
            type="text"
            placeholder="Value pattern, e.g. ^v\d+\."
            class="{field} font-mono"
            spellcheck="false"
            bind:value={keepDraft.match}
          />
          <span class="col-span-2 flex items-center justify-between gap-2">
            <span class="text-xs text-destructive">{keepError}</span>
            <button type="button" class={addButton} disabled={keepError !== ''} onclick={addKeep}>
              Add rule
            </button>
          </span>
        </div>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
