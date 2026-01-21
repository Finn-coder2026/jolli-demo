/**
 * SchemaMigration - Core business logic for schema migrations.
 *
 * This module contains the testable logic for running schema migrations.
 * The CLI runner in MigrateSchemas.ts uses these functions.
 *
 * @module SchemaMigration
 */

import { reloadEnvFiles } from "../config/Config";
import { ParameterStoreLoader } from "../config/ParameterStoreLoader";
import { createDatabase } from "../core/Database";
import { createTenantRegistryClient, type TenantRegistryClient } from "../tenant/TenantRegistryClient";
import { createTenantSequelize } from "../tenant/TenantSequelizeFactory";
import type { Org, Tenant } from "jolli-common";
import { decryptPassword, isEncryptedPassword } from "jolli-common/server";
import { Sequelize } from "sequelize";

/**
 * Result of a single tenant-org migration.
 */
export interface MigrationResult {
	tenantId: string;
	orgId: string;
	schemaName: string;
	status: "success" | "failed" | "skipped";
	error?: string;
	durationMs?: number;
	/** Whether actual schema changes were applied (only set when status is "success") */
	changesApplied?: boolean;
	/** Number of schema changes applied (only set when changesApplied is true) */
	changeCount?: number;
}

/**
 * Summary of all migrations.
 */
export interface MigrationSummary {
	totalTenants: number;
	totalOrgs: number;
	successful: number;
	failed: number;
	skipped: number;
	/** Number of successful migrations that applied schema changes */
	withChanges: number;
	/** Number of successful migrations with no schema changes needed */
	noChanges: number;
	results: Array<MigrationResult>;
	durationMs: number;
}

/**
 * Configuration options for the migration script.
 */
export interface MigrateConfig {
	/** Dry run mode - verify connections but don't apply changes */
	dryRun: boolean;
	/** Verbose logging */
	verbose: boolean;
	/** Check only mode - just verify connections */
	checkOnly: boolean;
	/** Skip migrations entirely */
	skipMigrations: boolean;
	/** AWS region for Parameter Store */
	awsRegion: string;
	/** Parameter Store environment */
	pstoreEnv?: string;
	/** Registry URL override */
	registryUrl?: string;
	/** Password encryption key */
	encryptionKey?: string;
	/** Explicit canary tenant slug (requires canaryOrgSlug) */
	canaryTenantSlug?: string;
	/** Explicit canary org slug (requires canaryTenantSlug) */
	canaryOrgSlug?: string;
}

/**
 * Logger interface for migration script.
 */
export interface MigrateLogger {
	info(message: string, data?: Record<string, unknown>): void;
	warn(message: string, data?: Record<string, unknown>): void;
	error(message: string, data?: Record<string, unknown>): void;
	debug(message: string, data?: Record<string, unknown>): void;
}
/* v8 ignore start */
/**
 * Create a console logger for CLI output.
 */
export function createConsoleLogger(verbose: boolean): MigrateLogger {
	function log(level: "info" | "warn" | "error" | "debug", message: string, data?: Record<string, unknown>): void {
		if (level === "debug" && !verbose) {
			return;
		}
		const timestamp = new Date().toISOString();
		const dataStr = data ? ` ${JSON.stringify(data)}` : "";
		const prefix = level === "error" ? "ERROR" : level === "warn" ? "WARN" : level === "debug" ? "DEBUG" : "INFO";
		console.log(`[${timestamp}] [${prefix}] ${message}${dataStr}`);
	}

	return {
		info: (message, data) => log("info", message, data),
		warn: (message, data) => log("warn", message, data),
		error: (message, data) => log("error", message, data),
		debug: (message, data) => log("debug", message, data),
	};
}

/**
 * Result of parsing command line arguments.
 */
export interface ParseArgsResult {
	config: Partial<MigrateConfig>;
	/** Validation error if args are invalid (e.g., mismatched canary args) */
	validationError?: string;
}

/**
 * Parse command line arguments into configuration.
 * Returns a validation error if canary args are mismatched (one provided without the other).
 */
export function parseArgs(args: Array<string>): ParseArgsResult {
	const config: Partial<MigrateConfig> = {
		dryRun: args.includes("--dry-run"),
		verbose: args.includes("--verbose") || args.includes("-v"),
		checkOnly: args.includes("--check-only"),
	};

	// Parse arguments with values
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--canary-tenant" && i + 1 < args.length) {
			config.canaryTenantSlug = args[++i];
		} else if (arg === "--canary-org" && i + 1 < args.length) {
			config.canaryOrgSlug = args[++i];
		}
	}

	// Early validation: canary args must be provided together or not at all
	const hasCanaryTenant = Boolean(config.canaryTenantSlug);
	const hasCanaryOrg = Boolean(config.canaryOrgSlug);
	if (hasCanaryTenant !== hasCanaryOrg) {
		return {
			config,
			validationError:
				"Both --canary-tenant and --canary-org must be specified together (or neither). " +
				`Got: --canary-tenant=${config.canaryTenantSlug ?? "(not set)"}, --canary-org=${config.canaryOrgSlug ?? "(not set)"}`,
		};
	}

	return { config };
}

/**
 * Build initial configuration from args and basic environment variables.
 * This reads directly from process.env to avoid triggering getConfig() validation
 * before Parameter Store is loaded.
 */
