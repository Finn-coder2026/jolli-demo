import type { ImpactAgentOptions } from "./ImpactAgentRunner";
import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Create mock functions
const mockLoadAuthToken = vi.fn().mockResolvedValue("test-token");
const mockGenerateImpactReport = vi.fn();
const mockGenerateUncommittedReport = vi.fn();
const mockResolveBaseRef = vi.fn().mockResolvedValue("origin/main");
const mockGetFileChangesBetween = vi.fn().mockResolvedValue([]);
const mockGetUncommittedFileChanges = vi.fn().mockResolvedValue([]);

// Mock modules before importing
vi.mock("../../auth/config", () => ({
	loadAuthToken: mockLoadAuthToken,
}));

vi.mock("../../agent", () => ({
	createAgentConvoClient: vi.fn(() => ({
		createConvo: vi.fn().mockResolvedValue({ id: 1, messages: [] }),
		sendMessage: vi.fn().mockResolvedValue(undefined),
		sendToolResult: vi.fn().mockResolvedValue(undefined),
		getMercureConfig: vi.fn().mockResolvedValue({ enabled: false, hubUrl: null }),
	})),
	createMercureSubscription: vi.fn(() => ({ close: vi.fn(), isConnected: () => true })),
	createSSESubscription: vi.fn(() => ({ close: vi.fn(), isConnected: () => true })),
}));

vi.mock("./GitDiffParser", () => ({
	generateImpactReport: mockGenerateImpactReport,
	generateUncommittedReport: mockGenerateUncommittedReport,
	resolveBaseRef: mockResolveBaseRef,
	getFileChangesBetween: mockGetFileChangesBetween,
	getUncommittedFileChanges: mockGetUncommittedFileChanges,
}));

vi.mock("../AgentToolHost", () => ({
	createToolHost: vi.fn(() => ({
		execute: vi.fn().mockResolvedValue({ success: true, output: "done" }),
		getManifest: vi.fn(() => ({ tools: [] })),
		config: { workspaceRoot: "/test", allowedRoots: [], allowedTools: new Set() },
	})),
}));

// Mock findProjectRoot to return null so runImpactAgent falls back to process.cwd()
vi.mock("../../../shared/ProjectRoot", () => ({
	findProjectRoot: vi.fn().mockResolvedValue(null),
}));

