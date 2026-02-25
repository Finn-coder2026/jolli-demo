import { Sequelize } from "sequelize";
import { getConfig } from "../config/Config";
import { getLog } from "./Logger";
import { withRetry } from "./Retry";

const log = getLog(import.meta);

/**
 * Formats a database connection error with actionable guidance.
 */
function formatConnectionError(error: unknown, host: string, port: number): Error {
	const originalMessage = error instanceof Error ? error.message : String(error);
	const errorCode = (error as { parent?: { code?: string } })?.parent?.code;

	if (errorCode === "ECONNREFUSED") {
		const message = [
			`PostgreSQL connection refused at ${host}:${port}`,
			"",
			"Possible causes:",
			"  1. PostgreSQL is not running",
			"  2. PostgreSQL is running on a different host/port",
			"  3. A firewall is blocking the connection",
			"",
			"To fix:",
			"  - Start PostgreSQL: brew services start postgresql (macOS) or sudo systemctl start postgresql (Linux)",
			"  - Or use in-memory mode: set SEQUELIZE=memory in your .env file",
			"  - Or check your POSTGRES_HOST and POSTGRES_PORT settings",
		].join("\n");
		const wrappedError = new Error(message);
		wrappedError.cause = error;
		return wrappedError;
	}

	// For other errors, return with original message but add context
	const message = `Failed to connect to PostgreSQL at ${host}:${port}: ${originalMessage}`;
	const wrappedError = new Error(message);
	wrappedError.cause = error;
	return wrappedError;
}

export async function createSequelize(): Promise<Sequelize> {
	const config = getConfig();
	const sequelizeMode = config.SEQUELIZE;
	switch (sequelizeMode) {
		case "memory":
			return await createMemorySequelize();
		case "postgres":
			return await createPostgresSequelize();
		default:
			throw new Error(`Unknown SEQUELIZE type: ${sequelizeMode}`);
	}
}

export interface PgBossPostgresConfiguration {
	connectionString: string;
	ssl: boolean;
}

interface PostgresConfig {
	POSTGRES_SCHEME: string;
	POSTGRES_DATABASE: string;
	POSTGRES_USERNAME: string;
	POSTGRES_PASSWORD: string;
	POSTGRES_HOST: string;
	POSTGRES_PORT: number;
	POSTGRES_NO_PORT: boolean;
	POSTGRES_QUERY: string;
}

function getPostgresConnectionUri(config: PostgresConfig) {
	const scheme = config.POSTGRES_SCHEME;
	const database = config.POSTGRES_DATABASE;
	const username = encodeURIComponent(config.POSTGRES_USERNAME);
	const password = encodeURIComponent(config.POSTGRES_PASSWORD);
	const host = config.POSTGRES_HOST;
	const port = config.POSTGRES_PORT;
	const noPort = config.POSTGRES_NO_PORT;
	const portPart = noPort ? "" : `:${port}`;
	const queryParams = config.POSTGRES_QUERY;
	const queryParamsPart = queryParams ? `?${queryParams}` : "";

	return `${scheme}://${username}:${password}@${host}${portPart}/${database}${queryParamsPart}`;
}

/**
 * Get the PostgreSQL connection string for the current configuration
 */
export function getPgBossPostgresConfiguration(): PgBossPostgresConfiguration {
	const config = getConfig();
	function getPostgresConnectionString(): string {
		const sequelizeMode = config.SEQUELIZE;

		if (sequelizeMode === "postgres") {
			return getPostgresConnectionUri(config);
		}

		// For memory mode, return a connection string that will work with the PGlite socket server
		// Note: The port is dynamic (5434-5444), so we use 5434 as default
		// This is only used if pg-boss is initialized in memory mode
		const port = 5434;
		return `postgres://postgres:postgres@localhost:${port}/postgres`;
	}

	return {
		connectionString: getPostgresConnectionString(),
		ssl: config.POSTGRES_SSL,
	};
}

export interface MemorySequelizeInstance {
	sequelize: Sequelize;
	server: { stop: () => Promise<void> };
}

export async function createMemorySequelize(): Promise<Sequelize>;
export async function createMemorySequelize(returnServer: true): Promise<MemorySequelizeInstance>;
export async function createMemorySequelize(returnServer?: boolean): Promise<Sequelize | MemorySequelizeInstance> {
	const { PGlite } = await import("@electric-sql/pglite");
	const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");

	const db = new PGlite("memory://");
	let port = 5434;
	const maxPort = 5444;
	let server: InstanceType<typeof PGLiteSocketServer> | null = null;

	while (port <= maxPort) {
		try {
			server = new PGLiteSocketServer({ db, port });
			await server.start();
			break;
		} catch (error) {
			if (port === maxPort || (error instanceof Error && !error.message.includes("EADDRINUSE"))) {
				throw error;
			}
			port++;
		}
	}

	if (!server) {
		throw new Error("Failed to create PGLiteSocketServer");
	}

	const config = getConfig();

	const sequelize = new Sequelize({
		username: "postgres",
		password: "postgres",
		host: "localhost",
		port,
		dialect: "postgres",
		dialectOptions: { ssl: false },
		logging: config.POSTGRES_LOGGING,
		pool: { max: 1, min: 0, idle: 0 },
		define: { underscored: true },
	});

	if (returnServer) {
		return { sequelize, server };
	}

	return sequelize;
}

/**
 * Determines if a database connection error is transient and worth retrying.
 * Retryable errors include connection refused, timeouts, and transient auth failures.
 */
export function isRetryableConnectionError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	const errorCode = (error as { parent?: { code?: string } })?.parent?.code;
	const message = error.message.toLowerCase();

	// Connection refused - server not ready yet
	if (errorCode === "ECONNREFUSED") {
		return true;
	}

	// Connection reset or aborted
	if (errorCode === "ECONNRESET" || errorCode === "ECONNABORTED") {
		return true;
	}

	// DNS resolution failures (transient)
	if (errorCode === "ENOTFOUND" || errorCode === "EAI_AGAIN") {
		return true;
	}

	// Timeouts
	if (errorCode === "ETIMEDOUT" || message.includes("timeout")) {
		return true;
	}

	// Neon-specific: transient auth or connection issues during cold start
	if (message.includes("endpoint is not found") || message.includes("could not translate host name")) {
		return true;
	}

	return false;
}

export async function createPostgresSequelize(): Promise<Sequelize> {
	const config = getConfig();
	const sequelize = new Sequelize(getPostgresConnectionUri(config), {
		dialect: "postgres",
		dialectOptions: config.POSTGRES_SSL ? { ssl: { rejectUnauthorized: false } } : {},
		logging: config.POSTGRES_LOGGING,
		pool: { max: config.POSTGRES_POOL_MAX },
		define: { underscored: true },
	});

	// Test the connection with retry logic for transient failures
	try {
		await withRetry(() => sequelize.authenticate(), {
			maxRetries: config.DB_CONNECT_MAX_RETRIES,
			baseDelayMs: config.DB_CONNECT_RETRY_BASE_DELAY_MS,
			maxDelayMs: config.DB_CONNECT_RETRY_MAX_DELAY_MS,
			isRetryable: isRetryableConnectionError,
			label: "DB connect",
		});
		log.info("PostgreSQL connection established successfully");
	} catch (error) {
		throw formatConnectionError(error, config.POSTGRES_HOST, config.POSTGRES_PORT);
	}

	return sequelize;
}
