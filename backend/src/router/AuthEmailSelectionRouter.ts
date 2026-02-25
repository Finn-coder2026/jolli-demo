import { validateAuthCode } from "../auth/AuthCodeService";
import type { BetterAuthInstance } from "../auth/BetterAuthConfig";
import type { ManagerDatabase } from "../core/ManagerDatabase";
import { buildAuthCookieValue, resolveCookieDomain } from "../util/Cookies";
import { getLog } from "../util/Logger";
import type { TokenUtil } from "../util/TokenUtil";
import express, { type Request, type Router } from "express";
import type { UserInfo } from "jolli-common";
import ms from "ms";

const log = getLog(import.meta);

type AuthWithUserRecord = NonNullable<
	Awaited<ReturnType<ManagerDatabase["globalAuthDao"]["findAuthWithUserByProviderId"]>>
>;

interface GitHubAuthSelectionData {
	authData: Record<string, unknown>;
	githubProviderId: string;
	accessToken: string;
	refreshToken: string | null;
}

interface EffectiveUserInfo {
	userId: number;
	email: string;
	name: string;
}

interface ResolveEffectiveUserArgs {
	managerDb: ManagerDatabase;
	authRecord: AuthWithUserRecord;
	githubProviderId: string;
	selectedEmail: string;
}

export interface AuthEmailSelectionRouterDeps {
	managerDb: ManagerDatabase;
	betterAuth?: BetterAuthInstance;
	tokenUtil: TokenUtil<UserInfo>;
	tokenCookieMaxAge: Parameters<typeof ms>[0];
	origin: string;
}

function parseAuthCount(authCount: unknown): number {
	return typeof authCount === "number" ? authCount : Number.parseInt(String(authCount ?? "0"), 10) || 0;
}

function extractGitHubAuthSelectionData(authJson: Record<string, unknown>): GitHubAuthSelectionData {
	const accountId = typeof authJson.accountId === "string" ? authJson.accountId : "";
	const providerId = typeof authJson.providerId === "string" ? authJson.providerId : "";
	const accessToken = typeof authJson.accessToken === "string" ? authJson.accessToken : "";
	const refreshToken = typeof authJson.refreshToken === "string" ? authJson.refreshToken : null;

	return {
		authData: authJson,
		githubProviderId: accountId || providerId,
		accessToken,
		refreshToken,
	};
}

async function resolveEffectiveUserFromSelection({
	managerDb,
	authRecord,
	githubProviderId,
	selectedEmail,
}: ResolveEffectiveUserArgs): Promise<EffectiveUserInfo> {
	const { userId, userEmail: currentUserEmail, userName, isActive } = authRecord;
	const currentEmail = currentUserEmail.toLowerCase();
	const authCount = parseAuthCount(authRecord.authCount);

	if (!isActive) {
		log.warn({ userId, email: currentUserEmail }, "Inactive user attempted login");
		throw new Error("INACTIVE_USER");
	}

	if (selectedEmail === currentEmail) {
		log.info({ userId, selectedEmail }, "Email selection: selected email matches current user");
		return { userId, email: currentEmail, name: userName };
	}

	const existingUser = await managerDb.globalUserDao.findUserByEmail(selectedEmail);
	if (existingUser && existingUser.id !== userId) {
		log.warn(
			{ githubProviderId, fromUserId: userId, toUserId: existingUser.id, selectedEmail },
			"Email selection: reassigning GitHub auth to existing user",
		);
		await managerDb.globalAuthDao.reassignAuthByProviderId("github", githubProviderId, existingUser.id);
		return {
			userId: existingUser.id,
			email: existingUser.email.toLowerCase(),
			name: existingUser.name,
		};
	}

	if (authCount > 1) {
		// Linked account scenario (e.g., Google + GitHub):
		// create a dedicated user for the selected email and reassign GitHub auth to it.
		const createdUser = await managerDb.globalUserDao.createUser({
			email: selectedEmail,
			name: userName,
			isActive,
		});
		log.info(
			{
				githubProviderId,
				fromUserId: userId,
				toUserId: createdUser.id,
				selectedEmail,
				authCount,
			},
			"Email selection: created user for selected email and reassigned GitHub auth",
		);
		await managerDb.globalAuthDao.reassignAuthByProviderId("github", githubProviderId, createdUser.id);
		return {
			userId: createdUser.id,
			email: createdUser.email.toLowerCase(),
			name: createdUser.name,
		};
	}

	log.info(
		{ userId, oldEmail: currentUserEmail, newEmail: selectedEmail, authCount },
		"Email selection: updating existing user email",
	);
	await managerDb.globalUserDao.updateUserEmail(userId, selectedEmail);
	return { userId, email: selectedEmail, name: userName };
}

