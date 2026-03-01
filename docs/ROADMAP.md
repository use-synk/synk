# synk ai — MVP Roadmap

> Detailed, issue-level breakdown for building a functional MVP.
> Each issue is scoped to be completable independently. Issues within a phase can be parallelized unless explicitly marked as blocked.
> Refer to [PLAN.md](./PLAN.md) for architecture context.

---

## Phase 1 — Project Foundation

Everything needed before writing business logic. The goal is a working monorepo where any developer can run `bun install && bun dev` and have a fully functional local environment.

---

### 1.1 Initialize monorepo with Turborepo and Bun

**Labels:** `infrastructure`, `priority:critical`

Initialize the root project with bun workspaces and Turborepo. Set up the workspace structure with placeholder packages.

**Acceptance criteria:**

- Root `package.json` `workspaces` defines `apps/*` and `packages/*`
- `turbo.json` configures `build`, `dev`, `lint`, `typecheck`, and `test` pipelines
- Root `package.json` with shared dev scripts
- `.npmrc` with `shamefully-hoist=false` and `strict-peer-dependencies=true`
- Bun version pinned in root `package.json` via `packageManager`
- Root `.gitignore` covering node_modules, dist, .env, .turbo

---

### 1.2 Configure shared TypeScript and Biome

**Labels:** `infrastructure`, `priority:critical`
**Blocked by:** 1.1

Create the `packages/config` package containing shared configurations.

**Acceptance criteria:**

- `tsconfig.base.json` with strict mode, ES2023 target, `noUncheckedIndexedAccess`, path aliases
- `biome.json` with formatting (tabs vs spaces, line width) and linting rules
- All workspace packages extend from `tsconfig.base.json`
- `bun lint` and `bun typecheck` work from root
- `bun format` works from root via Biome

---

### 1.3 Set up `packages/shared`

**Labels:** `infrastructure`, `priority:high`
**Blocked by:** 1.2

Shared types, constants, and utility functions used across all apps and packages.

**Acceptance criteria:**

- Package builds and exports correctly
- Shared Zod schemas for common types (e.g., `TriggerType`, `RunStatus`)
- Shared env validation utility (using Zod + `process.env`)
- Exports are consumed correctly by other packages in the workspace

---

### 1.4 Set up `packages/db` — Prisma schema and migrations

**Labels:** `database`, `priority:critical`
**Blocked by:** 1.2

Define the PostgreSQL schema using Prisma ORM and create the initial migration.

**Acceptance criteria:**

- prisma config (`prisma.config.ts`) reading `DATABASE_URL` from env
- Schema files defining:
  - `installations` table (id, github_id, account_login, account_type, status, timestamps)
  - `repositories` table (id, installation_id FK, github_id, full_name, default_branch, docs_config JSONB, is_active, timestamps)
  - `analysis_runs` table (id, repository_id FK, trigger_type, trigger_ref, commit_sha, status, result JSONB, docs_affected, pr_number, pr_url, token_usage JSONB, error, started_at, completed_at, timestamps)
- Proper indexes on: `installations.github_id`, `repositories.github_id`, `repositories.installation_id`, `analysis_runs.repository_id`, `analysis_runs.status`
- `migrate.ts` script that applies migrations programmatically
- Exported db client factory, schema types, and typed query helpers
- `bun db:generate`, `bun db:migrate`, `bun db:studio` scripts

---

### 1.5 Docker Compose for local development

**Labels:** `infrastructure`, `priority:critical`
**Blocked by:** 1.1

Provide a `docker-compose.yml` for local development dependencies.

**Acceptance criteria:**

- PostgreSQL 16 service with persistent volume and healthcheck
- Redis 7 (Valkey) service with persistent volume and healthcheck
- Sensible defaults (ports 5432 and 6379, user/password for local dev)
- `.env.example` file documenting all required environment variables
- `bun docker:up` and `bun docker:down` convenience scripts in root `package.json`

---

### 1.6 Set up `apps/api` — Hono server scaffold

**Labels:** `api`, `priority:critical`
**Blocked by:** 1.2

Scaffold the Hono API server with basic middleware.

**Acceptance criteria:**

- Hono app with Bun runtime entrypoint
- Middleware: request ID generation, structured logging (Pino), error handler, CORS
- Health check endpoint: `GET /health` returning `{ status: "ok", version: "<git-sha>" }`
- Graceful shutdown handling (SIGTERM/SIGINT)
- `bun dev` starts the server with hot reload
- Server reads config from environment variables via shared env validation

---

### 1.7 Set up `apps/worker` — BullMQ worker scaffold

**Labels:** `worker`, `priority:critical`
**Blocked by:** 1.3, 1.5

