/**
 * Simple manual deployment test script.
 *
 * Usage:
 *   npx tsx src/test/integration/deploy.integration.ts <site-path>
 *
 * Examples:
 *   npx tsx src/test/integration/deploy.integration.ts D:/jolli-sample-repos/valid-site
 *
 * Environment:
 *   Loads VERCEL_TOKEN from .env.local or .env in backend directory
 */

import { VercelDeployer } from "../../util/VercelDeployer";
import { existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

// ESM equivalent of __dirname
const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFilePath);

// Load environment variables (go up from src/test/integration to backend/)
const backendDir = resolve(currentDir, "../../..");
const envLocalPath = resolve(backendDir, ".env.local");
const envPath = resolve(backendDir, ".env");

if (existsSync(envLocalPath)) {
	config({ path: envLocalPath });
	console.log(`Loaded env from: ${envLocalPath}`);
} else if (existsSync(envPath)) {
	config({ path: envPath });
	console.log(`Loaded env from: ${envPath}`);
}

async function main() {
	const token = process.env.VERCEL_TOKEN;
	if (!token) {
		console.error("ERROR: VERCEL_TOKEN not found in .env.local or .env");
		process.exit(1);
	}

	// Get site path from command line
	const sitePath = process.argv[2];
	if (!sitePath) {
		console.error("Usage: npx tsx src/test/integration/deploy.integration.ts <site-path>");
		console.error("Example: npx tsx src/test/integration/deploy.integration.ts D:/jolli-sample-repos/valid-site");
		process.exit(1);
	}

	const absolutePath = resolve(sitePath);
	if (!existsSync(absolutePath)) {
		console.error(`ERROR: Site path does not exist: ${absolutePath}`);
		process.exit(1);
	}

	const projectName = `test-${basename(absolutePath)}-${Date.now()}`;

	console.log("\n========================================");
	console.log("VERCEL DEPLOYMENT TEST");
	console.log("========================================");
	console.log(`Site Path: ${absolutePath}`);
	console.log(`Project Name: ${projectName}`);
	console.log("========================================\n");

	const deployer = new VercelDeployer(token);

	console.log("[DEPLOY] Starting deployment...\n");

	const result = await deployer.deploy(
		{
			projectName,
			sourcePath: absolutePath,
			projectSettings: {
				framework: "nextjs",
				buildCommand: "npm run build",
				installCommand: "npm install",
				outputDirectory: ".next",
			},
			target: "preview",
		},
		{
			onCommand: cmd => console.log(`[VERCEL] $ ${cmd}`),
			onStdout: text => console.log(`[VERCEL] ${text}`),
			onStderr: text => console.log(`[VERCEL:ERR] ${text}`),
			onStateChange: state => console.log(`[VERCEL:STATE] ${state}`),
			onError: msg => console.log(`[VERCEL:FATAL] ${msg}`),
		},
		{
			timeoutMs: 300000,
			pollIntervalMs: 3000,
		},
	);

	console.log("\n========================================");
	console.log("RESULT");
	console.log("========================================");
	console.log(`Status: ${result.status}`);
	console.log(`ID: ${result.id || "N/A"}`);
	console.log(`URL: ${result.url || "N/A"}`);
	if (result.error) {
		console.log(`Error: ${result.error}`);
	}
	if (result.buildLogs && result.buildLogs.length > 0) {
		console.log(`\nBuild Logs (${result.buildLogs.length} entries):`);
		for (const log of result.buildLogs.slice(-20)) {
			console.log(`  ${log}`);
		}
	}
	console.log("========================================\n");

	// Show how to delete if deployment succeeded
	if (result.id) {
		console.log("To delete this project from Vercel dashboard:");
		console.log(`  https://vercel.com/dashboard -> ${projectName} -> Settings -> Delete`);
	}
}

main().catch(err => {
	console.error("Deployment failed:", err);
	process.exit(1);
});
