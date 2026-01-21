import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

// Bundle the Vercel handler with all dependencies into a single file
// This prevents Vercel from trying to process any TypeScript files
await build({
	entryPoints: ["src/VercelHandler.ts"],
	bundle: true,
	platform: "node",
	target: "node20",
	format: "esm",
	outfile: "dist-serverless/handler.js",
	external: [
		// Don't bundle native modules or database drivers
		"pg-native",
		"pg-hstore",
		"sharp",
		"canvas",
		"tedious",
		"sqlite3",
		"mysql2",
		"oracledb",
		"@google-cloud/*",
		"@aws-sdk/*",
		"aws-sdk",
		// Biome WASM modules are optional runtime deps, not needed for serverless
		"@biomejs/wasm-bundler",
		"@biomejs/wasm-web",
	],
	alias: {
		// Map workspace packages to their source locations
		"nextra-generator": join(rootDir, "tools/nextra-generator/src/index.ts"),
		"jolli-agent/workflows": join(rootDir, "tools/jolliagent/src/workflows.ts"),
		"jolli-agent/jolliscript": join(rootDir, "tools/jolliagent/src/jolliscript/index.ts"),
		"jolli-agent": join(rootDir, "tools/jolliagent/src/index.ts"),
	},
	minify: false,
	sourcemap: true,
	banner: {
		js: `import { createRequire as __createRequire__ } from 'module';
import { fileURLToPath as __fileURLToPath__ } from 'url';
import { dirname as __dirname_fn__ } from 'path';
const require = __createRequire__(import.meta.url);
const __filename = __fileURLToPath__(import.meta.url);
const __dirname = __dirname_fn__(__filename);`,
	},
});

console.log("✓ Backend bundled for serverless deployment → dist-serverless/handler.js");
