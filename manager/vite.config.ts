import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
		},
	},
	test: {
		coverage: {
			all: true,
			exclude: [
				"**/*.mock.ts",
				"**/index.ts",
				"src/app/**", // Next.js pages/routes (UI code)
				"src/components/**", // React components
				"src/contexts/**", // React contexts (UI code)
				"src/instrumentation.ts", // Next.js instrumentation hook (called by Next.js runtime)
				"src/lib/Config.ts", // Environment config
				"src/lib/auth/**", // Auth services (require Redis/JWT runtime)
				"src/lib/db/**", // Database DAOs, models, registry (require DB connection)
				"src/lib/providers/**", // Database providers (require actual DB)
				"src/lib/types/**", // Type definitions only
				"src/lib/util/ModelDef.ts", // Sequelize utility
			],
			include: ["src/**/*.ts", "src/**/*.tsx"],
			reporter: ["html", "json", "lcov", "text"],
			thresholds: {
				"100": true,
			},
		},
		globals: true,
		pool: process.platform === "linux" ? "vmForks" : "vmThreads",
		resolveSnapshotPath: (path: string, extension: string) => path + extension,
		restoreMocks: true,
		env: {
			LOG_TRANSPORTS: "console",
			DISABLE_LOGGING: "true",
		},
	},
});
