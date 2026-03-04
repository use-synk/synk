# Synk — Master Implementation Plan (v2)

*Last updated: 2026-03-03. This document supersedes all prior numbered-milestone plans.*

---

## Related Specs

- Suggestion Inbox breakout architecture and rollout: `docs/SUGGESTION-INBOX-ARCHITECTURE.md` (SYN-53)

---

## 1. Product Vision

Synk is an AI-powered documentation assistant that automatically keeps documentation in sync with code changes. It integrates with GitHub via a GitHub App, receives webhook events for push and PR activity, and uses AI to generate targeted documentation update pull requests.

**Core value proposition:** Configure once, get documentation PRs automatically — zero ongoing maintenance required.

---

## 2. Architecture

### 2.1 System Components

| Component | Technology | Role |
|-----------|-----------|------|
| `apps/api` | Hono + Bun | REST API, webhook ingestion, job enqueueing |
| `apps/worker` | BullMQ + Bun | Background job processor, AI pipeline |
| `apps/web` | Next.js 15 + React 19 | User dashboard |
| `packages/db` | Prisma + PostgreSQL | Database layer |
| `packages/ai` | Vercel AI SDK + OpenRouter | AI client |
| `packages/github` | Octokit | GitHub API integration |
| `packages/doc-adapters` | — | Framework detection and file parsing |
| `packages/shared` | — | Queue types, config schemas, utilities |
| `packages/auth` | Better Auth | GitHub OAuth, session management |
| `packages/api-client` | OpenAPI-generated | TypeScript client (partially adopted) |

### 2.2 Domain Model

```
Organization
  ├── ProviderInstallation (GitHub App installation)
  │     └── ProviderRepository (synced from GitHub)
  └── Project (documentation project)
        ├── sourceRepositoryId → ProviderRepository (where code lives)
        ├── docsRepositoryId?  → ProviderRepository (where docs live, if separate)
        ├── config (JSON: framework, paths, AI settings, PR config)
        └── AnalysisRun[] (AI run history, scoped to project)
              ├── status, triggerType, triggerRef, triggerCommitSha
              ├── result (doc changes, PR URL, affected files)
              └── tokenUsage (triage, generation, total)
```

**Key design principle:** `Project` is the unit of configuration and runs — not `ProviderRepository`. One project = one documentation target. Multiple projects can reference the same source repository (e.g. different doc paths or configs).

### 2.3 Data Flow

```
GitHub Webhook (push / pull_request)
  → apps/api  webhook handler
  → find Project[] where sourceRepositoryId = repo.id
  → enqueue AnalyzeChangesJob per project (one job per project)
  → apps/worker processes job
      → fetch diff (packages/github)
      → detect doc framework (packages/doc-adapters)
      → AI triage: does diff affect docs? (packages/ai)
      → if yes: AI generation: produce updated content (packages/ai)
      → create documentation PR (packages/github)
      → upsert AnalysisRun in DB (projectId, status, result)
  → web dashboard reflects results in real-time
```

---

## 3. Roadmap

### Phase 0 — Foundation ✅ Complete

*Infrastructure, tooling, and scaffolding*

- Turborepo + Bun monorepo with shared config and linting
- Prisma + PostgreSQL database layer
- Hono API scaffold and BullMQ worker scaffold
- Better Auth with GitHub OAuth
- CI pipeline (GitHub Actions: lint, typecheck, test, build)
- Shared packages: `config`, `shared`, `test-utils`

*Linear:* SYN-6, SYN-7, SYN-8, SYN-9, SYN-10, SYN-11, SYN-12, SYN-18, SYN-33, SYN-40

### Phase 1 — Core Integration ✅ Complete

*GitHub App, AI pipeline, worker job processor*

- GitHub App registration, webhook ingestion, installation lifecycle
- Diff extraction and repository tree fetching
- Documentation framework adapters (Markdown, Nextra, Fumadocs, auto-detection)
- AI client (OpenRouter via Vercel AI SDK) with exponential backoff
- Diff summarization for large changesets
- Worker `analyze-changes` job processor (end-to-end pipeline)
- PR creation service
- Job retry, error handling, deduplication, coalescing
- Dashboard API routes (projects, runs, repositories)

