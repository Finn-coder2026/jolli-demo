/**
 * Tests for GitHelper utilities.
 */

import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execGit, getCommitSha, getCurrentBranch, isGitRepo, refExists } from "./GitHelper.js";

vi.mock("node:child_process", () => ({
	execFileSync: vi.fn(),
}));

const mockExecFileSync = vi.mocked(execFileSync);

describe("GitHelper", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("execGit", () => {
		it("executes git command with arguments as array", () => {
			mockExecFileSync.mockReturnValue("command output\n");

			const result = execGit(["status", "--short"]);

			expect(mockExecFileSync).toHaveBeenCalledWith("git", ["status", "--short"], {
				cwd: process.cwd(),
				encoding: "utf-8",
				stdio: ["pipe", "pipe", "pipe"],
			});
			expect(result).toBe("command output");
		});

		it("uses custom cwd when provided", () => {
			mockExecFileSync.mockReturnValue("output");

			execGit(["log"], { cwd: "/custom/path" });

			expect(mockExecFileSync).toHaveBeenCalledWith(
				"git",
				["log"],
				expect.objectContaining({ cwd: "/custom/path" }),
			);
		});

		it("trims whitespace from output", () => {
			mockExecFileSync.mockReturnValue("  trimmed  \n");

			const result = execGit(["rev-parse", "HEAD"]);

			expect(result).toBe("trimmed");
		});

		it("throws error when git command fails", () => {
			const gitError = new Error("git command failed");
			mockExecFileSync.mockImplementation(() => {
				throw gitError;
			});

			expect(() => execGit(["invalid-command"])).toThrow("Git command failed: git invalid-command");
		});

		it("prevents command injection by using execFileSync", () => {
			mockExecFileSync.mockReturnValue("safe");

			// This malicious input would be dangerous with execSync + string concat
			// but is safe with execFileSync since args are passed as array
			execGit(["status", "; rm -rf /"]);

			// Verify the malicious string is passed as a single argument, not interpreted
			expect(mockExecFileSync).toHaveBeenCalledWith(
				"git",
				["status", "; rm -rf /"],
				expect.any(Object),
			);
		});
	});

	describe("isGitRepo", () => {
		it("returns true when directory is a git repository", () => {
			mockExecFileSync.mockReturnValue(".git");

			const result = isGitRepo("/some/path");

			expect(result).toBe(true);
			expect(mockExecFileSync).toHaveBeenCalledWith(
				"git",
				["rev-parse", "--git-dir"],
				expect.objectContaining({ cwd: "/some/path" }),
			);
		});

		it("returns false when directory is not a git repository", () => {
			mockExecFileSync.mockImplementation(() => {
				throw new Error("not a git repo");
			});

			const result = isGitRepo("/not/a/repo");

			expect(result).toBe(false);
		});

		it("uses process.cwd() when no cwd provided", () => {
			mockExecFileSync.mockReturnValue(".git");

			isGitRepo();

			expect(mockExecFileSync).toHaveBeenCalledWith(
				"git",
				["rev-parse", "--git-dir"],
				expect.objectContaining({ cwd: process.cwd() }),
			);
		});
	});

	describe("getCurrentBranch", () => {
		it("returns current branch name", () => {
			mockExecFileSync.mockReturnValue("main\n");

			const result = getCurrentBranch();

			expect(result).toBe("main");
			expect(mockExecFileSync).toHaveBeenCalledWith(
				"git",
				["rev-parse", "--abbrev-ref", "HEAD"],
				expect.any(Object),
			);
		});

		it("uses custom cwd when provided", () => {
			mockExecFileSync.mockReturnValue("feature-branch");

			getCurrentBranch({ cwd: "/my/repo" });

			expect(mockExecFileSync).toHaveBeenCalledWith(
				"git",
				["rev-parse", "--abbrev-ref", "HEAD"],
				expect.objectContaining({ cwd: "/my/repo" }),
			);
		});
	});

	describe("getCommitSha", () => {
		it("returns full commit SHA for a ref", () => {
			const sha = "abc123def456789";
			mockExecFileSync.mockReturnValue(`${sha}\n`);

			const result = getCommitSha("HEAD");

			expect(result).toBe(sha);
			expect(mockExecFileSync).toHaveBeenCalledWith("git", ["rev-parse", "HEAD"], expect.any(Object));
		});

		it("works with branch names", () => {
			mockExecFileSync.mockReturnValue("sha123");

			const result = getCommitSha("main");

			expect(result).toBe("sha123");
			expect(mockExecFileSync).toHaveBeenCalledWith("git", ["rev-parse", "main"], expect.any(Object));
		});

		it("uses custom cwd when provided", () => {
			mockExecFileSync.mockReturnValue("sha456");

			getCommitSha("HEAD~1", { cwd: "/other/repo" });

			expect(mockExecFileSync).toHaveBeenCalledWith(
				"git",
				["rev-parse", "HEAD~1"],
				expect.objectContaining({ cwd: "/other/repo" }),
			);
		});
	});

	describe("refExists", () => {
		it("returns true when ref exists", () => {
			mockExecFileSync.mockReturnValue("sha123");

			const result = refExists("main");

			expect(result).toBe(true);
			expect(mockExecFileSync).toHaveBeenCalledWith(
				"git",
				["rev-parse", "--verify", "main"],
				expect.any(Object),
			);
		});

		it("returns false when ref does not exist", () => {
			mockExecFileSync.mockImplementation(() => {
				throw new Error("unknown revision");
			});

			const result = refExists("nonexistent-branch");

			expect(result).toBe(false);
		});

		it("uses custom cwd when provided", () => {
			mockExecFileSync.mockReturnValue("sha");

			refExists("v1.0.0", { cwd: "/tagged/repo" });

			expect(mockExecFileSync).toHaveBeenCalledWith(
				"git",
				["rev-parse", "--verify", "v1.0.0"],
				expect.objectContaining({ cwd: "/tagged/repo" }),
			);
		});
	});
});
