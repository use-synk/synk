-- CreateEnum
CREATE TYPE "installation_oauth_state_status" AS ENUM ('pending', 'consumed', 'expired');

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

-- CreateIndex
CREATE UNIQUE INDEX "installation_oauth_states_token_key" ON "installation_oauth_states"("token");

-- CreateIndex
CREATE INDEX "installation_oauth_states_token_status_idx" ON "installation_oauth_states"("token", "status");

-- CreateIndex
CREATE INDEX "installation_oauth_states_expiresAt_idx" ON "installation_oauth_states"("expiresAt");
