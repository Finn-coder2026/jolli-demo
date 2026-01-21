import { createOctokitGitHub } from "./OctokitGitHub";
import type { Octokit } from "@octokit/rest";
import { beforeEach, describe, expect, test, vi } from "vitest";

// Mock Octokit methods
const mockGetContent = vi.fn();
const mockGetPull = vi.fn();
const mockSearchCode = vi.fn();
const mockGetIssue = vi.fn();
const mockListForRepo = vi.fn();
const mockListComments = vi.fn();
const mockListReviews = vi.fn();
const mockPaginateIterator = vi.fn();

const mockOctokit = {
	rest: {
		repos: {
			getContent: mockGetContent,
		},
		pulls: {
			get: mockGetPull,
		},
	},
	search: {
		code: mockSearchCode,
	},
	issues: {
		get: mockGetIssue,
		listForRepo: mockListForRepo,
		listComments: mockListComments,
	},
	pulls: {
		listReviews: mockListReviews,
	},
	paginate: {
		iterator: mockPaginateIterator,
	},
} as unknown as Octokit;

const owner = "testowner";
const repo = "testrepo";

beforeEach(() => {
	vi.clearAllMocks();
	mockGetContent.mockClear();
	mockGetPull.mockClear();
	mockSearchCode.mockClear();
	mockGetIssue.mockClear();
	mockListForRepo.mockClear();
	mockListComments.mockClear();
	mockListReviews.mockClear();
	mockPaginateIterator.mockClear();
});

