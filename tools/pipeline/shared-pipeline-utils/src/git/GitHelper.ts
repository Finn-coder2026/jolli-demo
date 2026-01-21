/**
 * Git helper utilities.
 * Provides simple wrappers around common git operations.
 */

import { execFileSync } from "node:child_process";

/**
 * Options for git operations.
 */
export interface GitOptions {
	/** Working directory for git commands */
	cwd?: string;
}

/**
 * Execute a git command and return stdout.
 * Uses execFileSync to prevent command injection vulnerabilities.
 *
 * @param args - Git command arguments
 * @param options - Git options
 * @returns Command stdout
 * @throws Error if git command fails
 */
export function execGit(args: Array<string>, options: GitOptions = {}): string {
	const { cwd = process.cwd() } = options;

	try {
		const result = execFileSync("git", args, {
			cwd,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		return result.trim();
	} catch (error) {
		throw new Error(`Git command failed: git ${args.join(" ")}\n${error}`);
	}
}

/**
 * Check if a directory is a git repository.
 *
 * @param cwd - Directory to check
 * @returns True if directory is inside a git repository
 */
export function isGitRepo(cwd?: string): boolean {
	try {
		execGit(["rev-parse", "--git-dir"], { cwd });
		return true;
	} catch {
		return false;
	}
}

/**
 * Get the current git branch name.
 *
 * @param options - Git options
 * @returns Current branch name
 */
export function getCurrentBranch(options: GitOptions = {}): string {
	return execGit(["rev-parse", "--abbrev-ref", "HEAD"], options);
}

/**
 * Get the commit SHA for a ref.
 *
 * @param ref - Git ref (branch, tag, or SHA)
 * @param options - Git options
 * @returns Full commit SHA
 */
export function getCommitSha(ref: string, options: GitOptions = {}): string {
	return execGit(["rev-parse", ref], options);
}

/**
 * Check if a ref exists.
 *
 * @param ref - Git ref to check
 * @param options - Git options
 * @returns True if ref exists
 */
export function refExists(ref: string, options: GitOptions = {}): boolean {
	try {
		execGit(["rev-parse", "--verify", ref], options);
		return true;
	} catch {
		return false;
	}
}
