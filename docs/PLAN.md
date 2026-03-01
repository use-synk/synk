# synk ai — Product & Architecture Plan

## 1. Problem Statement

Documentation drifts out of sync with code because developers update code without updating the corresponding docs. This is amplified in teams where many contributors work in parallel. **synk ai** closes this gap by automatically detecting when code changes require documentation updates and opening pull requests with suggested changes.

---

## 2. Core User Flow

```
Developer merges PR / pushes to branch
        ↓
GitHub sends webhook event to synk ai
        ↓
synk ai analyzes the diff (what changed?)
        ↓
synk ai locates the project's documentation
        ↓
AI determines: does this change affect docs?
        ↓
  NO → log & done
  YES → AI generates a doc update suggestion
        ↓
synk ai opens a PR with the suggested changes
        ↓
Developer reviews & merges the doc PR
```

---

## 3. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      GitHub App                         │
│         (webhook source + API for repo access)          │
└──────────────────────┬──────────────────────────────────┘
                       │ webhook events
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    API Server                           │
│               (Hono on Bun runtime)                    │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Webhook     │  │  REST API    │  │  Dashboard    │  │
│  │  Handler     │  │  (settings,  │  │  BFF          │  │
│  │              │  │   history)   │  │               │  │
│  └──────┬───── ┘  └──────────────┘  └───────────────┘  │
│         │                                               │
└─────────┼───────────────────────────────────────────────┘
          │ enqueue job
          ▼
┌─────────────────────┐     ┌────────────────────────────┐
│   Job Queue         │────▶│   Worker Process           │
│   (BullMQ + Redis)  │     │                            │
└─────────────────────┘     │  1. Fetch diff (GitHub API)│
                            │  2. Discover docs          │
                            │  3. AI analysis            │
                            │  4. AI doc generation      │
                            │  5. Open PR (GitHub API)   │
                            └─────────────┬──────────────┘
                                          │
                      ┌───────────────────┼────────────────┐
                      ▼                   ▼                ▼
               ┌────────────┐   ┌──────────────┐   ┌───────────┐
               │ PostgreSQL │   │  OpenRouter   │   │  GitHub   │
               │            │   │  (AI)         │   │  API      │
               └────────────┘   └──────────────┘   └───────────┘
