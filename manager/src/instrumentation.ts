export async function register() {
	// Only run in Node.js runtime, not Edge runtime
	if (process.env.NEXT_RUNTIME === "nodejs") {
		const { getLog } = await import("./lib/util/Logger");
		const log = getLog("Manager");
		log.info("Jolli Manager starting...");
	}
}
