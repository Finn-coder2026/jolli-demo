export async function register() {
	// Only run in Node.js runtime, not Edge runtime
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { getLog } = await import("./lib/util/Logger");
		const log = getLog("Manager");
		log.info("Jolli Manager starting...");

		// Initialize database at startup to ensure all tables are created
		// This runs sequelize.sync({ alter: true }) which creates missing tables
		try {
			const { getDatabase } = await import("./lib/db/getDatabase");
			await getDatabase();
			log.info("Database initialized successfully");
		} catch (error) {
			log.error({ err: error }, "Failed to initialize database at startup");
		}
	}
}
