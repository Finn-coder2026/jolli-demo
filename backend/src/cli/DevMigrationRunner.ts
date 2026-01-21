/**
 * DevMigrationRunner - Runs schema migrations automatically in development mode.
 *
 * This module runs sequelize.sync({ alter: true }) for all tenant-org databases
 * when the backend starts in development mode. This ensures devs don't need to
 * manually run migrations after model changes.
 *
 * @module DevMigrationRunner
 */

import { getConfig } from "../config/Config";
import { createDatabase } from "../core/Database";
import type { TenantRegistryClient } from "../tenant/TenantRegistryClient";
import { createTenantSequelize } from "../tenant/TenantSequelizeFactory";
import { getLog } from "../util/Logger";
import type { Sequelize } from "sequelize";

const log = getLog(import.meta);

/**
 * Options for running dev migrations.
 */
export interface DevMigrationOptions {
	registryClient: TenantRegistryClient;
	decryptPassword: (encrypted: string) => string | Promise<string>;
}

/**
 * Result of a single org migration.
 */
interface OrgMigrationResult {
	tenantSlug: string;
	orgSlug: string;
	schemaName: string;
	status: "success" | "failed";
	error?: string;
	durationMs: number;
}

/**
 * Check if dev migrations should run.
 *
 * Dev migrations only run when ALL of these conditions are met:
 * - NODE_ENV is "development" (excludes ECS workers which run in production)
 * - NOT running on Vercel (VERCEL !== "1")
 * - MULTI_TENANT_ENABLED is true
 * - SKIP_DEV_MIGRATIONS is not true
 *
 * Note: WORKER_MODE is NOT checked because local dev may run in worker mode
 * and still needs migrations. ECS workers are excluded by NODE_ENV=production.
 */
export function shouldRunDevMigrations(): boolean {
	const config = getConfig();

	// Only run in development mode
	// This excludes ECS workers which run with NODE_ENV=production
	if (config.NODE_ENV !== "development") {
		return false;
	}

	// Never run on Vercel (even dev/preview deployments)
	// Vercel deployments use the GitHub Actions migration step
	// Note: VERCEL is a platform env var set by Vercel, not part of our app config
	if (process.env.VERCEL === "1") {
		return false;
	}

	// Skip if explicitly disabled
	if (config.SKIP_DEV_MIGRATIONS) {
		return false;
	}

	// Only run if multi-tenant is enabled
	return config.MULTI_TENANT_ENABLED;
}

/**
 * Run schema migrations for all tenant-org databases in development mode.
 *
 * Unlike production migrations, this:
 * - Continues on failure (logs warning, doesn't block startup)
 * - Has simpler logging
 * - No rollback capability (dev environment)
 */
export async function runDevMigrations(options: DevMigrationOptions): Promise<void> {
	const { registryClient, decryptPassword } = options;
	const startTime = Date.now();
	const results: Array<OrgMigrationResult> = [];

	log.info("Starting dev migrations for all tenant-orgs...");

	try {
		// Get all active tenants
		const tenants = await registryClient.listAllActiveTenants();
		log.info({ tenantCount: tenants.length }, "Found active tenants");

		for (const tenant of tenants) {
			// Get database config for this tenant
			const dbConfig = await registryClient.getTenantDatabaseConfig(tenant.id);
			if (!dbConfig) {
				log.warn({ tenantSlug: tenant.slug }, "No database config found for tenant, skipping");
				continue;
			}

			// Decrypt password (supports both sync and async)
			const password = await decryptPassword(dbConfig.databasePasswordEncrypted);

			// Get all active orgs for this tenant
			const orgs = await registryClient.listAllActiveOrgs(tenant.id);

			for (const org of orgs) {
				const orgStartTime = Date.now();
				let sequelize: Sequelize | undefined;

				try {
					// Create sequelize connection with schema
					sequelize = createTenantSequelize(
						{
							tenantId: tenant.id,
							databaseHost: dbConfig.databaseHost,
							databasePort: dbConfig.databasePort,
							databaseName: dbConfig.databaseName,
							databaseUsername: dbConfig.databaseUsername,
							databasePasswordEncrypted: dbConfig.databasePasswordEncrypted,
							databaseSsl: dbConfig.databaseSsl,
							databasePoolMax: dbConfig.databasePoolMax,
						},
						password,
						5, // poolMax
						false, // logging
						org.schemaName,
					);

					// Run sync with alter: true
					// postSync hooks are idempotent and needed to set up partitioned tables
					// (e.g., audit_events). Connection is closed after sync completes.
					await createDatabase(sequelize, { forceSync: true, skipPostSync: false });

					results.push({
						tenantSlug: tenant.slug,
						orgSlug: org.slug,
						schemaName: org.schemaName,
						status: "success",
						durationMs: Date.now() - orgStartTime,
					});

					log.debug({ tenant: tenant.slug, org: org.slug }, "Dev migration succeeded");
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);

					results.push({
						tenantSlug: tenant.slug,
						orgSlug: org.slug,
						schemaName: org.schemaName,
						status: "failed",
						error: errorMessage,
						durationMs: Date.now() - orgStartTime,
					});

					// Don't fail startup, just log warning
					log.warn({ tenant: tenant.slug, org: org.slug, error: errorMessage }, "Dev migration failed");
				} finally {
					if (sequelize) {
						await sequelize.close();
					}
				}
			}
		}

		// Log summary
		const successful = results.filter(r => r.status === "success").length;
		const failed = results.filter(r => r.status === "failed").length;
		const totalDuration = Date.now() - startTime;

		if (failed > 0) {
			log.warn(
				{ successful, failed, totalDuration },
				"Dev migrations completed with failures (continuing startup)",
			);
		} else {
			log.info({ successful, totalDuration }, "Dev migrations completed successfully");
		}
	} catch (error) {
		// Log error but don't block startup
		log.error(error, "Dev migration runner failed (continuing startup)");
	}
}