```

---

## 4. Technology Stack

| Layer              | Technology                | Rationale                                                    |
| ------------------ | ------------------------- | ------------------------------------------------------------ |
| **Language**       | TypeScript (strict mode)  | MVP requirement, strong ecosystem for GitHub/web tooling     |
| **Runtime**        | Bun 1.3.x                | Single runtime for package management, scripts, and services |
| **API Framework**  | Hono                      | Lightweight, fast, middleware-friendly, runs anywhere        |
| **Job Queue**      | BullMQ + Redis (Valkey)   | Battle-tested, retries, rate limiting, concurrency control   |
| **Database**       | PostgreSQL 16             | MVP requirement, reliable, JSONB for flexible config storage |
| **ORM**            | Drizzle ORM               | Type-safe, lightweight, excellent migration tooling          |
| **AI Provider**    | OpenRouter                | MVP requirement, model flexibility, single API surface       |
| **AI SDK**         | Vercel AI SDK             | Unified streaming/structured output, provider-agnostic       |
| **GitHub**         | Octokit + Probot          | Official GitHub SDK, Probot simplifies App lifecycle         |
| **Monorepo**       | Turborepo + Bun          | Fast builds, workspace-aware pipelines, shared packages      |
| **Validation**     | Zod                       | Runtime validation, pairs with Drizzle and Hono              |
| **Testing**        | Bun test                  | Fast test runner with built-in coverage for TypeScript       |
| **Linting**        | Biome                     | Fast all-in-one linter + formatter                           |
| **Dashboard**      | Next.js 15 (App Router)   | React SSR, pairs with Hono API, shareable TS types           |
| **Containerization** | Docker                  | Reproducible builds, consistent environments                 |

---

## 5. Monorepo Structure

```
synk-ai/
├── apps/
│   ├── api/                    # Hono API server + webhook handler
│   │   ├── src/
│   │   │   ├── routes/         # Route handlers (webhooks, REST)
│   │   │   ├── middleware/     # Auth, rate limiting, error handling
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── worker/                 # BullMQ worker process
│   │   ├── src/
│   │   │   ├── jobs/           # Job processors
│   │   │   ├── pipelines/      # Orchestration logic
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── web/                    # Next.js dashboard
│       ├── src/
│       │   └── app/
│       ├── Dockerfile
│       └── package.json
│
├── packages/
│   ├── db/                     # Drizzle schema, migrations, client
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   └── migrate.ts
│   │   ├── drizzle/            # Migration files
│   │   └── package.json
│   │
│   ├── ai/                     # AI client, prompts, structured output schemas
│   │   ├── src/
│   │   │   ├── prompts/
│   │   │   ├── client.ts
│   │   │   └── schemas.ts      # Zod schemas for structured AI output
│   │   └── package.json
│   │
│   ├── github/                 # GitHub App client, helpers
│   │   ├── src/
│   │   │   ├── app.ts          # GitHub App auth + Octokit factory
│   │   │   ├── diff.ts         # Diff fetching & parsing
│   │   │   └── pr.ts           # PR creation helpers
│   │   └── package.json
│   │
│   ├── doc-adapters/           # Documentation framework adapters
│   │   ├── src/
│   │   │   ├── types.ts        # Shared adapter interface
│   │   │   ├── nextra.ts
│   │   │   ├── fumadocs.ts
│   │   │   ├── docusaurus.ts
│   │   │   ├── markdown.ts     # Fallback: plain markdown
│   │   │   └── detect.ts       # Auto-detection logic
│   │   └── package.json
│   │
│   ├── config/                 # Shared config (eslint, tsconfig, etc.)
│   │   ├── tsconfig.base.json
│   │   └── biome.json
│   │
│   └── shared/                 # Shared types, utils, constants
│       ├── src/
│       │   ├── types.ts
│       │   └── utils.ts
│       └── package.json
│
├── turbo.json
├── bun-workspace.yaml
├── docker-compose.yml          # Local dev: Postgres + Redis
└── .github/
    └── workflows/
        ├── ci.yml
        └── deploy.yml
```

---

## 6. Database Schema

```
┌──────────────────────────┐       ┌──────────────────────────┐
│ installations             │       │ repositories              │
├──────────────────────────┤       ├──────────────────────────┤
│ id              UUID PK  │       │ id              UUID PK  │
│ github_id       BIGINT   │──┐    │ installation_id UUID FK  │
│ account_login   TEXT     │  │    │ github_id       BIGINT   │
│ account_type    TEXT     │  │    │ full_name       TEXT     │
│ status          TEXT     │  └───▶│ default_branch  TEXT     │
│ created_at      TIMESTAMPTZ │    │ docs_config     JSONB    │
│ updated_at      TIMESTAMPTZ │    │ is_active       BOOLEAN  │
└──────────────────────────┘       │ created_at      TIMESTAMPTZ │
                                    │ updated_at      TIMESTAMPTZ │
                                    └──────────┬───────────────┘
                                               │
                                    ┌──────────▼───────────────┐
                                    │ analysis_runs             │
                                    ├──────────────────────────┤
                                    │ id              UUID PK  │
                                    │ repository_id   UUID FK  │
                                    │ trigger_type    TEXT     │
                                    │ trigger_ref     TEXT     │
                                    │ commit_sha      TEXT     │
                                    │ status          TEXT     │
                                    │ result          JSONB    │
                                    │ docs_affected   BOOLEAN  │
                                    │ pr_number       INTEGER  │
                                    │ pr_url          TEXT     │
                                    │ token_usage     JSONB    │
                                    │ error           TEXT     │
                                    │ started_at      TIMESTAMPTZ │
                                    │ completed_at    TIMESTAMPTZ │
                                    │ created_at      TIMESTAMPTZ │
                                    └──────────────────────────┘
