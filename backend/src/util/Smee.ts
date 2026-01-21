import type { ExitHandler } from "../index";
import { getLog } from "./Logger";

const log = getLog(import.meta);

export interface SmeeClientOptions {
	smeeUrl: string;
	localUrl: string;
}

export async function startSmeeClient(shutdownHandlers: Array<ExitHandler>, options: SmeeClientOptions) {
	const { smeeUrl, localUrl } = options;
	try {
		const { SmeeClient } = await import("smee-client");
		const smeeClient = new SmeeClient({
			source: smeeUrl,
			target: localUrl,
			logger: log,
		});
		await smeeClient.start();
		shutdownHandlers.push({
			stop(): void {
				smeeClient.stop();
			},
		});
	} catch (error) {
		log.error(error, "error starting up smee client.");
	}
}
