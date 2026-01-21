/**
 * Vercel build orchestrator script using Build Output API.
 * This gives us complete control over what gets deployed, bypassing
 * Vercel's automatic TypeScript processing.
 *
 * Output structure:
 * .vercel/output/
 *   config.json                    - Routing configuration
 *   static/                        - Frontend static assets
 *   functions/api/index.func/      - Serverless function
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../..");
const backendDir = join(rootDir, "backend");
const frontendDir = join(rootDir, "frontend");
const outputDir = join(rootDir, ".vercel/output");

console.log("🚀 Starting Vercel Build Output API build...\n");

// Clean previous output
if (existsSync(outputDir)) {
	rmSync(outputDir, { recursive: true });
}

// Step 1: Build backend serverless bundle
console.log("📦 Building backend serverless bundle...");
execSync("node build-serverless.js", {
	cwd: backendDir,
	stdio: "inherit",
});

// Step 2: Build frontend (package creates the dist folder with vite build)
console.log("\n📦 Building frontend...");
execSync("npm run package", {
	cwd: frontendDir,
	stdio: "inherit",
});

// Step 3: Create Build Output API structure
console.log("\n📁 Creating Build Output API structure...");

// Create output directories
const staticDir = join(outputDir, "static");
const funcDir = join(outputDir, "functions/api/index.func");
mkdirSync(staticDir, { recursive: true });
mkdirSync(funcDir, { recursive: true });

// Copy frontend assets to static
cpSync(join(frontendDir, "dist"), staticDir, { recursive: true });

// Copy serverless function (use .mjs extension for ESM modules)
cpSync(join(backendDir, "dist-serverless/handler.js"), join(funcDir, "index.mjs"));
cpSync(join(backendDir, "dist-serverless/handler.js.map"), join(funcDir, "index.mjs.map"));

// Create function config
// - handler: "index.mjs" for ESM with default export (Vercel auto-uses default export)
// - shouldAddHelpers: true adds Express-like methods (setHeader, json, etc.) to req/res
writeFileSync(
	join(funcDir, ".vc-config.json"),
	JSON.stringify(
		{
			runtime: "nodejs20.x",
			handler: "index.mjs",
			launcherType: "Nodejs",
			shouldAddHelpers: true,
			shouldAddSourcemapSupport: true,
			maxDuration: 30,
			memory: 1024,
		},
		null,
		2,
	),
);

// Create package.json for ESM support and dependencies
writeFileSync(
	join(funcDir, "package.json"),
	JSON.stringify(
		{
			type: "module",
			dependencies: {
				pg: "^8.16.0",
			},
		},
		null,
		2,
	),
);

// Install dependencies in the function directory
console.log("📦 Installing function dependencies...");
execSync("npm install --omit=dev", {
	cwd: funcDir,
	stdio: "inherit",
});

// Determine base domain for environment-specific routing
// In CI/CD, VERCEL_ENV is set by Vercel based on --target flag:
// - --prod sets VERCEL_ENV=production
// - --target=dev sets VERCEL_ENV=dev (custom environment)
// - --target=preview sets VERCEL_ENV=preview
const vercelEnv = process.env.VERCEL_ENV || "dev";
const baseDomainMap = {
	production: "jolli.ai",
	preview: "jolli.cloud",
	dev: "jolli.dev",
};
const baseDomain = process.env.BASE_DOMAIN || baseDomainMap[vercelEnv] || "jolli.dev";
console.log(`\n🌐 Configuring routes for base domain: ${baseDomain}`);

// Build the routes array
const routes = [];

// Base domain 404 handling
// When requests come to the bare base domain (no subdomain), return 404
// This allows future expansion to a company landing page or tenant routing
// Note: api.*, admin.*, and other subdomains still work normally
routes.push({
	src: "/(.*)",
	has: [{ type: "host", value: baseDomain }],
	status: 404,
	dest: "/_base-domain-404.html",
});

// API routes → serverless function
routes.push({ src: "^/api/(.*)", dest: "/api/index" });

// OAuth connect routes → serverless function
routes.push({ src: "^/connect/(.*)", dest: "/api/index" });

// Cache static assets
routes.push({
	src: "^/assets/(.*)",
	headers: { "Cache-Control": "public, max-age=31536000, immutable" },
	continue: true,
});

// SPA fallback - serve index.html for non-file routes
routes.push({ handle: "filesystem" });
routes.push({ src: "/(.*)", dest: "/index.html" });

// Create routing config
writeFileSync(
	join(outputDir, "config.json"),
	JSON.stringify(
		{
			version: 3,
			routes,
		},
		null,
		2,
	),
);

console.log("\n✅ Vercel Build Output API structure created!");
console.log(`   Output: ${outputDir}`);
console.log(`   Static: ${staticDir}`);
console.log(`   Function: ${funcDir}`);
