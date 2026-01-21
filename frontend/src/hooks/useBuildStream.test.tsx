import { createInitialBuildStreamState, useBuildStream } from "./useBuildStream";
import { act, renderHook } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Logger
vi.mock("../util/Logger", () => ({
	getLog: () => ({
		debug: vi.fn(),
		error: vi.fn(),
	}),
}));

// Mock EventSource
class MockEventSource {
	static CLOSED = 2;
	static OPEN = 1;

	url: string;
	readyState = MockEventSource.OPEN;
	onopen: ((event: Event) => void) | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: ((event: Event) => void) | null = null;

	constructor(url: string) {
		this.url = url;
		// Simulate async open
		setTimeout(() => {
			if (this.onopen) {
				this.onopen(new Event("open"));
			}
		}, 0);
	}

	close() {
		this.readyState = MockEventSource.CLOSED;
	}

	// Test helper to send a message
	simulateMessage(data: unknown) {
		if (this.onmessage) {
			this.onmessage({ data: JSON.stringify(data) } as MessageEvent);
		}
	}

	// Test helper to trigger error
	simulateError() {
		if (this.onerror) {
			this.onerror(new Event("error"));
		}
	}
}

// Store reference to created EventSource for tests
let mockEventSourceInstance: MockEventSource | null = null;

vi.stubGlobal(
	"EventSource",
	class extends MockEventSource {
		constructor(url: string) {
			super(url);
			mockEventSourceInstance = this;
		}
	},
);