export function buildInitialConfig(argConfig: Partial<MigrateConfig>): MigrateConfig {
	return {
		dryRun: argConfig.dryRun ?? false,
		verbose: argConfig.verbose ?? false,
		checkOnly: argConfig.checkOnly ?? false,
		skipMigrations: process.env.SKIP_SCHEMA_MIGRATIONS === "true",
		awsRegion: process.env.AWS_REGION ?? "us-west-2",
		...(process.env.PSTORE_ENV && { pstoreEnv: process.env.PSTORE_ENV }),
	};
}

/**
 * Enrich config with values from environment variables.
 * NOTE: Reads directly from process.env instead of getConfig() to avoid requiring
 * ALL application env vars to be set. The migration script only needs a subset.
 */
export function enrichConfig(config: MigrateConfig): MigrateConfig {
	// Read only the specific env vars we need for migration (not full app config)
	const skipMigrations = process.env.SKIP_SCHEMA_MIGRATIONS === "true";
	const registryUrl = process.env.MULTI_TENANT_REGISTRY_URL;
	const encryptionKey = process.env.DB_PASSWORD_ENCRYPTION_KEY;
	const envCanaryTenant = process.env.CANARY_TENANT_SLUG;
	const envCanaryOrg = process.env.CANARY_ORG_SLUG;

	// CLI args take precedence over env vars for canary config
	const canaryTenantSlug = config.canaryTenantSlug ?? envCanaryTenant;
	const canaryOrgSlug = config.canaryOrgSlug ?? envCanaryOrg;

	return {
		...config,
		skipMigrations,
		...(registryUrl && { registryUrl }),
		...(encryptionKey && { encryptionKey }),
		...(canaryTenantSlug && { canaryTenantSlug }),
		...(canaryOrgSlug && { canaryOrgSlug }),
	};
}

/**
 * Load configuration from Parameter Store if PSTORE_ENV is set.
 * If not set, uses environment from .env.local (loaded at startup).
 */
export async function loadConfig(config: MigrateConfig, logger: MigrateLogger): Promise<Record<string, string>> {
	// If PSTORE_ENV is not set, skip Parameter Store and use environment from .env.local
	if (!config.pstoreEnv) {
		logger.info("Using local config from .env.local (no PSTORE_ENV set)");
		return {};
	}

	// Always use "vercel" path base since this migration script runs before Vercel deployments
	// and needs to read the same parameters the deployment will use
	const pathBase = "vercel";

	logger.info(`Loading configuration from Parameter Store (env: ${config.pstoreEnv}, pathBase: ${pathBase})`);

	const loader = new ParameterStoreLoader({
		pstoreEnv: config.pstoreEnv,
		pathBase,
		region: config.awsRegion,
		applyToProcessEnv: true,
	});

	return await loader.load();
}

/**
 * Create the tenant registry client.
 */
export function createRegistryClientFromConfig(config: MigrateConfig, logger: MigrateLogger): TenantRegistryClient {
	// Read from config or fall back to process.env (avoid getConfig() validation)
	const registryUrl = config.registryUrl ?? process.env.MULTI_TENANT_REGISTRY_URL;

	if (!registryUrl) {
		throw new Error("MULTI_TENANT_REGISTRY_URL not configured");
	}

	logger.info("Connecting to tenant registry");
	return createTenantRegistryClient({ registryDatabaseUrl: registryUrl });
}

/**
 * Decrypt a database password.
 */
export function decryptDatabasePasswordCli(encrypted: string, encryptionKey?: string): string {
	// Fallback: if no encryption key configured, return as-is
	if (!encryptionKey) {
		return encrypted;
	}

	// Fallback: if value doesn't look like an encrypted password, return as-is
	if (!isEncryptedPassword(encrypted)) {
		return encrypted;
	}

	return decryptPassword(encrypted, encryptionKey);
}

/**
 * Dependencies for migration that can be injected for testing.
 */
export interface MigrateDependencies {
	createSequelize: typeof createTenantSequelize;
	createDb: typeof createDatabase;
}

/**
 * Default dependencies using real implementations.
 */
export const defaultDependencies: MigrateDependencies = {
	createSequelize: createTenantSequelize,
	createDb: createDatabase,
};

/**
 * Run migration for a single tenant-org.
 */
