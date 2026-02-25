import { getConfig } from "../config/Config";
import { getLog } from "../util/Logger";
import type { HealthService } from "./HealthService";

const log = getLog(import.meta);

export interface HeartbeatService {
	/** Run health checks and send heartbeat if healthy. */
	sendHeartbeat(): Promise<boolean>;
	/** Start the heartbeat interval. */
	start(intervalMs?: number): void;
	/** Stop the heartbeat interval. */
	stop(): void;
	/** Check if the heartbeat service is running. */
	isRunning(): boolean;
}

export interface HeartbeatServiceOptions {
	healthService: HealthService;
	/** Better Stack heartbeat URL (optional, falls back to config) */
	heartbeatUrl?: string;
}

/** Creates a heartbeat service that pings Better Stack when health checks pass. */
export function createHeartbeatService(options: HeartbeatServiceOptions): HeartbeatService {
	const { healthService } = options;
	let intervalHandle: ReturnType<typeof setInterval> | null = null;
	let lastHealthyState: boolean | null = null;

	return {
		sendHeartbeat,
		start,
		stop,
		isRunning,
	};

	async function sendHeartbeat(): Promise<boolean> {
		const config = getConfig();
		const heartbeatUrl = options.heartbeatUrl ?? config.BETTER_STACK_HEARTBEAT_URL;

		try {
			const healthResult = await healthService.check();
			const isHealthy = healthResult.status === "healthy";

			logHealthStateChange(isHealthy, healthResult.checks);
			lastHealthyState = isHealthy;

			if (!isHealthy) {
				log.debug({ checks: healthResult.checks }, "Health check failed, skipping heartbeat");
				return false;
			}

			if (!heartbeatUrl) {
				log.debug("Health check passed but no heartbeat URL configured");
				return true;
			}

			return await pingBetterStack(heartbeatUrl);
		} catch (error) {
			log.error({ err: error }, "Heartbeat check error");
			return false;
		}
	}

	/** Logs state transitions between healthy and unhealthy states. */
	function logHealthStateChange(isHealthy: boolean, checks: unknown): void {
		if (lastHealthyState === null || lastHealthyState === isHealthy) {
			return;
		}
		if (isHealthy) {
			log.info("Health status recovered to healthy");
		} else {
			log.warn({ checks }, "Health status changed to unhealthy");
		}
	}

	/** Sends a ping to Better Stack and returns whether it succeeded. */
	async function pingBetterStack(heartbeatUrl: string): Promise<boolean> {
		try {
			const response = await fetch(heartbeatUrl, { method: "GET" });
			if (!response.ok) {
				log.warn({ status: response.status, statusText: response.statusText }, "Better Stack returned error");
				return false;
			}
			log.debug("Heartbeat sent to Better Stack");
			return true;
		} catch (error) {
			log.error({ err: error }, "Failed to send heartbeat to Better Stack");
			return false;
		}
	}

	function start(intervalMs?: number): void {
		if (intervalHandle) {
			log.warn("HeartbeatService already running");
			return;
		}

		const config = getConfig();
		const interval = intervalMs ?? config.HEARTBEAT_INTERVAL_MS;

		log.info({ intervalMs: interval }, "Starting heartbeat service");

		// Fire initial heartbeat immediately. If it fails, the interval continues anyway
		// so we can recover on the next tick (transient failures shouldn't prevent startup).
		sendHeartbeat().catch(err => log.error({ err }, "Initial heartbeat failed"));

		intervalHandle = setInterval(() => {
			sendHeartbeat().catch(err => log.error({ err }, "Heartbeat failed"));
		}, interval);
	}

	function stop(): void {
		if (intervalHandle) {
			clearInterval(intervalHandle);
			intervalHandle = null;
			log.info("HeartbeatService stopped");
		}
	}

	function isRunning(): boolean {
		return intervalHandle !== null;
	}
}
