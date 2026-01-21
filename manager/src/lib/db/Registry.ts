import "server-only";

import { env } from "../Config";
import { getLog } from "../util/Logger";
import pg from "pg";
import { Sequelize } from "sequelize";

const { Client } = pg;
const log = getLog(import.meta.url);
let registrySequelize: Sequelize | null = null;
let databaseEnsured = false;

/**
 * Ensure the registry database exists, creating it if necessary.
 * Uses the ADMIN_POSTGRES_URL to connect and create the database.
 */
async function ensureRegistryDatabaseExists(): Promise<void> {
	if (databaseEnsured) {
		return;
	}

	// Parse the registry database name from the URL
	const registryUrl = new URL(env.REGISTRY_DATABASE_URL);
	const databaseName = registryUrl.pathname.slice(1); // Remove leading slash

	if (!databaseName) {
		log.warn("Could not parse database name from REGISTRY_DATABASE_URL");
		databaseEnsured = true;
		return;
	}

	// Connect using admin credentials to check/create the database
	const adminClient = new Client({
		connectionString: env.ADMIN_POSTGRES_URL,
		connectionTimeoutMillis: 10000,
	});

	try {
		await adminClient.connect();

		// Check if database exists
		const result = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);

		if (result.rowCount === 0) {
			log.info("Creating registry database: %s", databaseName);
			// Quote the database name to handle special characters
			await adminClient.query(`CREATE DATABASE "${databaseName.replace(/"/g, '""')}"`);
			log.info("Registry database created successfully");
		} else {
			log.debug("Registry database already exists: %s", databaseName);
		}

		databaseEnsured = true;
	} catch (error) {
		log.error({ err: error }, "Failed to ensure registry database exists");
		// Don't throw - let the app try to connect anyway, which will give a clearer error
		databaseEnsured = true;
	} finally {
		try {
			await adminClient.end();
		} catch {
			// Ignore close errors
		}
	}
}

/**
 * Get or create the Sequelize instance for the tenant registry database.
 */
export function getRegistrySequelize(): Sequelize {
	if (!registrySequelize) {
		registrySequelize = new Sequelize(env.REGISTRY_DATABASE_URL, {
			dialect: "postgres",
			logging: env.NODE_ENV === "development" ? sql => log.debug(sql) : false,
			pool: {
				max: 5,
				min: 0,
				acquire: 30000,
				idle: 10000,
			},
		});
	}
	return registrySequelize;
}

/**
 * Initialize the registry database, creating it if it doesn't exist.
 */
export async function initializeRegistry(): Promise<Sequelize> {
	await ensureRegistryDatabaseExists();
	return getRegistrySequelize();
}

/**
 * Close the registry database connection.
 */
export async function closeRegistry(): Promise<void> {
	if (registrySequelize) {
		await registrySequelize.close();
		registrySequelize = null;
	}
}

/**
 * Test the registry database connection.
 */
export async function testRegistryConnection(): Promise<boolean> {
	try {
		const sequelize = getRegistrySequelize();
		await sequelize.authenticate();
		return true;
	} catch {
		return false;
	}
}