describe("ImpactAgentRunner", () => {
	const testDir = "/tmp/jolli-agent-test";
	let originalCwd = process.cwd();

	beforeEach(async () => {
		originalCwd = process.cwd();
		await fs.mkdir(testDir, { recursive: true });
		const docsDir = path.join(testDir, "docs");
		await fs.mkdir(docsDir, { recursive: true });
		await fs.writeFile(
			path.join(docsDir, "default.md"),
			`---
jrn: TEST_DOC_DEFAULT
attention:
  - op: file
    path: src/default.ts
---

# Default Test Doc
`,
			"utf8",
		);
		process.chdir(testDir);
		// Reset mock implementations to defaults
		mockLoadAuthToken.mockResolvedValue("test-token");
		mockGenerateImpactReport.mockReset();
		mockGenerateUncommittedReport.mockReset();
		mockResolveBaseRef.mockReset();
		mockGetFileChangesBetween.mockReset();
		mockGetUncommittedFileChanges.mockReset();
	});

	afterEach(async () => {
		process.chdir(originalCwd);
		vi.clearAllMocks();
		try {
			await fs.rm(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe("runImpactAgent - early exits", () => {
		test("throws error when not authenticated", async () => {
			mockLoadAuthToken.mockResolvedValueOnce(null);

			const { runImpactAgent } = await import("./ImpactAgentRunner");
			const options: ImpactAgentOptions = {
				uncommitted: false,
				docsPath: "docs",
				autoConfirm: true,
				dryRun: false,
				json: false,
			};

			await expect(runImpactAgent(options)).rejects.toThrow("Not authenticated");
		});

		test("returns empty results when no changes detected", async () => {
			mockGenerateImpactReport.mockResolvedValueOnce({
				branch: "test",
				base: "main",
				commits: [],
				summary: "",
				queryText: "",
			});

			const { runImpactAgent } = await import("./ImpactAgentRunner");
			const options: ImpactAgentOptions = {
				uncommitted: false,
				docsPath: "docs",
				autoConfirm: true,
				dryRun: false,
				json: false,
			};

			const result = await runImpactAgent(options);
			expect(result.results).toHaveLength(0);
			expect(result.auditRecordId).toBe("");
		});

		test("returns empty results when no impacted docs found", async () => {
			mockGenerateImpactReport.mockResolvedValueOnce({
				branch: "test",
				base: "main",
				commits: [
					{
						sha: "abc123",
						message: "Test commit",
						author: "test@example.com",
						summary: "",
						hunks: [
							{
								file: "src/unrelated.ts",
								status: "modified",
								context: "",
								diff: "+test",
								queryText: "",
							},
						],
					},
				],
				summary: "",
				queryText: "",
			});

			// Create docs directory with no attention files
			const docsDir = path.join(testDir, "docs");
			await fs.mkdir(docsDir, { recursive: true });
			await fs.writeFile(path.join(docsDir, "test.md"), "# Test\n\nNo attention frontmatter", "utf8");

			const { runImpactAgent } = await import("./ImpactAgentRunner");
			const options: ImpactAgentOptions = {
				uncommitted: false,
				docsPath: "docs",
				autoConfirm: true,
				dryRun: false,
				json: false,
			};

			const result = await runImpactAgent(options);
			expect(result.results).toHaveLength(0);
		});
	});

	describe("runImpactAgent - dry run mode", () => {
		test("lists articles without processing in dry run mode", async () => {
			mockGenerateImpactReport.mockResolvedValueOnce({
				branch: "test",
				base: "main",
				commits: [
					{
						sha: "abc123",
						message: "Test commit",
						author: "test@example.com",
						summary: "",
						hunks: [
							{
								file: "src/auth/login.ts",
								status: "modified",
								context: "",
								diff: "+test",
								queryText: "",
							},
						],
					},
				],
				summary: "",
				queryText: "",
			});

			// Create docs directory with attention file
			const docsDir = path.join(testDir, "docs");
			await fs.mkdir(docsDir, { recursive: true });
			await fs.writeFile(
				path.join(docsDir, "auth.md"),
				`---
jrn: AUTH_DOC_001
attention:
  - op: file
    path: src/auth/**/*.ts
---

# Auth Documentation
`,
				"utf8",
			);

			const { runImpactAgent } = await import("./ImpactAgentRunner");
			const options: ImpactAgentOptions = {
				uncommitted: false,
				docsPath: "docs",
				autoConfirm: true,
				dryRun: true,
				json: false,
			};

			const result = await runImpactAgent(options);
			// In dry run mode, all articles are marked as skipped
			expect(result.results).toHaveLength(1);
			expect(result.results[0]?.status).toBe("skipped");
			expect(result.auditRecordId).toBeTruthy();
		});

		test("fails in strict mode when referenced source is unresolved", async () => {
			const docsDir = path.join(testDir, "docs");
			await fs.writeFile(
				path.join(docsDir, "backend.md"),
				`---
jrn: BACKEND_DOC_001
attention:
  - op: file
    source: backend
    path: src/auth/**/*.ts
---

# Backend Documentation
`,
				"utf8",
			);

			const { runImpactAgent } = await import("./ImpactAgentRunner");
			const options: ImpactAgentOptions = {
				uncommitted: false,
				docsPath: "docs",
				autoConfirm: true,
				dryRun: true,
				json: false,
				strict: true,
			};

			await expect(runImpactAgent(options)).rejects.toThrow("strict mode");
			expect(mockGenerateImpactReport).not.toHaveBeenCalled();
		});
	});
});
