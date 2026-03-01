FROM oven/bun:1.3.9 AS base
WORKDIR /app

COPY package.json bun.lock* ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/ ./packages/
RUN bun install --frozen-lockfile --production

COPY apps/worker/src ./apps/worker/src

WORKDIR /app/apps/worker
CMD ["bun", "src/worker.ts"]
