CREATE TYPE "run_step_status" AS ENUM ('running', 'failed', 'completed');

CREATE TABLE "analysis_run_steps" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "stepKey" TEXT NOT NULL,
    "status" "run_step_status" NOT NULL,
    "result" JSONB NOT NULL DEFAULT '{}',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_run_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "analysis_run_steps_runId_attemptNumber_stepKey_key" ON "analysis_run_steps"("runId", "attemptNumber", "stepKey");

CREATE INDEX "analysis_run_steps_runId_attemptNumber_idx" ON "analysis_run_steps"("runId", "attemptNumber");

CREATE INDEX "analysis_run_steps_runId_status_idx" ON "analysis_run_steps"("runId", "status");

CREATE INDEX "analysis_run_steps_runId_createdAt_idx" ON "analysis_run_steps"("runId", "createdAt" ASC);

ALTER TABLE "analysis_run_steps" ADD CONSTRAINT "analysis_run_steps_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "analysis_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
