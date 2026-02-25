// Extend express-session SessionData to add custom fields
import "express-session";

declare module "express-session" {
	interface SessionData {
		// Used by multi-tenant auth gateway for storing tenant context during OAuth flow (better-auth)
		gatewayAuth?: {
			tenantSlug: string;
			returnTo: string;
		};
		// Used by SiteAuthRouter for site-specific login flow
		pendingSiteAuth?: {
			siteId: string;
			returnUrl: string;
		};
		// User ID from Manager DB (saved after successful login via better-auth)
		userId?: number;
		// Selected tenant/org (saved after tenant selection)
		tenantId?: string;
		orgId?: string;
	}
}

// Extend the Request interface to include orgUser and space
declare module "express-serve-static-core" {
	interface Request {
		// Org-specific user info (set by UserProvisioningMiddleware in multi-tenant mode)
		// This user ID is specific to the current org schema and may differ from the JWT userId
		orgUser?: {
			id: number;
			email: string;
			name: string;
			picture: string | undefined;
		};
		// Space resolved by router.param('id') in SpaceRouter — pre-validated for access control
		space?: import("../model/Space").Space;
	}
}

// Runtime marker to ensure module is loaded for coverage
export const SESSION_TYPES_LOADED = true;