*Linear:* SYN-13, SYN-14, SYN-15, SYN-16, SYN-17, SYN-19, SYN-20, SYN-21, SYN-22, SYN-23, SYN-24, SYN-25, SYN-29, SYN-30, SYN-31, SYN-32, SYN-34

### Phase 2 — Project-Centric Model 🔄 ~85% Complete

*Introduction of `Project` as the unit of configuration and runs.*

This phase was not in the original numbered plan but represents a significant architectural pivot away from the repository-centric model.

| Item | Status |
|------|--------|
| `Project` Prisma model with migration | ✅ Done |
| `projectId` on `AnalysisRun` + unique constraint | ✅ Done |
| Project CRUD API routes (create, get, list, list runs) | ✅ Done |
| `listOrganizationProjects`, `listOrganizationRepositories` endpoints | ✅ Done |
| Projects sidebar navigation | ✅ Done |
| Create project page (`/[slug]/projects/new`) | ✅ Done |
| Project detail page with Overview + Runs tabs | ✅ Done |
| Worker resolves `projectId` from source repository at job time | ✅ Done |
| AI triage step (structured output, confidence) | ⚠️ Needs verification |
| AI doc generation step (per-file, validate output) | ⚠️ Needs verification |
| Projects list page (`/[slug]/projects`) | ❌ Placeholder only |
| Formatted runs display (not raw JSON) | ❌ Not done |
| Project settings/edit page | ❌ Not done |
| Manual trigger run (API + UI) | ❌ Not done |

### Phase 3 — Complete Dashboard & UX 🔄 Current Focus

*Finish the project-centric web experience and close AI pipeline gaps.*

See Section 5 for detailed work items.

- P3.1 AI triage: verify and complete acceptance criteria (SYN-26)
- P3.2 AI doc generation: verify and complete acceptance criteria (SYN-27)
- P3.3 Projects list page (SYN-35)
- P3.4 Formatted project runs display (SYN-36)
- P3.5 Run detail page (SYN-36)
- P3.6 Manual trigger run — new issue
- P3.7 Project settings/edit page — new issue
- P3.8 Overview dashboard (SYN-37)

### Phase 4 — Infrastructure & Production ⬜ Upcoming

*Production-ready deployment setup*

- Dockerfiles for all services (SYN-38)
- Docker Compose full-stack local testing (SYN-39)
- CD pipeline / GitHub Actions (SYN-41)
- Production environment configuration (SYN-42)

### Phase 5 — Quality, Observability & Polish ⬜ Future

*Hardening for production reliability*

- Structured logging / Pino (SYN-43)
- Error tracking with Sentry (SYN-44)
- Rate limiting and abuse prevention (SYN-45)
- BullMQ dashboard / Bull Board (SYN-46)
- End-to-end integration test suite (SYN-47)
- Error scenario and edge case testing (SYN-48)
- README and contributor documentation (SYN-49)
- Migrate web app to `@synk-ai/api-client` (SYN-50)
- Prompt management and versioning (SYN-28)

---

## 4. Current State Assessment

### 4.1 What Works End-to-End

| Feature | Status | Notes |
|---------|--------|-------|
| GitHub App installation (OAuth flow) | ✅ Working | |
| Webhook ingestion (push, pull_request) | ✅ Working | |
| Diff extraction from GitHub | ✅ Working | |
| Doc framework detection (auto-detect) | ✅ Working | |
| AI pipeline in worker (triage + generation) | ✅ Functional | Acceptance criteria need verification |
| Documentation PR creation | ✅ Working | |
| Run storage with `projectId` | ✅ Working | |
| Organization switching in web | ✅ Working | |
| Create project flow (web) | ✅ Working | |
| Project detail page — Overview tab | ✅ Working | |
| Project detail page — Runs tab | ⚠️ Partial | Data loads; UI is raw JSON dump |
| CI tests (lint, typecheck, test, build) | ✅ Working | |

### 4.2 Known Gaps

