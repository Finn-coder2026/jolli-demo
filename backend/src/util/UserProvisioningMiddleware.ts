import type { ActiveUserDao } from "../dao/ActiveUserDao";
import type { DaoProvider } from "../dao/DaoProvider";
import type { GlobalUserDao } from "../dao/GlobalUserDao";
import { getTenantContext } from "../tenant/TenantContext";
import { clearAuthCookie, clearRememberMeCookie } from "./Cookies";
import { getLog } from "./Logger";
import type { TokenUtil } from "./TokenUtil";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { UserInfo } from "jolli-common";

const log = getLog(import.meta);

/** Clear auth cookies and respond with 401 for inactive users. */
function sendInactiveResponse(res: Response): void {
	clearAuthCookie(res);
	clearRememberMeCookie(res);
	res.status(401).json({ error: "Account is inactive" });
}

/**
 * Middleware that attaches global user info to the request.
 *
 * In multi-tenant mode, this middleware:
 * 1. Decodes the JWT to get the user's email
 * 2. Looks up the user in the global_users table (Manager DB) to get the latest info
 * 3. Attaches the global user info to req.orgUser
 *
 * Route handlers should use req.orgUser.id (which is now the global_users.id)
 * when referencing users in database operations.
 *
 * Note: The org-level users table is no longer used. All user references now point
 * to global_users.id for consistency across all tenants and orgs.
 */
export function createUserProvisioningMiddleware(
	tokenUtil: TokenUtil<UserInfo>,
	globalUserDao?: GlobalUserDao,
	activeUserDaoProvider?: DaoProvider<ActiveUserDao>,
): RequestHandler {
	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		// Skip if no GlobalUserDao (single-tenant mode without Manager DB)
		if (!globalUserDao) {
			return next();
		}

		// Skip if no JWT token (unauthenticated request)
		const userInfo = tokenUtil.decodePayload(req);
		if (!userInfo) {
			return next();
		}

		try {
			const { email } = userInfo;

			// Look up user in global_users table to get the latest info
			const globalUser = await globalUserDao.findUserByEmail(email);
			if (globalUser) {
				// Block requests from inactive users (catches deactivation after login)
				if (!globalUser.isActive) {
					log.warn({ email, globalUserId: globalUser.id }, "Request blocked: user account is inactive");
					sendInactiveResponse(res);
					return;
				}

				// Check tenant-level isActive (catches deactivation by tenant admin)
				if (activeUserDaoProvider) {
					const tenantContext = getTenantContext();
					if (tenantContext) {
						const activeUserDao = activeUserDaoProvider.getDao(tenantContext);
						const activeUser = await activeUserDao.findById(globalUser.id);
						if (activeUser && !activeUser.isActive) {
							log.warn(
								{ email, globalUserId: globalUser.id },
								"Request blocked: user is inactive in this tenant",
							);
							sendInactiveResponse(res);
							return;
						}
					}
				}

				// Attach global user info to request
				// Note: globalUser.image maps to picture for API consistency
				req.orgUser = {
					id: globalUser.id,
					email: globalUser.email,
					name: globalUser.name,
					picture: globalUser.image,
				};
				log.debug({ email, globalUserId: globalUser.id }, "Global user info attached to request");
			} else {
				// User not found in global_users - this shouldn't happen for authenticated users
				// Log warning but allow request to proceed (will fall back to JWT info)
				log.warn({ email }, "Authenticated user not found in global_users table");
			}

			next();
		} catch (error) {
			log.error(error, "Failed to look up global user");
			res.status(500).json({ error: "Failed to look up user" });
		}
	};
}

/**
 * Helper function to get the global user ID from a request.
 * Falls back to the JWT userId if orgUser is not set (single-tenant mode without Manager DB).
 *
 * @param req Express request object
 * @param tokenUtil TokenUtil for decoding JWT
 * @returns The global user ID, or undefined if not authenticated
 */
export function getOrgUserId(req: Request, tokenUtil: TokenUtil<UserInfo>): number | undefined {
	// Prefer global user ID (set by UserProvisioningMiddleware when Manager DB is available)
	if (req.orgUser?.id !== undefined) {
		return req.orgUser.id;
	}
	// Fall back to JWT userId (single-tenant mode without Manager DB)
	return tokenUtil.decodePayload(req)?.userId;
}