export async function migrateTenantOrg(
	registryClient: TenantRegistryClient,
	tenant: Tenant,
	org: Org,
	config: MigrateConfig,
	logger: MigrateLogger,
	deps: MigrateDependencies = defaultDependencies,
): Promise<MigrationResult> {
	const startTime = Date.now();
	let sequelize: Sequelize | undefined;

	try {
		logger.info(`Migrating ${tenant.slug}/${org.slug} (schema: ${org.schemaName})`);

		// Get database config for tenant
		const dbConfig = await registryClient.getTenantDatabaseConfig(tenant.id);
		if (!dbConfig) {
			const errorMessage = `No database config found for tenant: ${tenant.slug}`;
			logger.error(`Migration failed for ${tenant.slug}/${org.slug}: ${errorMessage}`);
			return {
				tenantId: tenant.id,
				orgId: org.id,
				schemaName: org.schemaName,
				status: "failed",
				error: errorMessage,
				durationMs: Date.now() - startTime,
			};
		}

		// Log database connection info (mask password for security)
		const passwordPreview = dbConfig.databasePasswordEncrypted
			? `${dbConfig.databasePasswordEncrypted.substring(0, 8)}...`
			: "(empty)";
		logger.debug(`Database connection for ${tenant.slug}:`, {
			host: dbConfig.databaseHost,
			port: dbConfig.databasePort,
			database: dbConfig.databaseName,
			username: dbConfig.databaseUsername,
			ssl: dbConfig.databaseSsl,
			poolMax: dbConfig.databasePoolMax,
			passwordEncrypted: passwordPreview,
			schema: org.schemaName,
		});

		// Decrypt password - use config or fall back to process.env (avoid getConfig() validation)
		const encryptionKey = config.encryptionKey ?? process.env.DB_PASSWORD_ENCRYPTION_KEY;
		const password = decryptDatabasePasswordCli(dbConfig.databasePasswordEncrypted, encryptionKey);

		// Create sequelize connection with search_path set to org's schema
		sequelize = deps.createSequelize(
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
			config.verbose, // logging
			org.schemaName,
		);

		if (config.checkOnly) {
			// In check-only mode, just verify connection works
			await sequelize.authenticate();
			logger.info(`[CHECK] Connection verified for ${tenant.slug}/${org.slug}`);
			return {
				tenantId: tenant.id,
				orgId: org.id,
				schemaName: org.schemaName,
				status: "skipped",
				durationMs: Date.now() - startTime,
			};
		}

		if (config.dryRun) {
			// In dry run, verify connection and report what would happen
			await sequelize.authenticate();
			logger.info(`[DRY RUN] Would migrate ${tenant.slug}/${org.slug}`);
			return {
				tenantId: tenant.id,
				orgId: org.id,
				schemaName: org.schemaName,
				status: "skipped",
				durationMs: Date.now() - startTime,
			};
		}

		// Capture schema state BEFORE migration to detect real changes
		const schemaBefore = await captureSchemaState(sequelize);

		// Run createDatabase which handles sync({ alter: true })
		// Skip postSync hooks - they use fire-and-forget async and would fail when CLI closes connection.
		// Data migrations in postSync will run automatically when the backend starts normally.
		await deps.createDb(sequelize, { forceSync: true, skipPostSync: true });

		// Capture schema state AFTER migration
		const schemaAfter = await captureSchemaState(sequelize);

		// Compare to detect actual changes (filters out Sequelize's no-op ALTERs)
		const realChanges = diffSchemas(schemaBefore, schemaAfter);
		const changesApplied = realChanges.length > 0;

		if (changesApplied) {
			const changeDescriptions = formatSchemaDiffs(realChanges);
			logger.info(`✓ Migrated ${tenant.slug}/${org.slug} - ${realChanges.length} change(s) applied`);
			for (const desc of changeDescriptions) {
				logger.info(`  ${desc}`);
			}
		} else {
			logger.info(`✓ Migrated ${tenant.slug}/${org.slug} - no changes needed (schema up to date)`);
		}

		return {
			tenantId: tenant.id,
			orgId: org.id,
			schemaName: org.schemaName,
			status: "success",
			durationMs: Date.now() - startTime,
			changesApplied,
			changeCount: realChanges.length,
		};
	} catch (error) {
		/* v8 ignore next */
		const message = error instanceof Error ? error.message : String(error);
		logger.error(`Migration failed for ${tenant.slug}/${org.slug}: ${message}`);
		/* v8 ignore next 9 */
		return {
			tenantId: tenant.id,
			orgId: org.id,
			schemaName: org.schemaName,
			status: "failed",
			error: message,
			durationMs: Date.now() - startTime,
		};
		/* v8 ignore next */
	} finally {
		// Close sequelize connection
		if (sequelize) {
			await sequelize.close();
		}
	}
}

/**
 * Prepared org context for migration, including tenant info.
 */
interface OrgMigrationContext {
	tenant: Tenant;
	org: Org;
}

/**
 * Mutable counters for tracking migration statistics.
 */
interface MigrationCounters {
	failed: number;
	successful: number;
	skipped: number;
	withChanges: number;
	noChanges: number;
}

/**
 * Update counters based on a migration result.
 */
function updateCounters(counters: MigrationCounters, result: MigrationResult): void {
	if (result.status === "failed") {
		counters.failed++;
	} else if (result.status === "skipped") {
		counters.skipped++;
	} else {
		counters.successful++;
		if (result.changesApplied) {
			counters.withChanges++;
		} else {
			counters.noChanges++;
		}
	}
}

/**
 * Build a migration summary from the current state.
 */
function buildSummary(
	tenantCount: number,
	totalOrgs: number,
	counters: MigrationCounters,
	results: Array<MigrationResult>,
	startTime: number,
): MigrationSummary {
	return {
		totalTenants: tenantCount,
		totalOrgs,
		successful: counters.successful,
		failed: counters.failed,
		skipped: counters.skipped,
		withChanges: counters.withChanges,
		noChanges: counters.noChanges,
		results,
		durationMs: Date.now() - startTime,
	};
}

/**
 * Select or find the canary org from the list of all orgs.
 * Moves the canary to the front of the array if configured.
 */
function selectCanary(
	allOrgs: Array<OrgMigrationContext>,
	config: MigrateConfig,
	logger: MigrateLogger,
): OrgMigrationContext {
	const hasCanaryTenant = Boolean(config.canaryTenantSlug);
	const hasCanaryOrg = Boolean(config.canaryOrgSlug);

	if (hasCanaryTenant !== hasCanaryOrg) {
		throw new Error(
			"Both --canary-tenant and --canary-org must be specified together (or neither). " +
				`Got: tenant=${config.canaryTenantSlug ?? "(not set)"}, org=${config.canaryOrgSlug ?? "(not set)"}`,
		);
	}

	if (config.canaryTenantSlug && config.canaryOrgSlug) {
		const found = allOrgs.find(
			ctx => ctx.tenant.slug === config.canaryTenantSlug && ctx.org.slug === config.canaryOrgSlug,
		);
		if (!found) {
			throw new Error(
				`Configured canary tenant+org not found or inactive: ${config.canaryTenantSlug}/${config.canaryOrgSlug}`,
			);
		}
		logger.info(`Using configured canary: ${found.tenant.slug}/${found.org.slug}`);

		// Move canary to front of array
		const canaryIndex = allOrgs.indexOf(found);
		if (canaryIndex > 0) {
			allOrgs.splice(canaryIndex, 1);
			allOrgs.unshift(found);
		}
		return found;
	}

	// Default: first org
	const canary = allOrgs[0];
	logger.info(`Using default canary (first org): ${canary.tenant.slug}/${canary.org.slug}`);
	return canary;
}

