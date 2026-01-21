import viteConfig from "./vite.config";
import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";

export default mergeConfig(
	viteConfig,
	defineConfig({
		test: {
			include: ["tests/**/*.ts"],
			testTimeout: 30000,
			environment: "node",
			// Use VM threads pool to avoid process kill in sandbox
			pool: "vmThreads",
			maxWorkers: 1,
		},
		// Extend Vite's resolve.alias and add test-only aliases here.
		resolve: {
			alias: {
				// Keep test-only alias while inheriting others from Vite config
				llm: fileURLToPath(new URL("./src/llm.ts", import.meta.url)),
			},
		},
	}),
);
