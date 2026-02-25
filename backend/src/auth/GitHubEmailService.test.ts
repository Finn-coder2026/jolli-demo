import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockListEmailsForAuthenticatedUser, mockOctokitConstructor } = vi.hoisted(() => {
	const mockListEmailsForAuthenticatedUser = vi.fn();
	const mockOctokitConstructor = vi.fn();

	return { mockListEmailsForAuthenticatedUser, mockOctokitConstructor };
});

vi.mock("@octokit/rest", () => {
	class MockOctokit {
		readonly rest = {
			users: {
				listEmailsForAuthenticatedUser: (...args: Array<unknown>) =>
					mockListEmailsForAuthenticatedUser(...args),
			},
		};

		constructor(options: unknown) {
			mockOctokitConstructor(options);
		}
	}

	return { Octokit: MockOctokit };
});

import { fetchGitHubEmails, type GitHubEmail, getVerifiedEmails, selectPrimaryEmail } from "./GitHubEmailService";

describe("GitHubEmailService", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useRealTimers();
	});

	describe("fetchGitHubEmails", () => {
		it("should fetch and map GitHub emails", async () => {
			mockListEmailsForAuthenticatedUser.mockResolvedValue({
				data: [
					{
						email: "user@example.com",
						primary: true,
						verified: true,
						visibility: "private",
					},
				],
			});

			const result = await fetchGitHubEmails("token-123");

			expect(mockOctokitConstructor).toHaveBeenCalledWith({ auth: "token-123" });
			expect(mockListEmailsForAuthenticatedUser).toHaveBeenCalledTimes(1);
			expect(result).toEqual([
				{
					email: "user@example.com",
					primary: true,
					verified: true,
					visibility: "private",
				},
			]);
		});

		it("should retry on transient GitHub API errors and eventually succeed", async () => {
			vi.useFakeTimers();
			mockListEmailsForAuthenticatedUser.mockRejectedValueOnce({ status: 503 }).mockResolvedValueOnce({
				data: [
					{
						email: "retry@example.com",
						primary: true,
						verified: true,
						visibility: "private",
					},
				],
			});

			const resultPromise = fetchGitHubEmails("token-123");
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(mockListEmailsForAuthenticatedUser).toHaveBeenCalledTimes(2);
			expect(result).toEqual([
				{
					email: "retry@example.com",
					primary: true,
					verified: true,
					visibility: "private",
				},
			]);
		});

		it("should not retry on non-retryable errors", async () => {
			mockListEmailsForAuthenticatedUser.mockRejectedValue({ status: 401 });

			const result = await fetchGitHubEmails("token-123");

			expect(mockListEmailsForAuthenticatedUser).toHaveBeenCalledTimes(1);
			expect(result).toEqual([]);
		});

		it("should retry up to max attempts for transport errors and then return empty array", async () => {
			vi.useFakeTimers();
			mockListEmailsForAuthenticatedUser.mockRejectedValue(new Error("network timeout"));

			const resultPromise = fetchGitHubEmails("token-123");
			await vi.runAllTimersAsync();
			const result = await resultPromise;

			expect(mockListEmailsForAuthenticatedUser).toHaveBeenCalledTimes(3);
			expect(result).toEqual([]);
		});
	});

	describe("getVerifiedEmails", () => {
		it("should exclude GitHub no-reply aliases from verified emails", () => {
			const emails: Array<GitHubEmail> = [
				{
					email: "127468977+foster-han@users.noreply.github.com",
					primary: false,
					verified: true,
					visibility: "private",
				},
				{
					email: "foster.han@jolli.ai",
					primary: true,
					verified: true,
					visibility: "private",
				},
				{
					email: "unverified@example.com",
					primary: false,
					verified: false,
					visibility: "private",
				},
			];

			expect(getVerifiedEmails(emails)).toEqual([
				{
					email: "foster.han@jolli.ai",
					primary: true,
					verified: true,
					visibility: "private",
				},
			]);
		});

		it("should apply no-reply filter case-insensitively", () => {
			const emails: Array<GitHubEmail> = [
				{
					email: "123+user@Users.NoReply.GitHub.com",
					primary: true,
					verified: true,
					visibility: "private",
				},
			];

			expect(getVerifiedEmails(emails)).toEqual([]);
		});
	});

	describe("selectPrimaryEmail", () => {
		it("should return marked primary email", () => {
			const emails: Array<GitHubEmail> = [
				{
					email: "other@example.com",
					primary: false,
					verified: true,
					visibility: "private",
				},
				{
					email: "primary@example.com",
					primary: true,
					verified: true,
					visibility: "private",
				},
			];

			expect(selectPrimaryEmail(emails)).toBe("primary@example.com");
		});
	});
});
