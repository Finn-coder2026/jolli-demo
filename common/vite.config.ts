import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			all: true,
			exclude: [
				"**/*.mock.ts",
				"**/index.ts",
				"src/core/UserInfo.ts",
				"src/core/SiteClient.ts",
				"src/types/**",
				"src/tenant/**",
			],
			include: ["src/**/*.ts"],
			reporter: ["html", "json", "lcov", "text"],
			thresholds: {
				"100": true,
			},
		},
		globals: true,
		pool: process.platform === "linux" ? "vmForks" : "vmThreads",
		resolveSnapshotPath: (path: string, extension: string) => path + extension,
		restoreMocks: true,
		setupFiles: ["./src/util/Vitest.ts"],
	},
});
