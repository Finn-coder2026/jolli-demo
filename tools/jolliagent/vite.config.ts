import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		lib: {
			// Build library, workflows subpath, and the CLI entry
			entry: {
				index: resolve(__dirname, "src/index.ts"),
				workflows: resolve(__dirname, "src/workflows.ts"),
				cli: resolve(__dirname, "src/jolli.ts"),
			},
			formats: ["es"],
		},
		rollupOptions: {
			external: ["@anthropic-ai/sdk", /^node:.*/],
		},
		outDir: "dist",
		sourcemap: true,
		ssr: true,
	},
	resolve: {
		alias: {
			src: resolve(__dirname, "./src"),
			providers: resolve(__dirname, "./src/providers"),
		},
	},
});
