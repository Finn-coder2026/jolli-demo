import { env } from "../Config";
import type { DatabaseCredentials, ProvisionResult } from "../types";
import { getLog } from "../util/Logger";
import type { DatabaseProviderAdapter, SchemaProvisionResult } from "./DatabaseProviderInterface";
import { randomBytes } from "node:crypto";
import pg from "pg";

const { Client } = pg;
const log = getLog(import.meta.url);

interface ConnectionStringPostgresConfig {
	/** Admin connection URL (e.g., postgres://postgres:password@localhost:5432/postgres) */
	adminConnectionUrl: string;
	/** Host for tenant databases (defaults to parsed from adminConnectionUrl) */
	host?: string | undefined;
	/** Port for tenant databases (defaults to parsed from adminConnectionUrl) */
	port?: number | undefined;
	/** Whether to use SSL for tenant connections */
	ssl?: boolean | undefined;
}

/**
 * Database provider that provisions databases on a PostgreSQL instance using a connection string.
 * Can be used for local PostgreSQL, cloud-hosted PostgreSQL, or any PostgreSQL-compatible database.
 */
export class ConnectionStringPostgresProvider implements DatabaseProviderAdapter {
	readonly type = "connection_string" as const;

	private readonly adminUrl: URL;
	private readonly host: string;
	private readonly port: number;
	private readonly ssl: boolean;

	constructor(private readonly config: ConnectionStringPostgresConfig) {
		this.adminUrl = new URL(config.adminConnectionUrl);
		this.host = config.host ?? this.adminUrl.hostname;
		this.port = config.port ?? Number.parseInt(this.adminUrl.port || "5432", 10);
		this.ssl = config.ssl ?? false;
	}