```

### Key design decisions

- **`docs_config` (JSONB)** on `repositories` stores per-repo configuration: doc framework, doc paths, doc repo (if separate), branch conventions, file patterns to watch, and custom prompts. JSONB allows flexible schema evolution without migrations.
- **`analysis_runs`** logs every invocation for observability, debugging, and billing.
- **`token_usage`** tracks AI token consumption per run for cost monitoring.
- **`trigger_type`** is one of `push`, `pull_request.closed` (merged), or `manual`.

---

## 7. Core Processing Pipeline

The worker executes the following pipeline for each incoming event:

### Step 1 — Event Ingestion & Filtering

- Receive webhook (`push` or `pull_request` with `action: closed` + `merged: true`).
- Validate webhook signature (GitHub App secret).
- Check: is the repository active in our system?
- Check: is the target branch a monitored branch (e.g., `main`, `develop`)?
- If valid, enqueue a `analyze-changes` job.

### Step 2 — Diff Extraction

- Use the GitHub API to fetch the compare diff or PR diff.
- Parse the diff into structured change objects: `{ file, status, additions, deletions, patch }`.
- Filter out irrelevant files (lock files, generated code, assets) using configurable ignore patterns.
- If no relevant changes remain, mark the run as `skipped` and exit.

### Step 3 — Documentation Discovery

- Load the repository's `docs_config` from the database.
- If no config exists, run auto-detection:
  - Scan the repo tree for known doc framework markers (`next.config.mjs` with nextra, `fumadocs` in dependencies, `docs/` folder, etc.).
  - Detect the doc framework and file structure.
  - Store the detected config for future runs.
- If docs live in a separate repository, resolve that repo reference.
- Fetch the current documentation tree and relevant doc file contents.

### Step 4 — AI Analysis (Triage)

- Construct a prompt containing:
  - The code diff (summarized if too large).
  - The documentation file tree.
  - Context about the doc framework.
  - Repository-specific custom instructions (if any).
- Send to OpenRouter (via Vercel AI SDK) with **structured output** (Zod schema).
- The AI returns a verdict:
  - `needs_update: boolean`
  - `confidence: number`
  - `affected_doc_files: string[]`
  - `reasoning: string`
- If `needs_update` is `false`, mark the run as `completed` (no docs affected) and exit.

### Step 5 — AI Doc Generation

- For each affected doc file, fetch its full content.
- Construct a generation prompt containing:
  - The original doc file content.
  - The relevant code changes.
  - The doc framework conventions (frontmatter format, component usage, etc.).
  - Instructions to preserve the existing writing style and structure.
- The AI returns the updated file content.
- Diff the original and generated content to produce clean, minimal changes.

### Step 6 — PR Creation

- Create a new branch: `synk-ai/update-docs-<short-sha>`.
- Commit the changed doc files to the branch.
- Open a PR against the docs target branch with:
  - A clear title: `docs: update documentation for <change summary>`.
  - A body containing: what triggered the update, which code changes are referenced, AI reasoning, and a disclaimer.
  - Labels: `synk-ai`, `documentation`.
- If docs live in a separate repo, open the PR in that repo instead.
- Record the PR URL in `analysis_runs`.

---

## 8. Documentation Adapter System

The adapter pattern lets synk ai work with any documentation framework without coupling core logic to specific tools.

### Adapter Interface

Each adapter implements:

| Method                   | Purpose                                                 |
| ------------------------ | ------------------------------------------------------- |
| `detect(repoTree)`      | Returns `true` if this framework is detected in the repo |
| `getDocPaths(config)`   | Returns glob patterns for documentation source files     |
| `parseStructure(files)` | Parses the doc tree into a navigable structure           |
| `getConventions()`      | Returns framework-specific writing conventions for AI    |
| `validateOutput(file)`  | Validates generated content against framework rules      |

### MVP Adapters

1. **Nextra** — detects `nextra` in `next.config`, parses `_meta.json` files.
2. **Fumadocs** — detects `fumadocs` in dependencies, understands its content layer.
3. **Docusaurus** — detects `docusaurus.config`, parses sidebar configs.
4. **Plain Markdown** — fallback, handles any `docs/` or `*.md` structure.

### Separate-Repo Documentation

Many projects keep docs in a different repository. The `docs_config` supports this:

```jsonc
{
  "framework": "nextra",
  "docsRepo": "org/project-docs",   // docs live here
  "docsBranch": "main",
  "docsPath": "pages/docs",
  "sourceRepo": "org/project"       // code changes come from here
}
```

When configured, the worker fetches diffs from the source repo but creates PRs in the docs repo.

---

## 9. AI Strategy

### Model Selection

Use OpenRouter to access models with a fallback strategy:

| Use Case         | Recommended Model      | Rationale                          |
| ---------------- | ---------------------- | ---------------------------------- |
| Triage (Step 4)  | Claude Sonnet 4.5      | Fast, cheap, good at classification |
| Generation (Step 5) | Claude Opus 4.6     | Best writing quality               |

Model selection is configurable per repository so users can optimize for cost or quality.

### Prompt Engineering Principles

- **System prompt**: defines the role (documentation maintainer), constraints (preserve style, minimal changes), and output format.
- **Diff summarization**: for large diffs (>4k tokens), summarize using a fast model first to stay within context limits.
- **Few-shot examples**: include examples of good doc updates in the system prompt.
- **Structured output**: use Zod schemas with Vercel AI SDK's `generateObject` for reliable parsing.

### Cost Control

- Token budgets per run (configurable, with sensible defaults).
- Skip analysis for changes to files matching ignore patterns.
- Cache doc tree structures to reduce redundant fetches.
- Track token usage per run in `analysis_runs.token_usage`.

---

## 10. GitHub App

synk ai is distributed as a **GitHub App**, which provides:

- **Webhook delivery** for push and PR events.
- **Installation-scoped tokens** for repo access (no PATs needed).
- **Granular permissions**: contents (read/write), pull requests (read/write), metadata (read).
- **Marketplace listing** for distribution (future).

### Required Permissions

| Permission      | Access     | Reason                              |
| --------------- | ---------- | ----------------------------------- |
| Contents        | Read/Write | Read code + docs, create branches   |
| Pull Requests   | Read/Write | Read PR diffs, open doc PRs         |
| Metadata        | Read       | List repos, branches                |

### Webhook Events

| Event              | Usage                                    |
| ------------------ | ---------------------------------------- |
| `push`             | Trigger on direct pushes to main branch  |
| `pull_request`     | Trigger when PRs are merged              |
| `installation`     | Track app installs/uninstalls            |

---

## 11. Configuration

Users configure synk ai via a `.synk-ai.yml` file in the repository root:

```yaml
# .synk-ai.yml
docs:
  framework: auto            # auto | nextra | fumadocs | docusaurus | markdown
  path: docs/                # path to docs within this repo
  repo: org/my-docs          # if docs live in a separate repo
  branch: main               # target branch for doc PRs

