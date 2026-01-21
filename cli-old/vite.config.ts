import { defineConfig } from "vitest/config";

export default defineConfig({
	base: "./",
	build: {
		lib: {
			entry: "src/Main.ts",
			formats: ["es"],
			fileName: "index",
		},
		minify: "esbuild",
		target: "node20",
		ssr: true,
		rollupOptions: {
			external: [
				"commander",
				"node:child_process",
				"node:fs",
				"react",
				"ink",
				"ink-text-input",
				"ink-select-input",
				"ink-spinner",
			],
			output: {
				banner: "#!/usr/bin/env node",
			},
		},
	},
	esbuild: {
		jsx: "automatic",
	},
	test: {
		setupFiles: ["./vitest.setup.ts"],
		exclude: ["**/node_modules/**", "**/dist/**"],
		coverage: {
			all: true,
			exclude: [
				"src/util/Login.ts",
				"src/interactive/index.tsx",
				"src/interactive/commands/types.ts",
				"src/interactive/views/types.ts",
				"src/interactive/views/index.ts",
				"src/interactive/hooks/index.ts",
			],
			include: ["src/**"],
			reporter: ["html", "json", "lcov", "text"],
			thresholds: {
				lines: 95,
				functions: 95,
				branches: 95,
				statements: 95,
			},
		},
		env: {
			LOG_TRANSPORTS: "console",
			DISABLE_LOGGING: "true",
		},
		environment: "node",
		globals: true,
		pool: process.platform === "linux" ? "vmForks" : "vmThreads",
		resolveSnapshotPath: (path: string, extension: string) => path + extension,
		restoreMocks: true,
	},
});
