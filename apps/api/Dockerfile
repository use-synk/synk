FROM oven/bun:1.3.9 AS base
WORKDIR /app

# Install dependencies (full monorepo needed for workspace packages)
COPY package.json bun.lock* ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/ ./packages/
RUN bun install --frozen-lockfile --production

# Copy source
COPY apps/api/src ./apps/api/src

EXPOSE 3000
WORKDIR /app/apps/api
CMD ["bun", "src/server.ts"]