| Gap | Impact | Phase |
|-----|--------|-------|
| SYN-26: AI triage acceptance criteria not fully verified | High | 3 |
| SYN-27: AI doc generation acceptance criteria not fully verified | High | 3 |
| Projects list page is a placeholder | High | 3 |
| Project runs display shows raw JSON | High | 3 |
| Manual trigger run button is non-functional | High | 3 |
| No run detail page | Medium | 3 |
| No project settings/edit page | Medium | 3 |
| No overview dashboard | Medium | 3 |
| No Dockerfiles for production | Medium | 4 |
| No CD pipeline | Medium | 4 |
| No structured logging | Low | 5 |
| No error tracking | Low | 5 |
| No E2E tests | Low | 5 |

### 4.3 Technical Debt

| Item | Severity | Notes |
|------|----------|-------|
| Worker derives `projectId` at job execution time (not in payload) | Low | Works correctly; explicit payload field would be cleaner |
| `ProviderRepository.docsConfig` is unused when project exists | Low | Can be cleaned up post-MVP |
| Web API calls use hand-rolled fetch, not `@synk-ai/api-client` | Low | SYN-50; tracked in Backlog |
| Prompt strings hardcoded in worker | Low | SYN-28; tracked in Backlog |

---

## 5. Detailed Work Items — Phase 3 (Current Focus)

### P3.1 — AI triage: verify and complete (SYN-26)

**What needs verification against acceptance criteria:**
- Zod structured output schema: `{ needsUpdate: boolean, confidence: number, affectedDocFiles: string[], reasoning: string }`
- `generateObject` from Vercel AI SDK (not `generateText`)
- Configurable confidence threshold (default: 0.7) — skip update if below threshold
- Token usage tracked and returned alongside result
- Integration test with sample diff + doc tree

### P3.2 — AI doc generation: verify and complete (SYN-27)

**What needs verification against acceptance criteria:**
- Per-file generation: fetch current file content, construct prompt, generate updated content
- Zod output schema: `{ updatedContent: string, changeDescription: string }`
- Post-processing: normalize whitespace, ensure trailing newline, validate via adapter's `validateOutput`
- Skip file if generated content produces no meaningful diff from original
- Token usage tracked per file
- Integration test with sample input

### P3.3 — Projects list page (SYN-35)

**Route:** `/[slug]/projects`

The current page returns a placeholder. This is the primary navigation entry point for an organization's documentation projects.

**Acceptance criteria:**
- Fetches `listOrganizationProjects` via the existing API endpoint
- Displays project cards/rows: name, source repository, created date, last run status
- Links each project to `/[slug]/projects/[id]`
- "New Project" CTA linking to `/[slug]/projects/new`
- Empty state with prompt to create the first project
- Loading skeleton and error handling

### P3.4 — Formatted project runs display (SYN-36, part 1)

**Route:** `/[slug]/projects/[id]` — Runs tab

The Runs tab currently renders a raw JSON dump. Replace with a proper list view.

**Acceptance criteria:**
- Run status shown as a badge with semantic color: `queued` (neutral), `running` (blue), `completed` (green), `skipped` (gray), `failed` (red)
- Trigger type and ref displayed
- Created date shown (relative: "3 minutes ago")
- Duration shown (completedAt − startedAt)
- Doc PR link shown when available (external link)
- Number of docs affected shown
- Paginated — matches the existing `listProjectRuns` pagination
- Row links to the run detail page (P3.5)
- Empty state when no runs exist

### P3.5 — Run detail page (SYN-36, part 2)

**Route:** `/[slug]/projects/[id]/runs/[runId]`

Individual run view providing full context on what happened in a single analysis run.

**Acceptance criteria:**
- Breadcrumb: Org → Project → Runs → Run ID (short SHA)
- Run metadata: trigger type, trigger ref, commit SHA (linked to GitHub), timing, status badge
- AI triage result: reasoning, confidence score, list of affected doc files
- Generated changes: list of updated files with change description (diff view if feasible)
- Link to the created documentation PR (if any)
- Error details with message for failed runs
- Token usage breakdown: triage, generation, total
- "Back to project" navigation

### P3.6 — Manual trigger run (new issue)

**Route:** `/[slug]/projects/[id]` — Runs tab — "Trigger manual run" button

The button currently exists but is non-functional.

**API:** Requires a `POST /projects/{projectId}/runs` endpoint (or extend the existing queue enqueue endpoint) that accepts a `ref` (branch name or commit SHA) and enqueues a job with `triggerType: "manual"`.

