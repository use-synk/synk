ALTER TABLE "analysis_runs"
ADD COLUMN "triggerPrTitle" TEXT,
ADD COLUMN "triggerSourceBranch" TEXT,
ADD COLUMN "triggerTargetBranch" TEXT,
ADD COLUMN "triggerPrAuthorName" TEXT,
ADD COLUMN "triggerPrAuthorUsername" TEXT,
ADD COLUMN "triggerPrAuthorAvatarUrl" TEXT,
ADD COLUMN "suggestionsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "errorCode" TEXT,
ADD COLUMN "errorMessage" TEXT;

UPDATE "analysis_runs"
SET "errorMessage" = "error"
WHERE "error" IS NOT NULL;