export async function migrateAllTenants(
	registryClient: TenantRegistryClient,
	config: MigrateConfig,
	logger: MigrateLogger,
	deps: MigrateDependencies = defaultDependencies,
): Promise<MigrationSummary> {
	const startTime = Date.now();
	const results: Array<MigrationResult> = [];
	const counters: MigrationCounters = { failed: 0, successful: 0, skipped: 0, withChanges: 0, noChanges: 0 };

	// Get all active tenants
	logger.info("Fetching all active tenants");
	const tenants = await registryClient.listAllActiveTenants();
	logger.info(`Found ${tenants.length} active tenant(s)`);

	// Phase 1: Collect all orgs with their tenant context
	const allOrgs = await collectAllOrgs(registryClient, tenants, logger);
	const totalOrgs = allOrgs.length;
	logger.info(`Total orgs to migrate: ${totalOrgs}`);

	if (totalOrgs === 0) {
		logger.info("No orgs to migrate");
		return buildSummary(tenants.length, 0, counters, results, startTime);
	}

	// Phase 2: CANARY - Select and migrate canary org first
	const canary = selectCanary(allOrgs, config, logger);

	logger.info("=".repeat(60));
	logger.info(`CANARY MIGRATION: ${canary.tenant.slug}/${canary.org.slug}`);
	logger.info("=".repeat(60));

	const canaryResult = await migrateTenantOrg(registryClient, canary.tenant, canary.org, config, logger, deps);
	results.push(canaryResult);
	updateCounters(counters, canaryResult);

	if (canaryResult.status === "failed") {
		logger.error("Canary migration failed - stopping before affecting other orgs");
		return buildSummary(tenants.length, totalOrgs, counters, results, startTime);
	}

	// Phase 3: Canary succeeded - proceed with remaining orgs
	if (allOrgs.length > 1) {
		logger.info("=".repeat(60));
		logger.info("Canary migration succeeded - proceeding with remaining orgs");
		logger.info("=".repeat(60));

		for (let i = 1; i < allOrgs.length; i++) {
			const { tenant, org } = allOrgs[i];
			logger.info(`Migrating ${tenant.slug}/${org.slug} (${i + 1}/${totalOrgs})`);

			const result = await migrateTenantOrg(registryClient, tenant, org, config, logger, deps);
			results.push(result);
			updateCounters(counters, result);

			if (result.status === "failed") {
				logger.error("Migration failed - stopping immediately to prevent partial migration state");
				return buildSummary(tenants.length, totalOrgs, counters, results, startTime);
			}
		}
	}

	return buildSummary(tenants.length, totalOrgs, counters, results, startTime);
}

/**
 * Collect all orgs across all tenants that have database configs.
 */
async function collectAllOrgs(
	registryClient: TenantRegistryClient,
	tenants: Array<Tenant>,
	logger: MigrateLogger,
): Promise<Array<OrgMigrationContext>> {
	const allOrgs: Array<OrgMigrationContext> = [];

	for (const tenant of tenants) {
		logger.debug(`Collecting orgs for tenant: ${tenant.slug}`);

		const dbConfig = await registryClient.getTenantDatabaseConfig(tenant.id);
		if (!dbConfig) {
			logger.error(`No database config for tenant ${tenant.slug}, skipping`);
			continue;
		}

		const orgs = await registryClient.listAllActiveOrgs(tenant.id);
		for (const org of orgs) {
			allOrgs.push({ tenant, org });
		}
	}

	return allOrgs;
}

/**
 * Status of a dry-run check.
 * - 'error': An error occurred during the check
 * - 'no_changes': Schema is up to date, no changes needed
 * - 'has_changes': Schema changes would be applied
 */
export type DryRunStatus = "error" | "no_changes" | "has_changes";

/**
 * Result of a dry-run schema check.
 */
export interface DryRunResult {
	/** Status of the dry-run check (check this first before hasChanges) */
	status: DryRunStatus;
	/** Whether schema changes are needed (only meaningful when status is not 'error') */
	hasChanges: boolean;
	/** DDL statements that would be applied */
	ddlStatements: Array<string>;
	/** Error message if the check failed (present when status is 'error') */
	error?: string;
}

/**
 * Options for creating a Sequelize instance for dry-run.
 */
export interface DryRunSequelizeOptions {
	scheme: string;
	host: string;
	port: number;
	noPort: boolean;
	database: string;
	username: string;
	password: string;
	queryParams?: string;
	ssl: boolean;
}

/**
 * Create a Sequelize instance for dry-run checks.
 * Uses a single connection to ensure transaction consistency.
 */
