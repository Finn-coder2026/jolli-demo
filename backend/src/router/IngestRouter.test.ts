import type { DaoProvider } from "../dao/DaoProvider";
import type { DocDao } from "../dao/DocDao";
import { mockDocDao } from "../dao/DocDao.mock";
import { mockDoc } from "../model/Doc.mock";
import { createAuthHandler } from "../util/AuthHandler";
import { createTokenUtil } from "../util/TokenUtil";
import { createIngestRouter } from "./IngestRouter";
import cookieParser from "cookie-parser";
import express, { type Express } from "express";
import { jrnParser, type UserInfo } from "jolli-common";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Helper to generate expected JRN in sources:github format */
function expectedJrnForPath(owner: string, repo: string, path: string): string {
	return jrnParser.githubSource({ org: owner, repo, branch: path });
}

// Mock the dependencies
vi.mock("../util/OctokitUtil", () => ({
	createOctokit: vi.fn(() => ({})),
}));

vi.mock("../github/OctokitGitHub", () => ({
	createOctokitGitHub: vi.fn(() => ({
		streamResults: vi.fn(),
		getContent: vi.fn(),
	})),
}));

vi.mock("../util/Queue", () => ({
	createQueue: vi.fn((_concurrency, processor) => {
		const items: Array<unknown> = [];
		return {
			add: (item: unknown) => items.push(item),
			close: async () => {
				for (const item of items) {
					await processor(item);
				}
			},
		};
	}),
}));

/** Helper to wrap a DAO in a mock provider */
function mockDaoProvider<T>(dao: T): DaoProvider<T> {
	return { getDao: () => dao };
}