Scaffold the BullMQ worker process.

**Acceptance criteria:**

- Redis connection with retry logic and connection error handling
- Queue definition: `analyze-changes` queue with configurable concurrency
- Placeholder job processor that logs the job payload and completes
- Graceful shutdown: stops accepting new jobs, waits for active jobs to finish
- `bun dev` starts the worker with hot reload
- Structured logging (Pino) with job context (job ID, attempt number)

---

### 1.8 Set up Bun test and write first tests

**Labels:** `testing`, `priority:high`
**Blocked by:** 1.2

Configure the test framework across the monorepo.

**Acceptance criteria:**

- Bun test config at root and per-package overrides where needed
- Shared test utilities package or config (e.g., custom matchers, test fixtures)
- Coverage reporting configured (v8 provider, threshold at 70% for MVP)
- At least one unit test per existing package to validate the setup
- `bun test` runs all tests from root, `bun test --filter=<package>` runs per-package
- Turbo caches test results correctly

---

## Phase 2 — GitHub Integration

Connect synk ai to GitHub as a GitHub App. At the end of this phase, the API receives webhooks, validates them, and the worker can read repository data.

---

### 2.1 Register GitHub App and implement auth

**Labels:** `github`, `priority:critical`
**Blocked by:** 1.6

Create the `packages/github` package with GitHub App authentication.

**Acceptance criteria:**

- GitHub App registered (document the manual steps in a `docs/github-app-setup.md`)
- `createAppOctokit()` factory that authenticates as the App (JWT)
- `createInstallationOctokit(installationId)` factory that returns an installation-scoped client
- Both factories accept credentials from environment variables
- Unit tests with mocked auth responses

---

### 2.2 Webhook ingestion endpoint

**Labels:** `api`, `github`, `priority:critical`
**Blocked by:** 1.6, 2.1

Implement the webhook receiver in the API server.

**Acceptance criteria:**

- `POST /api/v1/webhooks/github` endpoint
- Webhook signature verification using HMAC-SHA256 against `GITHUB_WEBHOOK_SECRET`
- Rejects requests with invalid or missing signatures (401)
- Parses event type from `X-GitHub-Event` header
- Handles `installation` events: creates/updates/deletes installation records in DB
- Handles `push` events: validates branch, checks repo is active, enqueues job
- Handles `pull_request` events (merged only): validates, checks, enqueues job
- Returns 200 immediately after enqueuing (webhook timeout is 10s)
- Ignores unhandled event types with 200 (no-op)
- Integration tests with fixture payloads from GitHub

---

### 2.3 Installation lifecycle management

**Labels:** `github`, `database`, `priority:high`  
**Blocked by:** 1.4, 2.2

Handle GitHub App installation and uninstallation events.

**Acceptance criteria:**

- On `installation.created`: insert installation record, fetch and insert all repos granted to the installation
- On `installation.deleted`: soft-delete installation, deactivate all associated repos
- On `installation_repositories.added`: insert new repos
- On `installation_repositories.removed`: deactivate removed repos
- All operations are idempotent (safe to replay)
- Unit tests covering each event scenario

---

### 2.4 Diff extraction service

**Labels:** `github`, `priority:critical`
**Blocked by:** 2.1

Implement diff fetching and parsing in `packages/github`.

**Acceptance criteria:**

- `fetchPushDiff(octokit, owner, repo, before, after)` — uses compare API for push events
- `fetchPRDiff(octokit, owner, repo, prNumber)` — uses PR files API for merged PRs
- Both return a normalized array: `{ filename, status, additions, deletions, patch, previousFilename }`
- Handles pagination for PRs with >100 changed files
- Handles renamed files correctly
- `filterDiff(files, ignorePatterns)` — removes files matching configurable glob patterns
- Default ignore patterns: lock files, `node_modules`, `dist`, `*.min.js`, images, fonts
- Unit tests with fixture diffs

---

### 2.5 Repository tree fetching

**Labels:** `github`, `priority:high`
**Blocked by:** 2.1

Fetch the file tree and file contents from a repository via the GitHub API.

**Acceptance criteria:**

- `fetchRepoTree(octokit, owner, repo, ref)` — returns flat file list using Git Trees API (recursive)
- `fetchFileContent(octokit, owner, repo, path, ref)` — returns decoded file content using Contents API
- `fetchMultipleFiles(octokit, owner, repo, paths, ref)` — batch fetches, respects rate limits
- Handles files >1MB (uses Blob API fallback)
- Rate limit awareness: reads `x-ratelimit-remaining` headers, backs off proactively
- Unit tests with mocked API responses

---

## Phase 3 — Documentation Adapters

