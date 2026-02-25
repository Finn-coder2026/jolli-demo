#!/usr/bin/env node

/**
 * Generates runtime-deps.json for Docker production builds.
 *
 * This script extracts exact versions from package-lock.json for packages
 * that cannot be bundled by esbuild and must be installed at runtime:
 * - pg: Native PostgreSQL driver
 * - @node-rs/argon2: Native password hashing
 * - better-auth: Has dynamic imports that can't be bundled
 * - @sendgrid/mail: Email sending service
 *
 * Run this script before building the Docker image to ensure version consistency.
 *
 * Usage: node scripts/generate-runtime-deps.js
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

// Runtime dependencies that cannot be bundled
const RUNTIME_DEPS = ["pg", "@node-rs/argon2", "better-auth", "@sendgrid/mail"];

function getVersionFromLockfile(lockfile, packageName) {
	// Try packages format first (npm v7+)
	const packagesKey = `node_modules/${packageName}`;
	if (lockfile.packages?.[packagesKey]?.version) {
		return lockfile.packages[packagesKey].version;
	}

	// Fall back to dependencies format (npm v6)
	if (lockfile.dependencies?.[packageName]?.version) {
		return lockfile.dependencies[packageName].version;
	}

	return null;
}

function main() {
	const lockfilePath = join(rootDir, "package-lock.json");
	const outputPath = join(rootDir, "backend", "runtime-deps.json");

	console.log("Reading package-lock.json...");
	const lockfile = JSON.parse(readFileSync(lockfilePath, "utf-8"));

	const dependencies = {};
	const missing = [];

	for (const dep of RUNTIME_DEPS) {
		const version = getVersionFromLockfile(lockfile, dep);
		if (version) {
			dependencies[dep] = version;
			console.log(`  ${dep}: ${version}`);
		} else {
			missing.push(dep);
			console.warn(`  ${dep}: NOT FOUND`);
		}
	}

	if (missing.length > 0) {
		console.error(`\nError: Missing packages in lockfile: ${missing.join(", ")}`);
		process.exit(1);
	}

	const output = {
		name: "jolli-app-runtime",
		type: "module",
		description: "Runtime dependencies for Jolli App Docker image (auto-generated)",
		dependencies,
	};

	writeFileSync(outputPath, JSON.stringify(output, null, "\t") + "\n");
	console.log(`\nGenerated ${outputPath}`);
}

main();