export function createDryRunSequelize(options: DryRunSequelizeOptions, loggingFn: (sql: string) => void): Sequelize {
	const { scheme, host, port, noPort, database, username, password, queryParams, ssl } = options;

	const encodedUsername = encodeURIComponent(username);
	const encodedPassword = encodeURIComponent(password);
	const portPart = noPort ? "" : `:${port}`;
	const queryParamsPart = queryParams ? `?${queryParams}` : "";
	const connectionUri = `${scheme}://${encodedUsername}:${encodedPassword}@${host}${portPart}/${database}${queryParamsPart}`;

	return new Sequelize(connectionUri, {
		dialect: "postgres",
		dialectOptions: ssl ? { ssl: { rejectUnauthorized: false } } : {},
		logging: loggingFn,
		pool: { max: 1, min: 1 }, // Single connection for transaction consistency
		define: { underscored: true },
	});
}

/**
 * Represents the state of a database column for comparison.
 */
interface ColumnState {
	tableName: string;
	columnName: string;
	dataType: string;
	isNullable: boolean;
	columnDefault: string | null;
}

/**
 * Represents the state of a table for comparison.
 */
interface TableState {
	tableName: string;
	columns: Map<string, ColumnState>;
}

/**
 * Represents a schema difference.
 */
interface SchemaDiff {
	type: "table_added" | "table_removed" | "column_added" | "column_removed" | "column_changed";
	tableName: string;
	columnName?: string;
	details?: string;
}

/**
 * Capture the current schema state from information_schema.
 * This queries column definitions for all tables in the current schema.
 */
export async function captureSchemaState(sequelize: Sequelize): Promise<Map<string, TableState>> {
	const [rows] = (await sequelize.query(`
		SELECT
			table_name,
			column_name,
			data_type,
			is_nullable,
			column_default
		FROM information_schema.columns
		WHERE table_schema = current_schema()
		ORDER BY table_name, ordinal_position
	`)) as [Array<Record<string, unknown>>, unknown];

	const tables = new Map<string, TableState>();

	for (const row of rows) {
		const tableName = row.table_name as string;
		const columnName = row.column_name as string;

		let table = tables.get(tableName);
		if (!table) {
			table = { tableName, columns: new Map() };
			tables.set(tableName, table);
		}

		table.columns.set(columnName, {
			tableName,
			columnName,
			dataType: row.data_type as string,
			isNullable: row.is_nullable === "YES",
			columnDefault: row.column_default as string | null,
		});
	}

	return tables;
}

/**
 * Compare two schema states and return the differences.
 * This filters out Sequelize's no-op ALTER statements by comparing actual schema state.
 */
export function diffSchemas(before: Map<string, TableState>, after: Map<string, TableState>): Array<SchemaDiff> {
	const diffs: Array<SchemaDiff> = [];

	// Check for added tables
	for (const [tableName, afterTable] of after) {
		const beforeTable = before.get(tableName);
		if (!beforeTable) {
			diffs.push({ type: "table_added", tableName });
			continue;
		}

		// Check for added columns
		for (const [columnName, afterCol] of afterTable.columns) {
			const beforeCol = beforeTable.columns.get(columnName);
			if (!beforeCol) {
				diffs.push({ type: "column_added", tableName, columnName });
				continue;
			}

			// Check for column changes (type, nullable, default)
			const changes: Array<string> = [];

			if (beforeCol.dataType !== afterCol.dataType) {
				changes.push(`type: ${beforeCol.dataType} → ${afterCol.dataType}`);
			}
			if (beforeCol.isNullable !== afterCol.isNullable) {
				changes.push(`nullable: ${beforeCol.isNullable} → ${afterCol.isNullable}`);
			}
			// Normalize defaults for comparison (handle sequences, etc.)
			const beforeDefault = normalizeDefault(beforeCol.columnDefault);
			const afterDefault = normalizeDefault(afterCol.columnDefault);
			if (beforeDefault !== afterDefault) {
				/* v8 ignore next */
				changes.push(`default: ${beforeDefault ?? "null"} → ${afterDefault ?? "null"}`);
			}

			if (changes.length > 0) {
				diffs.push({
					type: "column_changed",
					tableName,
					columnName,
					details: changes.join(", "),
				});
			}
		}

		// Check for removed columns
		for (const columnName of beforeTable.columns.keys()) {
			if (!afterTable.columns.has(columnName)) {
				diffs.push({ type: "column_removed", tableName, columnName });
			}
		}
	}

	// Check for removed tables
	for (const tableName of before.keys()) {
		if (!after.has(tableName)) {
			diffs.push({ type: "table_removed", tableName });
		}
	}

	return diffs;
}

/**
 * Normalize a column default value for comparison.
 * PostgreSQL stores defaults in various formats that may differ cosmetically.
 */
function normalizeDefault(value: string | null): string | null {
	if (value === null) {
		return null;
	}

	// Remove type casts like ::character varying
	let normalized = value.replace(/::[a-z_ ]+/gi, "");

	// Normalize quotes
	normalized = normalized.replace(/^'|'$/g, "");

	// Handle nextval sequences (consider them equivalent if both are sequences)
	if (normalized.includes("nextval")) {
		return "[sequence]";
	}
	/* v8 ignore next */
	return normalized.trim() || null;
}

/**
 * Format schema diffs into human-readable descriptions.
 */
export function formatSchemaDiffs(diffs: Array<SchemaDiff>): Array<string> {
	return diffs.map(diff => {
		switch (diff.type) {
			case "table_added":
				return `CREATE TABLE ${diff.tableName}`;
			case "table_removed":
				return `DROP TABLE ${diff.tableName}`;
			case "column_added":
				return `ALTER TABLE ${diff.tableName} ADD COLUMN ${diff.columnName}`;
			case "column_removed":
				return `ALTER TABLE ${diff.tableName} DROP COLUMN ${diff.columnName}`;
			case "column_changed":
				return `ALTER TABLE ${diff.tableName} ALTER COLUMN ${diff.columnName} (${diff.details})`;
		}
	});
}