Teach synk ai to find and understand documentation in a repository. At the end of this phase, given a repo, the system can identify the doc framework, locate doc files, and describe the conventions.

---

### 3.1 Define adapter interface and registry

**Labels:** `adapters`, `priority:critical`
**Blocked by:** 1.3

Create the `packages/doc-adapters` package with the shared adapter contract.

**Acceptance criteria:**

- TypeScript interface `DocAdapter` with methods:
  - `detect(tree: RepoFile[]): Promise<boolean>`
  - `getDocPaths(config: DocsConfig): string[]` (returns glob patterns)
  - `parseStructure(files: DocFile[]): DocTree`
  - `getConventions(): FrameworkConventions` (returns AI-consumable description)
  - `validateOutput(content: string, filePath: string): ValidationResult`
- `DocTree` type representing hierarchical doc structure (sections, pages, ordering)
- `FrameworkConventions` type with fields: frontmatter format, component patterns, linking conventions, file naming rules
- Adapter registry: `getAdapter(framework: string): DocAdapter` and `detectAdapter(tree: RepoFile[]): DocAdapter`
- Detection runs adapters in priority order, falls back to plain markdown

---

### 3.2 Plain Markdown adapter (fallback)

**Labels:** `adapters`, `priority:critical`
**Blocked by:** 3.1

Implement the fallback adapter for repositories using plain Markdown documentation.

**Acceptance criteria:**

- Detects: any repo with `docs/` directory, `README.md`, or `*.md` files in common locations
- Doc paths: `docs/**/*.md`, `docs/**/*.mdx`, `README.md`
- Parses structure from directory hierarchy and heading structure
- Conventions: standard Markdown, no special frontmatter required
- Validation: checks for valid Markdown syntax, no broken relative links
- Unit tests with sample repo trees

---

### 3.3 Nextra adapter

**Labels:** `adapters`, `priority:high`
**Blocked by:** 3.1

Implement the Nextra-specific adapter.

**Acceptance criteria:**

- Detects: `nextra` or `nextra-theme-docs` in `package.json` dependencies
- Doc paths: reads from `next.config.mjs` or defaults to `pages/docs/**/*.mdx`
- Parses `_meta.json` files to understand page ordering and navigation structure
- Conventions: MDX format, Nextra-specific frontmatter (`title`, `description`), Nextra components (`<Callout>`, `<Tabs>`, `<Steps>`)
- Validation: checks frontmatter has required fields, MDX parses without errors
- Unit tests with real Nextra project fixture

---

### 3.4 Fumadocs adapter

**Labels:** `adapters`, `priority:medium`
**Blocked by:** 3.1

Implement the Fumadocs-specific adapter.

**Acceptance criteria:**

- Detects: `fumadocs-core` or `fumadocs-ui` in `package.json` dependencies
- Doc paths: reads from `source.config.ts` or defaults to `content/docs/**/*.mdx`
- Parses `meta.json` files for navigation and ordering
- Conventions: MDX format, Fumadocs frontmatter (`title`, `description`, `icon`), Fumadocs components
- Validation: checks frontmatter, valid MDX
- Unit tests with sample Fumadocs fixture

---

### 3.5 Auto-detection and config resolution

**Labels:** `adapters`, `priority:high`
**Blocked by:** 3.2, 3.3, 3.4

Implement the detection orchestrator and `.synk-ai.yml` config loading.

**Acceptance criteria:**

- `detectFramework(tree, packageJson)` runs all adapters and returns the best match
- `.synk-ai.yml` parser using Zod schema with sensible defaults for all optional fields
- Config merging: file config > database config > auto-detected defaults
- If `.synk-ai.yml` specifies `framework: auto`, run auto-detection
- Store resolved config back to `repositories.docs_config` for caching
- Handles separate-repo config: resolves `docs.repo` to a different repository
- Unit tests for detection priority, config merging, and edge cases

---

## Phase 4 — AI Engine

Build the AI-powered analysis and generation pipeline. At the end of this phase, given a diff and a doc tree, the system can determine if docs need updating and produce the updated content.

---

### 4.1 Set up OpenRouter client via Vercel AI SDK

**Labels:** `ai`, `priority:critical`
**Blocked by:** 1.3

Create the `packages/ai` package with the OpenRouter integration.

**Acceptance criteria:**

- OpenRouter provider configured via Vercel AI SDK's `createOpenRouter` (or custom provider)
- Client factory accepting `OPENROUTER_API_KEY` from env
- Model selection helper: maps logical names (`triage`, `generate`) to model IDs, with configurable overrides
- Token counting utility for estimating prompt size before sending
- Request/response logging (sanitized — no full content, just metadata and token counts)
- Retry logic with exponential backoff for transient failures (429, 500, 503)
- Unit tests with mocked provider

