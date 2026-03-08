# Suggestion Inbox Rollout Runbook (SYN-61)

*Last updated: 2026-03-04.*

---

## 1. Purpose

This runbook defines safe rollout and rollback procedures for Suggestion Inbox feature flags.

Feature flags:

1. `SYNK_SUGGESTION_INBOX_ENABLED`
2. `SYNK_AUTOPR_DISABLED`
3. `SYNK_SUGGESTION_DECISION_MEMORY_ENABLED`

Web UI visibility flags:

1. `NEXT_PUBLIC_SYNK_SUGGESTION_INBOX_ENABLED`
2. `NEXT_PUBLIC_SYNK_SUGGESTION_DECISION_MEMORY_ENABLED`

## 2. Flag Semantics

1. `SYNK_SUGGESTION_INBOX_ENABLED`
   - Enables inbox workflow components as they ship.
2. `SYNK_AUTOPR_DISABLED`
   - Requests disabling legacy auto-PR path.
   - Effective only when inbox is enabled.
3. `SYNK_SUGGESTION_DECISION_MEMORY_ENABLED`
   - Enables declined-suggestion memory behavior.
   - Effective only when inbox is enabled.

Safety rule:

1. Auto-PR remains enabled unless both conditions are true:
   - `SYNK_SUGGESTION_INBOX_ENABLED=true`
   - `SYNK_AUTOPR_DISABLED=true`

## 3. Rollout Stages

### Stage A: Dark Launch (data path)

1. API + worker:
   - `SYNK_SUGGESTION_INBOX_ENABLED=true`
   - `SYNK_AUTOPR_DISABLED=false`
   - `SYNK_SUGGESTION_DECISION_MEMORY_ENABLED=false`
2. Web:
   - `NEXT_PUBLIC_SYNK_SUGGESTION_INBOX_ENABLED=false`
3. Goal:
   - Validate backend behavior without changing maintainer workflow.

### Stage B: Internal Review UI

1. API + worker:
   - same as Stage A
2. Web:
   - `NEXT_PUBLIC_SYNK_SUGGESTION_INBOX_ENABLED=true`
   - `NEXT_PUBLIC_SYNK_SUGGESTION_DECISION_MEMORY_ENABLED=false`
3. Goal:
   - Validate review UX and permissions in staging/internal environments.

### Stage C: Controlled Publish Switch

1. API + worker:
   - `SYNK_SUGGESTION_INBOX_ENABLED=true`
   - `SYNK_AUTOPR_DISABLED=true`
   - `SYNK_SUGGESTION_DECISION_MEMORY_ENABLED=false`
2. Web:
   - inbox UI enabled.
3. Goal:
   - Shift publishing control to explicit maintainer action.

### Stage D: Decision Memory

1. API + worker:
   - `SYNK_SUGGESTION_DECISION_MEMORY_ENABLED=true`
2. Web:
   - `NEXT_PUBLIC_SYNK_SUGGESTION_DECISION_MEMORY_ENABLED=true`
3. Goal:
   - Prevent repeated unchanged suggestions after decline decisions.

## 4. Rollout Checks

Before advancing stages:

1. Verify API startup log `suggestion inbox rollout flags`.
2. Verify worker startup log `suggestion inbox rollout flags`.
3. Confirm no elevated error rates for runs and queue processing.
4. Confirm run summaries remain available in dashboard.
5. Confirm expected PR behavior for current stage.

## 5. Rollback Procedure

Immediate rollback:

1. Set API + worker:
   - `SYNK_SUGGESTION_INBOX_ENABLED=false`
   - `SYNK_AUTOPR_DISABLED=false`
   - `SYNK_SUGGESTION_DECISION_MEMORY_ENABLED=false`
2. Set web:
   - `NEXT_PUBLIC_SYNK_SUGGESTION_INBOX_ENABLED=false`
   - `NEXT_PUBLIC_SYNK_SUGGESTION_DECISION_MEMORY_ENABLED=false`
3. Redeploy web/api/worker.

Expected rollback effect:

1. Legacy auto-PR workflow remains active.
2. Suggestion data stays persisted for diagnostics.
3. No schema rollback required.

## 6. Environment Matrix

Recommended defaults:

1. Local: all flags `false`.
2. Staging:
   - advance stage-by-stage.
3. Production:
   - promote only after staging validation per stage.

## 7. Audit and Change Tracking

For each flag change, record:

1. Environment and timestamp.
2. Old/new values.
3. Operator name.
4. Reason and linked Linear issue.
