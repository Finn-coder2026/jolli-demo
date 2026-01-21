import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

// Bundle the Worker entry point with all dependencies into a single file
// This creates a standalone worker bundle for Docker deployment
await build({
	entryPoints: ["src/worker/WorkerMain.ts"],
	bundle: true,
	platform: "node",
	target: "node22",
	format: "esm",
	outfile: "dist-worker/worker.js",
	external: [
		// Don't bundle native modules or unused database drivers
		"pg-native",
		"pg-hstore",
		"sharp",
		"canvas",
		"tedious",
		"sqlite3",
		"mysql2",
		"oracledb",
		"@google-cloud/*",
		// Keep AWS SDK external (provided by runtime or installed separately)
		"@aws-sdk/*",
		"aws-sdk",
	],
	alias: {
		// Map workspace packages to their source locations
		"nextra-generator": join(rootDir, "tools/nextra-generator/src/index.ts"),
		"jolli-agent/workflows": join(rootDir, "tools/jolliagent/src/workflows.ts"),
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

console.log("✓ Worker bundled for deployment → dist-worker/worker.js");