---

### 4.2 Diff summarization for large changesets

**Labels:** `ai`, `priority:medium`
**Blocked by:** 4.1

Implement a preprocessing step that summarizes large diffs to fit within context limits.

**Acceptance criteria:**

- `summarizeDiff(diff, maxTokens)` function
- If diff is within budget, return as-is
- If diff exceeds budget:
  1. Prioritize files most likely to affect docs (source code > config > tests)
  2. Truncate large patches to show only additions and the surrounding context
  3. If still too large, use a fast AI model to produce a structured summary
- Summary preserves: which files changed, what functions/endpoints/types were added/modified/removed, semantic meaning of changes
- Unit tests with various diff sizes

---

### 4.3 AI triage — does this change affect docs?

**Labels:** `ai`, `priority:critical`
**Blocked by:** 4.1, 4.2

Implement the triage step that classifies whether a code change requires documentation updates.

**Acceptance criteria:**

- Zod schema for structured output: `{ needsUpdate: boolean, confidence: number, affectedDocFiles: string[], reasoning: string }`
- System prompt that instructs the AI to act as a documentation reviewer
- User prompt template that includes: the diff (or summary), the doc file tree, the framework conventions, and any custom instructions
- Uses `generateObject` from Vercel AI SDK for reliable structured output
- Confidence threshold is configurable (default: 0.7) — below threshold, skip update
- Tracks token usage (prompt + completion) and returns it alongside the result
- Integration test with a sample diff + doc tree expecting a correct triage result

---

### 4.4 AI doc generation — produce updated content

**Labels:** `ai`, `priority:critical`
**Blocked by:** 4.3

Implement the generation step that produces updated documentation.

**Acceptance criteria:**

- For each affected doc file identified by triage:
  - Fetch the current file content
  - Construct a generation prompt with: original content, relevant diff sections, framework conventions, style preservation instructions
- Zod schema for output: `{ updatedContent: string, changeDescription: string }`
- System prompt emphasizes: minimal changes, preserve existing style and tone, only update what's affected by the code change, do not add unrelated content
- Post-processing: normalize whitespace, ensure trailing newline, validate via adapter's `validateOutput`
- If generation produces no meaningful diff from the original, skip the file
- Tracks token usage per file
- Integration test with sample input expecting reasonable doc update

---

### 4.5 Prompt management and versioning

**Labels:** `ai`, `priority:medium`
**Blocked by:** 4.3, 4.4

Organize prompts for maintainability and iteration.

**Acceptance criteria:**

- Prompts stored as template functions in `packages/ai/src/prompts/`
- Separate files: `triage.ts`, `generation.ts`, `summarization.ts`
- Each prompt function accepts typed parameters and returns the complete message array
- Prompt versioning: each prompt exports a `VERSION` constant, logged with every AI call for debugging
- Unit tests asserting prompt structure (correct roles, no empty messages, required variables populated)

---

## Phase 5 — Core Pipeline Orchestration

Wire together the webhook handler, diff extraction, doc discovery, AI engine, and PR creation into the end-to-end pipeline.

---

### 5.1 Implement the `analyze-changes` job processor

**Labels:** `worker`, `pipeline`, `priority:critical`
**Blocked by:** 2.4, 3.5, 4.3, 4.4

Implement the main job that orchestrates the full analysis pipeline.

**Acceptance criteria:**

- Job payload: `{ installationId, repositoryId, trigger: { type, ref, commitSha, prNumber? } }`
- Creates an `analysis_runs` record with status `running` at start
- Pipeline steps:
  1. Create installation Octokit
  2. Fetch diff (push or PR)
  3. Filter diff by ignore patterns
  4. If no relevant changes → mark run as `skipped`, exit
  5. Resolve docs config (DB cache → `.synk-ai.yml` → auto-detect)
  6. Fetch doc tree and relevant doc file contents
  7. Run AI triage
  8. If `needsUpdate` is false → mark run as `completed` (no docs affected), exit
  9. Run AI generation for each affected file
  10. If no meaningful changes produced → mark run as `completed`, exit
  11. Create PR (delegated to issue 5.2)
  12. Mark run as `completed`, store PR URL
- On failure: mark run as `failed`, store error message, re-throw for BullMQ retry
- Updates `analysis_runs.token_usage` with aggregate token counts
- Structured logging at each step with run ID and timing

---

### 5.2 PR creation service

**Labels:** `github`, `pipeline`, `priority:critical`
**Blocked by:** 2.1, 2.5

