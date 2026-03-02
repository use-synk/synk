-- CreateEnum
CREATE TYPE "vcs_provider" AS ENUM ('github', 'gitlab', 'bitbucket');

-- CreateEnum
CREATE TYPE "installation_status" AS ENUM ('active', 'suspended', 'deleted');

-- CreateEnum
CREATE TYPE "repository_status" AS ENUM ('active', 'archived', 'removed');

-- CreateEnum
CREATE TYPE "run_status" AS ENUM ('queued', 'running', 'completed', 'skipped', 'failed', 'canceled');

-- CreateEnum
CREATE TYPE "run_trigger_type" AS ENUM ('push', 'merge', 'manual');

-- CreateEnum
CREATE TYPE "attempt_status" AS ENUM ('running', 'failed', 'completed');

-- CreateEnum
CREATE TYPE "webhook_status" AS ENUM ('received', 'processed', 'ignored', 'failed');

-- CreateEnum
CREATE TYPE "installation_oauth_state_status" AS ENUM ('pending', 'consumed', 'expired');

-- CreateTable
CREATE TABLE "provider_installations" (
    "id" TEXT NOT NULL,
    "organizationId" UUID NOT NULL,
    "provider" "vcs_provider" NOT NULL,
    "providerInstallationId" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "accountLogin" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "status" "installation_status" NOT NULL DEFAULT 'active',
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_installations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_repositories" (
    "id" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "provider" "vcs_provider" NOT NULL,
    "providerRepositoryId" TEXT NOT NULL,
    "ownerLogin" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL,
    "status" "repository_status" NOT NULL DEFAULT 'active',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_runs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "repositoryId" TEXT NOT NULL,
    "provider" "vcs_provider" NOT NULL,
    "triggerType" "run_trigger_type" NOT NULL,
    "triggerRef" TEXT NOT NULL,
    "triggerCommitSha" TEXT NOT NULL,
    "triggerMergeRequestNumber" INTEGER,
    "triggerMeta" JSONB NOT NULL DEFAULT '{}',
    "status" "run_status" NOT NULL,
    "result" JSONB NOT NULL DEFAULT '{}',
    "docsAffected" BOOLEAN,
    "docPrNumber" INTEGER,
    "docPrUrl" TEXT,
    "tokenUsage" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_run_attempts" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "attempt_status" NOT NULL,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_run_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installation_oauth_states" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "installation_oauth_state_status" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installation_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "provider" "vcs_provider" NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "providerInstallationId" TEXT,
    "providerRepositoryId" TEXT,
    "signatureValid" BOOLEAN NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "status" "webhook_status" NOT NULL DEFAULT 'received',
    "error" TEXT,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" UUID NOT NULL,
    "sourceRepositoryId" TEXT NOT NULL,
    "docsRepositoryId" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" UUID NOT NULL,
    "activeOrganizationId" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "metadata" TEXT,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" UUID NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviterId" UUID NOT NULL,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_installations_provider_status_idx" ON "provider_installations"("provider", "status");

-- CreateIndex
CREATE INDEX "provider_installations_accountLogin_idx" ON "provider_installations"("accountLogin");

-- CreateIndex
CREATE UNIQUE INDEX "provider_installations_provider_providerInstallationId_key" ON "provider_installations"("provider", "providerInstallationId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_installations_provider_providerAccountId_providerI_key" ON "provider_installations"("provider", "providerAccountId", "providerInstallationId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_installations_id_provider_key" ON "provider_installations"("id", "provider");

-- CreateIndex
CREATE INDEX "provider_repositories_installationId_idx" ON "provider_repositories"("installationId");

-- CreateIndex
CREATE INDEX "provider_repositories_provider_isActive_idx" ON "provider_repositories"("provider", "isActive");

-- CreateIndex
CREATE INDEX "provider_repositories_provider_fullName_idx" ON "provider_repositories"("provider", "fullName");

-- CreateIndex
CREATE UNIQUE INDEX "provider_repositories_provider_providerRepositoryId_key" ON "provider_repositories"("provider", "providerRepositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "provider_repositories_installationId_fullName_key" ON "provider_repositories"("installationId", "fullName");

-- CreateIndex
CREATE UNIQUE INDEX "provider_repositories_id_provider_key" ON "provider_repositories"("id", "provider");

-- CreateIndex
CREATE INDEX "analysis_runs_projectId_idx" ON "analysis_runs"("projectId");

-- CreateIndex
CREATE INDEX "analysis_runs_status_idx" ON "analysis_runs"("status");

-- CreateIndex
CREATE INDEX "analysis_runs_projectId_createdAt_idx" ON "analysis_runs"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "analysis_runs_projectId_status_createdAt_idx" ON "analysis_runs"("projectId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "analysis_runs_provider_triggerCommitSha_idx" ON "analysis_runs"("provider", "triggerCommitSha");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_runs_projectId_repositoryId_triggerCommitSha_trigg_key" ON "analysis_runs"("projectId", "repositoryId", "triggerCommitSha", "triggerType");

-- CreateIndex
CREATE INDEX "analysis_run_attempts_runId_idx" ON "analysis_run_attempts"("runId");

-- CreateIndex
CREATE INDEX "analysis_run_attempts_status_idx" ON "analysis_run_attempts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_run_attempts_runId_attemptNumber_key" ON "analysis_run_attempts"("runId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "installation_oauth_states_token_key" ON "installation_oauth_states"("token");

-- CreateIndex
CREATE INDEX "installation_oauth_states_expiresAt_idx" ON "installation_oauth_states"("expiresAt");

-- CreateIndex
CREATE INDEX "webhook_deliveries_provider_eventType_receivedAt_idx" ON "webhook_deliveries"("provider", "eventType", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "webhook_deliveries_provider_providerInstallationId_received_idx" ON "webhook_deliveries"("provider", "providerInstallationId", "receivedAt" DESC);

-- CreateIndex
CREATE INDEX "webhook_deliveries_provider_providerRepositoryId_receivedAt_idx" ON "webhook_deliveries"("provider", "providerRepositoryId", "receivedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_provider_deliveryId_key" ON "webhook_deliveries"("provider", "deliveryId");

-- CreateIndex
CREATE INDEX "projects_sourceRepositoryId_idx" ON "projects"("sourceRepositoryId");

-- CreateIndex
CREATE INDEX "projects_docsRepositoryId_idx" ON "projects"("docsRepositoryId");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "verification_identifier_key" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX "member_organizationId_idx" ON "member"("organizationId");

-- CreateIndex
CREATE INDEX "member_userId_idx" ON "member"("userId");

-- CreateIndex
CREATE INDEX "invitation_organizationId_idx" ON "invitation"("organizationId");

-- CreateIndex
CREATE INDEX "invitation_email_idx" ON "invitation"("email");

-- AddForeignKey
ALTER TABLE "provider_installations" ADD CONSTRAINT "provider_installations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_repositories" ADD CONSTRAINT "provider_repositories_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "provider_installations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "provider_repositories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_run_attempts" ADD CONSTRAINT "analysis_run_attempts_runId_fkey" FOREIGN KEY ("runId") REFERENCES "analysis_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_sourceRepositoryId_fkey" FOREIGN KEY ("sourceRepositoryId") REFERENCES "provider_repositories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_docsRepositoryId_fkey" FOREIGN KEY ("docsRepositoryId") REFERENCES "provider_repositories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
