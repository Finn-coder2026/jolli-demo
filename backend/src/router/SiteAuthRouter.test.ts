import type { DaoProvider } from "../dao/DaoProvider";
import type { SiteDao } from "../dao/SiteDao";
import { mockSiteDao as createMockSiteDao } from "../dao/SiteDao.mock";
import type { Site, SiteMetadata } from "../model/Site";
import type { TokenUtil } from "../util/TokenUtil";
import { createSiteAuthRouter } from "./SiteAuthRouter";
import { generateKeyPairSync } from "node:crypto";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { UserInfo } from "jolli-common";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../types/SessionTypes";

// Mock the config module
vi.mock("../config/Config", () => ({
	getConfig: vi.fn(() => ({
		TOKEN_SECRET: "test-secret-key-for-jwt-signing",
	})),
}));

// Mock the AuthHandler module for isEmailAuthorized
const mockIsEmailAuthorized = vi.fn();
vi.mock("../util/AuthHandler", () => ({
	isEmailAuthorized: (...args: Array<unknown>) => mockIsEmailAuthorized(...args),
}));

/** Helper to wrap a DAO in a mock provider */
function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

// Generate a valid ES256 key pair for testing (same method as production code)
const { publicKey: testPublicKey, privateKey: testPrivateKey } = generateKeyPairSync("ec", {
	namedCurve: "prime256v1",
	publicKeyEncoding: { type: "spki", format: "pem" },
	privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

describe("SiteAuthRouter", () => {
	let app: Express;
	let mockSiteDao: SiteDao;
	let mockTokenUtil: TokenUtil<UserInfo>;

	const mockDocsite: Site = {
		id: 1,
		name: "test-site",
		displayName: "Test Site",
		userId: 1,
		status: "active",
		visibility: "internal",
		lastGeneratedAt: new Date("2024-01-15T10:00:00Z"),
		metadata: {
			githubRepo: "Jolli-sample-repos/test-site",
			githubUrl: "https://github.com/Jolli-sample-repos/test-site",
			vercelUrl: "https://test-site.vercel.app",
			framework: "docusaurus-2",
			articleCount: 3,
			lastDeployedAt: "2024-01-15T10:00:00Z",
			jwtAuth: {
				enabled: true,
				mode: "full" as const,
				loginUrl: "https://jolli.ai/api/sites/1/auth/jwt",
				publicKey: testPublicKey,
				privateKey: testPrivateKey,
			},
		},
		createdAt: new Date("2024-01-15T08:00:00Z"),
		updatedAt: new Date("2024-01-15T10:00:00Z"),
	};

	beforeEach(() => {
		mockSiteDao = createMockSiteDao();
		mockTokenUtil = {
			encodePayload: vi.fn(),
			decodePayload: vi.fn(),
		} as unknown as TokenUtil<UserInfo>;

		app = express();
		app.use(express.json());
		app.use("/sites", createSiteAuthRouter(mockDaoProvider(mockSiteDao), mockTokenUtil));
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("GET /:id/auth/jwt", () => {
		const mockUserInfo: UserInfo = {
			email: "test@example.com",
			name: "Test User",
			userId: 42,
			picture: "https://example.com/avatar.png",
		};

		let mockSession: NonNullable<Request["session"]>;

		beforeEach(() => {
			// Create mock session with save method that invokes callback immediately
			mockSession = {
				save: (cb: (err?: Error) => void) => cb(),
			} as unknown as NonNullable<Request["session"]>;
			// Re-mount the router with session middleware
			app = express();
			app.use(express.json());
			app.use((req: Request, _res: Response, next: NextFunction) => {
				req.session = mockSession;
				next();
			});
			app.use("/sites", createSiteAuthRouter(mockDaoProvider(mockSiteDao), mockTokenUtil));
			// Default to authorized for most tests
			mockIsEmailAuthorized.mockReturnValue(true);
		});

		function createSiteWithJolliDomain(): Site {
			return {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					jolliSiteDomain: "docs-acme.jolli.site",
				} as typeof mockDocsite.metadata,
			};
		}

		function createSiteWithCustomDomain(): Site {
			return {
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					customDomains: [
						{
							domain: "docs.example.com",
							status: "verified" as const,
							addedAt: "2024-01-15T10:00:00Z",
							verifiedAt: "2024-01-15T10:30:00Z",
						},
					],
				} as typeof mockDocsite.metadata,
			};
		}

		it("should return 400 for invalid site ID", async () => {
			const response = await request(app).get("/sites/invalid/auth/jwt");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid site ID" });
		});

		it("should return 404 when site does not exist", async () => {
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(undefined);

			const response = await request(app).get("/sites/999/auth/jwt");

			expect(response.status).toBe(404);
			expect(response.body).toEqual({ error: "Site not found" });
		});

		it("should return 500 when session is not available", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(createSiteWithJolliDomain());

			// Create app without session middleware
			const appWithoutSession = express();
			appWithoutSession.use(express.json());
			appWithoutSession.use("/sites", createSiteAuthRouter(mockDaoProvider(mockSiteDao), mockTokenUtil));

			const response = await request(appWithoutSession).get("/sites/1/auth/jwt");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Session not available" });
		});

		it("should store pendingSiteAuth and redirect to login when user is not authenticated", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(createSiteWithJolliDomain());

			const response = await request(app).get("/sites/1/auth/jwt?returnUrl=/getting-started");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/login");
			expect(mockSession.pendingSiteAuth).toEqual({
				siteId: "1",
				returnUrl: "/getting-started",
			});
		});

		it("should use default returnUrl when not provided", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(createSiteWithJolliDomain());

			const response = await request(app).get("/sites/1/auth/jwt");

			expect(response.status).toBe(302);
			expect(mockSession.pendingSiteAuth).toEqual({
				siteId: "1",
				returnUrl: "/",
			});
		});

		it("should sanitize protocol-relative returnUrl to prevent open redirect", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(createSiteWithJolliDomain());

			const response = await request(app).get("/sites/1/auth/jwt?returnUrl=//evil.com");

			expect(response.status).toBe(302);
			expect(mockSession.pendingSiteAuth).toEqual({
				siteId: "1",
				returnUrl: "/",
			});
		});

		it("should sanitize absolute URL returnUrl to prevent open redirect", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(createSiteWithJolliDomain());

			const response = await request(app).get("/sites/1/auth/jwt?returnUrl=https://evil.com");

			expect(response.status).toBe(302);
			expect(mockSession.pendingSiteAuth).toEqual({
				siteId: "1",
				returnUrl: "/",
			});
		});

		it("should sanitize javascript: URL returnUrl to prevent XSS", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(createSiteWithJolliDomain());

			const response = await request(app).get("/sites/1/auth/jwt?returnUrl=javascript:alert(1)");

			expect(response.status).toBe(302);
			expect(mockSession.pendingSiteAuth).toEqual({
				siteId: "1",
				returnUrl: "/",
			});
		});

		it("should redirect to doc site with JWT using jolli.site domain", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(createSiteWithJolliDomain());

			const response = await request(app).get("/sites/1/auth/jwt?returnUrl=/docs");

			expect(response.status).toBe(302);
			expect(response.headers.location).toContain("https://docs-acme.jolli.site/auth/callback#jwt=");
			expect(response.headers.location).toContain("returnUrl=%2Fdocs");
		});

		it("should prefer verified custom domain over jolli.site domain", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			vi.mocked(mockSiteDao.getSite).mockResolvedValue({
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					jolliSiteDomain: "docs-acme.jolli.site",
					customDomains: [
						{
							domain: "docs.example.com",
							status: "verified" as const,
							addedAt: "2024-01-15T10:00:00Z",
							verifiedAt: "2024-01-15T10:30:00Z",
						},
					],
				} as typeof mockDocsite.metadata,
			});

			const response = await request(app).get("/sites/1/auth/jwt?returnUrl=/docs");

			expect(response.status).toBe(302);
			expect(response.headers.location).toContain("https://docs.example.com/auth/callback#jwt=");
			expect(response.headers.location).toContain("returnUrl=%2Fdocs");
		});

		it("should skip unverified custom domains and use jolli.site domain", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			vi.mocked(mockSiteDao.getSite).mockResolvedValue({
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					jolliSiteDomain: "docs-acme.jolli.site",
					customDomains: [
						{
							domain: "docs.example.com",
							status: "pending" as const,
							addedAt: "2024-01-15T10:00:00Z",
						},
					],
				} as typeof mockDocsite.metadata,
			});

			const response = await request(app).get("/sites/1/auth/jwt?returnUrl=/docs");

			expect(response.status).toBe(302);
			expect(response.headers.location).toContain("https://docs-acme.jolli.site/auth/callback#jwt=");
		});

		it("should redirect to site auth callback with error when user email is not authorized", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(createSiteWithCustomDomain());
			mockIsEmailAuthorized.mockReturnValue(false);

			const response = await request(app).get("/sites/1/auth/jwt?returnUrl=/docs");

			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("https://docs.example.com/auth/callback#error=unauthorized");
			expect(mockIsEmailAuthorized).toHaveBeenCalledWith("test@example.com");
		});

		it("should return 403 JSON when user email is not authorized and site has no domain", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			vi.mocked(mockSiteDao.getSite).mockResolvedValue({
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					jolliSiteDomain: undefined,
					customDomains: undefined,
				} as unknown as SiteMetadata,
			});
			mockIsEmailAuthorized.mockReturnValue(false);

			const response = await request(app).get("/sites/1/auth/jwt?returnUrl=/docs");

			expect(response.status).toBe(403);
			expect(response.body).toEqual({ error: "Not authorized for this tenant" });
		});

		it("should return 400 when authenticated user requests site with no domain configured", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			vi.mocked(mockSiteDao.getSite).mockResolvedValue({
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					jolliSiteDomain: undefined,
					customDomains: undefined,
				} as unknown as SiteMetadata,
			});

			const response = await request(app).get("/sites/1/auth/jwt");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Site has no domain configured" });
		});

		it("should return 400 when site has no JWT auth keys configured", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			vi.mocked(mockSiteDao.getSite).mockResolvedValue({
				...mockDocsite,
				metadata: {
					...mockDocsite.metadata,
					jolliSiteDomain: "docs-acme.jolli.site",
					jwtAuth: {
						enabled: true,
						mode: "full" as const,
						loginUrl: "https://jolli.ai/api/sites/1/auth/jwt",
						publicKey: testPublicKey,
						// privateKey is missing
					},
				} as unknown as SiteMetadata,
			});

			const response = await request(app).get("/sites/1/auth/jwt");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Site auth keys not configured" });
		});

		it("should return 400 when site has undefined metadata", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(mockUserInfo);
			vi.mocked(mockSiteDao.getSite).mockResolvedValue({
				...mockDocsite,
				metadata: undefined,
			});

			const response = await request(app).get("/sites/1/auth/jwt");

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Site has no domain configured" });
		});

		it("should still redirect when session save has an error", async () => {
			vi.mocked(mockTokenUtil.decodePayload).mockReturnValue(undefined);
			vi.mocked(mockSiteDao.getSite).mockResolvedValue(createSiteWithJolliDomain());

			// Create mock session with save that returns an error
			const mockSessionWithError = {
				save: (cb: (err?: Error) => void) => cb(new Error("Session save failed")),
			} as unknown as NonNullable<Request["session"]>;

			// Re-mount the router with the error-producing session
			const appWithSessionError = express();
			appWithSessionError.use(express.json());
			appWithSessionError.use((req: Request, _res: Response, next: NextFunction) => {
				req.session = mockSessionWithError;
				next();
			});
			appWithSessionError.use("/sites", createSiteAuthRouter(mockDaoProvider(mockSiteDao), mockTokenUtil));

			const response = await request(appWithSessionError).get("/sites/1/auth/jwt?returnUrl=/getting-started");

			// Should still redirect despite save error (error is just logged)
			expect(response.status).toBe(302);
			expect(response.headers.location).toBe("/login");
		});

		it("should return 500 on database error", async () => {
			vi.mocked(mockSiteDao.getSite).mockRejectedValue(new Error("Database error"));

			const response = await request(app).get("/sites/1/auth/jwt");

			expect(response.status).toBe(500);
			expect(response.body).toEqual({ error: "Failed to process site auth login" });
		});
	});
});
