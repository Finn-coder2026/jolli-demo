import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

// Bundle the ECS App entry point with all dependencies into a single file
// This creates a standalone app bundle that serves frontend static files via Express
await build({
	entryPoints: ["src/EcsHandler.ts"],
	bundle: true,
	platform: "node",
	target: "node22",
	format: "esm",
	outfile: "dist-app/server.js",
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
		// AWS SDK is bundled (not external) to include all langchain dependencies
		// Only keep aws-sdk v2 external if used
		"aws-sdk",
		// Biome WASM modules are optional runtime deps
		"@biomejs/wasm-bundler",
		"@biomejs/wasm-web",
		// @node-rs packages use native bindings, must be external
		"@node-rs/*",
		// better-auth and sendgrid need to be external (installed separately in Docker)
		"better-auth",
		"better-auth/*",
		"@sendgrid/mail",
	],
	alias: {
		// Map workspace packages to their source locations
		"nextra-generator": join(rootDir, "tools/nextra-generator/src/index.ts"),
		"jolli-agent/workflows": join(rootDir, "tools/jolliagent/src/workflows.ts"),
		"jolli-agent/jolliscript": join(rootDir, "tools/jolliagent/src/jolliscript/index.ts"),
		"jolli-agent": join(rootDir, "tools/jolliagent/src/index.ts"),
	},
	treeShaking: false,
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

console.log("✓ App bundled for ECS deployment → dist-app/server.js");