/**
 * Run a dry-run schema check against a database.
 * Uses PostgreSQL's transactional DDL to see what changes would be made without persisting them.
 * Compares actual schema state before/after to filter out Sequelize's no-op ALTER statements.
 *
 * @param sequelize - Sequelize instance to use
 * @param createDb - Function to create database (for dependency injection)
 * @returns DryRunResult with list of REAL schema changes (no-ops filtered out)
 */
export async function runDryRunCheck(
	sequelize: Sequelize,
	createDb: typeof createDatabase = createDatabase,
): Promise<DryRunResult> {
	let syncError: Error | undefined;

	try {
		// Capture schema state BEFORE sync
		const schemaBefore = await captureSchemaState(sequelize);

		// Start transaction (PostgreSQL DDL is transactional)
		await sequelize.query("BEGIN");

		try {
			// Run sync to see what would change
			// Use skipPostSync to avoid postSync hooks that might call getConfig()
			await createDb(sequelize, { forceSync: true, skipPostSync: true });

			// Capture schema state AFTER sync (within transaction)
			const schemaAfter = await captureSchemaState(sequelize);

			// Rollback - no changes will be persisted
			await sequelize.query("ROLLBACK");

			// Compare schemas to find REAL changes (filter out no-ops)
			const realDiffs = diffSchemas(schemaBefore, schemaAfter);
			const realChanges = formatSchemaDiffs(realDiffs);
			const hasChanges = realChanges.length > 0;
			/* v8 ignore next 5 */
			return {
				status: hasChanges ? "has_changes" : "no_changes",
				hasChanges,
				ddlStatements: realChanges, // Return only real changes, not raw DDL noise
			};
		} catch (error) {
			// Store the sync error to return later
			syncError = error instanceof Error ? error : new Error(String(error));
			// Try to rollback on error
			try {
				await sequelize.query("ROLLBACK");
			} catch {
				// Ignore rollback errors
			}
		}
	} catch (error) {
		// This catches errors from captureSchemaState or BEGIN
		/* v8 ignore next */
		const message = error instanceof Error ? error.message : String(error);
		return {
			status: "error",
			hasChanges: false,
			ddlStatements: [],
			error: message,
		};
	}

	// Return error from sync phase if one occurred
	if (syncError) {
		return {
			status: "error",
			hasChanges: false,
			ddlStatements: [],
			error: syncError.message,
		};
		/* v8 ignore next */
	}

	// Should never reach here, but TypeScript needs a return
	/* v8 ignore next 7 */
	return {
		status: "error",
		hasChanges: false,
		ddlStatements: [],
		error: "Unexpected state in runDryRunCheck",
	};
}

/**
 * Create a logging function that captures DDL statements.
 * Filters out SELECT queries and only captures ALTER, CREATE, DROP statements.
 */
export function createDdlCapture(): { loggingFn: (sql: string) => void; statements: Array<string> } {
	const statements: Array<string> = [];

	const loggingFn = (sql: string) => {
		// Strip Sequelize prefix if present
		const trimmedSql = sql.replace(/^Executing \(default\): /, "");

		// Only capture DDL statements (case-insensitive for safety)
		const upperSql = trimmedSql.toUpperCase();
		if (upperSql.startsWith("ALTER") || upperSql.startsWith("CREATE") || upperSql.startsWith("DROP")) {
			statements.push(trimmedSql); // Keep original case for display
		}
	};

	return { loggingFn, statements };
}

/**
 * Run dry-run against the canary tenant database.
 * Uses either a configured canary tenant/org or the first active tenant/org from the registry.
 * All tenant schemas use identical Sequelize models, so checking one database is sufficient.
 *
 * @param logger - Optional logger for output (defaults to console logger)
 * @returns DryRunResult
 */
