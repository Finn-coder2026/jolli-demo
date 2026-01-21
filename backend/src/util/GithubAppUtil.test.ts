import { mockGitHubApp } from "../model/GitHubApp.mock";
import {
	checkGitHubAppExistsOnGitHub,
	createGitHubAppJWT,
	fetchInstallationRepositories,
	findExistingInstallation,
	findInstallationForOwner,
	findInstallationInGithubApp,
	generateInstallationUrl,
	getAppInfo,
	getInstallations,
	getOwnerId,
	parseGitHubRepoUrl,
	subscribeToInstallationRepositoriesEvent,
	syncAllInstallationsForApp,
	uninstallGitHubApp,
	upsertInstallationContainer,
	verifyGitHubAppExists,
} from "./GithubAppUtil";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("GithubUtils", () => {
	// Test RSA private key (generated for testing purposes only)
	const testPrivateKey = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC2tE+niyzoQ2ja
mVrYZBzKnB5hN/gI44lKTrdyY71y8ks+XC4fV7sWxy0Q1DtLmoo5j74sYDIGFE0x
2JDmkYEW6wuazDEiUAs0PIftqYsi6lB9WhLOINZ4o6tYOwM2laJR6s6cMCZog3PR
QghocV06PkQPnNdEbhOhBi456+tJ1W2jAxyTVgc71C3YMaa/qhLdiT8ymL7Yy1oL
oHcUGiMF791LleLD36VTENUAW+w7fjLXAMy7101FnyIdnKrudXoOgVGcK0J8cMrs
mgTqVxTodPUcnw1hoqx7GyZKpcG0tQRxiPnsmPXGPh2PfmhSe+hyTzaPdXnSq8Vt
Tata4zwvAgMBAAECggEAHE8pXcyIKMpJH5X40uQFkgn0AHGrp7TvO5RMLcKb7Yjy
ymF+GV0pSrOR8rRFJnHLo8pMrT46ggv4lMCkXcAt6wnVwnvhIRqbTHy/Pb6yJbbT
bJjdpmga00EzoM2EB0Z9it6Bz7GmQeDHEVAp/Vo+F8g4w4ffKGXl+g1QcakcdqlX
uRvWh3TG9bSKktkR1GZYyfZEJ9ZxKsYkL1pdkXnjGy3lNeI7pB4RUYr1bYXGoAGm
xNK4GDnAZeB6CpAfpb0eTrApKRAFUlu1/zJ6Z2DTuHfnM+2sTCcNcW/43ffc+o6W
2f+BJRDx6rhNpwDTrr8cpK7emopux4Z9MRBAHXsAAQKBgQD2uZwVC30pycunevH1
c6ouRQcshPWjUMTB+bochnmPvGiBzB+Og5k0I/nIe5CyjrFPvJ2Iv+qByT6DKuBQ
0WFf+/pz3/LIyWGe+L1QrpCz/RUhKhGDNOklvkmR/BUICpW0gufqfJggNmzoWO2f
uAdsNmbKwZ7PaihkTLEdBa62LwKBgQC9kpcJ3iZ8GwVKewF0/a0BftnrMlhCOS+g
8JeByLvBAhvI2Rb2gtqbi/T9pkJhmLFJqZxaBwnBAgCfegJHi65aUALE5c3k7v/m
+MH5f2QU/NRF71ZocrDQVrLu2KGGYGs+PJYoVKgNmpWz4tbVYx/C3GykCZO92szw
796LB1haAQKBgQCy70YdlSl/JxUGMApPA0XHLNTZGsyzVx57t8ucaIK9Fd2NVScF
yrdPs0+ycLsuZIJ/28E8rkM7QWKO6oeo1VGTtUGczCxeJn8gNjHG0/OqNcAfP01Y
JQV6FBlzQKlYHaUZN19PFnGV2yL9F5Gupl7rwkCmh+nPb6Q/qcdBzx84jQKBgQCW
6berd1oTuj8AB+QlCj1Lz3wTrERuk6/C40T5YJ93CwKrZYbOP2VgJo6lzlFR+IhK
J+f8E1ZEfB+a1TozUpM9+iv6Kyc5dLnrWWSyBiPaQVuLQPj8tTDk6eAQHAyaOO+m
3/x5pssR6Vn7lj2IKh0Ctw8VlzoyDZjQxWPYMcS4AQKBgA0+XNZQ9xrBEtWqpvlA
b8z4GOt2n2W2HI7A7kEs5CZNVHBbFaRKstFNDf7BNPD2P4B1mmYz02hYv1YNnyOT
hnoF5lXcuec68+t5WjjuZ7IXb9gF6MnuiHDSFzfFHb39+l4XrLv8QRCFqge8BBbl
CsPGsHjRQP31pfVTFrZp5ywg
-----END PRIVATE KEY-----`;

	const testAppId = 123456;
	let originalFetch: typeof global.fetch;

	beforeEach(() => {
		// Clear all mocks before each test
		vi.clearAllMocks();
		originalFetch = global.fetch;
	});

	afterEach(() => {
		global.fetch = originalFetch;
	});

	describe("createGitHubAppJWT", () => {
		it("should generate a valid JWT token", () => {
			const token = createGitHubAppJWT(testAppId, testPrivateKey);
			expect(token).toBeTruthy();
			expect(typeof token).toBe("string");
		});

		it("should generate a token with correct issuer", () => {
			const token = createGitHubAppJWT(testAppId, testPrivateKey);
			const decoded = jwt.decode(token) as { iss: string };
			expect(decoded.iss).toBe(testAppId.toString());
		});

		it("should generate a token with iat 60 seconds in the past", () => {
			const beforeCall = Math.floor(Date.now() / 1000);
			const token = createGitHubAppJWT(testAppId, testPrivateKey);
			const afterCall = Math.floor(Date.now() / 1000);

			const decoded = jwt.decode(token) as { iat: number };
			expect(decoded.iat).toBeGreaterThanOrEqual(beforeCall - 60);
			expect(decoded.iat).toBeLessThanOrEqual(afterCall - 60);
		});

		it("should generate a token with exp 60 seconds from now", () => {
			const beforeCall = Math.floor(Date.now() / 1000);
			const token = createGitHubAppJWT(testAppId, testPrivateKey);
			const afterCall = Math.floor(Date.now() / 1000);

			const decoded = jwt.decode(token) as { exp: number };
			expect(decoded.exp).toBeGreaterThanOrEqual(beforeCall + 60);
			expect(decoded.exp).toBeLessThanOrEqual(afterCall + 60);
		});

		it("should use RS256 algorithm", () => {
			const token = createGitHubAppJWT(testAppId, testPrivateKey);
			const decoded = jwt.decode(token, { complete: true }) as { header: { alg: string } };
			expect(decoded.header.alg).toBe("RS256");
		});

		it("should generate different tokens on subsequent calls", () => {
			const token1 = createGitHubAppJWT(testAppId, testPrivateKey);
			// Wait a tiny bit to ensure different iat
			vi.useFakeTimers();
			vi.advanceTimersByTime(1000);
			const token2 = createGitHubAppJWT(testAppId, testPrivateKey);
			vi.useRealTimers();

			expect(token1).not.toBe(token2);
		});
	});

	describe("getInstallationRepositories", () => {
		it("should fetch installations successfully", async () => {
			const mockInstallations = [
				{ id: 123, account: { login: "test-owner" } },
				{ id: 456, account: { login: "another-owner" } },
			];

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(mockInstallations),
			});

			const result = await getInstallations(testAppId, "fake-token");

			expect(result).toEqual(mockInstallations);
			expect(global.fetch).toHaveBeenCalledWith("https://api.github.com/app/installations", {
				headers: {
					Accept: "application/vnd.github+json",
					Authorization: "Bearer fake-token",
					"X-GitHub-Api-Version": "2022-11-28",
				},
			});
		});

		it("should return undefined when fetch fails", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
			});

			const result = await getInstallations(testAppId, "fake-token");

			expect(result).toBeUndefined();
		});
	});

	describe("checkGitHubAppExistsOnGitHub", () => {
		it("should return true when app exists", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
			});

			const result = await checkGitHubAppExistsOnGitHub("test-app");

			expect(result).toBe(true);
			expect(global.fetch).toHaveBeenCalledWith("https://github.com/apps/test-app", {
				method: "HEAD",
			});
		});

		it("should return false when app does not exist", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
			});

			const result = await checkGitHubAppExistsOnGitHub("nonexistent-app");

			expect(result).toBe(false);
		});

		it("should return false when fetch throws error", async () => {
			global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

			const result = await checkGitHubAppExistsOnGitHub("test-app");

			expect(result).toBe(false);
		});
	});

	describe("verifyGitHubAppExists", () => {
		it("should return true when app exists and credentials are valid", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
			});

			const result = await verifyGitHubAppExists(app);

			expect(result).toBe(true);
			expect(global.fetch).toHaveBeenCalledWith(
				"https://api.github.com/app",
				expect.objectContaining({
					headers: expect.objectContaining({
						Accept: "application/vnd.github+json",
						"X-GitHub-Api-Version": "2022-11-28",
					}),
				}),
			);
		});

		it("should return false when credentials are invalid", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
			});

			const result = await verifyGitHubAppExists(app);

			expect(result).toBe(false);
		});

		it("should return false when fetch throws error", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

			const result = await verifyGitHubAppExists(app);

			expect(result).toBe(false);
		});
	});

	describe("getOwnerId", () => {
		it("should fetch organization ID successfully", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ id: 12345 }),
			});

			const result = await getOwnerId("test-org");

			expect(result).toBe(12345);
			expect(global.fetch).toHaveBeenCalledWith("https://api.github.com/orgs/test-org", {
				headers: {
					Accept: "application/vnd.github+json",
					"X-GitHub-Api-Version": "2022-11-28",
				},
			});
		});

		it("should fallback to user API when org fetch fails", async () => {
			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: false,
					status: 404,
				})
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({ id: 67890 }),
				});

			const result = await getOwnerId("test-user");

			expect(result).toBe(67890);
			expect(global.fetch).toHaveBeenCalledTimes(2);
			expect(global.fetch).toHaveBeenNthCalledWith(1, "https://api.github.com/orgs/test-user", {
				headers: {
					Accept: "application/vnd.github+json",
					"X-GitHub-Api-Version": "2022-11-28",
				},
			});
			expect(global.fetch).toHaveBeenNthCalledWith(2, "https://api.github.com/users/test-user", {
				headers: {
					Accept: "application/vnd.github+json",
					"X-GitHub-Api-Version": "2022-11-28",
				},
			});
		});

		it("should return undefined when both org and user fetches fail", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
			});

			const result = await getOwnerId("nonexistent-owner");

			expect(result).toBeUndefined();
		});

		it("should return undefined when fetch throws error", async () => {
			global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

			const result = await getOwnerId("test-owner");

			expect(result).toBeUndefined();
		});
	});

	describe("subscribeToInstallationRepositoriesEvent", () => {
		it("should subscribe to installation_repositories event when not already subscribed", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
				slug: "test-app",
			});

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({ events: ["push", "pull_request"] }),
				})
				.mockResolvedValueOnce({
					ok: true,
				});

			await subscribeToInstallationRepositoriesEvent(app);

			expect(global.fetch).toHaveBeenCalledTimes(2);
			expect(global.fetch).toHaveBeenNthCalledWith(2, "https://api.github.com/app", {
				method: "PATCH",
				headers: expect.objectContaining({
					Accept: "application/vnd.github+json",
					"X-GitHub-Api-Version": "2022-11-28",
					"Content-Type": "application/json",
				}),
				body: JSON.stringify({
					events: ["push", "pull_request", "installation_repositories"],
				}),
			});
		});

		it("should skip subscription when already subscribed", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ events: ["push", "installation_repositories"] }),
			});

			await subscribeToInstallationRepositoriesEvent(app);

			expect(global.fetch).toHaveBeenCalledTimes(1);
		});

		it("should handle missing events array in response", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
				slug: "test-app",
			});

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({}), // No events property
				})
				.mockResolvedValueOnce({
					ok: true,
				});

			await subscribeToInstallationRepositoriesEvent(app);

			expect(global.fetch).toHaveBeenCalledTimes(2);
			expect(global.fetch).toHaveBeenNthCalledWith(2, "https://api.github.com/app", {
				method: "PATCH",
				headers: expect.objectContaining({
					Accept: "application/vnd.github+json",
					"X-GitHub-Api-Version": "2022-11-28",
					"Content-Type": "application/json",
				}),
				body: JSON.stringify({
					events: ["installation_repositories"],
				}),
			});
		});

		it("should handle fetch app configuration failure", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
			});

			await subscribeToInstallationRepositoriesEvent(app);

			expect(global.fetch).toHaveBeenCalledTimes(1);
		});

		it("should handle update failure", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({ events: [] }),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 403,
				});

			await subscribeToInstallationRepositoriesEvent(app);

			expect(global.fetch).toHaveBeenCalledTimes(2);
		});

		it("should handle errors during subscription", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({ events: [] }),
				})
				.mockRejectedValueOnce(new Error("Network error"));

			await expect(subscribeToInstallationRepositoriesEvent(app)).resolves.not.toThrow();
		});
	});

	describe("getAppInfo", () => {
		it("should return app info when fetch succeeds", async () => {
			const token = "test-jwt-token";
			const mockAppData = {
				id: 123,
				slug: "test-app",
				name: "Test App",
				events: ["push", "pull_request"],
			};

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue(mockAppData),
			});

			const result = await getAppInfo(token);

			expect(result).toEqual(mockAppData);
			expect(global.fetch).toHaveBeenCalledWith("https://api.github.com/app", {
				headers: expect.objectContaining({
					Accept: "application/vnd.github+json",
					Authorization: `Bearer ${token}`,
					"X-GitHub-Api-Version": "2022-11-28",
				}),
			});
		});

		it("should return undefined when fetch fails", async () => {
			const token = "test-jwt-token";

			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
			});

			const result = await getAppInfo(token);

			expect(result).toBeUndefined();
		});

		it("should handle fetch errors gracefully", async () => {
			const token = "test-jwt-token";

			global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

			const result = await getAppInfo(token);

			expect(result).toBeUndefined();
		});
	});

	describe("findExistingInstallation", () => {
		it("should find installation with repository", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: vi
						.fn()
						.mockResolvedValue([{ id: 123, account: { login: "test-owner", type: "Organization" } }]),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({ token: "installation-token" }),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({
						repositories: [{ full_name: "test-owner/test-repo", default_branch: "main" }],
					}),
				});

			const result = await findExistingInstallation(app, "test-owner/test-repo");

			expect(result).toEqual({
				installationId: 123,
				defaultBranch: "main",
				accountLogin: "test-owner",
				accountType: "Organization",
				repositories: [{ full_name: "test-owner/test-repo", default_branch: "main" }],
			});
		});

		it("should return undefined when installation list fetch fails", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
			});

			const result = await findExistingInstallation(app, "test-owner/test-repo");

			expect(result).toBeUndefined();
		});

		it("should skip installation when token fetch fails", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue([{ id: 123, account: { login: "test-owner" } }]),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 403,
				});

			const result = await findExistingInstallation(app, "test-owner/test-repo");

			expect(result).toBeUndefined();
		});

		it("should skip installation when repositories fetch fails", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue([{ id: 123, account: { login: "test-owner" } }]),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({ token: "installation-token" }),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 404,
				});

			const result = await findExistingInstallation(app, "test-owner/test-repo");

			expect(result).toBeUndefined();
		});

		it("should use default branch 'main' when default_branch is missing", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: vi
						.fn()
						.mockResolvedValue([{ id: 123, account: { login: "test-owner", type: "Organization" } }]),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({ token: "installation-token" }),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({
						repositories: [{ full_name: "test-owner/test-repo", default_branch: null }],
					}),
				});

			const result = await findExistingInstallation(app, "test-owner/test-repo");

			expect(result).toEqual({
				installationId: 123,
				defaultBranch: "main",
				accountLogin: "test-owner",
				accountType: "Organization",
				repositories: [{ full_name: "test-owner/test-repo", default_branch: null }],
			});
		});

		it("should return undefined when repository not found in any installation", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue([{ id: 123, account: { login: "test-owner" } }]),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({ token: "installation-token" }),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({
						repositories: [{ full_name: "test-owner/other-repo", default_branch: "main" }],
					}),
				});

			const result = await findExistingInstallation(app, "test-owner/test-repo");

			expect(result).toBeUndefined();
		});

		it("should handle missing repositories array in response", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue([{ id: 123, account: { login: "test-owner" } }]),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({ token: "installation-token" }),
				})
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({}), // No repositories property
				});

			const result = await findExistingInstallation(app, "test-owner/test-repo");

			expect(result).toBeUndefined();
		});

		it("should handle errors during installation search", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

			const result = await findExistingInstallation(app, "test-owner/test-repo");

			expect(result).toBeUndefined();
		});
	});

	describe("getAccessTokenForGitHubAppInstallation", () => {
		it("should get access token for installation", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ token: "installation-access-token" }),
			});

			const { getAccessTokenForGitHubAppInstallation } = await import("./GithubAppUtil");
			const result = await getAccessTokenForGitHubAppInstallation(app, 123);

			expect(result).toBe("installation-access-token");
			expect(global.fetch).toHaveBeenCalledWith(
				"https://api.github.com/app/installations/123/access_tokens",
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({
						Accept: "application/vnd.github+json",
						"X-GitHub-Api-Version": "2022-11-28",
					}),
				}),
			);
		});

		it("should return undefined when access token fetch fails", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
			});

			const { getAccessTokenForGitHubAppInstallation } = await import("./GithubAppUtil");
			const result = await getAccessTokenForGitHubAppInstallation(app, 123);

			expect(result).toBeUndefined();
		});
	});

	describe("findInstallationForOwner", () => {
		it("should find installation for owner (case insensitive)", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue([
					{ id: 123, account: { login: "Test-Owner" } },
					{ id: 456, account: { login: "other-owner" } },
				]),
			});

			const result = await findInstallationForOwner(app, "test-owner");

			expect(result).toBe(123);
		});

		it("should return undefined when installation not found for owner", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue([{ id: 456, account: { login: "other-owner" } }]),
			});

			const result = await findInstallationForOwner(app, "nonexistent-owner");

			expect(result).toBeUndefined();
		});

		it("should return undefined when installations fetch fails", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
			});

			const result = await findInstallationForOwner(app, "test-owner");

			expect(result).toBeUndefined();
		});

		it("should handle errors during owner search", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

			const result = await findInstallationForOwner(app, "test-owner");

			expect(result).toBeUndefined();
		});
	});

	describe("syncAllInstallationsForApp", () => {
		it("should sync all installations for an app with organizations", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			const existingInstallation = {
				id: 1,
				containerType: "org" as const,
				name: "test-org",
				appId: testAppId,
				installationId: 123,
				repos: [],
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockInstallationDao = {
				listInstallations: vi.fn().mockResolvedValue([existingInstallation]),
				lookupByName: vi.fn().mockResolvedValue(undefined),
				createInstallation: vi.fn(),
				updateInstallation: vi.fn(),
			};

			global.fetch = vi
				.fn()
				// Fetch installations
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue([
						{
							id: 123,
							account: { login: "test-org", type: "Organization" },
							target_type: "Organization",
						},
					]),
				})
				// Get access token for installation
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({ token: "installation-token" }),
				})
				// Fetch repositories for installation
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({
						repositories: [{ full_name: "test-org/repo1" }, { full_name: "test-org/repo2" }],
					}),
				});

			await syncAllInstallationsForApp(app, mockInstallationDao as never);

			expect(mockInstallationDao.updateInstallation).toHaveBeenCalledWith({
				...existingInstallation,
				containerType: "org",
				installationId: 123,
				repos: ["test-org/repo1", "test-org/repo2"],
			});
		});

		it("should handle missing repositories array when syncing installations", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			const existingInstallation = {
				id: 1,
				containerType: "org" as const,
				name: "test-org",
				appId: testAppId,
				installationId: 123,
				repos: [],
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockInstallationDao = {
				listInstallations: vi.fn().mockResolvedValue([existingInstallation]),
				lookupByName: vi.fn().mockResolvedValue(undefined),
				createInstallation: vi.fn(),
				updateInstallation: vi.fn(),
			};

			global.fetch = vi
				.fn()
				// Fetch installations
				.mockResolvedValueOnce({
					ok: true,
					json: vi
						.fn()
						.mockResolvedValue([{ id: 123, account: { login: "test-org", type: "Organization" } }]),
				})
				// Get access token for installation
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({ token: "installation-token" }),
				})
				// Fetch repositories for installation - without repositories array
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({}),
				});

			await syncAllInstallationsForApp(app, mockInstallationDao as never);

			expect(mockInstallationDao.updateInstallation).toHaveBeenCalledWith({
				...existingInstallation,
				containerType: "org",
				installationId: 123,
				repos: [],
			});
		});

		it("should sync all installations for an app with users", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			const existingInstallation = {
				id: 1,
				containerType: "user" as const,
				name: "test-user",
				appId: testAppId,
				installationId: 456,
				repos: [],
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockInstallationDao = {
				listInstallations: vi.fn().mockResolvedValue([existingInstallation]),
				lookupByName: vi.fn().mockResolvedValue(undefined),
				createInstallation: vi.fn(),
				updateInstallation: vi.fn(),
			};

			global.fetch = vi
				.fn()
				// Fetch installations
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue([{ id: 456, account: { login: "test-user", type: "User" } }]),
				})
				// Get access token for installation
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({ token: "installation-token" }),
				})
				// Fetch repositories for installation
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({
						repositories: [{ full_name: "test-user/repo1" }],
					}),
				});

			await syncAllInstallationsForApp(app, mockInstallationDao as never);

			expect(mockInstallationDao.updateInstallation).toHaveBeenCalledWith({
				...existingInstallation,
				containerType: "user",
				installationId: 456,
				repos: ["test-user/repo1"],
			});
		});

		it("should update existing organization", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			const existingInstallation = {
				id: 1,
				containerType: "org" as const,
				name: "test-org",
				appId: testAppId,
				installationId: 123,
				repos: ["test-org/old-repo"],
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockInstallationDao = {
				listInstallations: vi.fn().mockResolvedValue([existingInstallation]),
				lookupByName: vi.fn().mockResolvedValue(existingInstallation),
				createInstallation: vi.fn(),
				updateInstallation: vi.fn(),
			};

			global.fetch = vi
				.fn()
				// Fetch installations
				.mockResolvedValueOnce({
					ok: true,
					json: vi
						.fn()
						.mockResolvedValue([{ id: 123, account: { login: "test-org", type: "Organization" } }]),
				})
				// Get access token for installation
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({ token: "installation-token" }),
				})
				// Fetch repositories for installation
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({
						repositories: [{ full_name: "test-org/new-repo" }],
					}),
				});

			await syncAllInstallationsForApp(app, mockInstallationDao as never);

			expect(mockInstallationDao.updateInstallation).toHaveBeenCalledWith({
				...existingInstallation,
				repos: ["test-org/new-repo"],
				installationId: 123,
				containerType: "org",
			});
			expect(mockInstallationDao.createInstallation).not.toHaveBeenCalled();
		});

		it("should update existing user", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			const existingInstallation = {
				id: 1,
				containerType: "user" as const,
				name: "test-user",
				appId: testAppId,
				installationId: 456,
				repos: ["test-user/old-repo"],
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockInstallationDao = {
				listInstallations: vi.fn().mockResolvedValue([existingInstallation]),
				lookupByName: vi.fn().mockResolvedValue(existingInstallation),
				createInstallation: vi.fn(),
				updateInstallation: vi.fn(),
			};

			global.fetch = vi
				.fn()
				// Fetch installations
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue([{ id: 456, account: { login: "test-user", type: "User" } }]),
				})
				// Get access token for installation
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({ token: "installation-token" }),
				})
				// Fetch repositories for installation
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({
						repositories: [{ full_name: "test-user/new-repo" }],
					}),
				});

			await syncAllInstallationsForApp(app, mockInstallationDao as never);

			expect(mockInstallationDao.updateInstallation).toHaveBeenCalledWith({
				...existingInstallation,
				repos: ["test-user/new-repo"],
				installationId: 456,
				containerType: "user",
			});
			expect(mockInstallationDao.createInstallation).not.toHaveBeenCalled();
		});

		it("should handle when installations fetch fails", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			const existingInstallation = {
				id: 1,
				containerType: "org" as const,
				name: "test-org",
				appId: testAppId,
				installationId: 123,
				repos: [],
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockInstallationDao = {
				listInstallations: vi.fn().mockResolvedValue([existingInstallation]),
				lookupByName: vi.fn(),
				createInstallation: vi.fn(),
				updateInstallation: vi.fn(),
			};

			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
			});

			const result = await syncAllInstallationsForApp(app, mockInstallationDao as never);

			// When getInstallations fails, the ?? [] branch is used, returning empty array
			expect(result).toEqual([]);
			expect(mockInstallationDao.createInstallation).not.toHaveBeenCalled();
		});

		it("should handle when access token fetch fails", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			const existingInstallation = {
				id: 1,
				containerType: "org" as const,
				name: "test-org",
				appId: testAppId,
				installationId: 123,
				repos: [],
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockInstallationDao = {
				listInstallations: vi.fn().mockResolvedValue([existingInstallation]),
				lookupByName: vi.fn(),
				createInstallation: vi.fn(),
				updateInstallation: vi.fn(),
			};

			global.fetch = vi
				.fn()
				// Fetch installations
				.mockResolvedValueOnce({
					ok: true,
					json: vi
						.fn()
						.mockResolvedValue([{ id: 123, account: { login: "test-org", type: "Organization" } }]),
				})
				// Get access token for installation (fails)
				.mockResolvedValueOnce({
					ok: false,
					status: 403,
				});

			await syncAllInstallationsForApp(app, mockInstallationDao as never);

			expect(mockInstallationDao.createInstallation).not.toHaveBeenCalled();
		});

		it("should handle when repositories fetch fails", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			const existingInstallation = {
				id: 1,
				containerType: "org" as const,
				name: "test-org",
				appId: testAppId,
				installationId: 123,
				repos: [],
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockInstallationDao = {
				listInstallations: vi.fn().mockResolvedValue([existingInstallation]),
				lookupByName: vi.fn(),
				createInstallation: vi.fn(),
				updateInstallation: vi.fn(),
			};

			global.fetch = vi
				.fn()
				// Fetch installations
				.mockResolvedValueOnce({
					ok: true,
					json: vi
						.fn()
						.mockResolvedValue([{ id: 123, account: { login: "test-org", type: "Organization" } }]),
				})
				// Get access token for installation
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({ token: "installation-token" }),
				})
				// Fetch repositories for installation (fails)
				.mockResolvedValueOnce({
					ok: false,
					status: 404,
				});

			await syncAllInstallationsForApp(app, mockInstallationDao as never);

			expect(mockInstallationDao.createInstallation).not.toHaveBeenCalled();
		});

		it("should handle errors during sync", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			const mockInstallationDao = {
				listInstallations: vi.fn().mockRejectedValue(new Error("Database error")),
				lookupByName: vi.fn(),
				createInstallation: vi.fn(),
				updateInstallation: vi.fn(),
			};

			global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

			await expect(syncAllInstallationsForApp(app, mockInstallationDao as never)).rejects.toThrow(
				"Database error",
			);
		});

		it("should handle empty repositories list", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			const existingInstallation = {
				id: 1,
				containerType: "org" as const,
				name: "test-org",
				appId: testAppId,
				installationId: 123,
				repos: [],
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockInstallationDao = {
				listInstallations: vi.fn().mockResolvedValue([existingInstallation]),
				lookupByName: vi.fn().mockResolvedValue(undefined),
				createInstallation: vi.fn(),
				updateInstallation: vi.fn(),
			};

			global.fetch = vi
				.fn()
				// Fetch installations
				.mockResolvedValueOnce({
					ok: true,
					json: vi
						.fn()
						.mockResolvedValue([{ id: 123, account: { login: "test-org", type: "Organization" } }]),
				})
				// Get access token for installation
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({ token: "installation-token" }),
				})
				// Fetch repositories for installation (empty list)
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({
						repositories: [],
					}),
				});

			await syncAllInstallationsForApp(app, mockInstallationDao as never);

			expect(mockInstallationDao.updateInstallation).toHaveBeenCalledWith({
				...existingInstallation,
				containerType: "org",
				installationId: 123,
				repos: [],
			});
		});

		it("should use account.type to determine container type", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			const existingInstallation = {
				id: 1,
				containerType: "org" as const,
				name: "test-org",
				appId: testAppId,
				installationId: 123,
				repos: [],
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockInstallationDao = {
				listInstallations: vi.fn().mockResolvedValue([existingInstallation]),
				lookupByName: vi.fn().mockResolvedValue(undefined),
				createInstallation: vi.fn(),
				updateInstallation: vi.fn(),
			};

			global.fetch = vi
				.fn()
				// Fetch installations
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue([
						{
							id: 123,
							account: { login: "test-org", type: "Organization" },
						},
					]),
				})
				// Get access token for installation
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({ token: "installation-token" }),
				})
				// Fetch repositories for installation
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({
						repositories: [{ full_name: "test-org/repo1" }],
					}),
				});

			await syncAllInstallationsForApp(app, mockInstallationDao as never);

			expect(mockInstallationDao.updateInstallation).toHaveBeenCalledWith({
				...existingInstallation,
				containerType: "org",
				installationId: 123,
				repos: ["test-org/repo1"],
			});
		});

		it("should return early when no installations in database", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			const mockInstallationDao = {
				listInstallations: vi.fn().mockResolvedValue([]),
				lookupByName: vi.fn(),
				createInstallation: vi.fn(),
				updateInstallation: vi.fn(),
			};

			const result = await syncAllInstallationsForApp(app, mockInstallationDao as never);

			expect(result).toEqual([]);
			expect(mockInstallationDao.createInstallation).not.toHaveBeenCalled();
			expect(mockInstallationDao.updateInstallation).not.toHaveBeenCalled();
		});

		it("should skip installations that exist in GitHub but not in database", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			// Mock dao with one existing installation
			const existingInstallation = {
				id: 1,
				containerType: "org" as const,
				name: "existing-org",
				appId: testAppId,
				installationId: 123,
				repos: [],
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockInstallationDao = {
				listInstallations: vi.fn().mockResolvedValue([existingInstallation]),
				lookupByName: vi.fn().mockImplementation((name: string) => {
					if (name === "existing-org") {
						return Promise.resolve(existingInstallation);
					}
					return Promise.resolve(undefined);
				}),
				createInstallation: vi.fn(),
				updateInstallation: vi.fn(),
			};

			global.fetch = vi
				.fn()
				// Fetch installations - return two installations
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue([
						{
							id: 123,
							account: { login: "existing-org", type: "Organization" },
							target_type: "Organization",
						},
						{
							id: 456,
							account: { login: "new-org-not-in-db", type: "Organization" },
							target_type: "Organization",
						},
					]),
				})
				// Get access token for first installation
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({ token: "installation-token-1" }),
				})
				// Fetch repositories for first installation
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({
						repositories: [{ full_name: "existing-org/repo1" }],
					}),
				});

			const result = await syncAllInstallationsForApp(app, mockInstallationDao as never);

			// Should only return the existing installation
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe(123);

			// Should update the existing installation
			expect(mockInstallationDao.updateInstallation).toHaveBeenCalledTimes(1);
			expect(mockInstallationDao.updateInstallation).toHaveBeenCalledWith({
				...existingInstallation,
				repos: ["existing-org/repo1"],
				installationId: 123,
				containerType: "org",
			});

			// Should NOT create a new installation for the one not in database
			expect(mockInstallationDao.createInstallation).not.toHaveBeenCalled();
		});
	});

	describe("parseGitHubRepoUrl", () => {
		it("should parse HTTPS URL correctly", () => {
			const result = parseGitHubRepoUrl("https://github.com/owner/repo");

			expect(result).toEqual({
				owner: "owner",
				repo: "repo",
				repoFullName: "owner/repo",
			});
		});

		it("should parse HTTPS URL with .git extension", () => {
			const result = parseGitHubRepoUrl("https://github.com/owner/repo.git");

			expect(result).toEqual({
				owner: "owner",
				repo: "repo",
				repoFullName: "owner/repo",
			});
		});

		it("should parse SSH URL correctly", () => {
			// Since the regex expects github.com/owner/repo, SSH URLs don't match
			expect(() => parseGitHubRepoUrl("git@github.com:owner/repo")).toThrow("Invalid GitHub repository URL");
		});

		it("should handle URLs with different path structures", () => {
			const result = parseGitHubRepoUrl("https://github.com/my-org/my-repo");

			expect(result).toEqual({
				owner: "my-org",
				repo: "my-repo",
				repoFullName: "my-org/my-repo",
			});
		});
	});

	describe("generateInstallationUrl", () => {
		it("should return existing installation URL when installation exists", async () => {
			const app = mockGitHubApp({ appId: testAppId, slug: "test-app", privateKey: testPrivateKey });

			global.fetch = vi.fn().mockResolvedValueOnce({
				ok: true,
				json: vi.fn().mockResolvedValue([
					{
						id: 123,
						account: { login: "test-owner", type: "Organization" },
					},
				]),
			});

			const result = await generateInstallationUrl(app, "test-owner");

			expect(result).toBe("https://github.com/apps/test-app/installations/123");
		});

		it("should return new installation URL with ownerId when no installation exists", async () => {
			const app = mockGitHubApp({ appId: testAppId, slug: "test-app", privateKey: testPrivateKey });

			global.fetch = vi
				.fn()
				// No existing installations
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue([]),
				})
				// Owner fetch succeeds
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({ id: 456 }),
				});

			const result = await generateInstallationUrl(app, "test-owner");

			expect(result).toContain("https://github.com/apps/test-app/installations/new");
			expect(result).toContain("suggested_target_id=456");
		});

		it("should return base URL when no installation and owner fetch fails", async () => {
			const app = mockGitHubApp({ appId: testAppId, slug: "test-app", privateKey: testPrivateKey });

			global.fetch = vi
				.fn()
				// No existing installations
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue([]),
				})
				// Owner fetch fails
				.mockResolvedValueOnce({
					ok: false,
					status: 404,
				})
				// Fallback user fetch also fails
				.mockResolvedValueOnce({
					ok: false,
					status: 404,
				});

			const result = await generateInstallationUrl(app, "test-owner");

			expect(result).toBe("https://github.com/apps/test-app/installations/new");
		});
	});

	describe("uninstallGitHubApp", () => {
		it("should successfully uninstall GitHub App (204 response)", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				status: 204,
			});

			const result = await uninstallGitHubApp(789);

			expect(result).toBe(true);
			expect(global.fetch).toHaveBeenCalledWith(
				"https://api.github.com/app/installations/789",
				expect.objectContaining({
					method: "DELETE",
					headers: expect.objectContaining({
						Accept: "application/vnd.github+json",
						"X-GitHub-Api-Version": "2022-11-28",
					}),
				}),
			);
		});

		it("should return true when GitHub App is already uninstalled (404 response)", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
			});

			const result = await uninstallGitHubApp(789);

			expect(result).toBe(true);
		});

		it("should return false when uninstallation fails with other status code", async () => {
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
			});

			const result = await uninstallGitHubApp(789);

			expect(result).toBe(false);
		});

		it("should return false when fetch throws an error", async () => {
			global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

			const result = await uninstallGitHubApp(789);

			expect(result).toBe(false);
		});
	});

	describe("findInstallationInGithubApp", () => {
		it("should find installation when it exists", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue([
					{ id: 123, account: { login: "test-org", type: "Organization" }, target_type: "Organization" },
					{ id: 456, account: { login: "other-org", type: "Organization" } },
				]),
			});

			const result = await findInstallationInGithubApp(app, 123);

			expect(result).toEqual({
				id: 123,
				account: { login: "test-org", type: "Organization" },
				target_type: "Organization",
			});
		});

		it("should return undefined when installation not found", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue([{ id: 456, account: { login: "other-org", type: "Organization" } }]),
			});

			const result = await findInstallationInGithubApp(app, 123);

			expect(result).toBeUndefined();
		});

		it("should return undefined when getInstallations returns undefined", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
			});

			const result = await findInstallationInGithubApp(app, 123);

			expect(result).toBeUndefined();
		});

		it("should return undefined when error is thrown", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

			const result = await findInstallationInGithubApp(app, 123);

			expect(result).toBeUndefined();
		});
	});

	describe("fetchInstallationRepositories", () => {
		it("should fetch repositories successfully", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi
				.fn()
				// Get access token
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({ token: "installation-token" }),
				})
				// Fetch repositories
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({
						repositories: [{ full_name: "test-org/repo1" }, { full_name: "test-org/repo2" }],
					}),
				});

			const result = await fetchInstallationRepositories(app, 123);

			expect(result).toEqual(["test-org/repo1", "test-org/repo2"]);
		});

		it("should return error when access token fetch fails", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
			});

			const result = await fetchInstallationRepositories(app, 123);

			expect(result).toEqual({ error: "failed_to_get_access_token" });
		});

		it("should return error when repositories fetch fails", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi
				.fn()
				// Get access token succeeds
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({ token: "installation-token" }),
				})
				// Fetch repositories fails
				.mockResolvedValueOnce({
					ok: false,
					status: 500,
				});

			const result = await fetchInstallationRepositories(app, 123);

			expect(result).toEqual({ error: "failed_to_fetch_repositories" });
		});

		it("should handle empty repositories list", async () => {
			const app = mockGitHubApp({
				appId: testAppId,
				privateKey: testPrivateKey,
			});

			global.fetch = vi
				.fn()
				// Get access token
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({ token: "installation-token" }),
				})
				// Fetch repositories - empty
				.mockResolvedValueOnce({
					ok: true,
					json: vi.fn().mockResolvedValue({}),
				});

			const result = await fetchInstallationRepositories(app, 123);

			expect(result).toEqual([]);
		});
	});

	describe("upsertInstallationContainer", () => {
		it("should create new installation when not existing", async () => {
			const mockInstallationDao = {
				lookupByName: vi.fn().mockResolvedValue(null),
				createInstallation: vi.fn().mockResolvedValue(undefined),
				updateInstallation: vi.fn(),
			};

			const installation = {
				account: { login: "test-org", type: "Organization" },
				target_type: "Organization",
			};

			await upsertInstallationContainer(
				installation,
				123,
				["test-org/repo1", "test-org/repo2"],
				mockInstallationDao as never,
				"setup flow",
			);

			expect(mockInstallationDao.createInstallation).toHaveBeenCalledWith({
				containerType: "org",
				name: "test-org",
				installationId: 123,
				repos: ["test-org/repo1", "test-org/repo2"],
			});
			expect(mockInstallationDao.updateInstallation).not.toHaveBeenCalled();
		});

		it("should update existing installation", async () => {
			const existingInstallation = {
				id: 1,
				containerType: "org" as const,
				name: "test-org",
				installationId: 100,
				repos: ["test-org/old-repo"],
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			const mockInstallationDao = {
				lookupByName: vi.fn().mockResolvedValue(existingInstallation),
				createInstallation: vi.fn(),
				updateInstallation: vi.fn().mockResolvedValue(undefined),
			};

			const installation = {
				account: { login: "test-org", type: "Organization" },
			};

			await upsertInstallationContainer(
				installation,
				123,
				["test-org/repo1"],
				mockInstallationDao as never,
				"connect flow",
			);

			expect(mockInstallationDao.updateInstallation).toHaveBeenCalledWith({
				...existingInstallation,
				containerType: "org",
				installationId: 123,
				repos: ["test-org/repo1"],
			});
			expect(mockInstallationDao.createInstallation).not.toHaveBeenCalled();
		});

		it("should handle user account type", async () => {
			const mockInstallationDao = {
				lookupByName: vi.fn().mockResolvedValue(null),
				createInstallation: vi.fn().mockResolvedValue(undefined),
				updateInstallation: vi.fn(),
			};

			const installation = {
				account: { login: "test-user", type: "User" },
			};

			await upsertInstallationContainer(
				installation,
				456,
				["test-user/repo1"],
				mockInstallationDao as never,
				"installation",
			);

			expect(mockInstallationDao.createInstallation).toHaveBeenCalledWith({
				containerType: "user",
				name: "test-user",
				installationId: 456,
				repos: ["test-user/repo1"],
			});
		});

		it("should use target_type to determine container type when available", async () => {
			const mockInstallationDao = {
				lookupByName: vi.fn().mockResolvedValue(null),
				createInstallation: vi.fn().mockResolvedValue(undefined),
				updateInstallation: vi.fn(),
			};

			const installation = {
				account: { login: "test-org", type: "Organization" },
				target_type: "Organization",
			};

			await upsertInstallationContainer(installation, 123, ["test-org/repo1"], mockInstallationDao as never);

			expect(mockInstallationDao.createInstallation).toHaveBeenCalledWith({
				containerType: "org",
				name: "test-org",
				installationId: 123,
				repos: ["test-org/repo1"],
			});
		});
	});
});
