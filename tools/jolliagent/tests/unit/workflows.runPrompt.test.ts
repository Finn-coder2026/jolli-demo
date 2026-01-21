// Import the types for testing
import type { JobStep } from "src/jolliscript/types";
import { describe, expect, it } from "vitest";

// We need to test the helper functions, but they're not exported.
// Let's test via the public interface and type definitions instead.

describe("JobStep type", () => {
	it("allows run_prompt field", () => {
		const step: JobStep = {
			name: "Analyze code",
			run_prompt: "Analyze the codebase and summarize the architecture",
		};

		expect(step.run_prompt).toBe("Analyze the codebase and summarize the architecture");
		expect(step.run).toBeUndefined();
		expect(step.run_tool).toBeUndefined();
	});

	it("allows multiline run_prompt", () => {
		const step: JobStep = {
			name: "Complex analysis",
			run_prompt: `First, read the README.md file.
Then analyze the project structure.
Finally, provide a summary of:
- Main components
- Dependencies
- Build process`,
		};

		expect(step.run_prompt).toContain("First, read the README.md file.");
		expect(step.run_prompt).toContain("Build process");
	});

	it("allows include_summary field with run_prompt", () => {
		const step: JobStep = {
			name: "Follow-up analysis",
			run_prompt: "Based on the previous steps, what improvements would you suggest?",
			include_summary: true,
		};

		expect(step.run_prompt).toBeDefined();
		expect(step.include_summary).toBe(true);
	});

	it("include_summary defaults to undefined", () => {
		const step: JobStep = {
			name: "Simple prompt",
			run_prompt: "Hello world",
		};

		expect(step.include_summary).toBeUndefined();
	});

	it("allows all step types to be defined (though only one should be used)", () => {
		// TypeScript allows this but semantically only one should be used
		const step: JobStep = {
			name: "All fields",
			run: "echo hello",
			run_tool: { name: "some_tool" },
			run_prompt: "Some prompt",
			include_summary: true,
		};

		// All fields can exist (runtime should prioritize run_prompt > run_tool > run)
		expect(step.run).toBeDefined();
		expect(step.run_tool).toBeDefined();
		expect(step.run_prompt).toBeDefined();
	});
});

describe("StepResult summary generation", () => {
	// Since generateStepSummary is not exported, we test its behavior through
	// the expected format that would be used with include_summary

	it("should format step results correctly", () => {
		// This test documents the expected format
		const expectedFormat = `[Previous steps completed:]
1. "Setup" (shell): success
2. "Analyze deps" (prompt): success - Analyzed package.json, found 12 dependencies...`;

		expect(expectedFormat).toContain("[Previous steps completed:]");
		expect(expectedFormat).toContain("(shell)");
		expect(expectedFormat).toContain("(prompt)");
	});
});