Implement the service that creates branches and opens PRs with doc updates.

**Acceptance criteria:**

- `createDocUpdatePR(octokit, params)` function accepting:
  - `owner`, `repo`, `baseBranch`
  - `files: { path: string, content: string }[]`
  - `triggerInfo: { type, ref, commitSha, prNumber?, prTitle? }`
- Creates a branch: `synk-ai/docs-<short-sha>-<timestamp>`
- Creates or updates files on the branch via the Git Trees + Commits API (single commit, not sequential file updates)
- Opens a PR with:
  - Title: `docs: update documentation for <concise change summary>` (≤72 chars)
  - Body template:
    ```
    ## What changed
    <AI-generated reasoning for each file>

    ## Triggered by
    <Link to the commit or PR that triggered this>

    ## Files updated
    - `path/to/doc1.md`
    - `path/to/doc2.md`

    ---
    *This PR was automatically generated by [synk ai](https://synk-ai.dev). Review carefully before merging.*
    ```
  - Labels: configurable, defaults to `synk-ai`, `documentation`
  - Assignees and reviewers: from config if specified
  - Draft mode: from config, defaults to `false`
- Handles separate-repo docs: creates PR in the docs repo, references the source commit in the body
- Returns `{ prNumber, prUrl, branchName }`
- Unit tests with mocked GitHub API

---

### 5.3 Job retry and error handling strategy

**Labels:** `worker`, `priority:high`
**Blocked by:** 5.1

Configure robust error handling and retry behavior.

**Acceptance criteria:**

- BullMQ retry config: 3 attempts, exponential backoff (30s, 2min, 10min)
- Error classification:
  - **Retryable**: GitHub API 5xx, OpenRouter 429/5xx, Redis connection errors → retry with backoff
  - **Non-retryable**: GitHub 404 (repo deleted), 401 (auth revoked), invalid payload → fail immediately
- Failed jobs after exhausting retries move to a dead-letter queue (`analyze-changes-dlq`)
- `analysis_runs` record updated on each attempt with attempt number and error
- Alert-worthy failures (auth revoked, repeated failures for same repo) logged at `error` level with structured metadata
- Unit tests for retry classification logic

---

### 5.4 Duplicate and concurrent run prevention

**Labels:** `worker`, `pipeline`, `priority:medium`
**Blocked by:** 5.1

Prevent redundant analysis when multiple events arrive for the same changes.

**Acceptance criteria:**

- Deduplication by `repository_id + commit_sha`: if an `analysis_runs` record already exists for the same commit (any status), skip enqueueing
- Concurrency control: max 1 active job per repository (BullMQ job groups or custom lock in Redis)
- If a new event arrives while a run is active for the same repo, queue it — it will run after the current one completes
- Rapid successive pushes: only the latest commit is analyzed (coalesce within a 30s window)
- Unit tests for deduplication and concurrency scenarios

---

## Phase 6 — Dashboard

Build a minimal but functional web dashboard for repo management and run visibility.

---

### 6.1 Set up Next.js app with GitHub OAuth

**Labels:** `web`, `priority:high`
**Blocked by:** 2.1

Scaffold `apps/web` with authentication.

**Acceptance criteria:**

- Next.js 15 with App Router
- GitHub OAuth flow using the GitHub App's OAuth credentials
- Session management: encrypted HTTP-only cookies (using `iron-session` or similar)
- Auth middleware protecting all routes except `/login` and `/api/auth/`*
- `/login` page with "Sign in with GitHub" button
- `/api/auth/callback` handles the OAuth code exchange
- Session stores: GitHub user ID, login, avatar URL, access token
- Logout endpoint that clears the session

---

### 6.2 API routes for dashboard data

**Labels:** `api`, `web`, `priority:high`
**Blocked by:** 1.4, 6.1

Add REST endpoints to the API server that the dashboard consumes.

**Acceptance criteria:**

- `GET /api/installations/:installationId/repos` — list repos for an installation (with pagination)
- `PATCH /api/repos/:repoId` — toggle `is_active`, update `docs_config`
- `GET /api/repos/:repoId/runs` — list analysis runs (with pagination, filters by status)
- `GET /api/runs/:runId` — run detail (full result, AI reasoning, PR link)
- `POST /api/repos/:repoId/runs` — manually trigger a run for a specific commit
- All endpoints validate that the authenticated user has access to the installation
- Request validation via Zod
- Consistent error response format: `{ error: { code, message } }`

---

### 6.3 Repository list and activation page

**Labels:** `web`, `priority:high`
**Blocked by:** 6.2

Build the repository management view.

**Acceptance criteria:**

