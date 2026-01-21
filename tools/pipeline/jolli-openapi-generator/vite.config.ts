import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		lib: {
			// Build library and CLI entry
			entry: {
				index: resolve(__dirname, "src/index.ts"),
				Cli: resolve(__dirname, "src/Cli.ts"),
			},
			formats: ["es"],
		},
		rollupOptions: {
			external: [/^node:.*/, "shared-pipeline-utils", /^shared-pipeline-utils\/.*/],
		},
		outDir: "dist",
		sourcemap: true,
		ssr: true,
	},
	test: {
		globals: false,
		environment: "node",
		include: ["src/**/*.test.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.test.ts", "src/types.ts", "src/index.ts"],
			thresholds: {
				lines: 97,
				functions: 97,
				branches: 97,
				statements: 97,
			},
		},
	},
});
