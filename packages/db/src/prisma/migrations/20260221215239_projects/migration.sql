/*
  Warnings:

  - You are about to drop the column `docsConfig` on the `provider_repositories` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[projectId,repositoryId,triggerCommitSha,triggerType]` on the table `analysis_runs` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `projectId` to the `analysis_runs` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "analysis_runs_repositoryId_createdAt_idx";

-- DropIndex
DROP INDEX "analysis_runs_repositoryId_idx";

-- DropIndex
DROP INDEX "analysis_runs_repositoryId_status_createdAt_idx";

-- DropIndex
DROP INDEX "analysis_runs_repositoryId_triggerCommitSha_triggerType_key";

-- AlterTable
ALTER TABLE "analysis_runs" ADD COLUMN     "projectId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "provider_repositories" DROP COLUMN "docsConfig";

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sourceRepositoryId" TEXT NOT NULL,
    "docsRepositoryId" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_sourceRepositoryId_idx" ON "projects"("sourceRepositoryId");

-- CreateIndex
CREATE INDEX "projects_docsRepositoryId_idx" ON "projects"("docsRepositoryId");

-- CreateIndex
CREATE INDEX "analysis_runs_projectId_idx" ON "analysis_runs"("projectId");

-- CreateIndex
CREATE INDEX "analysis_runs_projectId_createdAt_idx" ON "analysis_runs"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "analysis_runs_projectId_status_createdAt_idx" ON "analysis_runs"("projectId", "status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "analysis_runs_projectId_repositoryId_triggerCommitSha_trigg_key" ON "analysis_runs"("projectId", "repositoryId", "triggerCommitSha", "triggerType");

-- AddForeignKey
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_sourceRepositoryId_fkey" FOREIGN KEY ("sourceRepositoryId") REFERENCES "provider_repositories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_docsRepositoryId_fkey" FOREIGN KEY ("docsRepositoryId") REFERENCES "provider_repositories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