- `/repos` page listing all repositories across the user's installations
- Each repo shows: name, framework (detected or configured), active/inactive status, last run date
- Toggle switch to activate/deactivate a repo
- Search/filter by repo name
- Empty state when no repos are connected with a link to install the GitHub App
- Loading states and error handling

---

### 6.4 Run history and detail pages

**Labels:** `web`, `priority:high`
**Blocked by:** 6.2

Build the run visibility views.

**Acceptance criteria:**

- `/repos/[id]` page showing:
  - Repo info and current config
  - Run history table with: trigger (commit/PR), date, status badge, docs affected (yes/no), PR link
  - Pagination
- `/runs/[id]` page showing:
  - Run metadata: trigger, timing, status, token usage
  - AI triage result: reasoning, confidence, affected files
  - Generated changes: side-by-side diff view for each updated file
  - Link to the created PR (if any)
  - Error details (if failed)
- Status badges: `running` (blue), `completed` (green), `skipped` (gray), `failed` (red)

---

### 6.5 Overview dashboard page

**Labels:** `web`, `priority:medium`
**Blocked by:** 6.3, 6.4

Build the landing page after login.

**Acceptance criteria:**

- `/` (dashboard home) showing:
  - Summary stats: total runs (last 30 days), PRs created, PRs merged, active repos
  - Recent runs list (last 10) with quick-access links
  - Repos requiring attention (failed runs, inactive repos with changes)
- Stats fetched from a single aggregation API endpoint
- Responsive layout

---

## Phase 7 — Deployment & CI/CD

Make synk ai deployable and set up automated quality gates.

---

### 7.1 Dockerfiles for all services

**Labels:** `infrastructure`, `deployment`, `priority:high`
**Blocked by:** 1.6, 1.7, 6.1

Create production-optimized Dockerfiles.

**Acceptance criteria:**

- Multi-stage Dockerfiles for `apps/api`, `apps/worker`, `apps/web`
- Stage 1: install dependencies (leveraging `bun install --frozen-lockfile --production` for pruned installs)
- Stage 2: build TypeScript
- Stage 3: production image with only runtime dependencies and built artifacts
- Base image: `node:22-slim`
- Non-root user in production stage
- `.dockerignore` files to exclude tests, docs, source maps
- Images build successfully: `docker build -t synk-ai-api apps/api`
- Image sizes under 200MB each

---

### 7.2 Docker Compose for full-stack local testing

**Labels:** `infrastructure`, `priority:medium`
**Blocked by:** 7.1

Extend `docker-compose.yml` for running the full stack locally.

**Acceptance criteria:**

- `docker-compose.yml` (dev): Postgres + Redis only (apps run natively for hot reload)
- `docker-compose.prod.yml`: all services (API, Worker, Web, Postgres, Redis) for local integration testing
- Networking: all services on a shared network, services reference each other by hostname
- Environment variables via `.env` file
- `bun docker:prod` starts the full stack
- Health checks on all services
- Migration runs automatically on API startup (or via init container)

---

### 7.3 GitHub Actions CI pipeline

**Labels:** `ci`, `priority:high`
**Blocked by:** 1.8

Set up the continuous integration workflow.

**Acceptance criteria:**

- Triggers on: push to `main`, pull requests targeting `main`
- Jobs (parallelized where possible):
  1. **Lint**: `bun lint` (Biome)
  2. **Typecheck**: `bun typecheck` (tsc --noEmit)
  3. **Test**: `bun test` (Bun test) with Postgres service container for integration tests
  4. **Build**: `bun build` (Turborepo)
- Caching: bun store, Turborepo remote cache (or local), Docker layer cache
- Status checks required for PR merges
- Concurrency: cancel in-progress runs for the same PR

---

### 7.4 GitHub Actions CD pipeline

**Labels:** `cd`, `deployment`, `priority:medium`
**Blocked by:** 7.1, 7.3

Set up continuous deployment.

**Acceptance criteria:**

- Triggers on: push to `main` (after CI passes)
- Steps:
  1. Build Docker images for API, Worker, Web
  2. Tag with commit SHA and `latest`
  3. Push to container registry (GitHub Container Registry)
  4. Deploy to staging automatically (via Railway API, Fly.io CLI, or similar)
  5. Production deployment: manual trigger (workflow_dispatch) or tag-based
- Deployment notifications (GitHub deployment status)
- Rollback instructions documented

---

### 7.5 Production environment setup

**Labels:** `deployment`, `priority:high`
**Blocked by:** 7.4

Provision and configure the production environment.

**Acceptance criteria:**