triggers:
  branches:
    - main
    - release/*
  ignore_paths:
    - "**/*.test.ts"
    - "**/*.spec.ts"
    - "**/fixtures/**"
    - "package-lock.json"

ai:
  model: auto                 # auto | specific model ID
  custom_instructions: |      # optional extra context for the AI
    Our API docs follow OpenAPI conventions.
    Always include code examples in TypeScript.

pr:
  labels:
    - documentation
    - synk-ai
  draft: false
  assignees: []
  reviewers: []
```

If no `.synk-ai.yml` exists, synk ai uses auto-detection with sensible defaults.

---

## 12. Dashboard (Web App)

A Next.js dashboard provides visibility and control:

### Pages

| Page               | Purpose                                                    |
| ------------------ | ---------------------------------------------------------- |
| `/`                | Overview: recent runs, stats, active repos                 |
| `/repos`           | List of connected repositories, toggle active/inactive     |
| `/repos/[id]`      | Repo detail: run history, configuration editor, test run   |
| `/runs/[id]`       | Run detail: diff, AI reasoning, generated changes, PR link |
| `/settings`        | Account settings, API keys, billing                        |

### Auth

- GitHub OAuth (via the GitHub App) for login.
- Session management via secure HTTP-only cookies.

---

## 13. Deployment

### Target: Containerized Deployment

All three services (API, Worker, Web) are containerized with individual Dockerfiles and orchestrated via `docker-compose.yml` for local dev and a container platform for production.

### Recommended Production Platforms

| Platform         | Why                                                       |
| ---------------- | --------------------------------------------------------- |
| **Railway**      | Simple, supports Docker, managed Postgres + Redis, good DX |
| **Fly.io**       | Edge deployment, good for webhook latency                  |
| **AWS ECS/Fargate** | Scalable, full control, suitable for growth             |

### Service Topology

```
┌─────────────────────────────────────────────────────┐
│                  Load Balancer / CDN                 │
│                  (Cloudflare / AWS ALB)              │
└───────┬──────────────────────┬──────────────────────┘
        │                      │
        ▼                      ▼
