# QE Framework Portal

Working implementation of the **Quality Engineering Framework** (see `QE Framework.docx` /
[docs/QE-FRAMEWORK.md](docs/QE-FRAMEWORK.md)) — shift-left testing for web applications with
AI-assisted analysis, automated quality gates, and clear accountability.

> Quality Engineering is everyone's responsibility — starting at requirements, not after code is written.

## What's here

| Workspace | Purpose |
|---|---|
| `server/` | Node.js + TypeScript API: all framework engines + SQLite persistence + Claude AI integration |
| `web/` | React (Vite) portal dashboard: story pipeline, risk register, regression pack, go/no-go, metrics |
| `e2e/` | Playwright P1 smoke suite + axe-core WCAG 2.1 AA accessibility gate |

### Framework engines (server/src/engines)

| Engine | Spec | What it enforces |
|---|---|---|
| `dor.ts` | §2 | DoR checklists per story type; 100% / 80–99% / <80% thresholds; gaps auto-assigned to owners |
| `readiness.ts` | §3.2 | 3 Amigos 6-criteria readiness with owner-if-missing routing |
| `dod.ts` | §4 | Tailored DoD per story type; Dev self-certification → independent QE verification (dual gate) |
| `ac.ts` | §5, §10, §11 | Gherkin AC generation, auto security AC (OWASP) + accessibility AC, test-type categorisation, automation candidate scoring |
| `risk.ts` | §6 | 8 risk types, severity × likelihood matrix, monitor / mitigate / escalate bands |
| `ddi.ts` | §7.2 | Defect Density Index with ≥2.5 / 1.0–2.4 / <1.0 bands |
| `regression.ts` | §7 | Tiered P1/P2/P3 pack from risk + change + DDI + previously-failed rules; flaky quarantine |
| `gonogo.ts` | §8 | 3 hard blockers + 8 weighted signals → GO / Conditional / High-Risk / NO-GO |
| `metrics.ts` | §14 | Escape rate, shift-left index, automation coverage, MTTD, DoD compliance, flakiness, automation ROI |

## Quick start

```sh
npm install
npm run build --workspace=web   # build the dashboard once
npm run dev                     # API + dashboard on http://localhost:4000
```

The portal seeds demo data on first boot (disable with `QE_SEED=0`).

### Configuration via .env

All configuration can live in a `.env` file at the repo root (gitignored) — copy
[.env.example](.env.example) and fill in. Real environment variables take precedence over
file values. Loaded natively by `server/src/env.ts`, no dotenv dependency.

### Enable AI assessment (optional)

```sh
set ANTHROPIC_API_KEY=sk-ant-...   # PowerShell: $env:ANTHROPIC_API_KEY = "sk-ant-..."
```

With a key set, AC generation (`POST /api/stories/:id/ac/generate`) and risk analysis
(`POST /api/stories/:id/risks/analyse`) use the Claude API (default model `claude-sonnet-4-6`
per the framework spec §16; override with `QE_AI_MODEL`). Without a key, AC generation falls
back to a deterministic template engine — **AI enhances, never blocks**.

## Testing

```sh
npm run test           # 60 unit tests across all engines (Vitest)
npm run typecheck      # server + web
npm run e2e            # P1 smoke + WCAG 2.1 AA axe scan (Playwright; run `npm run install-browsers -w e2e` once)
```

### Jira integration

```sh
$env:JIRA_BASE_URL  = "https://yourteam.atlassian.net"
$env:JIRA_EMAIL     = "you@team.com"
$env:JIRA_API_TOKEN = "..."          # id.atlassian.com → Security → API tokens
$env:JIRA_JQL       = 'status = "Refinement" ORDER BY updated DESC'   # optional, this is the default
```

With these set, the Story Pipeline tab shows a **Sync from Jira** button (`POST /api/jira/sync`).
Issues are mapped to portal stories (issue type → feature/bug/tech_debt, components → module,
priority → P1/P2/P3, sensitive areas inferred from labels/summary) and land at DoR Gate 1.
Re-syncing matches on Jira key and preserves gate progress (status, DoR/DoD checks).

### MCP enrichment (optional, Phase 3)

```sh
$env:ATLASSIAN_MCP_URL   = "https://mcp.atlassian.com/v1/sse"
$env:ATLASSIAN_MCP_TOKEN = "..."     # OAuth token for the Atlassian MCP server
```

When set (and AI is enabled), AC generation for Jira-synced stories runs through the Claude API
MCP connector so the model fetches the full Jira issue, comments, and linked tickets itself.

## API surface

All under `/api`:

- `GET /jira/status`, `POST /jira/sync` — pull refinement stories from Jira
- `GET/POST /stories`, `GET /stories/:id`
- `GET/POST /stories/:id/dor` — DoR scoring with gap assignment
- `POST /stories/:id/readiness` — 3 Amigos assessment
- `POST /stories/:id/ac/generate`, `POST /stories/:id/ac/approve`
- `GET /stories/:id/dod`, `POST /stories/:id/dod/self-certify`, `POST /stories/:id/dod/qe-verify`
- `GET/POST /risks`, `POST /stories/:id/risks/analyse`
- `GET/POST /defects`, `GET /ddi?module=`
- `GET/POST /tests`, `POST /regression/build`
- `POST /gonogo`, `GET|POST /metrics`, `GET /health`

## CI quality gates (.github/workflows/ci.yml)

typecheck → unit tests → **Semgrep SAST** (per PR, §10.1) → web build → **Playwright P1 smoke +
axe accessibility** → **Lighthouse CI** performance budget.

## Deploy (shareable URL)

The repo ships a single-container deployment:

- **Render**: push the repo, then "New + → Blueprint" — [render.yaml](render.yaml) provisions the
  service with a persistent disk for SQLite (`/data/qe-portal.db`) and a `/api/health` check.
- **Railway/Fly**: `railway up` / `fly launch` with the [Dockerfile](Dockerfile); attach a volume and
  set `QE_DB_PATH` to a path on it.
- Set secrets in the platform dashboard: `ANTHROPIC_API_KEY`, `JIRA_*`, `ZEPHYR_*` (never commit them).
- Once deployed, set the `STAGING_URL` repository variable on GitHub so the
  [ZAP DAST workflow](.github/workflows/dast.yml) scans each release.

**PostgreSQL**: the data layer is one `Repo` class ([server/src/db.ts](server/src/db.ts)) by design,
so the swap is contained — but it stays SQLite until there is a real Postgres instance to verify
against (an untested data layer is worse than a tested one). With the persistent-disk setup above,
SQLite is fine well beyond demo scale.

## Production notes / integration path

- **Storage**: SQLite via a JSON-document `Repo` class (`server/src/db.ts`). The spec targets
  PostgreSQL — swap the `Repo` implementation; engines are pure functions and unaffected.
- **DAST (OWASP ZAP)**: `.github/workflows/dast.yml` runs a ZAP baseline scan on release (or
  manually) once the `STAGING_URL` repository variable is set.