describe("IngestRouter", () => {
	let app: Express;
	let mockDao: DocDao;
	let authToken: string;

	const tokenUtil = createTokenUtil<UserInfo>("test-secret", {
		algorithm: "HS256",
		expiresIn: "1h",
	});

	beforeEach(() => {
		mockDao = mockDocDao();
		app = express();
		app.use(cookieParser());
		app.use(express.json());
		app.use("/ingest", createAuthHandler(tokenUtil), createIngestRouter(mockDaoProvider(mockDao)));

		// Generate valid auth token for tests
		authToken = tokenUtil.generateToken({
			userId: 1,
			name: "Test User",
			email: "test@jolli.ai",
			picture: "https://example.com/pic.jpg",
		});

		vi.clearAllMocks();
	});

	describe("POST /sync", () => {
		it("should return 401 when not authenticated", async () => {
			const response = await request(app).post("/ingest/sync").send({ url: "https://github.com/owner/repo" });

			expect(response.status).toBe(401);
			expect(response.body).toEqual({ error: "Not authorized" });
		});

		it("should return 400 when URL is missing", async () => {
			const response = await request(app).post("/ingest/sync").set("Cookie", `authToken=${authToken}`).send({});

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "URL is required" });
		});

		it("should return 400 when URL is not a string", async () => {
			const response = await request(app)
				.post("/ingest/sync")
				.set("Cookie", `authToken=${authToken}`)
				.send({ url: 123 });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "URL is required" });
		});

		it("should return 400 when URL is not a GitHub URL", async () => {
			const response = await request(app)
				.post("/ingest/sync")
				.set("Cookie", `authToken=${authToken}`)
				.send({ url: "https://example.com/repo" });

			expect(response.status).toBe(400);
			expect(response.body).toEqual({ error: "Invalid GitHub URL" });
		});

		it("should return 200 and sync successfully with valid GitHub URL", async () => {
			const { createOctokitGitHub } = await import("../github/OctokitGitHub");
			const mockGitHub = {
				streamResults: vi.fn(function* () {
					yield { path: "README.md", url: "https://example.com" };
				}),
				getContent: vi.fn().mockResolvedValue({
					content: Buffer.from("# Test Content").toString("base64"),
				}),
			};
			vi.mocked(createOctokitGitHub).mockReturnValue(mockGitHub as never);

			mockDao.readDoc = vi.fn().mockResolvedValue(undefined);
			mockDao.createDoc = vi.fn().mockResolvedValue(mockDoc());

			const response = await request(app)
				.post("/ingest/sync")
				.set("Cookie", `authToken=${authToken}`)
				.send({ url: "https://github.com/owner/repo" });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				success: true,
				url: "https://github.com/owner/repo",
			});
			expect(mockDao.createDoc).toHaveBeenCalledWith({
				jrn: expectedJrnForPath("owner", "repo", "README.md"),
				updatedBy: "system",
				content: "# Test Content",
				contentType: "text/markdown",
				source: {
					type: "github",
					owner: "owner",
					repo: "repo",
					path: "README.md",
				},
				sourceMetadata: undefined,
				contentMetadata: undefined,
				createdBy: "system",
				docType: "document",
				slug: "readme",
				path: "",
				parentId: undefined,
				sortOrder: 0,
				spaceId: undefined,
			});
		});

		it("should update existing doc when syncing", async () => {
			const { createOctokitGitHub } = await import("../github/OctokitGitHub");
			const mockGitHub = {
				streamResults: vi.fn(function* () {
					yield { path: "README.md", url: "https://example.com" };
				}),
				getContent: vi.fn().mockResolvedValue({
					content: Buffer.from("# Updated Content").toString("base64"),
				}),
			};
			vi.mocked(createOctokitGitHub).mockReturnValue(mockGitHub as never);

			const existingDoc = mockDoc({
				jrn: expectedJrnForPath("owner", "repo", "README.md"),
				content: "# Old Content",
				version: 1,
				createdBy: "system",
			});

			mockDao.readDoc = vi.fn().mockResolvedValue(existingDoc);
			mockDao.updateDoc = vi.fn().mockResolvedValue(mockDoc({ ...existingDoc, version: 2 }));

			const response = await request(app)
				.post("/ingest/sync")
				.set("Cookie", `authToken=${authToken}`)
				.send({ url: "https://github.com/owner/repo" });

			expect(response.status).toBe(200);
			expect(mockDao.readDoc).toHaveBeenCalledWith(expectedJrnForPath("owner", "repo", "README.md"));
			expect(mockDao.updateDoc).toHaveBeenCalledWith({
				...existingDoc,
				jrn: expectedJrnForPath("owner", "repo", "README.md"),
				updatedBy: "system",
				content: "# Updated Content",
				contentType: "text/markdown",
				source: {
					type: "github",
					owner: "owner",
					repo: "repo",
					path: "README.md",
				},
				sourceMetadata: undefined,
				contentMetadata: undefined,
				version: 2,
				slug: "readme",
			});
		});

		it("should skip files without content", async () => {
			const { createOctokitGitHub } = await import("../github/OctokitGitHub");
			const mockGitHub = {
				streamResults: vi.fn(function* () {
					yield { path: "README.md", url: "https://example.com" };
				}),
				getContent: vi.fn().mockResolvedValue(undefined),
			};
			vi.mocked(createOctokitGitHub).mockReturnValue(mockGitHub as never);

			mockDao.createDoc = vi.fn();

			const response = await request(app)
				.post("/ingest/sync")
				.set("Cookie", `authToken=${authToken}`)
				.send({ url: "https://github.com/owner/repo" });

			expect(response.status).toBe(200);
			expect(mockDao.createDoc).not.toHaveBeenCalled();
		});

		it("should handle errors during ingestion", async () => {
			const { createOctokitGitHub } = await import("../github/OctokitGitHub");
			const mockGitHub = {
				streamResults: vi.fn(function* () {
					yield { path: "test.md", url: "https://example.com" };
				}),
				getContent: vi.fn().mockRejectedValue(new Error("GitHub API error")),
			};
			vi.mocked(createOctokitGitHub).mockReturnValue(mockGitHub as never);

			const response = await request(app)
				.post("/ingest/sync")
				.set("Cookie", `authToken=${authToken}`)
				.send({ url: "https://github.com/owner/repo" });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({
				error: "Failed to ingest URL",
				message: "GitHub API error",
			});
		});

		it("should handle non-Error errors during ingestion", async () => {
			const { createOctokitGitHub } = await import("../github/OctokitGitHub");
			const mockGitHub = {
				streamResults: vi.fn(function* () {
					yield { path: "test.md", url: "https://example.com" };
				}),
				getContent: vi.fn().mockRejectedValue("string error"),
			};
			vi.mocked(createOctokitGitHub).mockReturnValue(mockGitHub as never);

			const response = await request(app)
				.post("/ingest/sync")
				.set("Cookie", `authToken=${authToken}`)
				.send({ url: "https://github.com/owner/repo" });

			expect(response.status).toBe(500);
			expect(response.body).toEqual({
				error: "Failed to ingest URL",
				message: "string error",
			});
		});

		it("should have correct content-type header", async () => {
			const { createOctokitGitHub } = await import("../github/OctokitGitHub");
			const mockGitHub = {
				streamResults: vi.fn(function* (): Generator<never> {
					// Empty results - no yields
				}),
				getContent: vi.fn(),
			};
			vi.mocked(createOctokitGitHub).mockReturnValue(mockGitHub as never);

			const response = await request(app)
				.post("/ingest/sync")
				.set("Cookie", `authToken=${authToken}`)
				.send({ url: "https://github.com/owner/repo" });

			expect(response.headers["content-type"]).toMatch(/json/);
		});
	});
});
