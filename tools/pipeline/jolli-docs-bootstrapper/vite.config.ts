import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
	build: {
		ssr: true,
		lib: {
			entry: {
				index: resolve(__dirname, "src/index.ts"),
				Cli: resolve(__dirname, "src/Cli.ts"),
			},
			formats: ["es"],
			fileName: (format, entryName) => `${entryName}.js`,
		},
		rollupOptions: {
			external: [
				"node:fs",
				"node:path",
				"node:process",
				"gray-matter",
			],
		},
		outDir: "dist",
		emptyOutDir: true,
		sourcemap: true,
	},
	test: {
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			thresholds: {
				lines: 97,
				functions: 97,
				branches: 95,
				statements: 97,
			},
			exclude: [
				"**/*.test.ts",
				"**/node_modules/**",
				"**/dist/**",
				"**/*.config.ts",
				"**/types.ts",
			],
		},
	},
});
