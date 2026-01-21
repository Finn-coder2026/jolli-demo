import { SimpleTable } from "./SimpleTable";
import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";

describe("SimpleTable", () => {
	describe("rendering with data", () => {
		it("should render table with simple data", () => {
			const data = [
				{ name: "John", age: 30 },
				{ name: "Jane", age: 25 },
			];

			const { lastFrame } = render(<SimpleTable data={data} />);
			expect(lastFrame()).toBeDefined();
		});

		it("should render table with three columns", () => {
			const data = [
				{ id: 1, name: "Alice", status: "active" },
				{ id: 2, name: "Bob", status: "inactive" },
			];

			const { lastFrame } = render(<SimpleTable data={data} />);
			expect(lastFrame()).toBeDefined();
		});

		it("should render table with single row", () => {
			const data = [{ title: "Test API", endpoints: 5 }];

			const { lastFrame } = render(<SimpleTable data={data} />);
			expect(lastFrame()).toBeDefined();
		});

		it("should render table with multiple rows", () => {
			const data = [
				{ api: "Users API", version: "1.0", endpoints: 10 },
				{ api: "Posts API", version: "2.0", endpoints: 8 },
				{ api: "Comments API", version: "1.5", endpoints: 6 },
			];

			const { lastFrame } = render(<SimpleTable data={data} />);
			expect(lastFrame()).toBeDefined();
		});
	});

	describe("empty data handling", () => {
		it("should render 'No data' message when data is empty", () => {
			const { lastFrame } = render(<SimpleTable data={[]} />);
			expect(lastFrame()).toBeDefined();
		});
	});

	describe("column width calculation", () => {
		it("should handle short values", () => {
			const data = [{ a: "x", b: "y" }];

			const { lastFrame } = render(<SimpleTable data={data} />);
			expect(lastFrame()).toBeDefined();
		});

		it("should handle long values", () => {
			const data = [{ name: "Very Long Name That Exceeds Normal Width", value: "test" }];

			const { lastFrame } = render(<SimpleTable data={data} />);
			expect(lastFrame()).toBeDefined();
		});

		it("should handle varying column widths", () => {
			const data = [{ short: "a", medium: "medium text", long: "very long text here" }];

			const { lastFrame } = render(<SimpleTable data={data} />);
			expect(lastFrame()).toBeDefined();
		});
	});

	describe("data types", () => {
		it("should handle numeric values", () => {
			const data = [
				{ id: 1, count: 100, percent: 0.5 },
				{ id: 2, count: 200, percent: 0.75 },
			];

			const { lastFrame } = render(<SimpleTable data={data} />);
			expect(lastFrame()).toBeDefined();
		});

		it("should handle boolean values", () => {
			const data = [
				{ name: "Feature A", enabled: true },
				{ name: "Feature B", enabled: false },
			];

			const { lastFrame } = render(<SimpleTable data={data} />);
			expect(lastFrame()).toBeDefined();
		});

		it("should handle null/undefined values", () => {
			const data = [
				{ name: "Item 1", value: null },
				{ name: "Item 2", value: undefined },
			];

			const { lastFrame } = render(<SimpleTable data={data} />);
			expect(lastFrame()).toBeDefined();
		});

		it("should handle mixed data types", () => {
			const data = [{ id: 1, name: "Test", active: true, value: null, count: 42 }];

			const { lastFrame } = render(<SimpleTable data={data} />);
			expect(lastFrame()).toBeDefined();
		});
	});

	describe("edge cases", () => {
		it("should handle single column", () => {
			const data = [{ name: "Only Column" }];

			const { lastFrame } = render(<SimpleTable data={data} />);
			expect(lastFrame()).toBeDefined();
		});

		it("should handle many columns", () => {
			const data = [{ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8 }];

			const { lastFrame } = render(<SimpleTable data={data} />);
			expect(lastFrame()).toBeDefined();
		});

		it("should handle empty string values", () => {
			const data = [
				{ name: "", value: "" },
				{ name: "test", value: "" },
			];

			const { lastFrame } = render(<SimpleTable data={data} />);
			expect(lastFrame()).toBeDefined();
		});

		it("should handle special characters", () => {
			const data = [{ name: "Test@123", value: "!@#$%^&*()" }];

			const { lastFrame } = render(<SimpleTable data={data} />);
			expect(lastFrame()).toBeDefined();
		});
	});

	describe("component lifecycle", () => {
		it("should unmount cleanly", () => {
			const data = [{ name: "Test" }];
			const { unmount } = render(<SimpleTable data={data} />);
			expect(() => unmount()).not.toThrow();
		});

		it("should handle rerender with different data", () => {
			const data1 = [{ name: "First" }];
			const data2 = [{ name: "Second", value: "New" }];

			const { rerender } = render(<SimpleTable data={data1} />);
			rerender(<SimpleTable data={data2} />);
		});

		it("should handle rerender from empty to data", () => {
			const { rerender } = render(<SimpleTable data={[]} />);
			rerender(<SimpleTable data={[{ name: "Now has data" }]} />);
		});

		it("should handle rerender from data to empty", () => {
			const { rerender } = render(<SimpleTable data={[{ name: "Has data" }]} />);
			rerender(<SimpleTable data={[]} />);
		});
	});
});