- Managed PostgreSQL instance provisioned (Railway, Neon, or AWS RDS)
- Managed Redis instance provisioned (Railway, Upstash, or AWS ElastiCache)
- Three services deployed: API, Worker, Web
- Custom domain configured with TLS (e.g., `app.synk-ai.dev`, `api.synk-ai.dev`)
- Environment variables configured in the hosting platform (never in code)
- GitHub App webhook URL updated to point to production API
- Smoke test: install the GitHub App on a test repo, push a change, verify the pipeline runs end-to-end

---

## Phase 8 — Observability & Hardening

Make the system production-ready with logging, monitoring, and abuse prevention.

---

### 8.1 Structured logging

**Labels:** `observability`, `priority:high`
**Blocked by:** 1.6, 1.7

Ensure consistent, queryable logs across all services.

**Acceptance criteria:**

- Pino logger configured in all services with:
  - JSON output in production, pretty-print in development
  - Log level configurable via `LOG_LEVEL` env var
  - Request ID propagation (from API middleware through to worker via job metadata)
  - Sensitive field redaction (tokens, keys)
- Contextual child loggers: API routes include method/path/status, Worker includes jobId/runId/repoName
- Log levels used consistently: `error` for failures needing attention, `warn` for recoverable issues, `info` for business events (run started, PR created), `debug` for detailed flow

---

### 8.2 Error tracking with Sentry

**Labels:** `observability`, `priority:medium`
**Blocked by:** 8.1

Integrate Sentry for error aggregation and alerting.

**Acceptance criteria:**

- Sentry SDK initialized in all three services (API, Worker, Web)
- Unhandled exceptions and rejections captured automatically
- Additional context attached: user/installation ID, repository name, run ID
- Source maps uploaded during CI build for readable stack traces
- Environment and release tags set correctly
- PII scrubbing configured (no tokens or webhook payloads in breadcrumbs)
- Alert rules: notify on new error types, spike in error rate

---

### 8.3 Rate limiting and abuse prevention

**Labels:** `security`, `priority:high`
**Blocked by:** 1.6, 1.7

Protect the system from excessive usage.

**Acceptance criteria:**

- API rate limiting per installation: 100 requests/minute (configurable)
- Worker: max runs per repository per hour (default: 20) — additional events queued but delayed
- Global circuit breaker on OpenRouter: if error rate >50% in 5min window, pause new AI calls for 2min
- BullMQ rate limiter: max 10 concurrent AI calls globally to respect OpenRouter rate limits
- Rate limit responses include `Retry-After` header
- Abuse logging: flag installations exceeding 10x the normal rate

---

### 8.4 BullMQ dashboard (Bull Board)

**Labels:** `observability`, `priority:low`
**Blocked by:** 1.7

Add a queue monitoring UI.

**Acceptance criteria:**

- Bull Board mounted at `/admin/queues` in the API server
- Protected by a basic admin auth check (env-configured admin token or installation-level admin)
- Shows: active, waiting, completed, failed, and delayed jobs
- Allows: retry failed jobs, view job data, clean completed jobs
- DLQ visible and manageable

---

## Phase 9 — End-to-End Testing & Polish

Validate the entire flow and fix edge cases before shipping.

---

### 9.1 End-to-end integration test suite

**Labels:** `testing`, `priority:critical`
**Blocked by:** 5.1, 5.2

Automated tests that exercise the full pipeline.

**Acceptance criteria:**

- Test fixtures: sample repositories with known doc structures (markdown, Nextra)
- Test scenarios:
  1. Push with doc-relevant changes → PR created with correct updates
  2. Push with non-doc changes (e.g., only test files) → run skipped, no PR
  3. PR merge trigger → same pipeline as push
  4. Separate-repo docs → PR opened in correct repo
  5. Repository with `.synk-ai.yml` config → config respected
  6. Large diff (>100 files) → summarization kicks in, pipeline completes
  7. AI returns `needsUpdate: false` → no PR, run marked appropriately
- GitHub API calls mocked (Octokit mock or MSW)
- OpenRouter calls mocked with realistic responses
- Database is real (test Postgres via Docker)
- Tests run in CI

---

### 9.2 Error scenario and edge case testing

**Labels:** `testing`, `priority:high`
**Blocked by:** 5.3, 9.1

Test failure modes and recovery.

**Acceptance criteria:**

- Test scenarios:
  1. GitHub API returns 404 (repo deleted mid-run) → run fails gracefully, no retry
  2. GitHub API returns 403 (permissions revoked) → run fails, installation flagged
  3. OpenRouter timeout → retries, eventually fails
  4. OpenRouter returns malformed JSON → structured output retry, then fail
  5. Generated content is identical to original → no PR created, run marked as "no changes needed"
  6. Webhook replay (duplicate delivery) → deduplicated, only one run
  7. Worker crashes mid-run → run stays as `running`, stale run cleanup picks it up
  8. Database connection lost during job → job fails, retried on next attempt
