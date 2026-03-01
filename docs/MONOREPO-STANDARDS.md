# Monorepo Standards

This document defines the package and task standards for this repository.

## Package Archetypes

1. `app`: runnable services or frontends under `apps/*`.
2. `compiled-lib`: internal libraries compiled to `dist/**`.
3. `source-lib`: internal libraries consumed from source.
4. `config-only`: shared configuration packages with no runtime build output.

## Required Workspace Scripts

Every workspace must define these scripts:

1. `build`
2. `lint`
3. `lint:write`
4. `lint:unsafe`
5. `typecheck`
6. `test`

Notes:

1. `config-only` workspaces can use explicit no-op commands for `build`, `typecheck`, and `test`.
2. Root scripts must orchestrate with `turbo run ...` and not contain package task logic.

## Turborepo Task Contracts

1. `build`
   - Default output: `dist/**`.
   - Package overrides are required when build artifacts differ.
2. `typecheck`
   - Default dependency: `^typecheck`.
   - Add package-level `^build` dependency only when a package consumes built artifacts from dependencies.
3. `test`
   - Inputs must include both `**/*.test.ts` and `**/*.test.tsx`.
   - Coverage output is `coverage/**` when produced.

## Output Conventions by Archetype

1. `app` (Next.js): `.next/**` and exclude `.next/cache/**`.
2. `compiled-lib`: `dist/**`.
3. `compiled-lib` with generators: `dist/**` plus generated output paths (for example `src/generated/**`).
4. `source-lib`: generated source outputs only when applicable.
5. `config-only`: no outputs.

## Dependency and Version Policy

1. Shared infra dependencies should be version-aligned unless there is a documented exception.
2. `zod` must be major version `4` across all workspaces.
3. TypeScript and Node type packages should remain aligned across workspaces when compatibility permits.

## CI Quality Gate Policy

1. `lint`, `typecheck`, `test`, and `build` must run for all workspaces.
2. Temporary exclusions are only allowed with a tracked follow-up issue and expiry date.
