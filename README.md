# Leshy 🌲👁

Scrubs PII out of debugging data before it reaches an LLM — entirely in your browser.
Paste production output (JSON, Ruby inspects, logs, anything), get the same text back
with every name, email, phone, address, PESEL, SSN… replaced by a stable, realistic
fake. Copy it out. **Nothing leaves the woods**: no server, no cloud API, offline after
first load.

```
npm install
npm run models:fetch   # one-time model download (~190 MB, self-hosted afterwards)
npm run dev
```

- `npm run check` / `npm run test` — quality gates
- `npm run spike` — full detection-pipeline validation against golden samples

Docs: [CLAUDE.md](CLAUDE.md) (operating manual) · [docs/architecture.md](docs/architecture.md) ·
[docs/adr/](docs/adr/) (decisions) · [docs/implementation-plan.md](docs/implementation-plan.md).