- Stale run cleanup: worker startup scans for `running` runs older than 30min and marks them as `failed`

---

### 9.3 README and contributor documentation

**Labels:** `docs`, `priority:medium`
**Blocked by:** 7.2

Write documentation for developers setting up the project.

**Acceptance criteria:**

- `README.md` with:
  - Project overview and value proposition
  - Architecture diagram (from PLAN.md, simplified)
  - Quick start guide: prerequisites, clone, install, docker compose up, configure env, run dev
  - How to set up a development GitHub App
  - How to run tests
  - Project structure explanation
- `CONTRIBUTING.md` with:
  - Branch naming conventions
  - Commit message format
  - PR process
  - Code style (enforced by Biome, link to config)

---

## Issue Summary


| Phase             | Issues  | Critical | Description                                              |
| ----------------- | ------- | -------- | -------------------------------------------------------- |
| 1 — Foundation    | 1.1–1.8 | 5        | Monorepo, DB, API scaffold, Worker scaffold, testing     |
| 2 — GitHub        | 2.1–2.5 | 3        | App auth, webhooks, diff extraction, tree fetching       |
| 3 — Adapters      | 3.1–3.5 | 2        | Adapter interface, Markdown, Nextra, Fumadocs, detection |
| 4 — AI Engine     | 4.1–4.5 | 2        | OpenRouter client, triage, generation, prompts           |
| 5 — Pipeline      | 5.1–5.4 | 2        | Job orchestration, PR creation, retries, deduplication   |
| 6 — Dashboard     | 6.1–6.5 | 0        | OAuth, API routes, repo management, run views            |
| 7 — Deployment    | 7.1–7.5 | 0        | Dockerfiles, CI/CD, production environment               |
| 8 — Observability | 8.1–8.4 | 0        | Logging, Sentry, rate limiting, queue dashboard          |
| 9 — Polish        | 9.1–9.3 | 1        | E2E tests, edge cases, documentation                     |
| **Total**         | **36**  | **15**   |                                                          |


## Dependency Graph (Critical Path)

```
1.1 → 1.2 → 1.3 → 3.1 → 3.2 ─┐
                  │             ├→ 3.5 ──┐
                  │    3.3 ────┘         │
                  │    3.4 ──────────────│
                  └→ 4.1 → 4.2 ──┐      │
                         → 4.3 ──┤      │
                           → 4.4─┤      │
                                 │      │
1.2 → 1.4 ──────────────────────│──────│────→ 6.2
                                 │      │
1.1 → 1.5 → 1.7 ───────────────│──────│──┐
                                 │      │  │
1.2 → 1.6 → 2.1 → 2.2 → 2.3   │      │  │
              │  → 2.4 ────────│──────│──│──→ 5.1 → 5.2 → 9.1
              │  → 2.5 ────────│──────│──│──↗       5.3↗
              └→ 6.1 → 6.2 → 6.3     │  │          5.4
                             → 6.4    │  │
                        6.3 → 6.5     │  │
                                      │  │
         5.1 depends on: 2.4, 3.5, 4.3, 4.4
```

**Critical path to first working pipeline:**
`1.1 → 1.2 → 1.4 + 1.5 + 1.6 → 2.1 → 2.2 + 2.4 → 3.1 → 3.2 → 3.5 → 4.1 → 4.3 → 4.4 → 5.1 → 5.2 → 9.1`

## Parallelization Opportunities

At most stages, multiple tracks can progress concurrently:


| Track A (GitHub)           | Track B (Adapters)    | Track C (AI)           | Track D (Web)        |
| -------------------------- | --------------------- | ---------------------- | -------------------- |
| 2.1 GitHub App auth        | 3.1 Adapter interface | 4.1 OpenRouter client  | —                    |
| 2.2 Webhooks               | 3.2 Markdown adapter  | 4.2 Diff summarization | —                    |
| 2.3 Installation lifecycle | 3.3 Nextra adapter    | 4.3 AI triage          | 6.1 Next.js + OAuth  |
| 2.4 Diff extraction        | 3.4 Fumadocs adapter  | 4.4 AI generation      | 6.2 API routes       |
| 2.5 Tree fetching          | 3.5 Auto-detection    | 4.5 Prompt management  | 6.3 Repo list page   |
| —                          | —                     | —                      | 6.4 Run history page |


Phases 2, 3, and 4 can run **fully in parallel** after Phase 1 is complete. Phase 5 integrates all three. Phase 6 can start as soon as 2.1 is done and progress independently.
