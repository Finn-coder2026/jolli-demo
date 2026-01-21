import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		lib: {
			entry: resolve(__dirname, "src/index.ts"),
			formats: ["es"],
			fileName: "index",
		},
		rollupOptions: {
			external: [/^node:/, "commander", "fs-extra", "glob", "yaml", "path", "fs"],
			output: {
				banner: "#!/usr/bin/env node",
			},
		},
		target: "node18",
		minify: false,
	},
	test: {
		globals: true,
		coverage: {
			reporter: ["text", "json", "html"],
			exclude: ["node_modules", "dist", "coverage", "vite.config.ts", "src/cli.ts", "**/*.test.ts"],
			thresholds: {
				lines: 100,
				statements: 100,
				functions: 100,
				branches: 100,
			},
		},
	},
});
