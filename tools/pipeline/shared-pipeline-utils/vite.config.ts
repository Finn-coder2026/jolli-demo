import { defineConfig } from "vite";

export default defineConfig({
	build: {
		lib: {
			entry: {
				index: "src/index.ts",
				"mdx/index": "src/mdx/index.ts",
				"contracts/index": "src/contracts/index.ts",
				"hashing/index": "src/hashing/index.ts",
				"git/index": "src/git/index.ts",
				"fs/index": "src/fs/index.ts",
				"code-scanner/index": "src/code-scanner/index.ts",
				"detection/index": "src/detection/index.ts",
			},
			formats: ["es"],
		},
		rollupOptions: {
			external: [
				/^node:.*/,
				"gray-matter",
				"@babel/parser",
				"@babel/traverse",
				"@babel/types",
				"glob",
				"typescript",
			],
		},
	},
	test: {
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["src/**/*.ts"],
			exclude: ["**/*.test.ts", "src/index.ts", "src/**/index.ts"],
			thresholds: {
				lines: 97,
				functions: 97,
				branches: 97,
				statements: 97,
			},
		},
	},
});