describe("createOctokitGitHub", () => {
	test("creates GitHub instance with correct owner and repo", () => {
		const github = createOctokitGitHub(mockOctokit, owner, repo);
		expect(github.owner).toBe(owner);
		expect(github.repo).toBe(repo);
	});

	describe("getContent", () => {
		test("returns content from octokit", async () => {
			const mockContent = { name: "README.md", path: "README.md", content: "SGVsbG8gV29ybGQ=" };
			mockGetContent.mockResolvedValue({ data: mockContent });

			const github = createOctokitGitHub(mockOctokit, owner, repo);
			const result = await github.getContent("README.md");

			expect(mockGetContent).toHaveBeenCalledWith({
				owner,
				repo,
				path: "README.md",
			});
			expect(result).toBe(mockContent);
		});

		test("returns undefined when content not found (404)", async () => {
			const error = { status: 404, message: "Not Found" };
			mockGetContent.mockRejectedValue(error);

			const github = createOctokitGitHub(mockOctokit, owner, repo);
			const result = await github.getContent("nonexistent.md");

			expect(mockGetContent).toHaveBeenCalledWith({
				owner,
				repo,
				path: "nonexistent.md",
			});
			expect(result).toBeUndefined();
		});

		test("throws error for non-404 errors", async () => {
			const error = { status: 500, message: "Internal Server Error" };
			mockGetContent.mockRejectedValue(error);

			const github = createOctokitGitHub(mockOctokit, owner, repo);

			await expect(github.getContent("README.md")).rejects.toThrow();
			expect(mockGetContent).toHaveBeenCalledWith({
				owner,
				repo,
				path: "README.md",
			});
		});

		test("handles errors without status property", async () => {
			const error = new Error("Network error");
			mockGetContent.mockRejectedValue(error);

			const github = createOctokitGitHub(mockOctokit, owner, repo);

			await expect(github.getContent("README.md")).rejects.toThrow("Network error");
		});

		test("handles null/undefined errors", async () => {
			mockGetContent.mockRejectedValue(null);

			const github = createOctokitGitHub(mockOctokit, owner, repo);

			await expect(github.getContent("README.md")).rejects.toBeNull();
		});
	});

	describe("getPull", () => {
		test("returns pull request from octokit", async () => {
			const mockPull = { id: 1, number: 123, title: "Test PR" };
			mockGetPull.mockResolvedValue({ data: mockPull });

			const github = createOctokitGitHub(mockOctokit, owner, repo);
			const result = await github.getPull(123);

			expect(mockGetPull).toHaveBeenCalledWith({
				owner,
				repo,
				pull_number: 123,
			});
			expect(result).toBe(mockPull);
		});

		test("returns undefined when pull request not found (404)", async () => {
			const error = { status: 404, message: "Not Found" };
			mockGetPull.mockRejectedValue(error);

			const github = createOctokitGitHub(mockOctokit, owner, repo);
			const result = await github.getPull(123);

			expect(mockGetPull).toHaveBeenCalledWith({
				owner,
				repo,
				pull_number: 123,
			});
			expect(result).toBeUndefined();
		});

		test("throws error for non-404 errors", async () => {
			const error = { status: 500, message: "Internal Server Error" };
			mockGetPull.mockRejectedValue(error);

			const github = createOctokitGitHub(mockOctokit, owner, repo);

			await expect(github.getPull(123)).rejects.toThrow();
			expect(mockGetPull).toHaveBeenCalledWith({
				owner,
				repo,
				pull_number: 123,
			});
		});

		test("handles errors without status property", async () => {
			const error = new Error("Network error");
			mockGetPull.mockRejectedValue(error);

			const github = createOctokitGitHub(mockOctokit, owner, repo);

			await expect(github.getPull(123)).rejects.toThrow("Network error");
		});
	});

	describe("streamResults", () => {
		test("yields items from paginated search results", async () => {
			const mockItems = [
				{ name: "file1.js", path: "src/file1.js" },
				{ name: "file2.js", path: "src/file2.js" },
			];
			const mockIterator = [{ data: mockItems }];
			mockPaginateIterator.mockReturnValue(mockIterator);

			const github = createOctokitGitHub(mockOctokit, owner, repo);
			const results = [];
			for await (const item of github.streamResults("test query")) {
				results.push(item);
			}

			expect(mockPaginateIterator).toHaveBeenCalledWith(mockSearchCode, {
				per_page: 100,
				q: `test query repo:${owner}/${repo}`,
			});
			expect(results).toEqual(mockItems);
		});

		test("handles multiple pages of results", async () => {
			const page1Items = [{ name: "file1.js", path: "src/file1.js" }];
			const page2Items = [{ name: "file2.js", path: "src/file2.js" }];
			const mockIterator = [{ data: page1Items }, { data: page2Items }];
			mockPaginateIterator.mockReturnValue(mockIterator);

			const github = createOctokitGitHub(mockOctokit, owner, repo);
			const results = [];
			for await (const item of github.streamResults("test query")) {
				results.push(item);
			}

			expect(results).toEqual([...page1Items, ...page2Items]);
		});

		test("handles empty search results", async () => {
			const mockIterator = [{ data: [] }];
			mockPaginateIterator.mockReturnValue(mockIterator);

			const github = createOctokitGitHub(mockOctokit, owner, repo);
			const results = [];
			for await (const item of github.streamResults("test query")) {
				results.push(item);
			}

			expect(results).toEqual([]);
		});
	});

	describe("streamIssues", () => {
		test("streams issues from beginning when no fromIssue provided", async () => {
			const mockIssues = [
				{ number: 1, title: "Issue 1" },
				{ number: 2, title: "Issue 2" },
			];
			const mockIterator = [{ data: mockIssues }];
			mockPaginateIterator.mockReturnValue(mockIterator);

			const github = createOctokitGitHub(mockOctokit, owner, repo);
			const results = [];
			for await (const issue of github.streamIssues()) {
				results.push(issue);
			}

			expect(mockPaginateIterator).toHaveBeenCalledWith(mockListForRepo, {
				owner,
				repo,
				per_page: 100,
				state: "all",
				sort: "created",
				direction: "asc",
			});
			expect(results).toEqual(mockIssues);
		});

		test("streams issues from specific issue number", async () => {
			const mockLastIssue = { data: { created_at: "2023-01-01T00:00:00Z" } };
			const mockIssues = [
				{ number: 5, title: "Issue 5" },
				{ number: 6, title: "Issue 6" },
			];
			const mockIterator = [{ data: mockIssues }];

			mockGetIssue.mockResolvedValue(mockLastIssue);
			mockPaginateIterator.mockReturnValue(mockIterator);

			const github = createOctokitGitHub(mockOctokit, owner, repo);
			const results = [];
			for await (const issue of github.streamIssues(4)) {
				results.push(issue);
			}

			expect(mockGetIssue).toHaveBeenCalledWith({
				owner,
				repo,
				issue_number: 4,
			});
			expect(mockPaginateIterator).toHaveBeenCalledWith(mockListForRepo, {
				owner,
				repo,
				per_page: 100,
				state: "all",
				sort: "created",
				direction: "asc",
				since: "2023-01-01T00:00:00Z",
			});
			expect(results).toEqual(mockIssues);
		});

		test("filters out issues with numbers less than or equal to fromIssue", async () => {
			const mockLastIssue = { data: { created_at: "2023-01-01T00:00:00Z" } };
			const mockIssues = [
				{ number: 4, title: "Issue 4" },
				{ number: 5, title: "Issue 5" },
				{ number: 6, title: "Issue 6" },
			];
			const mockIterator = [{ data: mockIssues }];

			mockGetIssue.mockResolvedValue(mockLastIssue);
			mockPaginateIterator.mockReturnValue(mockIterator);

			const github = createOctokitGitHub(mockOctokit, owner, repo);
			const results = [];
			for await (const issue of github.streamIssues(4)) {
				results.push(issue);
			}

			expect(results).toEqual([
				{ number: 5, title: "Issue 5" },
				{ number: 6, title: "Issue 6" },
			]);
		});

		test("handles multiple pages in streamIssues", async () => {
			const page1Issues = [{ number: 1, title: "Issue 1" }];
			const page2Issues = [{ number: 2, title: "Issue 2" }];
			const mockIterator = [{ data: page1Issues }, { data: page2Issues }];
			mockPaginateIterator.mockReturnValue(mockIterator);

			const github = createOctokitGitHub(mockOctokit, owner, repo);
			const results = [];
			for await (const issue of github.streamIssues()) {
				results.push(issue);
			}

			expect(results).toEqual([...page1Issues, ...page2Issues]);
		});

		test("handles empty issues list", async () => {
			const mockIterator = [{ data: [] }];
			mockPaginateIterator.mockReturnValue(mockIterator);

			const github = createOctokitGitHub(mockOctokit, owner, repo);
			const results = [];
			for await (const issue of github.streamIssues()) {
				results.push(issue);
			}

			expect(results).toEqual([]);
		});
	});

	describe("streamComments", () => {
		test("yields comments from paginated results", async () => {
			const mockComments = [
				{ id: 1, body: "Comment 1" },
				{ id: 2, body: "Comment 2" },
			];
			const mockIterator = [{ data: mockComments }];
			mockPaginateIterator.mockReturnValue(mockIterator);

			const github = createOctokitGitHub(mockOctokit, owner, repo);
			const results = [];
			for await (const comment of github.streamComments(123)) {
				results.push(comment);
			}

			expect(mockPaginateIterator).toHaveBeenCalledWith(mockListComments, {
				owner,
				repo,
				per_page: 100,
				issue_number: 123,
			});
			expect(results).toEqual(mockComments);
		});

		test("handles multiple pages of comments", async () => {
			const page1Comments = [{ id: 1, body: "Comment 1" }];
			const page2Comments = [{ id: 2, body: "Comment 2" }];
			const mockIterator = [{ data: page1Comments }, { data: page2Comments }];
			mockPaginateIterator.mockReturnValue(mockIterator);

			const github = createOctokitGitHub(mockOctokit, owner, repo);
			const results = [];
			for await (const comment of github.streamComments(123)) {
				results.push(comment);
			}

			expect(results).toEqual([...page1Comments, ...page2Comments]);
		});

		test("handles empty comments list", async () => {
			const mockIterator = [{ data: [] }];
			mockPaginateIterator.mockReturnValue(mockIterator);

			const github = createOctokitGitHub(mockOctokit, owner, repo);
			const results = [];
			for await (const comment of github.streamComments(123)) {
				results.push(comment);
			}

			expect(results).toEqual([]);
		});
	});

	describe("streamReviews", () => {
		test("yields reviews from paginated results", async () => {
			const mockReviews = [
				{ id: 1, state: "APPROVED" },
				{ id: 2, state: "CHANGES_REQUESTED" },
			];
			const mockIterator = [{ data: mockReviews }];
			mockPaginateIterator.mockReturnValue(mockIterator);

			const github = createOctokitGitHub(mockOctokit, owner, repo);
			const results = [];
			for await (const review of github.streamReviews(123)) {
				results.push(review);
			}

			expect(mockPaginateIterator).toHaveBeenCalledWith(mockListReviews, {
				owner,
				repo,
				per_page: 100,
				pull_number: 123,
			});
			expect(results).toEqual(mockReviews);
		});

		test("handles multiple pages of reviews", async () => {
			const page1Reviews = [{ id: 1, state: "APPROVED" }];
			const page2Reviews = [{ id: 2, state: "CHANGES_REQUESTED" }];
			const mockIterator = [{ data: page1Reviews }, { data: page2Reviews }];
			mockPaginateIterator.mockReturnValue(mockIterator);

			const github = createOctokitGitHub(mockOctokit, owner, repo);
			const results = [];
			for await (const review of github.streamReviews(123)) {
				results.push(review);
			}

			expect(results).toEqual([...page1Reviews, ...page2Reviews]);
		});

		test("handles empty reviews list", async () => {
			const mockIterator = [{ data: [] }];
			mockPaginateIterator.mockReturnValue(mockIterator);

			const github = createOctokitGitHub(mockOctokit, owner, repo);
			const results = [];
			for await (const review of github.streamReviews(123)) {
				results.push(review);
			}

			expect(results).toEqual([]);
		});
	});
});
