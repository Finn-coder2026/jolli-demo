import { createQueue } from "./Queue";
import { describe, expect, test, vi } from "vitest";

describe("Queue", () => {
	test("should create queue and add items", () => {
		const processor = vi.fn(async () => {
			// Empty processor
		});
		const queue = createQueue(1, processor);

		expect(queue).toHaveProperty("add");
		expect(queue).toHaveProperty("close");
		expect(typeof queue.add).toBe("function");
		expect(typeof queue.close).toBe("function");

		// Should not throw when adding items
		expect(() => queue.add(1)).not.toThrow();
		expect(() => queue.add(2)).not.toThrow();
	});

	test("should handle empty queue close", async () => {
		const processor = vi.fn(async () => {
			// Empty processor
		});
		const queue = createQueue(1, processor);

		await queue.close();
		expect(processor).not.toHaveBeenCalled();
	});

	test("should process single item", async () => {
		const processed: Array<number> = [];
		const processor = vi.fn(async (item: number) => {
			await Promise.resolve(); // Satisfy async requirement
			processed.push(item);
		});

		const queue = createQueue(1, processor);
		queue.add(42);

		await queue.close();

		expect(processor).toHaveBeenCalledWith(42);
		expect(processed).toEqual([42]);
	});

	test("should call processor function", async () => {
		const processor = vi.fn(async () => {
			// Simple processor
		});

		const queue = createQueue(1, processor);
		queue.add(1);

		await queue.close();

		expect(processor).toHaveBeenCalledWith(1);
	});

	test("should create queue with different concurrency values", () => {
		const processor = vi.fn(async () => {
			// Empty processor
		});

		expect(() => createQueue(1, processor)).not.toThrow();
		expect(() => createQueue(5, processor)).not.toThrow();
	});

	test("should wait for processing to complete in close()", async () => {
		let resolveProcessor: (() => void) | undefined;
		const processorPromise = new Promise<void>(resolve => {
			resolveProcessor = resolve;
		});

		const processor = vi.fn(async () => {
			await processorPromise;
		});

		const queue = createQueue(1, processor);
		queue.add(1);

		// Start close but don't await yet
		const closePromise = queue.close();

		// Processor should have been called but close should still be waiting
		expect(processor).toHaveBeenCalledWith(1);

		// Now resolve the processor to let close complete
		if (resolveProcessor) {
			resolveProcessor();
		}
		await closePromise;
	});

	test("should handle multiple items with close()", async () => {
		const processed: Array<number> = [];
		const processor = vi.fn(async (item: number) => {
			await Promise.resolve(); // Satisfy async requirement
			processed.push(item);
		});

		const queue = createQueue(2, processor);
		queue.add(1);
		queue.add(2);
		queue.add(3);

		await queue.close();

		expect(processed).toEqual([1, 2, 3]);
		expect(processor).toHaveBeenCalledTimes(3);
	});
});