export async function runDryRun(logger?: MigrateLogger): Promise<DryRunResult> {
	// Use provided logger or create a default console logger
	const log = logger ?? createConsoleLogger(false);

	// Step 1: Load .env.local into process.env (local config takes precedence initially)
	reloadEnvFiles();

	// Step 2: If PSTORE_ENV is set, load from Parameter Store (overlays on top of local values)
	const pstoreEnv = process.env.PSTORE_ENV;
	if (pstoreEnv) {
		const loader = new ParameterStoreLoader({
			pstoreEnv,
			pathBase: "vercel", // Always use vercel path for migrations
			region: process.env.AWS_REGION ?? "us-west-2",
			applyToProcessEnv: true,
		});
		await loader.load();
		log.info(`[DRY RUN] Loaded config from Parameter Store (${pstoreEnv})`);
	} else {
		log.info("[DRY RUN] Using local config from .env.local (no PSTORE_ENV set)");
	}

	// Step 3: Extract only the needed config (no full getConfig() validation)
	const registryUrl = process.env.MULTI_TENANT_REGISTRY_URL;
	const encryptionKey = process.env.DB_PASSWORD_ENCRYPTION_KEY;
	const canaryTenantSlug = process.env.CANARY_TENANT_SLUG;
	const canaryOrgSlug = process.env.CANARY_ORG_SLUG;

	if (!registryUrl) {
		return {
			status: "error",
			hasChanges: false,
			ddlStatements: [],
			error: "MULTI_TENANT_REGISTRY_URL not configured - cannot run dry-run",
		};
	}

	// Validate canary config: both slugs must be provided together, or neither
	const hasCanaryTenant = Boolean(canaryTenantSlug);
	const hasCanaryOrg = Boolean(canaryOrgSlug);
	if (hasCanaryTenant !== hasCanaryOrg) {
		return {
			status: "error",
			hasChanges: false,
			ddlStatements: [],
			error:
				"Both CANARY_TENANT_SLUG and CANARY_ORG_SLUG must be specified together (or neither). " +
				`Got: tenant=${canaryTenantSlug ?? "(not set)"}, org=${canaryOrgSlug ?? "(not set)"}`,
		};
	}

	const registryClient = createTenantRegistryClient({ registryDatabaseUrl: registryUrl });

	try {
		let canaryTenant: Tenant;
		let canaryOrg: Org;

		if (canaryTenantSlug && canaryOrgSlug) {
			// Use configured canary - find the specific tenant
			const tenants = await registryClient.listAllActiveTenants();
			const foundTenant = tenants.find(t => t.slug === canaryTenantSlug);
			if (!foundTenant) {
				return {
					status: "error",
					hasChanges: false,
					ddlStatements: [],
					error: `Configured canary tenant not found or inactive: ${canaryTenantSlug}`,
				};
			}
			canaryTenant = foundTenant;

			// Find the specific org
			const orgs = await registryClient.listAllActiveOrgs(canaryTenant.id);
			const foundOrg = orgs.find(o => o.slug === canaryOrgSlug);
			if (!foundOrg) {
				return {
					status: "error",
					hasChanges: false,
					ddlStatements: [],
					error: `Configured canary org not found or inactive: ${canaryTenantSlug}/${canaryOrgSlug}`,
				};
			}
			canaryOrg = foundOrg;
			log.info(`[DRY RUN] Using configured canary: ${canaryTenant.slug}/${canaryOrg.slug}`);
		} else {
			// Default: first active tenant and org
			const tenants = await registryClient.listAllActiveTenants();
			if (tenants.length === 0) {
				// No tenants means nothing to migrate - this is a valid state (e.g., fresh environment)
				log.info("[DRY RUN] No active tenants found - nothing to migrate");
				return { status: "no_changes", hasChanges: false, ddlStatements: [] };
			}
			canaryTenant = tenants[0];

			const orgs = await registryClient.listAllActiveOrgs(canaryTenant.id);
			if (orgs.length === 0) {
				return {
					status: "error",
					hasChanges: false,
					ddlStatements: [],
					error: `No active orgs for tenant: ${canaryTenant.slug}`,
				};
			}
			canaryOrg = orgs[0];
			log.info(`[DRY RUN] Using default canary (first org): ${canaryTenant.slug}/${canaryOrg.slug}`);
		}

		// Get database config for canary tenant
		const dbConfig = await registryClient.getTenantDatabaseConfig(canaryTenant.id);
		if (!dbConfig) {
			return {
				status: "error",
				hasChanges: false,
				ddlStatements: [],
				error: `No database config for tenant: ${canaryTenant.slug}`,
			};
		}

		// Decrypt password
		const password = decryptDatabasePasswordCli(dbConfig.databasePasswordEncrypted, encryptionKey);

		// Create sequelize for canary tenant's database
		// Use pool size 1 to ensure all operations use the same connection.
		// This is required for transaction consistency during dry-run (BEGIN/ROLLBACK).
		const sequelize = createTenantSequelize(dbConfig, password, 1, false, canaryOrg.schemaName);

		try {
			return await runDryRunCheck(sequelize);
		} finally {
			await sequelize.close();
		}
	} finally {
		await registryClient.close();
	}
}

/**
 * Print migration summary using the provided logger.
 */
export function printSummary(summary: MigrationSummary, config: MigrateConfig, logger: MigrateLogger): void {
	logger.info(`\n${"=".repeat(60)}`);
	logger.info("MIGRATION SUMMARY");
	logger.info("=".repeat(60));
	logger.info(`Total Tenants:  ${summary.totalTenants}`);
	logger.info(`Total Orgs:     ${summary.totalOrgs}`);
	logger.info(`Successful:     ${summary.successful}`);
	if (summary.successful > 0 && !config.checkOnly && !config.dryRun) {
		logger.info(`  - With changes:    ${summary.withChanges}`);
		logger.info(`  - No changes:      ${summary.noChanges}`);
	}
	logger.info(`Failed:         ${summary.failed}`);
	logger.info(`Skipped:        ${summary.skipped}`);
	logger.info(`Duration:       ${(summary.durationMs / 1000).toFixed(2)}s`);
	logger.info("=".repeat(60));

	if (summary.failed > 0) {
		logger.error("\nFAILED MIGRATIONS:");
		for (const result of summary.results) {
			if (result.status === "failed") {
				logger.error(`  - ${result.schemaName}: ${result.error}`);
			}
		}
	}

	// Show a clear message when all migrations succeeded but no changes were needed
	if (summary.successful > 0 && summary.noChanges === summary.successful && !config.checkOnly && !config.dryRun) {
		logger.info("\n✓ All schemas are up to date - no changes were needed.");
	}

	if (config.checkOnly) {
		logger.info("\n[CHECK ONLY] Verified all database connections. No migrations run.");
	} else if (config.dryRun) {
		logger.info("\n[DRY RUN] No actual changes were made.");
	}
}

/**
 * Exit codes for the migration script.
 * Using codes >= 10 to avoid conflicts with standard POSIX exit codes.
 */
