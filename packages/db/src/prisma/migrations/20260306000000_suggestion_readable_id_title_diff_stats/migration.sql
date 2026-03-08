-- Add readableId, title, diffAdditions, diffDeletions to suggestions
-- and add FK constraint for decidedByUserId -> user(id)

-- Step 1: Add new columns (readableId nullable initially for backfill)
ALTER TABLE "suggestions" ADD COLUMN "readableId" INTEGER;
ALTER TABLE "suggestions" ADD COLUMN "title" TEXT;
ALTER TABLE "suggestions" ADD COLUMN "diffAdditions" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "suggestions" ADD COLUMN "diffDeletions" INTEGER NOT NULL DEFAULT 0;

-- Step 2: Backfill readableId — assign sequential IDs per project ordered by createdAt
WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY "projectId" ORDER BY "createdAt" ASC) AS rn
  FROM "suggestions"
)
UPDATE "suggestions"
SET "readableId" = numbered.rn
FROM numbered
WHERE "suggestions".id = numbered.id;

-- Step 3: Make readableId NOT NULL now that all rows have a value
ALTER TABLE "suggestions" ALTER COLUMN "readableId" SET NOT NULL;

-- Step 4: Add unique constraint on (projectId, readableId)
CREATE UNIQUE INDEX "suggestions_projectId_readableId_key" ON "suggestions"("projectId", "readableId");

-- Step 5: Add FK constraint for decidedByUserId -> user(id)
-- (The column already exists from the initial migration, just add the constraint)
ALTER TABLE "suggestions"
ADD CONSTRAINT "suggestions_decidedByUserId_fkey"
FOREIGN KEY ("decidedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
