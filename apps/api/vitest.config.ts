import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		coverage: {
			provider: "v8",
			reporter: ["text", "lcov"],
			exclude: [
				"src/server.ts",
				"src/env.ts",
				"src/types.ts",
				"src/queues/**",
				"src/logger.ts",
				"src/routes/**",
			],
			thresholds: {
				lines: 70,
				functions: 70,
				branches: 70,
				statements: 70,
			},
		},
	},
});