**Acceptance criteria:**
- "Trigger manual run" button opens a dialog/modal
- User enters a branch name or commit SHA (pre-filled with default branch)
- Input is validated (non-empty, reasonable format)
- On submit: calls API, enqueues job, closes modal
- UI refetches runs list after triggering (to show the new `queued` run)
- Error shown if API call fails
- Button is disabled while a run is actively `queued` or `running`

### P3.7 — Project settings/edit page (new issue)

**Route:** `/[slug]/projects/[id]/settings`

Allow updating project name and docs configuration.

**Acceptance criteria:**
- "Settings" tab added to project detail page tabs
- Form pre-filled with current project name and `config` fields
- Editable fields: name, `config.framework`, `config.docsPath`, `config.branch`, `config.ignorePaths`, `config.prLabels`, `config.ai.model`, `config.ai.customInstructions`
- Source repository shown as read-only (not editable post-creation without explicit warning)
- Uses existing `PATCH /projects/{projectId}` API endpoint
- Form validation (Zod schema) before submit
- Success toast on save; error message on failure
- Unsaved changes warning on navigation away

### P3.8 — Overview dashboard (SYN-37)

**Route:** `/[slug]` (organization home page)

**Acceptance criteria:**
- Summary stats for the organization: total projects, total runs (last 30 days), doc PRs created
- GitHub installation status (installed / not installed with CTA)
- Recent runs list (last 10 across all projects): project name, trigger, date, status
- Projects requiring attention: projects with recent failed runs
- Empty state for new organizations (no installation yet) with onboarding steps
- Stats fetched from a single aggregation endpoint (add to existing dashboard API)

---

## 6. Open Questions

The following questions affect implementation scope and must be resolved before or during Phase 3:

1. **Multiple projects per source repo:** The worker currently finds the *first* matching project for a repository. Should multiple projects per source repo be supported (e.g. different doc paths)? If yes, the webhook handler must enqueue one job *per* project. **Recommendation:** Support it — the schema already allows it.

2. **Job payload and `projectId`:** The worker derives `projectId` at job execution time by querying the database. The `AnalyzeChangesJobPayload` in `packages/shared` does not carry `projectId`. Should we add it explicitly? **Recommendation:** Yes, for clarity and correctness — add `projectId` to the payload and have the webhook handler set it. This also enables project-level coalescing.

3. **Project deletion behavior:** Should deleting a project hard-delete its `AnalysisRun` records? **Recommendation:** Cascade delete runs; add a confirmation dialog in the UI.

4. **Separate docs repository in create form:** The `Project` model has `docsRepositoryId` but the create project form may not expose it. Should MVP support a separate docs repo in the create flow? **Recommendation:** Yes — include it as an optional field in the create form.

---

## 7. Linear Issue Mapping

| Linear Issue | Original Title | Action | Updated Purpose |
|-------------|---------------|--------|-----------------|
| SYN-26 | [4.3] AI triage | Verify + complete | AI triage acceptance criteria |
| SYN-27 | [4.4] AI doc generation | Verify + complete | AI doc generation acceptance criteria |
| SYN-35 | [6.3] Repository list page | Re-scope | Projects list page (`/[slug]/projects`) |
| SYN-36 | [6.4] Run history and detail pages | Re-scope | Formatted runs + run detail page (project-centric) |
| SYN-37 | [6.5] Overview dashboard | Update | Org-level dashboard (project-centric) |
| SYN-38 | [7.1] Dockerfiles | Keep | Unchanged |
| SYN-39 | [7.2] Docker Compose full-stack | Keep | Unchanged |
| SYN-41 | [7.4] CD pipeline | Keep | Unchanged |
| SYN-42 | [7.5] Production environment | Keep | Unchanged |
| SYN-43–46 | Observability | Keep as Backlog | Unchanged |
| SYN-47–49 | Testing/docs | Keep as Backlog | Unchanged |
| SYN-50 | API client migration | Keep as Backlog | Unchanged |
| SYN-28 | [4.5] Prompt management | Keep as Backlog | Unchanged |
| *(new)* | Manual trigger run | Create | P3.6 |
| *(new)* | Project settings/edit page | Create | P3.7 |
