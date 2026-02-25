import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findProjectRoot, requireProjectRoot } from "./ProjectRoot";

describe("ProjectRoot", () => {
	let testDir: string;

	beforeEach(() => {
		// Use realpathSync to resolve macOS /var → /private/var symlink
		const realTmp = realpathSync(tmpdir());
		testDir = join(realTmp, `jolli-project-root-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	describe("findProjectRoot", () => {
		test("returns directory containing .jolli when found", async () => {
			mkdirSync(join(testDir, ".jolli"), { recursive: true });

			const result = await findProjectRoot(testDir);
			expect(result).toBe(testDir);
		});

		test("traverses up to find .jolli in a parent directory", async () => {
			mkdirSync(join(testDir, ".jolli"), { recursive: true });
			const subDir = join(testDir, "docs", "guides");
			mkdirSync(subDir, { recursive: true });

			const result = await findProjectRoot(subDir);
			expect(result).toBe(testDir);
		});

		test("traverses multiple levels up", async () => {
			mkdirSync(join(testDir, ".jolli"), { recursive: true });
			const deepDir = join(testDir, "a", "b", "c", "d");
			mkdirSync(deepDir, { recursive: true });

			const result = await findProjectRoot(deepDir);
			expect(result).toBe(testDir);
		});

		test("returns null when no .jolli directory exists", async () => {
			// testDir has no .jolli, and traversal will eventually hit root
			const result = await findProjectRoot(testDir);
			expect(result).toBeNull();
		});

		test("stops at the nearest .jolli (does not traverse further up)", async () => {
			// Outer .jolli
			mkdirSync(join(testDir, ".jolli"), { recursive: true });
			// Inner project with its own .jolli
			const innerProject = join(testDir, "projects", "inner");
			mkdirSync(join(innerProject, ".jolli"), { recursive: true });
			const innerSub = join(innerProject, "src");
			mkdirSync(innerSub, { recursive: true });

			const result = await findProjectRoot(innerSub);
			expect(result).toBe(innerProject);
		});

		test("defaults to process.cwd() when no startDir given", async () => {
			const originalCwd = process.cwd();
			try {
				mkdirSync(join(testDir, ".jolli"), { recursive: true });
				process.chdir(testDir);

				const result = await findProjectRoot();
				expect(result).toBe(testDir);
			} finally {
				process.chdir(originalCwd);
			}
		});

		test("ignores .jolli if it is a file, not a directory", async () => {
			// Create .jolli as a file instead of directory
			await Bun.write(join(testDir, ".jolli"), "not a directory");

			const result = await findProjectRoot(testDir);
			// Should not match since .jolli is a file
			expect(result).toBeNull();
		});
	});

	describe("requireProjectRoot", () => {
		test("returns project root when .jolli exists", async () => {
			mkdirSync(join(testDir, ".jolli"), { recursive: true });

			const result = await requireProjectRoot(testDir);
			expect(result).toBe(testDir);
		});

		test("throws when no .jolli directory exists", async () => {
			await expect(requireProjectRoot(testDir)).rejects.toThrow(
				"No .jolli directory found",
			);
		});

		test("error message suggests running jolli init", async () => {
			await expect(requireProjectRoot(testDir)).rejects.toThrow(
				"jolli init",
			);
		});
	});
});
