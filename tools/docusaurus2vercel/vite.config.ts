import { defineConfig } from "vitest/config";

export default defineConfig({
	base: "./",
	build: {
		lib: {
			entry: "src/index.tsx",
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
	esbuild: {
		jsx: "automatic",
	},
	test: {
		globals: true,
		environment: "node",
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["src/**/*.ts", "src/**/*.tsx"],
			exclude: ["**/*.test.ts", "**/*.test.tsx", "src/index.tsx", "src/types/**"],
		},
	},
});
