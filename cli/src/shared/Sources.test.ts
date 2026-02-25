import { getSourcePathStatus, loadSources, normalizeSourcePath, removeSource, setSource } from "./Sources";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

const tempDirs: Array<string> = [];

async function makeTempDir(prefix: string): Promise<string> {
	const dir = await fs.mkdtemp(path.join(tmpdir(), prefix));
	tempDirs.push(dir);
	return dir;
}

async function runGit(args: Array<string>, cwd: string): Promise<void> {
	const proc = Bun.spawn(["git", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		throw new Error(`git ${args.join(" ")} failed: ${stderr}`);
	}
}

afterEach(async () => {
	for (const dir of tempDirs.splice(0)) {
		await fs.rm(dir, { recursive: true, force: true });
	}
});

describe("Sources store", () => {
	test("loadSources returns empty default config when file is missing", async () => {
		const projectRoot = await makeTempDir("jolli-sources-");
		const sources = await loadSources(projectRoot);
		expect(sources).toEqual({ version: 1, sources: {} });
	});

	test("setSource persists source entries", async () => {
		const projectRoot = await makeTempDir("jolli-sources-");

		await setSource(projectRoot, "backend", {
			type: "git",
			path: "/tmp/backend",
			sourceId: 12,
		});

		const loaded = await loadSources(projectRoot);
		expect(loaded.sources.backend).toEqual({
			type: "git",
			path: "/tmp/backend",
			sourceId: 12,
		});
	});

	test("removeSource removes an existing source", async () => {
		const projectRoot = await makeTempDir("jolli-sources-");
		await setSource(projectRoot, "backend", {
			type: "git",
			path: "/tmp/backend",
		});

		const result = await removeSource(projectRoot, "backend");
		expect(result.removed).toBe(true);
		expect(result.config.sources.backend).toBeUndefined();
	});

	test("normalizeSourcePath resolves nested path to git root", async () => {
		const root = await makeTempDir("jolli-sources-git-");
		const repoRoot = path.join(root, "repo");
		const nested = path.join(repoRoot, "src", "auth");
		await fs.mkdir(nested, { recursive: true });
		await runGit(["init"], repoRoot);

		const resolved = await normalizeSourcePath(nested);
		expect(path.normalize(resolved)).toBe(path.normalize(await fs.realpath(repoRoot)));
	});

	test("getSourcePathStatus detects missing and non-git paths", async () => {
		const root = await makeTempDir("jolli-sources-status-");
		const missing = path.join(root, "missing");
		const nonGit = path.join(root, "not-git");
		await fs.mkdir(nonGit, { recursive: true });

		await expect(getSourcePathStatus(missing)).resolves.toBe("missing-path");
		await expect(getSourcePathStatus(nonGit)).resolves.toBe("invalid-git-root");
	});
});