function buildClearEmailSelectionCookie(cookieDomain: string | undefined, isSecure: boolean): string {
	return [
		"email_selection=",
		"Max-Age=0",
		"Path=/",
		"SameSite=Lax",
		isSecure ? "Secure" : "",
		cookieDomain ? `Domain=${cookieDomain}` : "",
	]
		.filter(Boolean)
		.join("; ");
}

function getRequestCookieHeader(req: Request): string | undefined {
	const header = req.headers.cookie;
	return Array.isArray(header) ? header.join("; ") : header;
}

function buildWebHeadersFromRequest(req: Request): Headers {
	const headers: Record<string, string> = {};
	const cookieHeader = getRequestCookieHeader(req);
	if (cookieHeader) {
		headers.cookie = cookieHeader;
	}
	return new Headers(headers);
}

function extractSetCookieHeaders(headers: Headers | null | undefined): Array<string> {
	if (!headers) {
		return [];
	}

	const maybeHeaders = headers as unknown as { getSetCookie?: () => Array<string> };
	if (typeof maybeHeaders.getSetCookie === "function") {
		return maybeHeaders.getSetCookie();
	}

	const setCookieValue = headers.get("set-cookie");
	return setCookieValue ? [setCookieValue] : [];
}

async function syncBetterAuthSessionUser(
	betterAuth: BetterAuthInstance | undefined,
	req: Request,
	effectiveUserId: number,
): Promise<Array<string>> {
	if (!betterAuth) {
		return [];
	}

	const headers = buildWebHeadersFromRequest(req);

	try {
		// Ask better-auth to resolve the signed cookie into the canonical session token.
		const tokenSessionResult = (await betterAuth.api.getSession({
			headers,
			query: {
				disableCookieCache: true,
				disableRefresh: true,
			},
			returnHeaders: true,
		})) as { response?: { session?: { token?: string } } };
		const sessionToken = tokenSessionResult?.response?.session?.token;
		if (!sessionToken) {
			log.warn({ effectiveUserId }, "Email selection: better-auth session token not found");
			return [];
		}

		const context = await betterAuth.$context;
		const updatedSession = await context.internalAdapter.updateSession(sessionToken, {
			userId: String(effectiveUserId),
			updatedAt: new Date(),
		});
		if (!updatedSession) {
			log.warn({ effectiveUserId }, "Email selection: better-auth session token not found");
			return [];
		}

		if (context.options?.secondaryStorage) {
			// Trigger better-auth's built-in refreshUserSessions(user) path.
			await context.internalAdapter.updateUser(String(effectiveUserId), {
				updatedAt: new Date(),
			});
		}

		// Rebuild session_data cookie using better-auth itself (no hardcoded cookie names).
		const refreshedSessionResult = (await betterAuth.api.getSession({
			headers,
			query: {
				disableCookieCache: true,
			},
			returnHeaders: true,
		})) as { headers?: Headers | null };

		log.info({ effectiveUserId }, "Email selection: synchronized better-auth session user");
		return extractSetCookieHeaders(refreshedSessionResult?.headers ?? null);
	} catch (error) {
		log.warn(error, "Email selection: failed to synchronize better-auth session user");
		return [];
	}
}