	async provisionDatabase(
		providerSlug: string,
		options?: { reuseExisting?: boolean; force?: boolean },
	): Promise<ProvisionResult> {
		// Validate host is in the allowed list (if restrictions are configured)
		if (env.ALLOWED_POSTGRES_HOSTS.length > 0 && !env.ALLOWED_POSTGRES_HOSTS.includes(this.host)) {
			log.error(
				"PostgreSQL host '%s' is not in the allowed hosts list: %o",
				this.host,
				env.ALLOWED_POSTGRES_HOSTS,
			);
			return {
				success: false,
				error: `PostgreSQL host '${this.host}' is not in the allowed hosts list for this environment`,
			};
		}

		const dbName = `jolli_${providerSlug}`;
		const username = `jolli_${providerSlug}`;
		const password = generateSecurePassword();
		const reuseExisting = options?.reuseExisting ?? false;
		const force = options?.force ?? false;

		log.info(
			"Provisioning database for provider: %s (reuseExisting: %s, force: %s)",
			providerSlug,
			reuseExisting,
			force,
		);
		log.debug("Admin URL: %s", this.config.adminConnectionUrl.replace(/:[^:@]+@/, ":****@"));

		const client = new Client({
			connectionString: this.config.adminConnectionUrl,
			connectionTimeoutMillis: 10000, // 10 second connection timeout
			query_timeout: 30000, // 30 second query timeout
		});

		try {
			log.debug("Connecting to PostgreSQL...");
			await client.connect();
			log.debug("Connected successfully");

			// Check if database already exists
			const existingDb = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
			const dbExists = existingDb.rowCount && existingDb.rowCount > 0;

			// If force=true, always drop and recreate
			if (dbExists && force) {
				log.warn("Database %s already exists, force=true so dropping and recreating...", dbName);
				// Terminate existing connections to the database
				await client.query(
					`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
					[dbName],
				);
				await client.query(`DROP DATABASE ${quoteIdent(dbName)}`);
				log.info("Database %s force-dropped", dbName);

				// Also drop the user if it exists
				const existingUser = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [username]);
				if (existingUser.rowCount && existingUser.rowCount > 0) {
					log.warn("User %s already exists, dropping...", username);
					await client.query(`DROP USER ${quoteIdent(username)}`);
					log.info("User %s dropped", username);
				}
				// Continue to create fresh database below
			} else if (dbExists && reuseExisting) {
				log.info("Database %s already exists, attempting to reuse...", dbName);

				// Test connection with generated credentials
				const credentials: DatabaseCredentials = {
					host: this.host,
					port: this.port,
					database: dbName,
					username,
					password,
					ssl: this.ssl,
				};

				const canConnect = await this.testConnection(credentials);
				if (!canConnect) {
					log.error("Cannot connect to existing database %s with generated credentials", dbName);
					return {
						success: false,
						error: `Database ${dbName} exists but cannot connect with expected credentials. Please check the database state or use a different tenant slug.`,
					};
				}

				// Validate it's a Jolli database (warn if tables are missing, but don't block)
				// The backend will run migrations/sync to create missing tables
				const validation = await this.validateJolliDatabase(credentials);
				if (!validation.valid) {
					const missingTables = validation.missingTables ?? [];
					log.warn(
						"Existing database %s is missing some expected tables: %o. Backend migrations will create them.",
						dbName,
						missingTables,
					);
				} else {
					log.info("Existing database %s validated successfully", dbName);
				}

				log.info("Reusing existing database %s", dbName);
				return {
					success: true,
					credentials,
					reused: true,
				};
			}

			// Note: The case where dbExists && !reuseExisting && !force is handled by the API endpoint
			// which returns a 409 conflict asking the user to choose. So we should never reach here
			// in that state. If we do somehow reach here, we'll treat it like force mode for backwards compatibility.
			if (dbExists && !reuseExisting && !force) {
				log.warn(
					"Database %s already exists without explicit reuse or force flag. This shouldn't happen. Treating as force mode.",
					dbName,
				);
			}

			// Check if user already exists and clean it up
			const existingUser = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [username]);
			if (existingUser.rowCount && existingUser.rowCount > 0) {
				log.warn("User %s already exists, cleaning up stale user...", username);
				await client.query(`DROP USER ${quoteIdent(username)}`);
				log.info("Stale user %s dropped", username);
			}

			// Create user (password must be escaped properly)
			log.debug("Creating user: %s", username);
			await client.query(`CREATE USER ${quoteIdent(username)} WITH PASSWORD ${quoteLiteral(password)}`);

			// Create database
			log.debug("Creating database: %s", dbName);
			await client.query(`CREATE DATABASE ${quoteIdent(dbName)} OWNER ${quoteIdent(username)}`);

			// Grant privileges
			log.debug("Granting privileges...");
			await client.query(`GRANT ALL PRIVILEGES ON DATABASE ${quoteIdent(dbName)} TO ${quoteIdent(username)}`);

			// Enable pgvector extension in public schema using admin connection.
			// We must connect to the newly created database (not postgres) and use admin
			// credentials since CREATE EXTENSION requires superuser privileges.
			// This ensures the extension is owned by the postgres/admin user and accessible to all.
			log.info("Enabling pgvector extension in public schema");
			const adminUrlForNewDb = new URL(this.config.adminConnectionUrl);
			adminUrlForNewDb.pathname = `/${encodeURIComponent(dbName)}`;
			const extensionClient = new Client({
				connectionString: adminUrlForNewDb.toString(),
				connectionTimeoutMillis: 10000,
				query_timeout: 30000,
			});

			try {
				await extensionClient.connect();
				await extensionClient.query("CREATE EXTENSION IF NOT EXISTS vector SCHEMA public");
				log.info("pgvector extension enabled successfully");
			} finally {
				await extensionClient.end();
			}

			log.info("Provisioning complete for provider: %s", providerSlug);

			return {
				success: true,
				credentials: {
					host: this.host,
					port: this.port,
					database: dbName,
					username,
					password,
					ssl: this.ssl,
				},
			};
		} catch (error) {
			log.error({ err: error }, "Provisioning error");
			const message = error instanceof Error ? error.message : String(error);
			return {
				success: false,
				error: `Failed to provision database: ${message}`,
			};
		} finally {
			log.debug("Closing database connection...");
			try {
				await client.end();
				log.debug("Connection closed");
			} catch (closeError) {
				log.error({ err: closeError }, "Error closing connection");
			}
		}
	}

	async deprovisionDatabase(
		_providerSlug: string,
		credentials: DatabaseCredentials,
		mode: "drop" | "retain" = "drop",
	): Promise<void> {
		if (mode === "retain") {
			log.info("Deprovision mode is 'retain', skipping database deletion for %s", credentials.database);
			return;
		}

		const client = new Client({ connectionString: this.config.adminConnectionUrl });

		try {
			await client.connect();

			const dbName = credentials.database;
			const username = credentials.username;

			log.info("Deprovisioning database %s (mode: %s)", dbName, mode);

			// Terminate existing connections to the database
			await client.query(
				`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
				[dbName],
			);

			// Drop database
			await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(dbName)}`);

			// Drop user
			await client.query(`DROP USER IF EXISTS ${quoteIdent(username)}`);

			log.info("Database %s deprovisioned successfully", dbName);
		} finally {
			await client.end();
		}
	}

	async testConnection(credentials: DatabaseCredentials): Promise<boolean> {
		const client = new Client({
			host: credentials.host,
			port: credentials.port,
			database: credentials.database,
			user: credentials.username,
			password: credentials.password,
			ssl: credentials.ssl ? { rejectUnauthorized: false } : false,
		});

		try {
			await client.connect();
			await client.query("SELECT 1");
			return true;
		} catch {
			return false;
		} finally {
			await client.end();
		}
	}

	migrate(_credentials: DatabaseCredentials): Promise<void> {
		// TODO: Import and run Jolli backend migrations
		// This would need to import the backend's Database.ts and run createDatabase()
		// For now, we'll leave this as a placeholder that can be implemented
		// when the backend multi-tenancy changes are in place
		throw new Error("Migration not yet implemented - requires backend integration");
	}

	/**
	 * Create a PostgreSQL schema for an org within a tenant database.
	 * @param credentials - Database credentials for the tenant database
	 * @param schemaName - Name of the schema to create (e.g., "org_engineering")
	 * @param options - Provisioning options
	 */
	async provisionSchema(
		credentials: DatabaseCredentials,
		schemaName: string,
		options?: { reuseExisting?: boolean; force?: boolean },
	): Promise<SchemaProvisionResult> {
		log.info(
			"Provisioning schema %s in database %s (reuseExisting: %s, force: %s)",
			schemaName,
			credentials.database,
			options?.reuseExisting ?? false,
			options?.force ?? false,
		);

		// Skip provisioning for "public" schema - it already exists in PostgreSQL
		// and all users have CREATE/USAGE privileges on it by default
		if (schemaName === "public") {
			log.info("Using existing public schema for database %s, skipping schema creation", credentials.database);
			return { created: false, existed: true };
		}

		// Check if schema already exists
		const schemaExists = await this.checkSchemaExists(credentials, schemaName);

		// If schema exists and force=true, drop it first
		if (schemaExists && options?.force) {
			log.info("Schema %s exists and force=true, dropping existing schema", schemaName);
			await this.deprovisionSchema(credentials, schemaName, "drop");
		}

		// If schema exists and no force, return early (reuse)
		if (schemaExists && !options?.force) {
			log.info("Schema %s already exists, reusing (created=false, existed=true)", schemaName);
			return { created: false, existed: true };
		}

		const client = new Client({
			host: credentials.host,
			port: credentials.port,
			database: credentials.database,
			user: credentials.username,
			password: credentials.password,
			ssl: credentials.ssl ? { rejectUnauthorized: false } : false,
		});

		try {
			await client.connect();

			// Create schema
			log.debug("Creating schema: %s", schemaName);
			await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schemaName)}`);

			// Grant permissions to the tenant user
			log.debug("Granting privileges on schema %s to %s", schemaName, credentials.username);
			await client.query(
				`GRANT ALL PRIVILEGES ON SCHEMA ${quoteIdent(schemaName)} TO ${quoteIdent(credentials.username)}`,
			);

			// Set default privileges for future objects created in this schema
			await client.query(
				`ALTER DEFAULT PRIVILEGES IN SCHEMA ${quoteIdent(schemaName)} GRANT ALL PRIVILEGES ON TABLES TO ${quoteIdent(credentials.username)}`,
			);
			await client.query(
				`ALTER DEFAULT PRIVILEGES IN SCHEMA ${quoteIdent(schemaName)} GRANT ALL PRIVILEGES ON SEQUENCES TO ${quoteIdent(credentials.username)}`,
			);

			log.info("Schema %s provisioned successfully (created=true, existed=%s)", schemaName, schemaExists);
			return { created: true, existed: schemaExists };
		} finally {
			await client.end();
		}
	}

	/**
	 * Drop a PostgreSQL schema for an org.
	 * @param credentials - Database credentials for the tenant database
	 * @param schemaName - Name of the schema to drop
	 * @param mode - Deprovisioning mode: 'drop' to delete schema, 'retain' to keep it
	 */
	async deprovisionSchema(
		credentials: DatabaseCredentials,
		schemaName: string,
		mode: "drop" | "retain" = "drop",
	): Promise<void> {
		if (mode === "retain") {
			log.info("Deprovision mode is 'retain', skipping schema deletion for %s", schemaName);
			return;
		}

		log.info("Deprovisioning schema %s in database %s (mode: %s)", schemaName, credentials.database, mode);

		const client = new Client({
			host: credentials.host,
			port: credentials.port,
			database: credentials.database,
			user: credentials.username,
			password: credentials.password,
			ssl: credentials.ssl ? { rejectUnauthorized: false } : false,
		});

		try {
			await client.connect();

			// Drop schema with CASCADE to remove all objects within it
			log.debug("Dropping schema: %s", schemaName);
			await client.query(`DROP SCHEMA IF EXISTS ${quoteIdent(schemaName)} CASCADE`);

			log.info("Schema %s deprovisioned successfully", schemaName);
		} finally {
			await client.end();
		}
	}

	/**
	 * Run Jolli backend migrations in a specific schema.
	 * @param credentials - Database credentials for the tenant database
	 * @param schemaName - Name of the schema to run migrations in
	 */
	migrateSchema(_credentials: DatabaseCredentials, _schemaName: string): Promise<void> {
		// TODO: Import and run Jolli backend migrations with schema-aware model definitions
		// This would need to:
		// 1. Connect with search_path set to the schema
		// 2. Import backend models with schema option
		// 3. Run sequelize.sync() to create tables in the schema
		throw new Error("Schema migration not yet implemented - requires backend integration");
	}

	async checkDatabaseExists(dbName: string): Promise<boolean> {
		const client = new Client({ connectionString: this.config.adminConnectionUrl });
		try {
			await client.connect();
			const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
			return result.rowCount !== null && result.rowCount > 0;
		} finally {
			await client.end();
		}
	}

	async checkSchemaExists(credentials: DatabaseCredentials, schemaName: string): Promise<boolean> {
		const client = new Client({
			host: credentials.host,
			port: credentials.port,
			database: credentials.database,
			user: credentials.username,
			password: credentials.password,
			ssl: credentials.ssl ? { rejectUnauthorized: false } : false,
		});

		try {
			await client.connect();
			const result = await client.query("SELECT 1 FROM information_schema.schemata WHERE schema_name = $1", [
				schemaName,
			]);
			return result.rowCount !== null && result.rowCount > 0;
		} finally {
			await client.end();
		}
	}

	async validateJolliDatabase(
		credentials: DatabaseCredentials,
	): Promise<{ valid: boolean; missingTables?: Array<string> }> {
		// Expected Jolli core tables from backend
		const expectedTables = [
			"docs",
			"docsites",
			"jobs",
			"integrations",
			"users",
			"chunks",
			"sites",
			"convos",
			"github_installations",
			"visits",
		];

		const client = new Client({
			host: credentials.host,
			port: credentials.port,
			database: credentials.database,
			user: credentials.username,
			password: credentials.password,
			ssl: credentials.ssl ? { rejectUnauthorized: false } : false,
		});

		try {
			await client.connect();

			// Query information_schema to check which tables exist
			const result = await client.query(
				"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
			);
			const existingTables = new Set(result.rows.map(row => row.table_name));

			const missingTables = expectedTables.filter(table => !existingTables.has(table));

			if (missingTables.length > 0) {
				log.warn("Database validation failed. Missing tables: %o", missingTables);
				return {
					valid: false,
					missingTables,
				};
			}

			log.info("Database validation passed. All expected Jolli tables found.");
			return { valid: true };
		} catch (error) {
			log.error({ err: error }, "Error validating Jolli database");
			return {
				valid: false,
				missingTables: expectedTables, // Assume all missing on error
			};
		} finally {
			await client.end();
		}
	}
}

/**
 * Generate a secure random password.
 */
function generateSecurePassword(length = 32): string {
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
	const bytes = randomBytes(length);
	let password = "";
	for (let i = 0; i < length; i++) {
		password += chars[bytes[i] % chars.length];
	}
	return password;
}

/**
 * Quote an identifier for use in SQL.
 */
function quoteIdent(identifier: string): string {
	// PostgreSQL identifier quoting: double any double quotes, wrap in double quotes
	return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Quote a literal string for use in SQL.
 */
function quoteLiteral(value: string): string {
	// PostgreSQL string literal quoting: double any single quotes, wrap in single quotes
	return `'${value.replace(/'/g, "''")}'`;
}
