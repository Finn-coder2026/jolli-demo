import { Sequelize } from "sequelize";
import { getConfig } from "../config/Config";

export async function createSequelize(): Promise<Sequelize> {
	const config = getConfig();
	const sequelizeMode = config.SEQUELIZE;
	switch (sequelizeMode) {
		case "memory":
			return await createMemorySequelize();
		case "postgres":
			return createPostgresSequelize();
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

export function createPostgresSequelize(): Sequelize {
	const config = getConfig();
	return new Sequelize(getPostgresConnectionUri(config), {
		dialect: "postgres",
		dialectOptions: config.POSTGRES_SSL ? { ssl: { rejectUnauthorized: false } } : {},
		logging: config.POSTGRES_LOGGING,
		pool: { max: config.POSTGRES_POOL_MAX },
		define: { underscored: true },
	});
}
