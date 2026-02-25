import {
	createHealthService,
	createHeartbeatService,
	createMultiTenantDatabaseCheck,
	type HeartbeatService,
} from "../health/index";
import type { TenantOrgConnectionManager } from "../tenant/TenantOrgConnectionManager";

export interface HeartbeatSetupOptions {
	connectionManager: TenantOrgConnectionManager;
	/** Timeout for database health checks in milliseconds (default: 5000) */
	timeoutMs?: number;
}

/** Sets up the heartbeat service for Better Stack monitoring using cached connections. */
export function setupHeartbeatService(options: HeartbeatSetupOptions): HeartbeatService {
	const { connectionManager, timeoutMs } = options;

	const healthService = createHealthService({
		checks: [
			createMultiTenantDatabaseCheck({
				connectionManager,
				...(timeoutMs !== undefined && { timeoutMs }),
			}),
		],
	});

	return createHeartbeatService({ healthService });
}
