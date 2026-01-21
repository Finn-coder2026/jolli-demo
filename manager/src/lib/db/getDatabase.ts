import "server-only";

import type { Database } from "./Database";
import { createDatabase } from "./Database";
import { initializeRegistry } from "./Registry";

let database: Database | null = null;
let initPromise: Promise<Database> | null = null;

/**
 * Get or create the database singleton.
 * Initializes the registry database connection and DAOs.
 * Creates the registry database if it doesn't exist.
 * Uses a promise to prevent race conditions when multiple requests
 * call getDatabase() simultaneously during startup.
 */
export function getDatabase(): Promise<Database> {
	if (database) {
		return Promise.resolve(database);
	}

	// If initialization is in progress, wait for it
	if (initPromise) {
		return initPromise;
	}

	// Start initialization and store the promise
	initPromise = (async () => {
		// Initialize registry (creates database if needed) and get sequelize instance
		const sequelize = await initializeRegistry();
		database = await createDatabase(sequelize);
		return database;
	})();

	return initPromise;
}
