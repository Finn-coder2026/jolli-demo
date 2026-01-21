import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["src/**/*.test.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			exclude: ["**/*.test.ts", "**/types.ts", "vitest.config.ts"],
			thresholds: {
				lines: 98,
				functions: 98,
				branches: 98,
				statements: 98,
			},
		},
	},
});
