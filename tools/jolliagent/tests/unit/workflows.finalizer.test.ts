import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Track ordering across mocks
let killed = false;
let finalizerCalled = false;

// Mock E2B Sandbox to avoid real network and to assert ordering
vi.mock("e2b", () => {
	return {
		Sandbox: {
			create: async () => ({
				// biome-ignore lint/suspicious/useAwait: mock function must be async to match interface
				kill: async () => {
					killed = true;
				},
			}),
		},
	};
});

// Mock agent factory used by workflows to inject a fake agent with a finalizer
vi.mock("src/agents/factory", () => {
	return {
		createGettingStartedGuideAgent: () => ({
			agent: {
				// Chat turn completes immediately with stub output
				chatTurn: async () => ({ assistantText: "ok", history: [] }),
				// Finalizer should be called before sandbox.kill
				finalizer: () => {
					expect(killed).toBe(false);
					finalizerCalled = true;
				},
				// biome-ignore lint/suspicious/noExplicitAny: test mock doesn't need full Agent interface
			} as any,
			withDefaults: () => ({}),
		}),
	};
});

import { runWorkflow } from "src/workflows";

describe("workflows finalizer", () => {
	beforeEach(() => {
		killed = false;
		finalizerCalled = false;
	});
	const prevAnth = process.env.ANTHROPIC_API_KEY;
	afterEach(() => {
		// Restore env to avoid affecting integration tests
		if (prevAnth === undefined) {
			delete process.env.ANTHROPIC_API_KEY;
		} else {
			process.env.ANTHROPIC_API_KEY = prevAnth;
		}
	});

	it("invokes agent.finalizer before sandbox shutdown", async () => {
		const result = await runWorkflow(
			"getting-started-guide",
			{
				e2bApiKey: "test",
				e2bTemplateId: "tmpl",
				anthropicApiKey: "key",
				debug: false,
			},
			{
				killSandbox: true,
			},
		);

		expect(result.success).toBe(true);
		expect(finalizerCalled).toBe(true);
		expect(killed).toBe(true);
	});
});
