#!/usr/bin/env node

/**
 * MigrateSchemas - CLI entry point for schema migrations.
 *
 * This is a thin wrapper that calls runMigrationCli() and exits with the returned code.
 * All logic is in SchemaMigration.ts where it can be tested.
 *
 * Called from GitHub Actions BEFORE Vercel deployment.
 *
 * ## Usage
 *
 * ```bash
 * # Run migrations for all tenants
 * npx tsx src/cli/MigrateSchemas.ts
 *
 * # Dry run (no actual changes)
 * npx tsx src/cli/MigrateSchemas.ts --dry-run
 *
 * # Check only - verify connections without running migrations
 * npx tsx src/cli/MigrateSchemas.ts --check-only
 * ```
 *
 * @module MigrateSchemas
 */

import { EXIT_CODES, runMigrationCli } from "./SchemaMigration";

// Run the CLI and exit with the returned code
runMigrationCli()
	.then(result => {
		process.exit(result.exitCode);
	})
	.catch(error => {
		console.error("Unhandled error:", error);
		process.exit(EXIT_CODES.ERROR);
	});
