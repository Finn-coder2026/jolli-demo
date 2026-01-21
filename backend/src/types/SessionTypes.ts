// Extend the Request interface to include session types used across routers
declare module "express-serve-static-core" {
	interface Request {
		session?: {
			// Used by AuthRouter for OAuth flow
			grant?: {
				response?: {
					access_token?: string;
				};
				provider?: string;
			};
			// Used by AuthRouter for email selection
			pendingAuth?: {
				authJson: Record<string, unknown>;
				emails: Array<string>;
			};
			// Used by grant library for dynamic OAuth configuration
			dynamic?: {
				origin?: string;
				redirect_uri?: string;
			};
			// Used for dynamic OAuth redirect - stores the origin URL the user started OAuth from
			oauthOrigin?: string;
			// Used by multi-tenant auth gateway for storing tenant context during OAuth flow
			gatewayAuth?: {
				tenantSlug: string;
				returnTo: string;
			};
			// Used by SiteAuthRouter for site-specific login flow
			pendingSiteAuth?: {
				siteId: string;
				returnUrl: string;
			};
		};
		// Org-specific user info (set by UserProvisioningMiddleware in multi-tenant mode)
		// This user ID is specific to the current org schema and may differ from the JWT userId
		orgUser?: {
			id: number;
			email: string;
			name: string;
			picture: string | undefined;
		};
	}
}

// Runtime marker to ensure module is loaded for coverage
export const SESSION_TYPES_LOADED = true;