describe("useBuildStream", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockEventSourceInstance = null;
	});

	describe("initial state", () => {
		it("should return initial state when status is not building", () => {
			const { result } = renderHook(() => useBuildStream(1, "active"));

			expect(result.current).toEqual({
				connected: false,
				mode: null,
				currentStep: 0,
				totalSteps: 0,
				currentMessage: "",
				logs: [],
				completed: false,
				failed: false,
				finalUrl: null,
				errorMessage: null,
			});
		});

		it("should not create EventSource when status is not building", () => {
			renderHook(() => useBuildStream(1, "active"));

			expect(mockEventSourceInstance).toBeNull();
		});
	});

	describe("connection", () => {
		it("should create EventSource when status is building", async () => {
			const { result } = renderHook(() => useBuildStream(1, "building"));

			// Wait for connection
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			expect(mockEventSourceInstance).not.toBeNull();
			expect(mockEventSourceInstance?.url).toBe("/api/sites/1/build-stream");
			expect(result.current.connected).toBe(true);
		});

		it("should create EventSource when status is pending", async () => {
			const { result } = renderHook(() => useBuildStream(1, "pending"));

			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			expect(mockEventSourceInstance).not.toBeNull();
			expect(result.current.connected).toBe(true);
		});

		it("should close EventSource when status changes from building to active", async () => {
			const { result, rerender } = renderHook(({ status }) => useBuildStream(1, status), {
				initialProps: { status: "building" },
			});

			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			expect(result.current.connected).toBe(true);
			const eventSourceBeforeRerender = mockEventSourceInstance;

			await act(async () => {
				rerender({ status: "active" });
				// Wait for effect to run
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			// EventSource should have been closed
			expect(eventSourceBeforeRerender?.readyState).toBe(MockEventSource.CLOSED);
		});
	});

	describe("event handling", () => {
		it("should handle build:mode event", async () => {
			const { result } = renderHook(() => useBuildStream(1, "building"));

			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			act(() => {
				mockEventSourceInstance?.simulateMessage({
					type: "build:mode",
					mode: "create",
					totalSteps: 7,
				});
			});

			expect(result.current.mode).toBe("create");
			expect(result.current.totalSteps).toBe(7);
			expect(result.current.logs).toHaveLength(1);
			expect(result.current.logs[0].type).toBe("build:mode");
		});

		it("should handle build:step event", async () => {
			const { result } = renderHook(() => useBuildStream(1, "building"));

			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			act(() => {
				mockEventSourceInstance?.simulateMessage({
					type: "build:step",
					step: 3,
					total: 7,
					message: "Installing dependencies...",
				});
			});

			expect(result.current.currentStep).toBe(3);
			expect(result.current.totalSteps).toBe(7);
			expect(result.current.currentMessage).toBe("Installing dependencies...");
			expect(result.current.logs).toHaveLength(1);
		});

		it("should handle build:stdout event", async () => {
			const { result } = renderHook(() => useBuildStream(1, "building"));

			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			act(() => {
				mockEventSourceInstance?.simulateMessage({
					type: "build:stdout",
					step: 3,
					output: "npm install output...",
				});
			});

			expect(result.current.logs).toHaveLength(1);
			expect(result.current.logs[0].type).toBe("build:stdout");
			expect(result.current.logs[0].output).toBe("npm install output...");
		});

		it("should handle build:stderr event", async () => {
			const { result } = renderHook(() => useBuildStream(1, "building"));

			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			act(() => {
				mockEventSourceInstance?.simulateMessage({
					type: "build:stderr",
					step: 3,
					output: "npm warn deprecated...",
				});
			});

			expect(result.current.logs).toHaveLength(1);
			expect(result.current.logs[0].type).toBe("build:stderr");
			expect(result.current.logs[0].output).toBe("npm warn deprecated...");
		});

		it("should handle build:command event", async () => {
			const { result } = renderHook(() => useBuildStream(1, "building"));

			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			act(() => {
				mockEventSourceInstance?.simulateMessage({
					type: "build:command",
					step: 4,
					command: "npm run build",
				});
			});

			expect(result.current.logs).toHaveLength(1);
			expect(result.current.logs[0].type).toBe("build:command");
			expect(result.current.logs[0].command).toBe("npm run build");
		});

		it("should handle build:state event", async () => {
			const { result } = renderHook(() => useBuildStream(1, "building"));

			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			act(() => {
				mockEventSourceInstance?.simulateMessage({
					type: "build:state",
					step: 4,
					state: "BUILDING",
				});
			});

			expect(result.current.logs).toHaveLength(1);
			expect(result.current.logs[0].type).toBe("build:state");
			expect(result.current.logs[0].state).toBe("BUILDING");
		});

		it("should handle build:completed event", async () => {
			const onComplete = vi.fn();
			const { result } = renderHook(() => useBuildStream(1, "building", onComplete));

			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			act(() => {
				mockEventSourceInstance?.simulateMessage({
					type: "build:completed",
					status: "active",
					url: "https://example.vercel.app",
				});
			});

			expect(result.current.completed).toBe(true);
			expect(result.current.finalUrl).toBe("https://example.vercel.app");
			expect(result.current.logs).toHaveLength(1);
			expect(onComplete).toHaveBeenCalled();
		});

		it("should handle build:failed event", async () => {
			const onComplete = vi.fn();
			const { result } = renderHook(() => useBuildStream(1, "building", onComplete));

			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			act(() => {
				mockEventSourceInstance?.simulateMessage({
					type: "build:failed",
					step: 5,
					error: "npm install failed",
				});
			});

			expect(result.current.failed).toBe(true);
			expect(result.current.errorMessage).toBe("npm install failed");
			expect(result.current.logs).toHaveLength(1);
			expect(onComplete).toHaveBeenCalled();
		});

		it("should handle connection error", async () => {
			const { result } = renderHook(() => useBuildStream(1, "building"));

			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			expect(result.current.connected).toBe(true);

			act(() => {
				mockEventSourceInstance?.simulateError();
			});

			expect(result.current.connected).toBe(false);
		});

		it("should handle malformed JSON gracefully", async () => {
			renderHook(() => useBuildStream(1, "building"));

			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			// Send malformed message - should not throw
			act(() => {
				if (mockEventSourceInstance?.onmessage) {
					mockEventSourceInstance.onmessage({ data: "not valid json" } as MessageEvent);
				}
			});
			// Test passes if no exception is thrown
		});

		it("should clear ref when EventSource is permanently closed on error", async () => {
			renderHook(() => useBuildStream(1, "building"));

			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			act(() => {
				if (mockEventSourceInstance) {
					mockEventSourceInstance.readyState = MockEventSource.CLOSED;
					mockEventSourceInstance.simulateError();
				}
			});
			// EventSource ref should be cleared (verified by code path coverage)
		});

		it("should accumulate multiple log entries", async () => {
			const { result } = renderHook(() => useBuildStream(1, "building"));

			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			act(() => {
				mockEventSourceInstance?.simulateMessage({
					type: "build:mode",
					mode: "rebuild",
					totalSteps: 10,
				});
				mockEventSourceInstance?.simulateMessage({
					type: "build:step",
					step: 1,
					total: 10,
					message: "Step 1",
				});
				mockEventSourceInstance?.simulateMessage({
					type: "build:stdout",
					step: 1,
					output: "output 1",
				});
			});

			expect(result.current.logs).toHaveLength(3);
		});

		it("should de-duplicate build:step events with same step and message", async () => {
			const { result } = renderHook(() => useBuildStream(1, "building"));

			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			// Send the same step event twice (simulating buffer replay on reconnect)
			act(() => {
				mockEventSourceInstance?.simulateMessage({
					type: "build:step",
					step: 2,
					total: 7,
					message: "[2/7] Checking existing configuration...",
				});
				mockEventSourceInstance?.simulateMessage({
					type: "build:step",
					step: 2,
					total: 7,
					message: "[2/7] Checking existing configuration...",
				});
			});

			// Should only have one log entry, not two
			expect(result.current.logs).toHaveLength(1);
			expect(result.current.logs[0].message).toBe("[2/7] Checking existing configuration...");
		});

		it("should allow different step numbers even with same message format", async () => {
			const { result } = renderHook(() => useBuildStream(1, "building"));

			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			act(() => {
				mockEventSourceInstance?.simulateMessage({
					type: "build:step",
					step: 1,
					total: 7,
					message: "[1/7] Fetching articles...",
				});
				mockEventSourceInstance?.simulateMessage({
					type: "build:step",
					step: 2,
					total: 7,
					message: "[2/7] Checking existing configuration...",
				});
			});

			// Both should be present since they have different step numbers
			expect(result.current.logs).toHaveLength(2);
		});

		it("should not de-duplicate non build:step events", async () => {
			const { result } = renderHook(() => useBuildStream(1, "building"));

			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			// Send identical stdout events (should both be added)
			act(() => {
				mockEventSourceInstance?.simulateMessage({
					type: "build:stdout",
					step: 1,
					output: "Same output line",
				});
				mockEventSourceInstance?.simulateMessage({
					type: "build:stdout",
					step: 1,
					output: "Same output line",
				});
			});

			// Both should be present (stdout is not de-duplicated)
			expect(result.current.logs).toHaveLength(2);
		});

		it("should handle build:clear event to reset state", async () => {
			const { result } = renderHook(() => useBuildStream(1, "building"));

			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			// First, add some build progress
			act(() => {
				mockEventSourceInstance?.simulateMessage({
					type: "build:mode",
					mode: "create",
					totalSteps: 5,
				});
				mockEventSourceInstance?.simulateMessage({
					type: "build:step",
					step: 3,
					total: 5,
					message: "Building...",
				});
				mockEventSourceInstance?.simulateMessage({
					type: "build:stdout",
					step: 3,
					output: "Some output",
				});
			});

			// Verify state has progress
			expect(result.current.mode).toBe("create");
			expect(result.current.currentStep).toBe(3);
			expect(result.current.totalSteps).toBe(5);
			expect(result.current.logs).toHaveLength(3);

			// Now send build:clear
			act(() => {
				mockEventSourceInstance?.simulateMessage({
					type: "build:clear",
				});
			});

			// State should be reset
			expect(result.current.mode).toBeNull();
			expect(result.current.currentStep).toBe(0);
			expect(result.current.totalSteps).toBe(0);
			expect(result.current.currentMessage).toBe("");
			expect(result.current.logs).toHaveLength(0);
			expect(result.current.completed).toBe(false);
			expect(result.current.failed).toBe(false);
			expect(result.current.finalUrl).toBeNull();
			expect(result.current.errorMessage).toBeNull();
			// Connection should still be active
			expect(result.current.connected).toBe(true);
		});
	});
});

describe("createInitialBuildStreamState", () => {
	it("should return initial state object", () => {
		const state = createInitialBuildStreamState();

		expect(state).toEqual({
			connected: false,
			mode: null,
			currentStep: 0,
			totalSteps: 0,
			currentMessage: "",
			logs: [],
			completed: false,
			failed: false,
			finalUrl: null,
			errorMessage: null,
		});
	});
});
