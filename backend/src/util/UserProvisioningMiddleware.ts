import type { DaoProvider } from "../dao/DaoProvider";
import type { UserDao } from "../dao/UserDao";
import { getTenantContext } from "../tenant/TenantContext";
import { getLog } from "./Logger";
import type { TokenUtil } from "./TokenUtil";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { UserInfo } from "jolli-common";

const log = getLog(import.meta);

/**
 * Middleware that ensures the authenticated user exists in the current org schema.
 *
 * In multi-tenant mode, each org has its own users table with auto-incrementing IDs.
 * When a user switches orgs, they may not exist in the new org's schema yet.
 * This middleware:
 * 1. Decodes the JWT to get user info (email, name, picture)
 * 2. Finds or creates the user in the current org's schema using email as the key
 * 3. Attaches the org-specific user info to req.orgUser
 *
 * Route handlers should use req.orgUser.id instead of the JWT userId when
 * referencing users in database operations.
 */
export function createUserProvisioningMiddleware(
	userDaoProvider: DaoProvider<UserDao>,
	tokenUtil: TokenUtil<UserInfo>,
): RequestHandler {
	return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
		const context = getTenantContext();

		// Skip if no tenant context (single-tenant mode)
		if (!context) {
			return next();
		}

		// Skip if no JWT token (unauthenticated request)
		const userInfo = tokenUtil.decodePayload(req);
		if (!userInfo) {
			return next();
		}

		try {
			const userDao = userDaoProvider.getDao(context);
			const { email, name, picture } = userInfo;

			// Find or create user in org schema using email as the stable identifier
			let orgUser = await userDao.findUser(email);

			if (!orgUser) {
				// User doesn't exist in this org schema - create them
				log.info({ email, orgSchema: context.schemaName }, "Provisioning user in org schema");
				orgUser = await userDao.createUser({ email, name, picture });
			} else {
				// User exists - optionally sync name/picture from JWT
				// This keeps user info in sync across orgs
				if (orgUser.name !== name || orgUser.picture !== picture) {
					log.debug({ email, orgSchema: context.schemaName }, "Syncing user info in org schema");
					orgUser = await userDao.updateUser({ ...orgUser, name, picture });
				}
			}

			// Attach org-specific user info to request
			req.orgUser = {
				id: orgUser.id,
				email: orgUser.email,
				name: orgUser.name,
				picture: orgUser.picture,
			};

			next();
		} catch (error) {
			log.error(error, "Failed to provision user in org schema");
			res.status(500).json({ error: "Failed to provision user" });
		}
	};
}

/**
 * Helper function to get the org-specific user ID from a request.
 * Falls back to the JWT userId if orgUser is not set (single-tenant mode).
 *
 * @param req Express request object
 * @param tokenUtil TokenUtil for decoding JWT
 * @returns The org-specific user ID, or undefined if not authenticated
 */
export function getOrgUserId(req: Request, tokenUtil: TokenUtil<UserInfo>): number | undefined {
	// Prefer org-specific user ID (set by UserProvisioningMiddleware in multi-tenant mode)
	if (req.orgUser?.id !== undefined) {
		return req.orgUser.id;
	}
	// Fall back to JWT userId (single-tenant mode)
	return tokenUtil.decodePayload(req)?.userId;
}
