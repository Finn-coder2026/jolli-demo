import { resetConfig } from "../config/Config";
import { createGitHubAuthProvider } from "./GitHubAuthProvider";
import { describe, expect, it, vi } from "vitest";

describe("GitHubAuthProvider", () => {
	describe("createConfig", () => {
		it("should return config when env vars are set", () => {
			const originalId = process.env.GITHUB_CLIENT_ID;
			const originalSecret = process.env.GITHUB_CLIENT_SECRET;

			process.env.GITHUB_CLIENT_ID = "test-id";
			process.env.GITHUB_CLIENT_SECRET = "test-secret";
			resetConfig();

			const provider = createGitHubAuthProvider();
			const config = provider.createConfig();

			expect(config).toEqual({
				key: "test-id",
				secret: "test-secret",
				scope: ["user:email"],
			});

			process.env.GITHUB_CLIENT_ID = originalId;
			process.env.GITHUB_CLIENT_SECRET = originalSecret;
			resetConfig();
		});

		it("should return undefined when env vars are missing", () => {
			const originalId = process.env.GITHUB_CLIENT_ID;
			const originalSecret = process.env.GITHUB_CLIENT_SECRET;

			delete process.env.GITHUB_CLIENT_ID;
			delete process.env.GITHUB_CLIENT_SECRET;
			resetConfig();

			const provider = createGitHubAuthProvider();
			const config = provider.createConfig();

			expect(config).toBeUndefined();

			process.env.GITHUB_CLIENT_ID = originalId;
			process.env.GITHUB_CLIENT_SECRET = originalSecret;
			resetConfig();
		});
	});

	describe("getSelectedEmail", () => {
		it("should return undefined", () => {
			const provider = createGitHubAuthProvider();
			const userData = {
				id: 12345,
				email: "test@example.com",
			};

			const email = provider.getSelectedEmail(userData);

			expect(email).toBeUndefined();
		});
	});

	describe("getVerifiedEmails", () => {
		it("should fetch verified emails from GitHub API", async () => {
			const provider = createGitHubAuthProvider();

			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: () =>
					Promise.resolve([
						{ email: "primary@example.com", primary: true, verified: true },
						{ email: "secondary@example.com", primary: false, verified: true },
						{ email: "unverified@example.com", primary: false, verified: false },
					]),
			});

			const emails = await provider.getVerifiedEmails("test-token");

			expect(emails).toEqual(["primary@example.com", "secondary@example.com"]);
			expect(global.fetch).toHaveBeenCalledWith("https://api.github.com/user/emails", {
				headers: {
					Authorization: "Bearer test-token",
					"User-Agent": "Jolli",
				},
			});
		});

		it("should return empty array when fetch fails", async () => {
			const provider = createGitHubAuthProvider();

			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
			});

			const emails = await provider.getVerifiedEmails("test-token");

			expect(emails).toEqual([]);
		});
	});

	describe("createAuth", () => {
		it("should convert user data with all fields", () => {
			const provider = createGitHubAuthProvider();
			const userData = {
				id: 12345,
				login: "testuser",
				name: "Test User",
				avatar_url: "https://example.com/avatar.jpg",
			};

			const auth = provider.newAuth(userData, "test@example.com");

			expect(auth).toEqual({
				provider: "github",
				subject: "12345",
				email: "test@example.com",
				name: "Test User",
				picture: "https://example.com/avatar.jpg",
			});
		});

		it("should use node_id if id is missing", () => {
			const provider = createGitHubAuthProvider();
			const userData = {
				node_id: "node_67890",
				login: "testuser",
			};

			const auth = provider.newAuth(userData, "test@example.com");

			expect(auth.subject).toBe("node_67890");
		});

		it("should use login as name if name is missing", () => {
			const provider = createGitHubAuthProvider();
			const userData = {
				id: 12345,
				login: "testuser",
			};

			const auth = provider.newAuth(userData, "test@example.com");

			expect(auth.name).toBe("testuser");
		});

		it("should set picture to undefined if avatar_url is missing", () => {
			const provider = createGitHubAuthProvider();
			const userData = {
				id: 12345,
				login: "testuser",
				name: "Test User",
			};

			const auth = provider.newAuth(userData, "test@example.com");

			expect(auth.picture).toBeUndefined();
		});
	});

	describe("url", () => {
		it("should return GitHub API user endpoint", () => {
			const provider = createGitHubAuthProvider();
			expect(provider.url).toBe("https://api.github.com/user");
		});
	});
});
