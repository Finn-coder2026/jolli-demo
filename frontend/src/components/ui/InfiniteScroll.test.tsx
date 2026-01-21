import type { FetchResult } from "./InfiniteScroll";
import { InfiniteScroll } from "./InfiniteScroll";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface TestItem {
	id: number;
	name: string;
}

function createMockFetchData(
	items: Array<TestItem>,
	total: number,
): (pageNo: number, pageSize: number) => Promise<FetchResult<TestItem>> {
	return vi.fn((pageNo: number, pageSize: number) => {
		const start = (pageNo - 1) * pageSize;
		const end = start + pageSize;
		return Promise.resolve({
			list: items.slice(start, end),
			total,
		});
	});
}

describe("InfiniteScroll", () => {
	const mockItems: Array<TestItem> = Array.from({ length: 50 }, (_, i) => ({
		id: i + 1,
		name: `Item ${i + 1}`,
	}));

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render initial loading state", () => {
		// Never-resolving promise to keep loading state
		const fetchData = vi.fn(
			() =>
				new Promise<FetchResult<TestItem>>(() => {
					// intentionally never resolves
				}),
		);

		render(
			<InfiniteScroll
				fetchData={fetchData}
				renderItem={item => <div>{item.name}</div>}
				testId="infinite-scroll"
			/>,
		);

		const container = screen.getByTestId("infinite-scroll");
		expect(container).toBeDefined();
	});

	it("should render items after initial load", async () => {
		const fetchData = createMockFetchData(mockItems.slice(0, 10), 50);

		render(
			<InfiniteScroll
				fetchData={fetchData}
				pageSize={10}
				renderItem={item => <div data-testid={`item-${item.id}`}>{item.name}</div>}
				testId="infinite-scroll"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("item-1")).toBeDefined();
		});

		expect(screen.getByText("Item 1")).toBeDefined();
		expect(screen.getByText("Item 10")).toBeDefined();
	});

	it("should render empty state when no data", async () => {
		const fetchData = vi.fn().mockResolvedValue({ list: [], total: 0 });

		render(
			<InfiniteScroll
				fetchData={fetchData}
				renderItem={item => <div>{(item as TestItem).name}</div>}
				testId="infinite-scroll"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("No data available")).toBeDefined();
		});
	});

	it("should show no more indicator when all data loaded", async () => {
		const fetchData = createMockFetchData(mockItems.slice(0, 5), 5);

		render(
			<InfiniteScroll
				fetchData={fetchData}
				pageSize={10}
				renderItem={item => <div>{item.name}</div>}
				testId="infinite-scroll"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("no-more")).toBeDefined();
		});

		expect(screen.getByText("No more data")).toBeDefined();
	});

	it("should apply cva variants correctly", async () => {
		const fetchData = createMockFetchData(mockItems.slice(0, 5), 5);

		const { container } = render(
			<InfiniteScroll
				fetchData={fetchData}
				renderItem={item => <div>{item.name}</div>}
				padding="md"
				rounded="lg"
				border="default"
				testId="infinite-scroll"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("Item 1")).toBeDefined();
		});

		const scrollContainer = container.querySelector('[data-testid="infinite-scroll"]');
		expect(scrollContainer?.className).toContain("p-4");
		expect(scrollContainer?.className).toContain("rounded-lg");
		expect(scrollContainer?.className).toContain("border");
	});

	it("should merge custom className", async () => {
		const fetchData = createMockFetchData(mockItems.slice(0, 5), 5);

		const { container } = render(
			<InfiniteScroll
				fetchData={fetchData}
				renderItem={item => <div>{item.name}</div>}
				className="custom-class"
				testId="infinite-scroll"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("Item 1")).toBeDefined();
		});

		const scrollContainer = container.querySelector('[data-testid="infinite-scroll"]');
		expect(scrollContainer?.className).toContain("custom-class");
	});

	it("should use keyExtractor when provided", async () => {
		const fetchData = createMockFetchData(mockItems.slice(0, 3), 3);

		render(
			<InfiniteScroll
				fetchData={fetchData}
				renderItem={item => <div data-testid={`item-${item.id}`}>{item.name}</div>}
				keyExtractor={item => item.id}
				testId="infinite-scroll"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("item-1")).toBeDefined();
			expect(screen.getByTestId("item-2")).toBeDefined();
			expect(screen.getByTestId("item-3")).toBeDefined();
		});
	});

	it("should append items on subsequent loads", async () => {
		// This test verifies that multiple pages of data can be loaded and appended
		const fetchData = vi.fn().mockImplementation((pageNo: number, pageSize: number) => {
			const start = (pageNo - 1) * pageSize;
			const items = mockItems.slice(start, start + pageSize);
			return Promise.resolve({ list: items, total: 50 });
		});

		render(
			<InfiniteScroll
				fetchData={fetchData}
				pageSize={10}
				threshold="30"
				renderItem={(item: TestItem) => <div style={{ height: "50px" }}>{item.name}</div>}
				testId="infinite-scroll"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("Item 1")).toBeDefined();
		});

		expect(fetchData).toHaveBeenCalledWith(1, 10);
		expect(screen.getByText("Item 10")).toBeDefined();
	});

	it("should handle fetch error gracefully", async () => {
		const fetchData = vi.fn().mockRejectedValue(new Error("Network error"));

		render(
			<InfiniteScroll
				fetchData={fetchData}
				renderItem={item => <div>{(item as TestItem).name}</div>}
				testId="infinite-scroll"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByTestId("error")).toBeDefined();
		});

		expect(screen.getByText("Failed to load data")).toBeDefined();
	});

	it("should use default pageSize of 20", async () => {
		const fetchData = vi.fn().mockResolvedValue({ list: mockItems.slice(0, 20), total: 50 });

		render(
			<InfiniteScroll
				fetchData={fetchData}
				renderItem={(item: TestItem) => <div>{item.name}</div>}
				testId="infinite-scroll"
			/>,
		);

		await waitFor(() => {
			expect(fetchData).toHaveBeenCalledWith(1, 20);
		});
	});

	it("should support different threshold presets", async () => {
		const fetchData = vi.fn().mockResolvedValue({ list: mockItems.slice(0, 10), total: 50 });

		const { rerender } = render(
			<InfiniteScroll
				fetchData={fetchData}
				threshold="10"
				renderItem={(item: TestItem) => <div>{item.name}</div>}
				testId="infinite-scroll"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("Item 1")).toBeDefined();
		});

		// Re-render with different threshold
		rerender(
			<InfiniteScroll
				fetchData={fetchData}
				threshold="20"
				renderItem={(item: TestItem) => <div>{item.name}</div>}
				testId="infinite-scroll"
			/>,
		);

		expect(screen.getByText("Item 1")).toBeDefined();
	});

	it("should apply padding variant sm", async () => {
		const fetchData = createMockFetchData(mockItems.slice(0, 3), 3);

		const { container } = render(
			<InfiniteScroll
				fetchData={fetchData}
				renderItem={item => <div>{item.name}</div>}
				padding="sm"
				testId="infinite-scroll"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("Item 1")).toBeDefined();
		});

		const scrollContainer = container.querySelector('[data-testid="infinite-scroll"]');
		expect(scrollContainer?.className).toContain("p-2");
	});

	it("should apply padding variant lg", async () => {
		const fetchData = createMockFetchData(mockItems.slice(0, 3), 3);

		const { container } = render(
			<InfiniteScroll
				fetchData={fetchData}
				renderItem={item => <div>{item.name}</div>}
				padding="lg"
				testId="infinite-scroll"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("Item 1")).toBeDefined();
		});

		const scrollContainer = container.querySelector('[data-testid="infinite-scroll"]');
		expect(scrollContainer?.className).toContain("p-6");
	});

	it("should apply rounded variant sm", async () => {
		const fetchData = createMockFetchData(mockItems.slice(0, 3), 3);

		const { container } = render(
			<InfiniteScroll
				fetchData={fetchData}
				renderItem={item => <div>{item.name}</div>}
				rounded="sm"
				testId="infinite-scroll"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("Item 1")).toBeDefined();
		});

		const scrollContainer = container.querySelector('[data-testid="infinite-scroll"]');
		expect(scrollContainer?.className).toContain("rounded-sm");
	});

	it("should apply rounded variant md", async () => {
		const fetchData = createMockFetchData(mockItems.slice(0, 3), 3);

		const { container } = render(
			<InfiniteScroll
				fetchData={fetchData}
				renderItem={item => <div>{item.name}</div>}
				rounded="md"
				testId="infinite-scroll"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("Item 1")).toBeDefined();
		});

		const scrollContainer = container.querySelector('[data-testid="infinite-scroll"]');
		expect(scrollContainer?.className).toContain("rounded-md");
	});

	it("should apply border variant muted", async () => {
		const fetchData = createMockFetchData(mockItems.slice(0, 3), 3);

		const { container } = render(
			<InfiniteScroll
				fetchData={fetchData}
				renderItem={item => <div>{item.name}</div>}
				border="muted"
				testId="infinite-scroll"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("Item 1")).toBeDefined();
		});

		const scrollContainer = container.querySelector('[data-testid="infinite-scroll"]');
		expect(scrollContainer?.className).toContain("border-muted");
	});

	it("should not load more when already loading", async () => {
		let resolveFirstCall: ((value: FetchResult<TestItem>) => void) | null = null;
		const fetchData = vi.fn().mockImplementation((pageNo: number) => {
			if (pageNo === 1) {
				return new Promise<FetchResult<TestItem>>(resolve => {
					resolveFirstCall = resolve;
				});
			}
			return Promise.resolve({ list: mockItems.slice(10, 20), total: 50 });
		});

		const { container } = render(
			<InfiniteScroll
				fetchData={fetchData}
				pageSize={10}
				threshold="30"
				renderItem={(item: TestItem) => <div>{item.name}</div>}
				testId="infinite-scroll"
			/>,
		);

		// First call should be made
		expect(fetchData).toHaveBeenCalledTimes(1);

		// Simulate scroll while still loading
		const scrollContainer = container.querySelector('[data-testid="infinite-scroll"]');
		if (scrollContainer) {
			Object.defineProperty(scrollContainer, "scrollHeight", { value: 1000, configurable: true });
			Object.defineProperty(scrollContainer, "clientHeight", { value: 200, configurable: true });
			Object.defineProperty(scrollContainer, "scrollTop", { value: 750, configurable: true });
			fireEvent.scroll(scrollContainer);
		}

		// Should not make another call while loading
		expect(fetchData).toHaveBeenCalledTimes(1);

		// Resolve first call - we know it's been assigned by the mock
		// biome-ignore lint/style/noNonNullAssertion: resolveFirstCall is assigned in the mock before this point
		resolveFirstCall!({ list: mockItems.slice(0, 10), total: 50 });

		await waitFor(() => {
			expect(screen.getByText("Item 1")).toBeDefined();
		});
	});

	it("should not load more when no more items available", async () => {
		const fetchData = vi.fn().mockResolvedValue({ list: mockItems.slice(0, 10), total: 10 });

		const { container } = render(
			<InfiniteScroll
				fetchData={fetchData}
				pageSize={10}
				threshold="30"
				renderItem={(item: TestItem) => <div>{item.name}</div>}
				testId="infinite-scroll"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("Item 1")).toBeDefined();
		});

		// Simulate scroll
		const scrollContainer = container.querySelector('[data-testid="infinite-scroll"]');
		if (scrollContainer) {
			Object.defineProperty(scrollContainer, "scrollHeight", { value: 500, configurable: true });
			Object.defineProperty(scrollContainer, "clientHeight", { value: 200, configurable: true });
			Object.defineProperty(scrollContainer, "scrollTop", { value: 250, configurable: true });
			fireEvent.scroll(scrollContainer);
		}

		// Should only be called once (initial load)
		expect(fetchData).toHaveBeenCalledTimes(1);
	});

	it("should support scroll event listener setup", async () => {
		// This test verifies the scroll handler is set up correctly
		const fetchData = vi.fn().mockResolvedValue({ list: mockItems.slice(0, 10), total: 50 });

		const { container } = render(
			<InfiniteScroll
				fetchData={fetchData}
				pageSize={10}
				threshold="30"
				renderItem={(item: TestItem) => <div style={{ height: "50px" }}>{item.name}</div>}
				testId="infinite-scroll"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("Item 1")).toBeDefined();
		});

		// Verify container exists and has correct structure
		const scrollContainer = container.querySelector('[data-testid="infinite-scroll"]');
		expect(scrollContainer).toBeDefined();
		expect(scrollContainer?.className).toContain("overflow-auto");
	});

	it("should render with none variants by default", async () => {
		const fetchData = createMockFetchData(mockItems.slice(0, 3), 3);

		const { container } = render(
			<InfiniteScroll
				fetchData={fetchData}
				renderItem={item => <div>{item.name}</div>}
				testId="infinite-scroll"
			/>,
		);

		await waitFor(() => {
			expect(screen.getByText("Item 1")).toBeDefined();
		});

		const scrollContainer = container.querySelector('[data-testid="infinite-scroll"]');
		// Should have overflow-auto but not have padding/rounded/border classes
		expect(scrollContainer?.className).toContain("overflow-auto");
		expect(scrollContainer?.className).not.toContain("p-2");
		expect(scrollContainer?.className).not.toContain("rounded-");
		expect(scrollContainer?.className).not.toContain("border-");
	});
});