/**
 * Routes for GitHub OAuth email selection flow.
 * Mounted separately from AppFactory to keep auth-selection logic isolated.
 */
export function createAuthEmailSelectionRouter(deps: AuthEmailSelectionRouterDeps): Router {
	const { managerDb, betterAuth, tokenUtil, tokenCookieMaxAge, origin } = deps;
	const router = express.Router();

	// Decode auth code and return candidate emails for selection UI.
	router.post("/auth/validate-code", (req, res) => {
		const { code } = req.body;

		if (!code) {
			return res.status(400).json({ error: "Missing code" });
		}

		try {
			const payload = validateAuthCode(code);
			if (!payload?.pendingEmailSelection) {
				log.warn("Invalid auth code for validation");
				return res.status(400).json({ error: "Invalid or expired code" });
			}

			return res.json({
				pendingEmailSelection: {
					emails: payload.pendingEmailSelection.emails,
				},
			});
		} catch (error) {
			log.error(error, "Failed to validate auth code");
			return res.status(400).json({ error: "Invalid or expired code" });
		}
	});

	// Complete email selection and issue auth cookie/JWT.
	router.post("/auth/select-email", async (req, res) => {
		const { code, email } = req.body;

		if (!code || !email) {
			return res.status(400).json({ error: "Missing code or email" });
		}

		try {
			const payload = validateAuthCode(code);
			if (!payload?.pendingEmailSelection) {
				log.warn("Invalid auth code for email selection");
				return res.status(400).json({ error: "Invalid or expired code" });
			}

			// Prevent client-side tampering with selected email.
			if (!payload.pendingEmailSelection.emails.includes(email)) {
				log.warn(
					{ selectedEmail: email, validEmails: payload.pendingEmailSelection.emails },
					"Email tampering detected",
				);
				return res.status(403).json({ error: "Invalid email selection" });
			}

			const { authData, githubProviderId, accessToken, refreshToken } = extractGitHubAuthSelectionData(
				payload.pendingEmailSelection.authJson,
			);
			if (!githubProviderId) {
				log.error({ authData }, "Missing GitHub provider_id in auth data");
				return res.status(500).json({ error: "Missing GitHub account information" });
			}

			const authRecord = await managerDb.globalAuthDao.findAuthWithUserByProviderId("github", githubProviderId);
			if (!authRecord) {
				log.error({ githubProviderId }, "GitHub auth record not found");
				return res.status(500).json({ error: "Authentication state lost" });
			}

			const effectiveUser = await resolveEffectiveUserFromSelection({
				managerDb,
				authRecord,
				githubProviderId,
				selectedEmail: email.toLowerCase(),
			});

			await managerDb.globalAuthDao.updateTokensByProviderId(
				"github",
				githubProviderId,
				accessToken,
				refreshToken,
			);
			const refreshedSessionCookies = await syncBetterAuthSessionUser(betterAuth, req, effectiveUser.userId);

			const jwtToken = tokenUtil.generateToken({
				userId: effectiveUser.userId,
				email: effectiveUser.email,
				name: effectiveUser.name,
				picture: authData.picture as string | undefined,
			});

			const maxAge = ms(tokenCookieMaxAge);
			const cookieDomain = resolveCookieDomain();
			const isSecure = origin.startsWith("https://");
			const cookieValue = buildAuthCookieValue(jwtToken, cookieDomain, maxAge, isSecure);
			const clearEmailSelectionCookie = buildClearEmailSelectionCookie(cookieDomain, isSecure);
			res.setHeader("Set-Cookie", [cookieValue, clearEmailSelectionCookie, ...refreshedSessionCookies]);

			return res.json({
				success: true,
				redirectTo: "/select-tenant",
				effectiveEmail: effectiveUser.email,
			});
		} catch (error) {
			if (error instanceof Error && error.message === "INACTIVE_USER") {
				return res.status(403).json({ error: "Account is inactive" });
			}
			log.error(error, "Failed to complete email selection login");
			return res.status(500).json({ error: "Login failed" });
		}
	});

	return router;
}
