import type { RunState } from "../../../../tools/jolliagent/src/Types";
import type { DocDao } from "../../dao/DocDao";
import { mockDoc } from "../../model/Doc.mock";
import {
	createSyncUpArticleToolDefinition,
	executeSyncUpArticleTool,
	generateArticleJrn,
	generateTitleFromArticleName,
	getContentTypeFromPath,
	sanitizeResourceId,
} from "./SyncUpArticleTool";
import { describe, expect, it, vi } from "vitest";

// Helper to generate expected JRN in new format: jrn:/global:docs:article/{resourceId}
const expectedJrn = (resourceId: string) => `jrn:/global:docs:article/${resourceId}`;

describe("SyncUpArticleTool", () => {
	describe("createSyncUpArticleToolDefinition", () => {
		it("creates a tool definition with correct name and parameters", () => {
			const tool = createSyncUpArticleToolDefinition();
			expect(tool.name).toBe("sync_up_article");
			expect(tool.description).toContain("Sync a markdown file from the sandbox");
			expect(tool.parameters).toEqual({
				type: "object",
				properties: {
					sandboxPath: {
						type: "string",
						description: expect.stringContaining("Path to the markdown file"),
					},
					articleName: {
						type: "string",
						description: expect.stringContaining("Name for the article"),
					},
				},
				required: ["sandboxPath", "articleName"],
			});
		});
	});
	describe("getContentTypeFromPath", () => {
		it("returns OpenAPI JSON content type for .json files", () => {
			expect(getContentTypeFromPath("/path/to/openapi.json")).toBe("application/vnd.oai.openapi+json");
			expect(getContentTypeFromPath("/path/to/spec.JSON")).toBe("application/vnd.oai.openapi+json");
		});
		it("returns OpenAPI YAML content type for .yaml files", () => {
			expect(getContentTypeFromPath("/path/to/openapi.yaml")).toBe("application/vnd.oai.openapi");
			expect(getContentTypeFromPath("/path/to/spec.YAML")).toBe("application/vnd.oai.openapi");
		});
		it("returns OpenAPI YAML content type for .yml files", () => {
			expect(getContentTypeFromPath("/path/to/openapi.yml")).toBe("application/vnd.oai.openapi");
			expect(getContentTypeFromPath("/path/to/spec.YML")).toBe("application/vnd.oai.openapi");
		});
		it("returns markdown content type for .md files", () => {
			expect(getContentTypeFromPath("/path/to/doc.md")).toBe("text/markdown");
			expect(getContentTypeFromPath("/path/to/readme.MD")).toBe("text/markdown");
		});
		it("returns markdown content type for unknown extensions", () => {
			expect(getContentTypeFromPath("/path/to/file.txt")).toBe("text/markdown");
			expect(getContentTypeFromPath("/path/to/file")).toBe("text/markdown");
		});
	});
	describe("generateTitleFromArticleName", () => {
		it("converts kebab-case to Title Case", () => {
			expect(generateTitleFromArticleName("my-article")).toBe("My Article");
			expect(generateTitleFromArticleName("test-api-overview")).toBe("Test Api Overview");
		});
		it("converts snake_case to Title Case", () => {
			expect(generateTitleFromArticleName("my_article")).toBe("My Article");
			expect(generateTitleFromArticleName("test_api_overview")).toBe("Test Api Overview");
		});
		it("handles mixed separators", () => {
			expect(generateTitleFromArticleName("my-api_overview")).toBe("My Api Overview");
		});
		it("removes file extensions", () => {
			expect(generateTitleFromArticleName("my-article.md")).toBe("My Article");
			expect(generateTitleFromArticleName("test-api.json")).toBe("Test Api");
			expect(generateTitleFromArticleName("openapi.yaml")).toBe("Openapi");
			expect(generateTitleFromArticleName("spec.yml")).toBe("Spec");
		});
		it("handles single word", () => {
			expect(generateTitleFromArticleName("article")).toBe("Article");
		});
		it("handles already capitalized words", () => {
			expect(generateTitleFromArticleName("SHLINK-OPENAPI")).toBe("Shlink Openapi");
		});
	});
	describe("sanitizeResourceId", () => {
		it("removes .md extension if present", () => {
			expect(sanitizeResourceId("my-article.md")).toBe("my-article");
			expect(sanitizeResourceId("my-article.MD")).toBe("my-article");
		});
		it("removes .json extension if present", () => {
			expect(sanitizeResourceId("my-api.json")).toBe("my-api");
		});
		it("removes .yaml/.yml extension if present", () => {
			expect(sanitizeResourceId("my-api.yaml")).toBe("my-api");
			expect(sanitizeResourceId("my-api.yml")).toBe("my-api");
		});
		it("replaces path separators with dashes", () => {
			expect(sanitizeResourceId("path/to/article")).toBe("path-to-article");
			expect(sanitizeResourceId("path\\to\\article")).toBe("path-to-article");
		});
		it("replaces invalid characters with dashes", () => {
			expect(sanitizeResourceId("my article!@#")).toBe("my-article");
		});
		it("collapses multiple dashes", () => {
			expect(sanitizeResourceId("my---article")).toBe("my-article");
		});
		it("removes leading and trailing dashes", () => {
			expect(sanitizeResourceId("-my-article-")).toBe("my-article");
		});
	});
	describe("generateArticleJrn", () => {
		it("generates JRN with new structured format", () => {
			expect(generateArticleJrn("my-article", "text/markdown")).toBe(expectedJrn("my-article"));
		});
		it("generates JRN regardless of content type (content type no longer affects JRN)", () => {
			expect(generateArticleJrn("my-api", "application/vnd.oai.openapi+json")).toBe(expectedJrn("my-api"));
			expect(generateArticleJrn("my-api", "application/vnd.oai.openapi")).toBe(expectedJrn("my-api"));
		});
		it("removes extensions in resource ID", () => {
			expect(generateArticleJrn("my-article.md", "text/markdown")).toBe(expectedJrn("my-article"));
			expect(generateArticleJrn("my-api.json", "application/vnd.oai.openapi+json")).toBe(expectedJrn("my-api"));
			expect(generateArticleJrn("my-api.yaml", "application/vnd.oai.openapi")).toBe(expectedJrn("my-api"));
		});
		it("replaces path separators with dashes", () => {
			expect(generateArticleJrn("path/to/article", "text/markdown")).toBe(expectedJrn("path-to-article"));
		});
		it("replaces invalid characters with dashes", () => {
			expect(generateArticleJrn("my article!@#", "text/markdown")).toBe(expectedJrn("my-article"));
		});
		it("collapses multiple dashes", () => {
			expect(generateArticleJrn("my---article", "text/markdown")).toBe(expectedJrn("my-article"));
		});
		it("removes leading and trailing dashes", () => {
			expect(generateArticleJrn("-my-article-", "text/markdown")).toBe(expectedJrn("my-article"));
		});
	});
	describe("executeSyncUpArticleTool", () => {
		const createMockRunState = (
			commandResult: { stdout: string; stderr: string; exitCode: number; error?: string } | null,
		): RunState => {
			const mockSandbox = commandResult
				? {
						commands: {
							run: vi.fn().mockResolvedValue(commandResult),
						},
					}
				: undefined;
			return {
				cwd: "/home/user",
				env_vars: {},
				e2bsandbox: mockSandbox,
			} as unknown as RunState;
		};
		const createMockDocDao = (): DocDao =>
			({
				readDoc: vi.fn(),
				createDoc: vi.fn(),
				updateDoc: vi.fn(),
				deleteDoc: vi.fn(),
				listDocs: vi.fn(),
				deleteAllDocs: vi.fn(),
				searchDocsByTitle: vi.fn(),
			}) as unknown as DocDao;
		it("returns error when sandboxPath is missing", async () => {
			const runState = createMockRunState({ stdout: "", stderr: "", exitCode: 0 });
			const docDao = createMockDocDao();
			const result = await executeSyncUpArticleTool({ sandboxPath: "", articleName: "test" }, runState, docDao);
			expect(result).toBe("Error: sandboxPath parameter is required for sync_up_article");
		});
		it("returns error when articleName is missing", async () => {
			const runState = createMockRunState({ stdout: "", stderr: "", exitCode: 0 });
			const docDao = createMockDocDao();
			const result = await executeSyncUpArticleTool(
				{ sandboxPath: "/path/to/file.md", articleName: "" },
				runState,
				docDao,
			);
			expect(result).toBe("Error: articleName parameter is required for sync_up_article");
		});
		it("returns error when sandbox is not initialized", async () => {
			const runState = createMockRunState(null);
			const docDao = createMockDocDao();
			const result = await executeSyncUpArticleTool(
				{ sandboxPath: "/path/to/file.md", articleName: "test" },
				runState,
				docDao,
			);
			expect(result).toContain("E2B sandbox not initialized");
		});
		it("returns error when file read fails", async () => {
			const runState = createMockRunState({
				stdout: "",
				stderr: "No such file or directory",
				exitCode: 1,
			});
			const docDao = createMockDocDao();
			const result = await executeSyncUpArticleTool(
				{ sandboxPath: "/path/to/nonexistent.md", articleName: "test" },
				runState,
				docDao,
			);
			expect(result).toContain("Error syncing article");
			expect(result).toContain("No such file or directory");
		});
		it("returns default error message when file read fails with empty stderr", async () => {
			const runState = createMockRunState({
				stdout: "",
				stderr: "",
				exitCode: 1,
			});
			const docDao = createMockDocDao();
			const result = await executeSyncUpArticleTool(
				{ sandboxPath: "/path/to/nonexistent.md", articleName: "test" },
				runState,
				docDao,
			);
			expect(result).toContain("Error syncing article");
			expect(result).toContain("Failed to read file");
		});
		it("creates new article when it does not exist", async () => {
			const fileContent = "# Test Article\n\nThis is test content.";
			const runState = createMockRunState({
				stdout: fileContent,
				stderr: "",
				exitCode: 0,
			});
			const docDao = createMockDocDao();
			vi.mocked(docDao.readDoc).mockResolvedValue(undefined);
			vi.mocked(docDao.createDoc).mockResolvedValue(
				mockDoc({
					id: 1,
					jrn: expectedJrn("test"),
					content: fileContent,
					contentType: "text/markdown",
					version: 1,
					createdAt: new Date(),
					updatedAt: new Date(),
					updatedBy: "system",
					contentMetadata: { title: "Test" },
				}),
			);
			const result = await executeSyncUpArticleTool(
				{ sandboxPath: "/path/to/file.md", articleName: "test" },
				runState,
				docDao,
			);
			expect(result).toContain('Article "test" created successfully');
			expect(result).toContain(expectedJrn("test"));
			expect(docDao.createDoc).toHaveBeenCalledWith({
				jrn: expectedJrn("test"),
				content: fileContent,
				contentType: "text/markdown",
				contentMetadata: expect.objectContaining({
					sourceName: "sync_up_article",
					title: "Test",
				}),
				source: undefined,
				sourceMetadata: undefined,
				updatedBy: "system",
				spaceId: undefined,
				parentId: undefined,
				docType: "document",
				slug: "test",
				path: "",
				sortOrder: 0,
				createdBy: "system",
			});
		});
		it("updates existing article", async () => {
			const fileContent = "# Updated Article\n\nUpdated content.";
			const runState = createMockRunState({
				stdout: fileContent,
				stderr: "",
				exitCode: 0,
			});
			const docDao = createMockDocDao();
			vi.mocked(docDao.readDoc).mockResolvedValue(
				mockDoc({
					id: 1,
					jrn: expectedJrn("test"),
					content: "Old content",
					contentType: "text/markdown",
					version: 1,
					createdAt: new Date(),
					updatedAt: new Date(),
					updatedBy: "system",
				}),
			);
			vi.mocked(docDao.updateDoc).mockResolvedValue(
				mockDoc({
					id: 1,
					jrn: expectedJrn("test"),
					content: fileContent,
					contentType: "text/markdown",
					version: 2,
					createdAt: new Date(),
					updatedAt: new Date(),
					updatedBy: "system",
				}),
			);
			const result = await executeSyncUpArticleTool(
				{ sandboxPath: "/path/to/file.md", articleName: "test" },
				runState,
				docDao,
			);
			expect(result).toContain('Article "test" updated successfully');
			expect(docDao.updateDoc).toHaveBeenCalledWith(
				expect.objectContaining({
					content: fileContent,
					version: 2,
				}),
			);
		});
		it("returns error when update fails", async () => {
			const runState = createMockRunState({
				stdout: "content",
				stderr: "",
				exitCode: 0,
			});
			const docDao = createMockDocDao();
			vi.mocked(docDao.readDoc).mockResolvedValue(
				mockDoc({
					id: 1,
					jrn: expectedJrn("test"),
					content: "Old content",
					contentType: "text/markdown",
					version: 1,
					createdAt: new Date(),
					updatedAt: new Date(),
					updatedBy: "system",
				}),
			);
			vi.mocked(docDao.updateDoc).mockResolvedValue(undefined);
			const result = await executeSyncUpArticleTool(
				{ sandboxPath: "/path/to/file.md", articleName: "test" },
				runState,
				docDao,
			);
			expect(result).toBe(`Failed to update article ${expectedJrn("test")}`);
		});
		it("handles sandbox command error", async () => {
			const runState = createMockRunState({
				stdout: "",
				stderr: "",
				exitCode: 0,
				error: "Command failed",
			});
			const docDao = createMockDocDao();
			const result = await executeSyncUpArticleTool(
				{ sandboxPath: "/path/to/file.md", articleName: "test" },
				runState,
				docDao,
			);
			expect(result).toContain("Error syncing article");
			expect(result).toContain("Command failed");
		});
		it("creates JSON article with OpenAPI JSON content type", async () => {
			const fileContent = '{"openapi": "3.0.0", "info": {"title": "Test API"}}';
			const runState = createMockRunState({
				stdout: fileContent,
				stderr: "",
				exitCode: 0,
			});
			const docDao = createMockDocDao();
			vi.mocked(docDao.readDoc).mockResolvedValue(undefined);
			vi.mocked(docDao.createDoc).mockResolvedValue(
				mockDoc({
					id: 1,
					jrn: expectedJrn("test-api"),
					content: fileContent,
					contentType: "application/vnd.oai.openapi+json",
					version: 1,
					createdAt: new Date(),
					updatedAt: new Date(),
					updatedBy: "system",
					contentMetadata: { title: "Test Api" },
				}),
			);
			const result = await executeSyncUpArticleTool(
				{ sandboxPath: "/path/to/openapi.json", articleName: "test-api" },
				runState,
				docDao,
			);
			expect(result).toContain('Article "test-api" created successfully');
			expect(result).toContain(expectedJrn("test-api"));
			expect(result).toContain("application/vnd.oai.openapi+json");
			expect(docDao.createDoc).toHaveBeenCalledWith({
				jrn: expectedJrn("test-api"),
				content: fileContent,
				contentType: "application/vnd.oai.openapi+json",
				contentMetadata: expect.objectContaining({
					sourceName: "sync_up_article",
					title: "Test Api",
				}),
				source: undefined,
				sourceMetadata: undefined,
				updatedBy: "system",
				spaceId: undefined,
				parentId: undefined,
				docType: "document",
				slug: "test-api",
				path: "",
				sortOrder: 0,
				createdBy: "system",
			});
		});
		it("creates YAML article with OpenAPI YAML content type", async () => {
			const fileContent = "openapi: '3.0.0'\ninfo:\n  title: Test API";
			const runState = createMockRunState({
				stdout: fileContent,
				stderr: "",
				exitCode: 0,
			});
			const docDao = createMockDocDao();
			vi.mocked(docDao.readDoc).mockResolvedValue(undefined);
			vi.mocked(docDao.createDoc).mockResolvedValue(
				mockDoc({
					id: 1,
					jrn: expectedJrn("test-api"),
					content: fileContent,
					contentType: "application/vnd.oai.openapi",
					version: 1,
					createdAt: new Date(),
					updatedAt: new Date(),
					updatedBy: "system",
					contentMetadata: { title: "Test Api" },
				}),
			);
			const result = await executeSyncUpArticleTool(
				{ sandboxPath: "/path/to/openapi.yaml", articleName: "test-api" },
				runState,
				docDao,
			);
			expect(result).toContain('Article "test-api" created successfully');
			expect(result).toContain(expectedJrn("test-api"));
			expect(result).toContain("application/vnd.oai.openapi");
			expect(docDao.createDoc).toHaveBeenCalledWith({
				jrn: expectedJrn("test-api"),
				content: fileContent,
				contentType: "application/vnd.oai.openapi",
				contentMetadata: expect.objectContaining({
					sourceName: "sync_up_article",
					title: "Test Api",
				}),
				source: undefined,
				sourceMetadata: undefined,
				updatedBy: "system",
				spaceId: undefined,
				parentId: undefined,
				docType: "document",
				slug: "test-api",
				path: "",
				sortOrder: 0,
				createdBy: "system",
			});
		});
		it("creates YML article with OpenAPI YAML content type", async () => {
			const fileContent = "openapi: '3.0.0'\ninfo:\n  title: Test API";
			const runState = createMockRunState({
				stdout: fileContent,
				stderr: "",
				exitCode: 0,
			});
			const docDao = createMockDocDao();
			vi.mocked(docDao.readDoc).mockResolvedValue(undefined);
			vi.mocked(docDao.createDoc).mockResolvedValue(
				mockDoc({
					id: 1,
					jrn: expectedJrn("test-api"),
					content: fileContent,
					contentType: "application/vnd.oai.openapi",
					version: 1,
					createdAt: new Date(),
					updatedAt: new Date(),
					updatedBy: "system",
					contentMetadata: { title: "Test Api" },
				}),
			);
			const result = await executeSyncUpArticleTool(
				{ sandboxPath: "/path/to/openapi.yml", articleName: "test-api" },
				runState,
				docDao,
			);
			expect(result).toContain('Article "test-api" created successfully');
			expect(result).toContain(expectedJrn("test-api"));
			expect(result).toContain("application/vnd.oai.openapi");
			expect(docDao.createDoc).toHaveBeenCalledWith({
				jrn: expectedJrn("test-api"),
				content: fileContent,
				contentType: "application/vnd.oai.openapi",
				contentMetadata: expect.objectContaining({
					sourceName: "sync_up_article",
					title: "Test Api",
				}),
				source: undefined,
				sourceMetadata: undefined,
				updatedBy: "system",
				spaceId: undefined,
				parentId: undefined,
				docType: "document",
				slug: "test-api",
				path: "",
				sortOrder: 0,
				createdBy: "system",
			});
		});
	});
});
