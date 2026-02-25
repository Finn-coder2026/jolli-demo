import { getConfig } from "../config/Config";

/**
 * Check if the given host is the auth gateway domain.
 * The auth gateway is at `auth.{BASE_DOMAIN}` (e.g., auth.jolli.ai).
 *
 * @param host - The host header (may include port)
 * @param baseDomain - The base domain (e.g., "jolli.ai")
 * @returns true if this is the auth gateway domain
 */
export function isAuthGateway(host: string, baseDomain: string): boolean {
	const hostname = host.split(":")[0]; // Remove port
	return hostname === `auth.${baseDomain}`;
}

/**
 * Check if multi-tenant auth mode is enabled.
 *
 * @returns true if USE_MULTI_TENANT_AUTH is enabled
 */
export function isMultiTenantAuthEnabled(): boolean {
	const config = getConfig();
	return config.USE_MULTI_TENANT_AUTH;
}
