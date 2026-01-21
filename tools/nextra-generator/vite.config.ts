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
			external: ["jolli-common", "yaml", /^node:.*/],
		},
		outDir: "dist",
		sourcemap: true,
		ssr: true,
	},
});