┌───────────────┐    ┌─────────────────┐
│  API Server   │    │  Web Dashboard  │
│  (container)  │    │  (container)    │
│  port 3001    │    │  port 3000      │
└───────┬───────┘    └─────────────────┘
        │ enqueue
        ▼
┌───────────────┐
│  Worker       │
│  (container)  │    ←── scales horizontally
└───────┬───────┘
        │
   ┌────┴─────┐
   ▼          ▼
┌──────┐  ┌───────┐
│Postgres│ │ Redis │
│(managed)│ │(managed)│
└──────┘  └───────┘
```

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/synkai

# Redis
REDIS_URL=redis://host:6379

# GitHub App
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY=base64:...
GITHUB_WEBHOOK_SECRET=whsec_...
GITHUB_CLIENT_ID=Iv1.xxx
GITHUB_CLIENT_SECRET=xxx

# AI
OPENROUTER_API_KEY=sk-or-...

# App
APP_URL=https://app.synk-ai.dev
API_URL=https://api.synk-ai.dev
NODE_ENV=production
```

### CI/CD

GitHub Actions with the following pipeline:

```
Push to main
    ↓
Lint (Biome) + Type Check (tsc) + Test (Bun test)  [parallel]
    ↓
Build Docker images
    ↓
Push to container registry
    ↓
Deploy to staging (auto)
    ↓
Deploy to production (manual approval)
```

---

## 14. Observability

| Concern        | Tool                    | Notes                                    |
| -------------- | ----------------------- | ---------------------------------------- |
| Logging        | Pino                    | Structured JSON logs, built into Hono    |
| Error Tracking | Sentry                  | Captures exceptions with context         |
| Metrics        | OpenTelemetry → Grafana | Request latency, queue depth, AI latency |
| Job Monitoring | BullMQ Dashboard (Bull Board) | Queue health, failed jobs, retries  |

---

## 15. Security Considerations

- **Webhook signature verification**: every incoming webhook is verified against the GitHub App secret using HMAC-SHA256 before processing.
- **Installation tokens**: scoped to the specific installation, short-lived, and never stored.
- **Secret management**: all secrets stored in environment variables, never in code or database.
- **Rate limiting**: API endpoints are rate-limited per installation to prevent abuse.
- **Content isolation**: each job processes only the data it needs; no cross-tenant data access.
- **Least privilege**: the GitHub App requests only the minimum permissions required.

---

## 16. MVP Scope & Milestones

### Milestone 1 — Foundation

- [ ] Monorepo setup (Turborepo, bun, shared config)
- [ ] Database schema + migrations (Drizzle)
- [ ] GitHub App registration and auth flow
- [ ] Webhook ingestion endpoint with signature verification
- [ ] BullMQ job queue setup
- [ ] Docker Compose for local dev (Postgres + Redis)

### Milestone 2 — Core Pipeline

- [ ] Diff extraction from GitHub API
- [ ] Documentation auto-detection (plain markdown + Nextra)
- [ ] AI triage prompt + structured output
- [ ] AI doc generation prompt
- [ ] PR creation via GitHub API
- [ ] End-to-end pipeline test with a real repo

### Milestone 3 — Configuration & Adapters

- [ ] `.synk-ai.yml` parsing and validation
- [ ] Fumadocs adapter
- [ ] Docusaurus adapter
- [ ] Separate-repo documentation support
- [ ] Per-repo configuration in dashboard

### Milestone 4 — Dashboard & Polish

- [ ] GitHub OAuth login
- [ ] Repository listing and activation
- [ ] Run history and detail views
- [ ] Manual trigger ("re-analyze this commit")
- [ ] Error handling, retries, and dead-letter queue

### Milestone 5 — Production Readiness

- [ ] CI/CD pipeline
- [ ] Staging environment
- [ ] Observability (logging, error tracking, metrics)
- [ ] Rate limiting and abuse prevention
- [ ] Documentation for synk ai itself
