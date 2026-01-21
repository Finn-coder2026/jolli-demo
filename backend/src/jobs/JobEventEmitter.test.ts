import { createJobEventEmitter } from "./JobEventEmitter.js";
import { describe, expect, it, vi } from "vitest";

describe("JobEventEmitter", () => {
	it("should create an event emitter", () => {
		const emitter = createJobEventEmitter();
		expect(emitter).toBeDefined();
		expect(emitter.emit).toBeDefined();
		expect(emitter.on).toBeDefined();
		expect(emitter.off).toBeDefined();
		expect(emitter.removeAllListeners).toBeDefined();
	});

	it("should emit and receive events", () => {
		const emitter = createJobEventEmitter();
		const listener = vi.fn();

		emitter.on("test-event", listener);
		emitter.emit("test-event", { message: "Hello" });

		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledWith({
			name: "test-event",
			data: { message: "Hello" },
			sourceJobId: undefined,
			timestamp: expect.any(Date),
		});
	});

	it("should emit events with source job ID", () => {
		const emitter = createJobEventEmitter();
		const listener = vi.fn();

		emitter.on("test-event", listener);
		emitter.emit("test-event", { message: "Hello" }, "job-123");

		expect(listener).toHaveBeenCalledWith({
			name: "test-event",
			data: { message: "Hello" },
			sourceJobId: "job-123",
			timestamp: expect.any(Date),
		});
	});

	it("should remove event listeners", () => {
		const emitter = createJobEventEmitter();
		const listener = vi.fn();

		emitter.on("test-event", listener);
		emitter.emit("test-event", { message: "Hello" });
		expect(listener).toHaveBeenCalledTimes(1);

		emitter.off("test-event", listener);
		emitter.emit("test-event", { message: "World" });
		expect(listener).toHaveBeenCalledTimes(1); // Still 1, not called again
	});

	it("should remove all listeners for an event", () => {
		const emitter = createJobEventEmitter();
		const listener1 = vi.fn();
		const listener2 = vi.fn();

		emitter.on("test-event", listener1);
		emitter.on("test-event", listener2);

		emitter.removeAllListeners("test-event");

		emitter.emit("test-event", { message: "Hello" });
		expect(listener1).not.toHaveBeenCalled();
		expect(listener2).not.toHaveBeenCalled();
	});
});