export const EXIT_CODES = {
	/** Migration completed successfully, no changes needed */
	SUCCESS: 0,
	/** An error occurred during migration */
	ERROR: 1,
	/** Dry-run detected schema changes that need to be applied */
	CHANGES_DETECTED: 10,
} as const;

/**
 * Result of formatting dry-run results for CLI output.
 */
export interface DryRunCliResult {
	exitCode: number;
	messages: Array<{ level: "info" | "warn" | "error"; message: string }>;
}

/**
 * Format dry-run results for CLI output.
 * Returns exit code and messages instead of calling process.exit() directly.
 */
export function formatDryRunResult(result: DryRunResult): DryRunCliResult {
	const messages: DryRunCliResult["messages"] = [];

	switch (result.status) {
		case "error":
			messages.push({ level: "error", message: `[DRY RUN] Error: ${result.error}` });
			return { exitCode: EXIT_CODES.ERROR, messages };

		case "has_changes":
			messages.push({ level: "info", message: "[DRY RUN] Schema changes that would be applied:\n" });
			for (const sql of result.ddlStatements) {
				messages.push({ level: "info", message: `  ${sql}` });
			}
			messages.push({
				level: "warn",
				message: `\n⚠️  ${result.ddlStatements.length} schema change(s) detected - full migration required`,
			});
			return { exitCode: EXIT_CODES.CHANGES_DETECTED, messages };

		case "no_changes":
			messages.push({ level: "info", message: "✓ No schema changes needed - schemas are up to date" });
			return { exitCode: EXIT_CODES.SUCCESS, messages };
	}
}

/**
 * Result of running the migration CLI.
 */
export interface MigrationCliResult {
	exitCode: number;
}

/**
 * Run the migration CLI with the given arguments.
 * Returns an exit code instead of calling process.exit() directly, making it testable.
 *
 * @param args - Command line arguments (defaults to process.argv.slice(2))
 * @param logger - Optional logger override for testing
 * @returns Exit code to use
 */
export async function runMigrationCli(
	args: Array<string> = process.argv.slice(2),
	logger?: MigrateLogger,
): Promise<MigrationCliResult> {
	const { config: argConfig, validationError } = parseArgs(args);

	// Check for CLI argument validation errors early (before any config loading)
	if (validationError) {
		// If no logger provided, use a minimal one for early errors
		const earlyLogger = logger ?? createConsoleLogger(false);
		earlyLogger.error(`Error: ${validationError}`);
		return { exitCode: EXIT_CODES.ERROR };
	}

	// Load .env and .env.local files before reading any config values
	// This ensures .env.local values take precedence over .env values
	reloadEnvFiles();

	// Phase 1: Build initial config from CLI args and basic env vars
	let config = buildInitialConfig(argConfig);
	const log = logger ?? createConsoleLogger(config.verbose);

	// Print header using logger
	log.info("=".repeat(60));
	log.info("JOLLI SCHEMA MIGRATION");
	log.info("=".repeat(60));
	log.info(`Mode: ${config.checkOnly ? "CHECK ONLY" : config.dryRun ? "DRY RUN" : "LIVE"}`);
	log.info(`Config: ${config.pstoreEnv ? `Parameter Store (${config.pstoreEnv})` : ".env.local"}`);
	log.info(`Verbose: ${config.verbose ? "ON" : "OFF"}`);
	log.info(`Skip: ${config.skipMigrations ? "YES" : "NO"}`);
	log.info(`${"=".repeat(60)}\n`);

	// Check if migrations should be skipped entirely (before loading from pstore)
	if (config.skipMigrations) {
		log.info("SKIP_SCHEMA_MIGRATIONS=true - Skipping all migrations");
		log.info("\n[SKIPPED] Schema migrations skipped via environment variable.");
		return { exitCode: EXIT_CODES.SUCCESS };
	}

	let registryClient: TenantRegistryClient | undefined;

	try {
		// Handle dry-run mode BEFORE loading config
		// runDryRun() handles its own config loading (.env.local first, then Parameter Store if set)
		if (config.dryRun) {
			log.info("\n[DRY RUN] Checking for pending schema changes...\n");
			const dryRunResult = await runDryRun(log);
			const cliResult = formatDryRunResult(dryRunResult);

			// Output the formatted messages
			for (const msg of cliResult.messages) {
				log[msg.level](msg.message);
			}

			return { exitCode: cliResult.exitCode };
		}

		// Load configuration from Parameter Store (for full migration)
		await loadConfig(config, log);

		// Phase 2: Enrich config with values from Parameter Store (now in process.env)
		config = enrichConfig(config);

		// Create registry client
		registryClient = createRegistryClientFromConfig(config, log);

		// Run migrations
		const summary = await migrateAllTenants(registryClient, config, log);

		// Print summary
		printSummary(summary, config, log);

		// Return appropriate exit code
		if (summary.failed > 0) {
			log.error(`Migration completed with ${summary.failed} failure(s). Deployment should be blocked.`);
			return { exitCode: EXIT_CODES.ERROR };
		}

		log.info("All migrations completed successfully");
		return { exitCode: EXIT_CODES.SUCCESS };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log.error(`Migration script failed: ${message}`);
		if (error instanceof Error && error.stack) {
			log.error(error.stack);
		}
		return { exitCode: EXIT_CODES.ERROR };
		/* v8 ignore next */
	} finally {
		// Clean up
		if (registryClient) {
			await registryClient.close();
		}
	}

	/* v8 ignore stop */
}
