import { getConfig } from "../config/Config.js";
import type { UserOrgDao, UserTenantInfo } from "../dao/UserOrgDao.js";
import type { ActiveUserProvisioningService } from "../services/ActiveUserProvisioningService.js";
import { isEmailMatchingPatterns } from "../util/AuthHandler.js";
import { issueAuthCookie } from "../util/Cookies.js";
import { getLog } from "../util/Logger.js";
import type { TokenUtil } from "../util/TokenUtil.js";
import express from "express";
import type { UserInfo } from "jolli-common";
import "../types/SessionTypes.js";

const log = getLog(import.meta);

/**
 * Check if an email is authorized for a specific tenant.
 * Uses the tenant's AUTH_EMAILS config if available, otherwise falls back to global config.
 * @param email The email to check
 * @param tenant The tenant to check authorization against
 * @returns true if email is authorized, false otherwise
 */
function isEmailAuthorizedForTenant(email: string, tenant: UserTenantInfo): boolean {
	const config = getConfig();

	// Use tenant's AUTH_EMAILS if available, otherwise fall back to global config
	const authEmails = tenant.authEmails ?? config.AUTH_EMAILS;
	const isAuthorized = isEmailMatchingPatterns(email, authEmails);

	if (!isAuthorized) {
		log.debug(
			{ email, tenantId: tenant.tenantId, tenantAuthEmails: tenant.authEmails },
			"Email not authorized for tenant",
		);
	}

	return isAuthorized;
}

/**
 * Build the URL for a tenant based on its feature flags.
 * Priority:
 * 1. Custom domain (if customDomain feature enabled and primaryDomain set)
 * 2. Subdomain (if subdomain feature enabled)
 * 3. Path-based (default for free tier)
 *
 * @param tenant The tenant info with feature flags
 * @param path The path to append (e.g., "/dashboard")
 * @param protocol The protocol to use (http/https)
 * @param baseDomain The base domain for multi-tenant mode
 * @param fallbackHost The fallback host for single-tenant mode
 * @returns The full URL for the tenant
 */
function buildTenantUrl(
	tenant: UserTenantInfo,
	path: string,
	protocol: string,
	baseDomain: string | undefined,
	fallbackHost: string,
): string {
	const featureFlags = tenant.featureFlags as Record<string, unknown> | undefined;

	// Priority 1: Custom domain (if feature enabled and domain configured)
	if (featureFlags?.customDomain === true && tenant.primaryDomain) {
		return `https://${tenant.primaryDomain}${path}`;
	}

	// Priority 2: Subdomain (if feature enabled)
	if (featureFlags?.subdomain === true && baseDomain) {
		return `${protocol}://${tenant.tenantSlug}.${baseDomain}${path}`;
	}

	// Priority 3: Path-based (free tier default)
	if (baseDomain) {
		return `${protocol}://${baseDomain}/${tenant.tenantSlug}${path}`;
	}

	// Fallback for single-tenant mode
	return `${protocol}://${fallbackHost}${path}`;
}

export interface TenantSelectionRouterDeps {
	userOrgDao: UserOrgDao;
	tokenUtil: TokenUtil<UserInfo>;
	activeUserProvisioningService?: ActiveUserProvisioningService;
}

/**
 * Create tenant selection router
 */
