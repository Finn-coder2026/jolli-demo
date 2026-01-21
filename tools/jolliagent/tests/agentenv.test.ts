// biome-ignore lint/style/noRestrictedImports: Test file imports internal module directly for testing
import { createAgentEnvironment, createLocalGeneralAgent, type ToolPreset } from "../src/direct/agentenv";
import { describe, expect, it, vi } from "vitest";

// Mock E2B Sandbox
vi.mock("e2b", () => ({
	Sandbox: {
		create: vi.fn().mockResolvedValue({
			id: "mock-sandbox-id",
			close: vi.fn().mockResolvedValue(undefined),
		}),
	},
}));

describe("agentenv", () => {
	describe("createAgentEnvironment", () => {
		describe("tool presets", () => {
			it("should create agent with general tools", async () => {
				const env = await createAgentEnvironment({
					toolPreset: "general",
					useE2B: false,
				});

				expect(env.agent).toBeDefined();
				expect(env.runState.executorNamespace).toBe("local");
				expect(env.sandbox).toBeUndefined();
				expect(env.sandboxId).toBeUndefined();

				await env.dispose();
			});

			it("should create agent with e2b-general tools", async () => {
				const env = await createAgentEnvironment({
					toolPreset: "e2b-general",
					useE2B: true,
					e2bApiKey: "test-key",
					e2bTemplateId: "test-template",
				});

				expect(env.agent).toBeDefined();
				expect(env.runState.executorNamespace).toBe("e2b");
				expect(env.sandbox).toBeDefined();
				expect(env.sandboxId).toBe("mock-sandbox-id");

				await env.dispose();
			});

			it("should create agent with e2b-code tools (filtered subset)", async () => {
				const env = await createAgentEnvironment({
					toolPreset: "e2b-code",
					useE2B: true,
					e2bApiKey: "test-key",
					e2bTemplateId: "test-template",
				});

				expect(env.agent).toBeDefined();
				expect(env.runState.executorNamespace).toBe("e2b");

				// Verify it's a filtered subset with only read-only code tools
				const agentTools = env.agent.getTools() || [];
				const toolNames = agentTools.map(t => t.name);

				expect(toolNames).toContain("ls");
				expect(toolNames).toContain("cat");
				expect(toolNames).toContain("web_search");
				expect(toolNames).toContain("git_diff");
				expect(toolNames).toContain("git_history");
				expect(toolNames).toContain("github_checkout");

				// Should not have write tools or docs tools
				expect(toolNames).not.toContain("write_file");
				expect(toolNames).not.toContain("code2docusaurus_run");
				expect(toolNames).not.toContain("docs2docusaurus_run");

				await env.dispose();
			});

			it("should create agent with e2b-docs tools (filtered subset)", async () => {
				const env = await createAgentEnvironment({
					toolPreset: "e2b-docs",
					useE2B: true,
					e2bApiKey: "test-key",
					e2bTemplateId: "test-template",
				});

				expect(env.agent).toBeDefined();

				const agentTools = env.agent.getTools() || [];
				const toolNames = agentTools.map(t => t.name);

				expect(toolNames).toContain("ls");
				expect(toolNames).toContain("docs2docusaurus_run");
				expect(toolNames).toContain("docusaurus2vercel_run");

				// Should not have code2docusaurus
				expect(toolNames).not.toContain("code2docusaurus_run");

				await env.dispose();
			});

			it("should create agent with custom tools", async () => {
				const customTools = [
					{
						name: "custom_tool_1",
						description: "Test tool 1",
						parameters: { type: "object", properties: {} },
					},
					{
						name: "custom_tool_2",
						description: "Test tool 2",
						parameters: { type: "object", properties: {} },
					},
				];

				const env = await createAgentEnvironment({
					toolPreset: "custom",
					customTools,
					useE2B: false,
				});

				expect(env.agent).toBeDefined();

				const agentTools = env.agent.getTools() || [];
				const toolNames = agentTools.map(t => t.name);

				expect(toolNames).toEqual(["custom_tool_1", "custom_tool_2"]);

				await env.dispose();
			});

			it("should throw error for custom preset without tools", async () => {
				await expect(
					createAgentEnvironment({
						toolPreset: "custom",
						useE2B: false,
					}),
				).rejects.toThrow("Custom tool preset requires customTools");
			});

			it("should throw error for unknown preset", async () => {
				await expect(
					createAgentEnvironment({
						toolPreset: "unknown-preset" as ToolPreset,
						useE2B: false,
					}),
				).rejects.toThrow("Unknown tool preset");
			});
		});

		describe("E2B configuration", () => {
			it("should auto-enable E2B for e2b-* presets", async () => {
				const env = await createAgentEnvironment({
					toolPreset: "e2b-general",
					e2bApiKey: "test-key",
					e2bTemplateId: "test-template",
				});

				expect(env.runState.executorNamespace).toBe("e2b");
				expect(env.sandbox).toBeDefined();

				await env.dispose();
			});

			it("should throw error when E2B required but missing credentials", async () => {
				await expect(
					createAgentEnvironment({
						toolPreset: "e2b-general",
						useE2B: true,
						// Missing e2bApiKey and e2bTemplateId
					}),
				).rejects.toThrow("E2B usage requires e2bApiKey and e2bTemplateId");
			});

			it("should allow local execution for general preset", async () => {
				const env = await createAgentEnvironment({
					toolPreset: "general",
					useE2B: false,
				});

				expect(env.runState.executorNamespace).toBe("local");
				expect(env.sandbox).toBeUndefined();

				await env.dispose();
			});
		});

		describe("agent configuration", () => {
			it("should configure agent with custom model", async () => {
				const env = await createAgentEnvironment({
					toolPreset: "general",
					model: "claude-opus-4-20250514",
				});

				expect(env.agent).toBeDefined();
				const agentModel = env.agent.getModel();
				expect(agentModel).toBe("claude-opus-4-20250514");

				await env.dispose();
			});

			it("should configure agent with custom temperature", async () => {
				const env = await createAgentEnvironment({
					toolPreset: "general",
					temperature: 0.1,
				});

				expect(env.agent).toBeDefined();
				const agentTemp = env.agent.getTemperature();
				expect(agentTemp).toBe(0.1);

				await env.dispose();
			});

			it("should configure agent with system prompt", async () => {
				const systemPrompt = "You are a specialized assistant.";
				const env = await createAgentEnvironment({
					toolPreset: "general",
					systemPrompt,
				});

				expect(env.agent).toBeDefined();
				const agentPrompt = env.agent.getSystemPrompt();
				expect(agentPrompt).toBe(systemPrompt);

				await env.dispose();
			});

			it("should configure agent with environment variables", async () => {
				const envVars = { API_KEY: "secret", DEBUG: "true" };
				const env = await createAgentEnvironment({
					toolPreset: "general",
					envVars,
				});

				expect(env.runState.env_vars).toEqual(envVars);

				await env.dispose();
			});
		});

		describe("cleanup", () => {
			it("should dispose of E2B sandbox on cleanup", async () => {
				const env = await createAgentEnvironment({
					toolPreset: "e2b-general",
					useE2B: true,
					e2bApiKey: "test-key",
					e2bTemplateId: "test-template",
				});

				expect(env.sandbox).toBeDefined();

				const closeSpy = vi.spyOn(env.sandbox as unknown as { close: () => Promise<void> }, "close");

				await env.dispose();

				expect(closeSpy).toHaveBeenCalled();
			});

			it("should handle cleanup errors gracefully", async () => {
				const env = await createAgentEnvironment({
					toolPreset: "e2b-general",
					useE2B: true,
					e2bApiKey: "test-key",
					e2bTemplateId: "test-template",
				});

				// Make close throw an error
				vi.spyOn(env.sandbox as unknown as { close: () => Promise<void> }, "close").mockRejectedValue(
					new Error("Cleanup failed"),
				);

				// Should not throw
				await expect(env.dispose()).resolves.toBeUndefined();
			});

			it("should handle cleanup when no sandbox exists", async () => {
				const env = await createAgentEnvironment({
					toolPreset: "general",
					useE2B: false,
				});

				// Should not throw
				await expect(env.dispose()).resolves.toBeUndefined();
			});
		});
	});

	describe("helper functions", () => {
		it("createLocalGeneralAgent should create local agent", async () => {
			const env = await createLocalGeneralAgent();

			expect(env.agent).toBeDefined();
			expect(env.runState.executorNamespace).toBe("local");
			expect(env.sandbox).toBeUndefined();

			await env.dispose();
		});

		it("createLocalGeneralAgent should accept options", async () => {
			const env = await createLocalGeneralAgent({
				systemPrompt: "Custom prompt",
				temperature: 0.2,
			});

			expect(env.agent).toBeDefined();
			const agentPrompt = env.agent.getSystemPrompt();
			const agentTemp = env.agent.getTemperature();

			expect(agentPrompt).toBe("Custom prompt");
			expect(agentTemp).toBe(0.2);

			await env.dispose();
		});
	});
});
