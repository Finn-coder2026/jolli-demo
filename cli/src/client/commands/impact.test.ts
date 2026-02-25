/**
 * Impact Command Tests
 */

import { describe, expect, it } from "bun:test";
import { generateLLMPrompt } from "./impact";
import type { ImpactReport } from "./impact/Types";

describe("impact command", () => {
	describe("generateLLMPrompt", () => {
		it("generates prompt with branch info", () => {
			const report: ImpactReport = {
				branch: "feature/auth",
				base: "origin/main",
				commits: [],
				summary: "",
				queryText: "",
			};

			const prompt = generateLLMPrompt(report);

			expect(prompt).toContain("Branch: feature/auth");
			expect(prompt).toContain("Base: origin/main");
			expect(prompt).toContain("Commits: 0");
		});

		it("includes commit messages", () => {
			const report: ImpactReport = {
				branch: "fix/bug",
				base: "origin/main",
				commits: [
					{
						sha: "abc1234",
						message: "Fix login validation",
						author: "developer",
						summary: "",
						hunks: [],
					},
					{
						sha: "def5678",
						message: "Add tests",
						author: "developer",
						summary: "",
						hunks: [],
					},
				],
				summary: "",
				queryText: "",
			};

			const prompt = generateLLMPrompt(report);

			expect(prompt).toContain("abc1234: Fix login validation");
			expect(prompt).toContain("def5678: Add tests");
		});

		it("includes hunks with diff content", () => {
			const report: ImpactReport = {
				branch: "feature/x",
				base: "origin/main",
				commits: [
					{
						sha: "abc1234",
						message: "Add feature",
						author: "dev",
						summary: "",
						hunks: [
							{
								file: "src/auth/login.ts",
								status: "modified",
								context: "handleLogin",
								diff: "+  validate(input);\n   process(input);",
								queryText: "",
							},
						],
					},
				],
				summary: "",
				queryText: "",
			};

			const prompt = generateLLMPrompt(report);

			expect(prompt).toContain("Hunk 1: src/auth/login.ts");
			expect(prompt).toContain("Status: modified");
			expect(prompt).toContain("Context: handleLogin");
			expect(prompt).toContain("+  validate(input);");
		});

		it("includes instructions for queryText", () => {
			const report: ImpactReport = {
				branch: "main",
				base: "origin/main",
				commits: [],
				summary: "",
				queryText: "",
			};

			const prompt = generateLLMPrompt(report);

			expect(prompt).toContain("queryText");
			expect(prompt).toContain("BM25+vector");
			expect(prompt).toContain("architecture");
		});

		it("handles multiple hunks per commit", () => {
			const report: ImpactReport = {
				branch: "refactor",
				base: "origin/main",
				commits: [
					{
						sha: "abc1234",
						message: "Refactor auth",
						author: "dev",
						summary: "",
						hunks: [
							{
								file: "src/auth.ts",
								status: "modified",
								context: "login",
								diff: "-old\n+new",
								queryText: "",
							},
							{
								file: "src/auth.ts",
								status: "modified",
								context: "logout",
								diff: "-oldLogout\n+newLogout",
								queryText: "",
							},
							{
								file: "src/config.ts",
								status: "added",
								context: "",
								diff: "+export const config = {};",
								queryText: "",
							},
						],
					},
				],
				summary: "",
				queryText: "",
			};

			const prompt = generateLLMPrompt(report);

			expect(prompt).toContain("Hunk 1: src/auth.ts");
			expect(prompt).toContain("Hunk 2: src/auth.ts");
			expect(prompt).toContain("Hunk 3: src/config.ts");
			expect(prompt).toContain("Context: login");
			expect(prompt).toContain("Context: logout");
			expect(prompt).toContain("Context: (none)");
		});
	});
});
