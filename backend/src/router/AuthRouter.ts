import { auditLog } from "../audit";
import {
	type AuthUserInfo,
	generateAuthCode,
	generatePendingEmailAuthCode,
	validateAuthCode,
} from "../auth/AuthCodeService";
import { isMultiTenantAuthEnabled } from "../auth/AuthGateway";
import { findAuthProvider } from "../auth/AuthProvider";
import { getConfig, parseRegexList } from "../config/Config";
import type { AuthDao } from "../dao/AuthDao";
import type { DaoProvider } from "../dao/DaoProvider";
import type { UserDao } from "../dao/UserDao";
import type { Auth, NewAuth } from "../model/Auth";
import type { User } from "../model/User";
import { getTenantContext } from "../tenant/TenantContext";
import { clearAuthCookie, issueAuthCookie } from "../util/Cookies";
import { getLog } from "../util/Logger";
import type { TokenUtil } from "../util/TokenUtil";
import express, { type Router } from "express";
import type { UserInfo } from "jolli-common";
import ms from "ms";
import "../types/SessionTypes";

const log = getLog(import.meta);

export function createAuthRouter(
	authDaoProvider: DaoProvider<AuthDao>,
	userDaoProvider: DaoProvider<UserDao>,
	tokenUtil: TokenUtil<UserInfo>,
): Router {
	const router = express.Router();

	router.get("/callback", async (req, res) => {
		try {
			const session = req.session;
			// Use stored origin from OAuth flow, fall back to configured origin (tenant-scoped)
			const callbackOrigin = session?.oauthOrigin ?? getConfig().ORIGIN;

			if (!session) {
				return res.redirect(`${callbackOrigin}/?error=session_missing`);
			}

			const grant = session.grant?.response;
			if (!grant?.access_token) {
				return res.redirect(`${callbackOrigin}/?error=oauth_failed`);
			}

			const providerName = req.session?.grant?.provider;
			const authProvider = findAuthProvider(providerName);
			if (!authProvider) {
				return res.redirect(`${callbackOrigin}/?error=invalid_provider`);
			}

			const authResponse = await fetch(authProvider.url, {
				headers: {
					Authorization: `Bearer ${grant.access_token}`,
					"User-Agent": "Jolli",
				},
			});

			if (!authResponse.ok) {
				log.error("Auth fetch failed: %s", await authResponse.text());
				return res.redirect(`${callbackOrigin}/?error=auth_fetch_failed`);
			}

			const authJson = await authResponse.json();

			// Check if this is a gateway callback (multi-tenant auth mode)
			const gatewayAuth = session.gatewayAuth;
			if (gatewayAuth && isMultiTenantAuthEnabled()) {
				return handleGatewayCallback(
					req,
					res,
					authProvider,
					authJson,
					grant.access_token,
					gatewayAuth,
					/* c8 ignore next */ providerName ?? "unknown",
				);
			}

			// Standard callback flow (non-gateway mode)
			const redirectUrl = new URL("/", callbackOrigin);

			let email = authProvider.getSelectedEmail(authJson);
			if (!email) {
				const emails = await authProvider.getVerifiedEmails(grant.access_token);
				if (emails.length === 0) {
					return res.redirect(`${callbackOrigin}/?error=no_verified_emails`);
				} else if (emails.length === 1) {
					email = emails[0];
				} else {
					session.pendingAuth = { authJson, emails };
					redirectUrl.searchParams.set("select_email", "true");
				}
			}

			if (email) {
				const token = await login(authProvider.newAuth(authJson, email));
				issueAuthCookie(res, token);
			}

			// Clear the stored origin after successful callback
			if (session.oauthOrigin) {
				delete session.oauthOrigin;
			}

			// Check for pending site auth - redirect to complete site authentication
			if (session.pendingSiteAuth) {
				const { siteId, returnUrl } = session.pendingSiteAuth;
				delete session.pendingSiteAuth;
				return res.redirect(`/api/sites/${siteId}/auth/jwt?returnUrl=${encodeURIComponent(returnUrl)}`);
			}

			return res.redirect(redirectUrl.toString());
		} catch (error) {
			log.error(error, "OAuth callback error:");
			const callbackOrigin = req.session?.oauthOrigin ?? getConfig().ORIGIN;
			res.redirect(`${callbackOrigin}/?error=server_error`);
		}
	});

	/**
	 * Handle gateway callback - generate auth code and redirect to tenant.
	 * This is called when the auth gateway receives OAuth callback in multi-tenant mode.
	 */
	async function handleGatewayCallback(
		req: express.Request,
		res: express.Response,
		authProvider: ReturnType<typeof findAuthProvider>,
		authJson: Record<string, unknown>,
		accessToken: string,
		gatewayAuth: { tenantSlug: string; returnTo: string },
		providerName: string,
	): Promise<void> {
		const session = req.session;

		// Get email - handle multiple email case
		let email = authProvider?.getSelectedEmail(authJson);
		if (!email) {
			/* c8 ignore next */ const emails = authProvider ? await authProvider.getVerifiedEmails(accessToken) : [];
			if (emails.length === 0) {
				return res.redirect(`${gatewayAuth.returnTo}/?error=no_verified_emails`);
			} else if (emails.length === 1) {
				email = emails[0];
			} else {
				// Multiple emails - generate pending auth code and redirect to tenant for selection
				const pendingCode = generatePendingEmailAuthCode(
					emails,
					authJson,
					providerName,
					gatewayAuth.tenantSlug,
					gatewayAuth.returnTo,
				);

				// Clean up session
				if (session) {
					delete session.gatewayAuth;
					delete session.oauthOrigin;
				}

				// Redirect to tenant's /api/auth/complete with pending code
				const selectUrl = new URL("/api/auth/complete", gatewayAuth.returnTo);
				selectUrl.searchParams.set("code", pendingCode);
				log.info(
					{ tenantSlug: gatewayAuth.tenantSlug, emailCount: emails.length },
					"Gateway redirecting to tenant for email selection",
				);
				return res.redirect(selectUrl.toString());
			}
		}

		// Build user info for auth code
		const newAuth = authProvider?.newAuth(authJson, email);
		const userInfo: AuthUserInfo = {
			email,
			/* v8 ignore next 4 */
			name: newAuth?.name ?? email,
			// Use jolli_ prefix for Jolli's shared OAuth apps
			provider: `jolli_${providerName}`,
			subject: newAuth?.subject ?? "",
			...(newAuth?.picture && { picture: newAuth.picture }),
		};

		// Generate encrypted auth code
		const authCode = generateAuthCode(userInfo, gatewayAuth.tenantSlug, gatewayAuth.returnTo);

		// Clean up session
		if (session) {
			delete session.gatewayAuth;
			delete session.oauthOrigin;
		}

		// Redirect to tenant's /api/auth/complete endpoint
		const completeUrl = new URL("/api/auth/complete", gatewayAuth.returnTo);
		completeUrl.searchParams.set("code", authCode);
		log.info({ tenantSlug: gatewayAuth.tenantSlug, email }, "Gateway redirecting to tenant complete endpoint");
		return res.redirect(completeUrl.toString());
	}

	router.get("/emails", (req, res) => {
		try {
			const pendingAuth = req.session?.pendingAuth;
			if (!pendingAuth?.emails) {
				return res.status(400).json({ error: "No pending authentication" });
			}

			res.json({ emails: pendingAuth.emails });
		} catch (error) {
			log.error(error, "Get emails error:");
			res.status(500).json({ error: "server_error" });
		}
	});

	router.post("/select-email", async (req, res) => {
		try {
			const pendingAuth = req.session?.pendingAuth;
			if (!pendingAuth) {
				return res.status(400).json({ error: "No pending authentication" });
			}

			const { email } = req.body;
			if (!email || typeof email !== "string") {
				return res.status(400).json({ error: "Invalid email" });
			}

			const providerName = req.session?.grant?.provider;
			const authProvider = findAuthProvider(providerName);
			if (!authProvider) {
				return res.status(400).json({ error: "Invalid provider" });
			}

			if (!pendingAuth.emails.includes(email)) {
				return res.status(400).json({ error: "Invalid email selection" });
			}

			// Check if this is gateway mode (multi-tenant auth)
			const gatewayAuth = req.session?.gatewayAuth;
			if (gatewayAuth && isMultiTenantAuthEnabled()) {
				// Gateway mode - generate auth code and return redirect URL
				const newAuth = authProvider.newAuth(pendingAuth.authJson, email);
				const userInfo: AuthUserInfo = {
					email,
					/* v8 ignore next 4 */
					name: newAuth?.name ?? email,
					provider: `jolli_${providerName}`,
					subject: newAuth?.subject ?? "",
					...(newAuth?.picture && { picture: newAuth.picture }),
				};

				const authCode = generateAuthCode(userInfo, gatewayAuth.tenantSlug, gatewayAuth.returnTo);

				// Clean up session
				if (req.session) {
					delete req.session.pendingAuth;
					delete req.session.gatewayAuth;
					delete req.session.oauthOrigin;
				}

				// Return redirect URL for frontend to navigate to
				const completeUrl = new URL("/api/auth/complete", gatewayAuth.returnTo);
				completeUrl.searchParams.set("code", authCode);

				log.info(
					{ tenantSlug: gatewayAuth.tenantSlug, email },
					"Gateway email selection complete, returning redirect URL",
				);
				return res.json({ success: true, redirectTo: completeUrl.toString() });
			}

			// Standard mode - create user and issue cookie
			if (req.session) {
				delete req.session.pendingAuth;
			}

			const token = await login(authProvider.newAuth(pendingAuth.authJson, email));
			issueAuthCookie(res, token);

			// Check for pending site auth - return redirect URL for site authentication
			if (req.session?.pendingSiteAuth) {
				const { siteId, returnUrl } = req.session.pendingSiteAuth;
				delete req.session.pendingSiteAuth;
				return res.json({
					success: true,
					redirectTo: `/api/sites/${siteId}/auth/jwt?returnUrl=${encodeURIComponent(returnUrl)}`,
				});
			}

			res.json({ success: true });
		} catch (error) {
			log.error(error, "Email selection error:");
			res.status(500).json({ error: "server_error" });
		}
	});

	router.get("/login", (req, res) => {
		const userInfo = tokenUtil.decodePayload(req);
		res.json({ user: userInfo ?? undefined });
	});

	router.get("/cli-token", (req, res) => {
		const token = req.cookies?.authToken;
		if (!token) {
			return res.status(401).json({ error: "Not authorized" });
		}
		res.json({ token });
	});

	router.post("/logout", (req, res) => {
		const userInfo = tokenUtil.decodePayload(req);
		clearAuthCookie(res);

		// Audit log the logout event
		if (userInfo) {
			auditLog({
				action: "logout",
				resourceType: "session",
				resourceId: userInfo.userId?.toString() ?? userInfo.email,
				resourceName: userInfo.email,
				actorId: userInfo.userId ?? null,
				actorEmail: userInfo.email,
			});
		}

		res.json({ success: true });
	});

	/**
	 * Returns gateway auth info from session.
	 * Used by the frontend on the auth gateway to get the tenant returnTo URL
	 * for redirecting errors back to the tenant.
	 */
	router.get("/gateway-info", (req, res) => {
		const gatewayAuth = req.session?.gatewayAuth;
		if (!gatewayAuth) {
			return res.status(404).json({ error: "No gateway auth in session" });
		}
		res.json({
			tenantSlug: gatewayAuth.tenantSlug,
			returnTo: gatewayAuth.returnTo,
		});
	});

	/**
	 * Returns session configuration for the frontend.
	 * This is a public endpoint (no auth required) so the frontend can fetch
	 * the idle timeout value before the user logs in.
	 */
	router.get("/session-config", (_req, res) => {
		const config = getConfig();

		// Parse enabled providers and map to frontend-friendly names
		const enabledProviders = config.ENABLED_AUTH_PROVIDERS.split(",")
			.map(p => p.trim())
			.filter(p => p.length > 0)
			.map(p => {
				// Strip jolli_ prefix for frontend display
				if (p.startsWith("jolli_")) {
					return p.slice(6); // "jolli_google" -> "google"
				}
				return p;
			});

		res.json({
			idleTimeoutMs: ms(config.SESSION_IDLE_TIMEOUT),
			enabledProviders,
			siteEnv: config.SITE_ENV,
			jolliSiteDomain: config.JOLLI_SITE_DOMAIN,
		});
	});

	/**
	 * Check if a provider is enabled for the tenant.
	 */
	function isProviderEnabled(provider: string): boolean {
		const config = getConfig();
		const enabledProviders = config.ENABLED_AUTH_PROVIDERS.split(",").map(p => p.trim());
		return enabledProviders.includes(provider);
	}

	/**
	 * Check if an email is authorized for the tenant.
	 * Returns true if authorized, false otherwise.
	 */
	function isEmailAuthorized(email: string): boolean {
		const config = getConfig();

		// Check super admin emails first
		const superAdminPatterns = config.SUPER_ADMIN_EMAILS ? parseRegexList(config.SUPER_ADMIN_EMAILS) : [];
		if (superAdminPatterns.some(p => p.test(email))) {
			return true;
		}

		// Check tenant's email patterns
		const authEmails = config.AUTH_EMAILS;
		if (authEmails === "*") {
			return true;
		}

		const emailPatterns = parseRegexList(authEmails);
		return emailPatterns.some(pattern => pattern.test(email));
	}

	/**
	 * Check seat limits for a new user.
	 * Returns an error string if seat limit is reached, null otherwise.
	 */
	async function checkSeatLimit(email: string, userDao: UserDao): Promise<string | null> {
		const existingUser = await userDao.findUser(email);
		if (existingUser) {
			return null; // Existing users don't count against new seats
		}

		const config = getConfig();
		/* v8 ignore next */
		const maxSeatsConfig = config.MAX_SEATS ?? "5";
		if (maxSeatsConfig === "unlimited") {
			return null;
		}

		const maxSeats = Number.parseInt(maxSeatsConfig, 10);
		const userCount = await userDao.countUsers();
		if (userCount >= maxSeats) {
			log.warn({ email, userCount, maxSeats }, "Auth complete: seat limit reached");
			return "seat_limit_reached";
		}

		return null;
	}

	/**
	 * Complete auth from gateway redirect.
	 * This endpoint is called by the tenant backend after the gateway redirects with an auth code.
	 * It validates the code, creates/updates the user, and issues a JWT cookie.
	 */
	router.get("/complete", async (req, res) => {
		try {
			const code = req.query.code as string | undefined;
			if (!code) {
				return res.redirect("/?error=missing_auth_code");
			}

			// Validate and decrypt auth code
			const payload = validateAuthCode(code);
			if (!payload) {
				log.warn("Auth complete: invalid or expired auth code");
				return res.redirect("/?error=invalid_auth_code");
			}

			// Verify tenant matches (prevent cross-tenant auth)
			const tenantContext = getTenantContext();
			if (tenantContext && tenantContext.tenant.slug !== payload.tenantSlug) {
				log.warn(
					{ expected: tenantContext.tenant.slug, actual: payload.tenantSlug },
					"Auth complete: tenant mismatch",
				);
				return res.redirect("/?error=tenant_mismatch");
			}

			// Handle pending email selection
			if (payload.pendingEmailSelection) {
				const providerWithPrefix = `jolli_${payload.pendingEmailSelection.providerName}`;
				if (!isProviderEnabled(providerWithPrefix)) {
					log.warn(
						{ provider: providerWithPrefix },
						"Auth complete: provider not enabled for tenant (email selection)",
					);
					return res.redirect("/?error=provider_not_enabled");
				}

				// Store pending auth in session for email selection
				if (req.session) {
					req.session.pendingAuth = {
						authJson: payload.pendingEmailSelection.authJson,
						emails: payload.pendingEmailSelection.emails,
					};
					req.session.grant = { provider: payload.pendingEmailSelection.providerName };
				}
				log.info(
					{ tenantSlug: payload.tenantSlug, emailCount: payload.pendingEmailSelection.emails.length },
					"Auth complete: redirecting to email selection",
				);
				return res.redirect("/?select_email=true");
			}

			const { userInfo } = payload;

			// Validate provider, email authorization, and seat limits
			if (!isProviderEnabled(userInfo.provider)) {
				log.warn({ provider: userInfo.provider }, "Auth complete: provider not enabled for tenant");
				return res.redirect("/?error=provider_not_enabled");
			}

			if (!isEmailAuthorized(userInfo.email)) {
				log.warn({ email: userInfo.email }, "Auth complete: email not authorized");
				return res.redirect("/?error=email_not_authorized");
			}

			const userDao = userDaoProvider.getDao(tenantContext);
			const seatLimitError = await checkSeatLimit(userInfo.email, userDao);
			if (seatLimitError) {
				return res.redirect(`/?error=${seatLimitError}`);
			}

			// Create or update auth and user records
			const token = await login({
				provider: userInfo.provider,
				subject: userInfo.subject,
				email: userInfo.email,
				name: userInfo.name,
				picture: userInfo.picture,
			});
			issueAuthCookie(res, token);

			log.info({ email: userInfo.email, tenantSlug: payload.tenantSlug }, "Auth complete successful");

			// Check for pending site auth - redirect to complete site authentication
			if (req.session?.pendingSiteAuth) {
				const { siteId, returnUrl } = req.session.pendingSiteAuth;
				delete req.session.pendingSiteAuth;
				return res.redirect(`/api/sites/${siteId}/auth/jwt?returnUrl=${encodeURIComponent(returnUrl)}`);
			}

			return res.redirect("/");
		} catch (error) {
			log.error(error, "Auth complete error:");
			return res.redirect("/?error=server_error");
		}
	});

	async function login(newAuth: NewAuth): Promise<string> {
		const auth = await createOrUpdateAuth(newAuth);
		const user = await createOrUpdateUser(auth);
		const token = tokenUtil.generateToken({
			name: user.name,
			email: user.email,
			picture: user.picture,
			userId: user.id,
		});

		// Audit log the login event
		auditLog({
			action: "login",
			resourceType: "session",
			resourceId: user.id.toString(),
			resourceName: user.email,
			actorId: user.id,
			actorEmail: user.email,
			metadata: {
				provider: newAuth.provider,
			},
		});

		return token;
	}

	async function createOrUpdateAuth(newAuth: NewAuth): Promise<Auth> {
		const authDao = authDaoProvider.getDao(getTenantContext());
		const auth = await authDao.findAuth(newAuth.provider, newAuth.subject);
		if (auth) {
			return await authDao.updateAuth({ ...auth, ...newAuth });
		} else {
			return await authDao.createAuth(newAuth);
		}
	}

	async function createOrUpdateUser(auth: Auth): Promise<User> {
		const userDao = userDaoProvider.getDao(getTenantContext());
		const user = await userDao.findUser(auth.email);
		if (user) {
			return await userDao.updateUser({
				...user,
				name: auth.name,
				picture: auth.picture,
			});
		} else {
			return await userDao.createUser({
				email: auth.email,
				name: auth.name,
				picture: auth.picture,
			});
		}
	}

	return router;
}
