import { defineConfig } from "vitest/config";

export default defineConfig({
	base: "./",
	build: {
		lib: {
			entry: "src/index.ts",
			formats: ["es"],
			fileName: "index",
		},
		minify: "esbuild",
		target: "node20",
		ssr: true,
		rollupOptions: {
			// Bundle everything except Node built-ins
			external: id => id.startsWith("node:"),
			output: { banner: "#!/usr/bin/env node" },
		},
	},
	test: {
		globals: true,
		environment: "node",
		exclude: ["**/node_modules/**", "**/dist/**"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["src/**/*.ts"],
			exclude: [
				"**/node_modules/**",
				"**/dist/**",
				"**/*.test.ts",
				"src/index.ts", // CLI entry point - tested via integration tests
			],
		},
	},
});
