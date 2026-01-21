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
		},
		rollupOptions: {
			external: [
				"node:fs",
				"node:path",
				"node:process",
				"@anthropic-ai/sdk",
				"dotenv",
				"gray-matter",
			],
		},
		outDir: "dist",
	},
	test: {
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			exclude: [
				"node_modules/**",
				"dist/**",
				"**/*.test.ts",
				"vite.config.ts",
			],
		},
	},
});