export function createTenantSelectionRouter(deps: TenantSelectionRouterDeps): express.Router {
	const router = express.Router();
	const { userOrgDao, tokenUtil, activeUserProvisioningService } = deps;

	// GET /api/auth/tenants - Get current user's tenants
	router.get("/tenants", async (req, res) => {
		const startTime = Date.now();
		try {
			// Decode user info from JWT token
			const decodeStart = Date.now();
			const userInfo = tokenUtil.decodePayload(req);
			const decodeTime = Date.now() - decodeStart;

			log.info(
				{
					hasUserInfo: !!userInfo,
					userId: userInfo?.userId,
					email: userInfo?.email,
					userInfoKeys: userInfo ? Object.keys(userInfo) : [],
					hasCookie: !!req.cookies?.authToken,
					hasAuthHeader: !!req.headers.authorization,
				},
				"Decoded user info from token",
			);

			if (!userInfo?.userId) {
				log.warn({ userInfo }, "No userId in token");
				return res.status(401).json({
					error: "not_authenticated",
					message: "Authentication required",
				});
			}

			// Get tenants for user (joined with tenants table for slug and name)
			const queryStart = Date.now();
			const tenants = await userOrgDao.getUserTenants(userInfo.userId);
			const queryTime = Date.now() - queryStart;

			// Generate URL for each tenant based on feature flags
			const config = getConfig();
			const baseDomain = config.BASE_DOMAIN;
			const protocol = req.protocol;
			const host = req.get("host") || "";

			// Build URLs respecting each tenant's feature flags (custom domain, subdomain, or path-based)
			const tenantsWithUrls = tenants.map(tenant => ({
				...tenant,
				url: buildTenantUrl(tenant, "/dashboard", protocol, baseDomain, host),
			}));

			const totalTime = Date.now() - startTime;

			log.info(
				{
					userId: userInfo.userId,
					tenantCount: tenants.length,
					timings: {
						decodeMs: decodeTime,
						queryMs: queryTime,
						totalMs: totalTime,
					},
				},
				"Fetched user tenants",
			);
			res.json({ tenants: tenantsWithUrls });
		} catch (error) {
			const totalTime = Date.now() - startTime;
			log.error({ error, totalMs: totalTime }, "Failed to fetch tenants");
			res.status(500).json({
				error: "server_error",
				message: "Failed to fetch tenants",
			});
		}
	});

	// POST /api/auth/tenants/set-default - Set default tenant
	router.post("/tenants/set-default", async (req, res) => {
		try {
			const userInfo = tokenUtil.decodePayload(req);

			if (!userInfo?.userId) {
				return res.status(401).json({
					error: "not_authenticated",
					message: "Authentication required",
				});
			}

			const { tenantId, orgId } = req.body;

			if (!tenantId || !orgId) {
				return res.status(400).json({
					error: "missing_parameters",
					message: "tenantId and orgId are required",
				});
			}

			await userOrgDao.setDefaultTenant(userInfo.userId, tenantId, orgId);

			// Save tenantId and orgId to session
			if (req.session) {
				req.session.tenantId = tenantId;
				req.session.orgId = orgId;
			}

			log.info({ userId: userInfo.userId, tenantId, orgId }, "Set default tenant and saved to session");
			res.json({ success: true });
		} catch (error) {
			log.error(error, "Failed to set default tenant");
			res.status(500).json({
				error: "server_error",
				message: "Failed to set default tenant",
			});
		}
	});

	// POST /api/auth/tenants/update-access - Update last accessed timestamp
	router.post("/tenants/update-access", async (req, res) => {
		try {
			const userInfo = tokenUtil.decodePayload(req);

			if (!userInfo?.userId) {
				return res.status(401).json({
					error: "not_authenticated",
					message: "Authentication required",
				});
			}

			const { tenantId, orgId } = req.body;

			if (!tenantId || !orgId) {
				return res.status(400).json({
					error: "missing_parameters",
					message: "tenantId and orgId are required",
				});
			}

			await userOrgDao.updateLastAccessed(userInfo.userId, tenantId, orgId);

			// Save tenantId and orgId to session
			if (req.session) {
				req.session.tenantId = tenantId;
				req.session.orgId = orgId;
			}

			log.debug(
				{ userId: userInfo.userId, tenantId, orgId },
				"Updated tenant last accessed and saved to session",
			);
			res.json({ success: true });
		} catch (error) {
			log.error(error, "Failed to update tenant access");
			res.status(500).json({
				error: "server_error",
				message: "Failed to update tenant access",
			});
		}
	});

	// POST /api/auth/tenants/select - Select tenant and regenerate JWT with tenant context
	router.post("/tenants/select", async (req, res) => {
		try {
			const userInfo = tokenUtil.decodePayload(req);

			if (!userInfo?.userId) {
				log.warn("Tenant selection attempted without authentication");
				return res.status(401).json({
					error: "not_authenticated",
					message: "Authentication required",
				});
			}

			const { tenantId, orgId } = req.body;

			log.info(
				{
					userId: userInfo.userId,
					requestedTenantId: tenantId,
					requestedOrgId: orgId,
					currentTenantId: userInfo.tenantId,
					currentOrgId: userInfo.orgId,
				},
				"Client requested tenant/org selection",
			);

			if (!tenantId || !orgId) {
				log.warn({ userId: userInfo.userId, tenantId, orgId }, "Missing tenantId or orgId in request");
				return res.status(400).json({
					error: "missing_parameters",
					message: "tenantId and orgId are required",
				});
			}

			// Verify user has access to this tenant/org
			const tenants = await userOrgDao.getUserTenants(userInfo.userId);
			const matchingTenant = tenants.find(t => t.tenantId === tenantId && t.orgId === orgId);

			if (!matchingTenant) {
				log.warn(
					{
						userId: userInfo.userId,
						requestedTenantId: tenantId,
						requestedOrgId: orgId,
						availableTenants: tenants.length,
					},
					"User does not have access to requested tenant/org",
				);
				return res.status(403).json({
					error: "access_denied",
					message: "User does not have access to this tenant/org",
				});
			}

			// Check if user's email is authorized for this tenant
			if (!isEmailAuthorizedForTenant(userInfo.email, matchingTenant)) {
				log.warn(
					{
						userId: userInfo.userId,
						email: userInfo.email,
						tenantId,
						orgId,
						tenantSlug: matchingTenant.tenantSlug,
						tenantAuthEmails: matchingTenant.authEmails,
					},
					"Email not authorized for tenant",
				);
				return res.status(403).json({
					error: "email_not_authorized",
					message: "Your email is not authorized for this organization",
				});
			}

			// Check if user is inactive in this tenant/org, then auto-create if missing
			if (activeUserProvisioningService) {
				const isInactive = await activeUserProvisioningService.isUserInactiveInTenant(
					userInfo.userId,
					tenantId,
					orgId,
				);
				if (isInactive) {
					log.warn(
						{ userId: userInfo.userId, email: userInfo.email, tenantId, orgId },
						"Tenant selection blocked: user is inactive in this tenant/org",
					);
					return res.status(403).json({
						error: "user_inactive",
						message: "Your account is inactive in this organization",
					});
				}

				try {
					await activeUserProvisioningService.ensureActiveUser({
						userId: userInfo.userId,
						email: userInfo.email,
						name: userInfo.name ?? null,
						picture: userInfo.picture ?? null,
						tenantId,
						orgId,
						role: matchingTenant.role,
					});
				} catch (error) {
					// Log error but don't fail the login process
					log.error(
						{ error, userId: userInfo.userId, tenantId, orgId },
						"Failed to auto-create active_users record, continuing with login",
					);
				}
			}

			// Generate new token with tenant context
			const tokenPayload = {
				email: userInfo.email,
				name: userInfo.name,
				picture: userInfo.picture,
				userId: userInfo.userId,
				tenantId,
				orgId,
			};

			log.info(
				{
					userId: userInfo.userId,
					requestedTenantId: tenantId,
					requestedOrgId: orgId,
					tokenTenantId: tokenPayload.tenantId,
					tokenOrgId: tokenPayload.orgId,
					tenantSlug: matchingTenant.tenantSlug,
					orgSlug: matchingTenant.orgSlug,
				},
				"Generating auth token with tenant/org context",
			);

			const newToken = tokenUtil.generateToken(tokenPayload);

			// Set new auth cookie
			issueAuthCookie(res, newToken);

			// Update session
			if (req.session) {
				req.session.tenantId = tenantId;
				req.session.orgId = orgId;
			}

			// Update last accessed timestamp
			await userOrgDao.updateLastAccessed(userInfo.userId, tenantId, orgId);

			// Get redirect path from request body, default to /dashboard
			// Validate to prevent open redirect attacks (must start with /)
			const requestedRedirect = typeof req.body.redirect === "string" ? req.body.redirect : "/dashboard";
			const safeRedirectPath = requestedRedirect.startsWith("/") ? requestedRedirect : "/dashboard";

			// Generate the tenant URL for client-side redirect based on feature flags
			const config = getConfig();
			const baseDomain = config.BASE_DOMAIN;
			const protocol = req.protocol;
			const host = req.get("host") || "";
			const url = buildTenantUrl(matchingTenant, safeRedirectPath, protocol, baseDomain, host);

			log.info(
				{
					userId: userInfo.userId,
					tenantId,
					orgId,
					tenantSlug: matchingTenant.tenantSlug,
					orgSlug: matchingTenant.orgSlug,
					redirectUrl: url,
				},
				"Successfully selected tenant and regenerated token",
			);

			res.json({
				success: true,
				url,
			});
		} catch (error) {
			log.error(error, "Failed to select tenant");
			res.status(500).json({
				error: "server_error",
				message: "Failed to select tenant",
			});
		}
	});

	return router;
}
