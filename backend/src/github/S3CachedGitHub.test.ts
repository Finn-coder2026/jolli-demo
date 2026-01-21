import { mockAsyncIterable } from "../util/Async.mock";
import type { S3 } from "../util/S3";
import { mockS3 } from "../util/S3.mock";
import { mockGitHub } from "./GitHub.mock";
import type {
	GitHub,
	GitHubComment,
	GitHubContent,
	GitHubIssue,
	GitHubPull,
	GitHubResult,
	GitHubReview,
} from "./GitHub.ts";
import { createS3CachedGitHub } from "./S3CachedGitHub";
import { beforeEach, describe, expect, test, vi } from "vitest";

describe("S3CachedGitHub", () => {
	let mockDelegate: GitHub;
	let mockS3Instance: S3;
	let cachedGitHub: GitHub;

	beforeEach(() => {
		mockDelegate = mockGitHub({
			owner: "testowner",
			repo: "testrepo",
		});

		mockS3Instance = mockS3();

		cachedGitHub = createS3CachedGitHub(mockDelegate, mockS3Instance);
	});

	test("preserves delegate owner and repo", () => {
		expect(cachedGitHub.owner).toBe("testowner");
		expect(cachedGitHub.repo).toBe("testrepo");
	});

	test("delegates streamResults to original implementation", async () => {
		const mockResults = [{ path: "file1.ts" }] as Array<GitHubResult>;
		vi.mocked(mockDelegate.streamResults).mockImplementation(() => mockAsyncIterable(mockResults));

		const results = [];
		for await (const result of cachedGitHub.streamResults("test query")) {
			results.push(result);
		}

		expect(mockDelegate.streamResults).toHaveBeenCalledWith("test query");
		expect(results).toEqual(mockResults);
	});

	test("getContent returns cached content from S3", async () => {
		const mockContent = { name: "README.md", path: "README.md", content: "SGVsbG8gV29ybGQ=" };
		vi.mocked(mockS3Instance.readJson).mockResolvedValue(mockContent);

		const result = await cachedGitHub.getContent("README.md");

		expect(mockS3Instance.readJson).toHaveBeenCalledWith(
			"github.com/testowner/testrepo/contents/README.md.json.gz",
		);
		expect(result).toBe(mockContent);
	});

	test("getContent fetches from delegate and caches when not in S3", async () => {
		const mockContent = { name: "README.md", path: "README.md", content: "SGVsbG8gV29ybGQ=" } as GitHubContent;
		vi.mocked(mockS3Instance.readJson).mockResolvedValue(undefined);
		vi.mocked(mockDelegate.getContent).mockResolvedValue(mockContent);

		const result = await cachedGitHub.getContent("README.md");

		expect(mockS3Instance.readJson).toHaveBeenCalledWith(
			"github.com/testowner/testrepo/contents/README.md.json.gz",
		);
		expect(mockDelegate.getContent).toHaveBeenCalledWith("README.md");
		expect(mockS3Instance.writeJson).toHaveBeenCalledWith(
			"github.com/testowner/testrepo/contents/README.md.json.gz",
			mockContent,
		);
		expect(result).toBe(mockContent);
	});

	test("getContent returns undefined when delegate returns undefined", async () => {
		vi.mocked(mockS3Instance.readJson).mockResolvedValue(undefined);
		vi.mocked(mockDelegate.getContent).mockResolvedValue(undefined);

		const result = await cachedGitHub.getContent("nonexistent.md");

		expect(mockS3Instance.readJson).toHaveBeenCalledWith(
			"github.com/testowner/testrepo/contents/nonexistent.md.json.gz",
		);
		expect(mockDelegate.getContent).toHaveBeenCalledWith("nonexistent.md");
		expect(mockS3Instance.writeJson).not.toHaveBeenCalled();
		expect(result).toBeUndefined();
	});

	test("getPull returns cached pull from S3", async () => {
		const mockPull = { number: 123, title: "Test PR" };
		vi.mocked(mockS3Instance.readJson).mockResolvedValue(mockPull);

		const result = await cachedGitHub.getPull(123);

		expect(mockS3Instance.readJson).toHaveBeenCalledWith("github.com/testowner/testrepo/pulls/123.json.gz");
		expect(result).toBe(mockPull);
	});

	test("getPull returns undefined when no cached pull found", async () => {
		vi.mocked(mockS3Instance.readJson).mockResolvedValue(undefined);
		vi.mocked(mockDelegate.getPull).mockResolvedValue(undefined);

		const result = await cachedGitHub.getPull(123);

		expect(mockS3Instance.readJson).toHaveBeenCalledWith("github.com/testowner/testrepo/pulls/123.json.gz");
		expect(mockDelegate.getPull).toHaveBeenCalledWith(123);
		expect(result).toBeUndefined();
	});

	test("getPull fetches from delegate and caches when not in S3", async () => {
		const mockPull = { number: 123, title: "Test PR" } as unknown as GitHubPull;
		vi.mocked(mockS3Instance.readJson).mockResolvedValue(undefined);
		vi.mocked(mockDelegate.getPull).mockResolvedValue(mockPull);

		const result = await cachedGitHub.getPull(123);

		expect(mockS3Instance.readJson).toHaveBeenCalledWith("github.com/testowner/testrepo/pulls/123.json.gz");
		expect(mockDelegate.getPull).toHaveBeenCalledWith(123);
		expect(mockS3Instance.writeJson).toHaveBeenCalledWith(
			"github.com/testowner/testrepo/pulls/123.json.gz",
			mockPull,
		);
		expect(result).toBe(mockPull);
	});

	test("streamIssues yields cached issues then delegates to stream", async () => {
		const cachedIssue = { number: 5 };
		const newIssue = { number: 10 } as GitHubIssue;

		vi.mocked(mockS3Instance.listKeys).mockResolvedValue(["github.com/testowner/testrepo/issues/5.json.gz"]);
		vi.mocked(mockS3Instance.readJson).mockResolvedValue(cachedIssue);
		vi.mocked(mockDelegate.streamIssues).mockImplementation(() => mockAsyncIterable([newIssue]));

		const issues = [];
		for await (const issue of cachedGitHub.streamIssues(3)) {
			issues.push(issue);
		}

		expect(mockS3Instance.listKeys).toHaveBeenCalledWith("github.com/testowner/testrepo/issues/");
		expect(mockDelegate.streamIssues).toHaveBeenCalledWith(5);
		expect(mockS3Instance.writeJson).toHaveBeenCalledWith(
			"github.com/testowner/testrepo/issues/10.json.gz",
			newIssue,
		);
		expect(issues).toEqual([cachedIssue, newIssue]);
	});

	test("streamIssues filters cached issues by fromIssue parameter", async () => {
		vi.mocked(mockS3Instance.listKeys).mockResolvedValue([
			"github.com/testowner/testrepo/issues/2.json.gz",
			"github.com/testowner/testrepo/issues/5.json.gz",
		]);
		vi.mocked(mockS3Instance.readJson).mockResolvedValue({ number: 5 });
		vi.mocked(mockDelegate.streamIssues).mockImplementation(async function* () {
			// No issues to yield
		});

		const issues = [];
		for await (const issue of cachedGitHub.streamIssues(3)) {
			issues.push(issue);
		}

		expect(mockS3Instance.readJson).toHaveBeenCalledTimes(1);
		expect(mockS3Instance.readJson).toHaveBeenCalledWith("github.com/testowner/testrepo/issues/5.json.gz");
		expect(issues).toEqual([{ number: 5 }]);
	});

	test("streamIssues handles null cached issues", async () => {
		vi.mocked(mockS3Instance.listKeys).mockResolvedValue(["github.com/testowner/testrepo/issues/5.json.gz"]);
		vi.mocked(mockS3Instance.readJson).mockResolvedValue(undefined);
		vi.mocked(mockDelegate.streamIssues).mockImplementation(async function* () {
			// No issues to yield
		});

		const issues = [];
		for await (const issue of cachedGitHub.streamIssues()) {
			issues.push(issue);
		}

		expect(issues).toEqual([]);
	});

	test("streamComments yields cached comments from S3", async () => {
		const mockComments = [
			{ id: 1, body: "comment 1" },
			{ id: 2, body: "comment 2" },
		];
		vi.mocked(mockS3Instance.readJson).mockResolvedValue(mockComments);

		const comments = [];
		for await (const comment of cachedGitHub.streamComments(123)) {
			comments.push(comment);
		}

		expect(mockS3Instance.readJson).toHaveBeenCalledWith("github.com/testowner/testrepo/comments/123.json.gz");
		expect(comments).toEqual(mockComments);
	});

	test("streamComments handles null cached comments", async () => {
		const mockComments = [{ id: 1, body: "comment 1" }] as Array<GitHubComment>;
		vi.mocked(mockS3Instance.readJson).mockResolvedValue(undefined);
		vi.mocked(mockDelegate.streamComments).mockImplementation(() => mockAsyncIterable(mockComments));

		const comments = [];
		for await (const comment of cachedGitHub.streamComments(123)) {
			comments.push(comment);
		}

		expect(mockS3Instance.writeJson).toHaveBeenCalledWith(
			"github.com/testowner/testrepo/comments/123.json.gz",
			mockComments,
		);
		expect(comments).toEqual(mockComments);
	});

	test("streamReviews yields cached reviews from S3", async () => {
		const mockReviews = [
			{ id: 1, state: "APPROVED" },
			{ id: 2, state: "CHANGES_REQUESTED" },
		];
		vi.mocked(mockS3Instance.readJson).mockResolvedValue(mockReviews);

		const reviews = [];
		for await (const review of cachedGitHub.streamReviews(123)) {
			reviews.push(review);
		}

		expect(mockS3Instance.readJson).toHaveBeenCalledWith("github.com/testowner/testrepo/reviews/123.json.gz");
		expect(reviews).toEqual(mockReviews);
	});

	test("streamReviews handles null cached reviews", async () => {
		const mockReviews = [{ id: 1, state: "APPROVED" }] as Array<GitHubReview>;
		vi.mocked(mockS3Instance.readJson).mockResolvedValue(undefined);
		vi.mocked(mockDelegate.streamReviews).mockImplementation(() => mockAsyncIterable(mockReviews));

		const reviews = [];
		for await (const review of cachedGitHub.streamReviews(123)) {
			reviews.push(review);
		}

		expect(mockS3Instance.writeJson).toHaveBeenCalledWith(
			"github.com/testowner/testrepo/reviews/123.json.gz",
			mockReviews,
		);
		expect(reviews).toEqual(mockReviews);
	});

	test("uses custom concurrency parameter", () => {
		const customConcurrency = 5;
		const customCachedGitHub = createS3CachedGitHub(mockDelegate, mockS3Instance, customConcurrency);

		expect(customCachedGitHub.owner).toBe("testowner");
		expect(customCachedGitHub.repo).toBe("testrepo");
	});

	test("streamIssues filters keys that don't match regex pattern", async () => {
		vi.mocked(mockS3Instance.listKeys).mockResolvedValue([
			"github.com/testowner/testrepo/issues/invalid.txt",
			"github.com/testowner/testrepo/issues/5.json.gz",
		]);
		vi.mocked(mockS3Instance.readJson).mockResolvedValue({ number: 5 });
		vi.mocked(mockDelegate.streamIssues).mockImplementation(async function* () {
			// No issues to yield
		});

		const issues = [];
		for await (const issue of cachedGitHub.streamIssues()) {
			issues.push(issue);
		}

		expect(mockS3Instance.readJson).toHaveBeenCalledTimes(1);
		expect(mockS3Instance.readJson).toHaveBeenCalledWith("github.com/testowner/testrepo/issues/5.json.gz");
		expect(issues).toEqual([{ number: 5 }]);
	});

	test("streamIssues sorts keys correctly by issue number", async () => {
		vi.mocked(mockS3Instance.listKeys).mockResolvedValue([
			"github.com/testowner/testrepo/issues/10.json.gz",
			"github.com/testowner/testrepo/issues/5.json.gz",
			"github.com/testowner/testrepo/issues/20.json.gz",
		]);
		vi.mocked(mockS3Instance.readJson)
			.mockResolvedValueOnce({ number: 5 })
			.mockResolvedValueOnce({ number: 10 })
			.mockResolvedValueOnce({ number: 20 });
		vi.mocked(mockDelegate.streamIssues).mockImplementation(async function* () {
			// No issues to yield
		});

		const issues = [];
		for await (const issue of cachedGitHub.streamIssues()) {
			issues.push(issue);
		}

		// Should be sorted by issue number (5, 10, 20)
		expect(issues).toEqual([{ number: 5 }, { number: 10 }, { number: 20 }]);
		expect(mockS3Instance.readJson).toHaveBeenCalledWith("github.com/testowner/testrepo/issues/5.json.gz");
		expect(mockS3Instance.readJson).toHaveBeenCalledWith("github.com/testowner/testrepo/issues/10.json.gz");
		expect(mockS3Instance.readJson).toHaveBeenCalledWith("github.com/testowner/testrepo/issues/20.json.gz");
	});

	test("streamIssues with custom concurrency parameter works correctly", async () => {
		const customCachedGitHub = createS3CachedGitHub(mockDelegate, mockS3Instance, 5);

		vi.mocked(mockS3Instance.listKeys).mockResolvedValue(["github.com/testowner/testrepo/issues/1.json.gz"]);
		vi.mocked(mockS3Instance.readJson).mockResolvedValue({ number: 1 });
		vi.mocked(mockDelegate.streamIssues).mockImplementation(async function* () {
			// No issues to yield
		});

		const issues = [];
		for await (const issue of customCachedGitHub.streamIssues()) {
			issues.push(issue);
		}

		expect(issues).toEqual([{ number: 1 }]);
	});
});
