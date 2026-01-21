/**
 * Tests for CoverageAssessor module.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assessCoverage } from "./CoverageAssessor.js";

describe("CoverageAssessor", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "coverage-assessor-test-"));
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	describe("assessCoverage", () => {
		it("should recommend fallback when no routes found", async () => {
			const result = await assessCoverage(tempDir, 0, "minimal", new Set());

			expect(result.routesFound).toBe(0);
			expect(result.recommendation).toBe("fallback");
			expect(result.confidence).toBe(0.1);
		});

		it("should recommend use for schema-enforced with good coverage", async () => {
			// Create some route files
			await fs.mkdir(path.join(tempDir, "routes"), { recursive: true });
			await fs.writeFile(path.join(tempDir, "routes", "user.ts"), "");
			await fs.writeFile(path.join(tempDir, "routes", "item.ts"), "");

			const filesWithRoutes = new Set([
				path.join(tempDir, "routes", "user.ts"),
				path.join(tempDir, "routes", "item.ts"),
			]);

			const result = await assessCoverage(tempDir, 6, "schema-enforced", filesWithRoutes);

			expect(result.routesFound).toBe(6);
			expect(result.recommendation).toBe("use");
			expect(result.confidence).toBeGreaterThan(0.7);
		});

		it("should recommend warn for moderate coverage", async () => {
			await fs.mkdir(path.join(tempDir, "routes"), { recursive: true });
			await fs.writeFile(path.join(tempDir, "routes", "user.ts"), "");
			await fs.writeFile(path.join(tempDir, "routes", "item.ts"), "");

			// 2 files * 3 routes/file = 6 estimated
			// 4 routes / 6 estimated = 67% - within "warn" range (40-70%) for schema-enforced
			const result = await assessCoverage(tempDir, 4, "schema-enforced", new Set());

			expect(result.recommendation).toBe("warn");
		});

		it("should report suspicious files not yielding routes", async () => {
			await fs.mkdir(path.join(tempDir, "routes"), { recursive: true });
			await fs.writeFile(path.join(tempDir, "routes", "user.ts"), "");
			await fs.writeFile(path.join(tempDir, "routes", "item.ts"), "");

			const filesWithRoutes = new Set([path.join(tempDir, "routes", "user.ts")]);

			const result = await assessCoverage(tempDir, 3, "minimal", filesWithRoutes);

			expect(result.suspiciousFiles.length).toBeGreaterThan(0);
		});

		it("should calculate percentage correctly", async () => {
			await fs.mkdir(path.join(tempDir, "routes"), { recursive: true });
			await fs.writeFile(path.join(tempDir, "routes", "api.ts"), "");

			const result = await assessCoverage(tempDir, 3, "minimal", new Set());

			expect(result.estimatedTotal).toBeGreaterThan(0);
			expect(result.percentage).toBeGreaterThan(0);
			expect(result.percentage).toBeLessThanOrEqual(100);
		});

		it("should have higher confidence for schema-enforced frameworks", async () => {
			await fs.mkdir(path.join(tempDir, "routes"), { recursive: true });
			await fs.writeFile(path.join(tempDir, "routes", "api.ts"), "");

			const schemaResult = await assessCoverage(tempDir, 5, "schema-enforced", new Set());
			const minimalResult = await assessCoverage(tempDir, 5, "minimal", new Set());

			expect(schemaResult.confidence).toBeGreaterThan(minimalResult.confidence);
		});

		it("should limit suspicious files to 10", async () => {
			await fs.mkdir(path.join(tempDir, "routes"), { recursive: true });
			for (let i = 0; i < 15; i++) {
				await fs.writeFile(path.join(tempDir, "routes", `route${i}.ts`), "");
			}

			const result = await assessCoverage(tempDir, 1, "minimal", new Set());

			expect(result.suspiciousFiles.length).toBeLessThanOrEqual(10);
		});

		it("should include reason for recommendation", async () => {
			const result = await assessCoverage(tempDir, 0, "minimal", new Set());

			expect(result.reason).toBeTruthy();
			expect(typeof result.reason).toBe("string");
		});
	});
});
