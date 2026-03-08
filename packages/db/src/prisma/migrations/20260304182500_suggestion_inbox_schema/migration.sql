-- CreateEnum
CREATE TYPE "suggestion_status" AS ENUM ('pending', 'accepted', 'declined', 'superseded', 'stale', 'applied');

-- CreateEnum
CREATE TYPE "suggestion_batch_status" AS ENUM ('queued', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "suggestion_batches" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "baseBranch" TEXT NOT NULL,
    "baseSha" TEXT NOT NULL,
    "headBranch" TEXT NOT NULL,
    "prNumber" INTEGER,
    "prUrl" TEXT,
    "status" "suggestion_batch_status" NOT NULL DEFAULT 'queued',
    "summary" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suggestion_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suggestions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "docPath" TEXT NOT NULL,
    "baseDocSha" TEXT NOT NULL,
    "beforeContent" TEXT,
    "proposedContent" TEXT NOT NULL,
    "reasoning" TEXT,
    "fingerprint" TEXT NOT NULL,
    "status" "suggestion_status" NOT NULL DEFAULT 'pending',
    "supersedesSuggestionId" TEXT,
    "decidedByUserId" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "appliedInBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suggestion_batches_projectId_idx" ON "suggestion_batches"("projectId");

-- CreateIndex
CREATE INDEX "suggestion_batches_repositoryId_idx" ON "suggestion_batches"("repositoryId");

-- CreateIndex
CREATE INDEX "suggestion_batches_createdByUserId_idx" ON "suggestion_batches"("createdByUserId");

-- CreateIndex
CREATE INDEX "suggestion_batches_projectId_status_createdAt_idx" ON "suggestion_batches"("projectId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "suggestions_projectId_idx" ON "suggestions"("projectId");

-- CreateIndex
CREATE INDEX "suggestions_repositoryId_idx" ON "suggestions"("repositoryId");

-- CreateIndex
CREATE INDEX "suggestions_runId_idx" ON "suggestions"("runId");

-- CreateIndex
CREATE INDEX "suggestions_appliedInBatchId_idx" ON "suggestions"("appliedInBatchId");

-- CreateIndex
CREATE INDEX "suggestions_projectId_status_createdAt_idx" ON "suggestions"("projectId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "suggestions_projectId_fingerprint_status_idx" ON "suggestions"("projectId", "fingerprint", "status");

-- AddForeignKey
ALTER TABLE "suggestion_batches"
ADD CONSTRAINT "suggestion_batches_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestion_batches"
ADD CONSTRAINT "suggestion_batches_repositoryId_fkey"
FOREIGN KEY ("repositoryId") REFERENCES "provider_repositories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestions"
ADD CONSTRAINT "suggestions_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestions"
ADD CONSTRAINT "suggestions_repositoryId_fkey"
FOREIGN KEY ("repositoryId") REFERENCES "provider_repositories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestions"
ADD CONSTRAINT "suggestions_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "analysis_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestions"
ADD CONSTRAINT "suggestions_supersedesSuggestionId_fkey"
FOREIGN KEY ("supersedesSuggestionId") REFERENCES "suggestions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggestions"
ADD CONSTRAINT "suggestions_appliedInBatchId_fkey"
FOREIGN KEY ("appliedInBatchId") REFERENCES "suggestion_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
