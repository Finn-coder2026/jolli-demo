import { SimpleProgressBar } from "./SimpleProgressBar";
import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";

describe("SimpleProgressBar", () => {
	describe("rendering", () => {
		it("should render progress bar at 0%", () => {
			const { lastFrame } = render(<SimpleProgressBar percent={0} />);
			expect(lastFrame()).toBeDefined();
		});

		it("should render progress bar at 100%", () => {
			const { lastFrame } = render(<SimpleProgressBar percent={1} />);
			expect(lastFrame()).toBeDefined();
		});

		it("should render progress bar at 50%", () => {
			const { lastFrame } = render(<SimpleProgressBar percent={0.5} />);
			expect(lastFrame()).toBeDefined();
		});

		it("should render progress bar at 25%", () => {
			const { lastFrame } = render(<SimpleProgressBar percent={0.25} />);
			expect(lastFrame()).toBeDefined();
		});

		it("should render progress bar at 75%", () => {
			const { lastFrame } = render(<SimpleProgressBar percent={0.75} />);
			expect(lastFrame()).toBeDefined();
		});
	});

	describe("custom columns", () => {
		it("should render with custom column width of 20", () => {
			const { lastFrame } = render(<SimpleProgressBar percent={0.5} columns={20} />);
			expect(lastFrame()).toBeDefined();
		});

		it("should render with custom column width of 10", () => {
			const { lastFrame } = render(<SimpleProgressBar percent={0.3} columns={10} />);
			expect(lastFrame()).toBeDefined();
		});

		it("should render with very small column widths", () => {
			const { lastFrame } = render(<SimpleProgressBar percent={0.5} columns={5} />);
			expect(lastFrame()).toBeDefined();
		});
	});

	describe("custom character", () => {
		it("should render with custom character '#'", () => {
			const { lastFrame } = render(<SimpleProgressBar percent={0.5} character="#" />);
			expect(lastFrame()).toBeDefined();
		});

		it("should render with custom character '='", () => {
			const { lastFrame } = render(<SimpleProgressBar percent={0.7} character="=" />);
			expect(lastFrame()).toBeDefined();
		});

		it("should render with custom character '>'", () => {
			const { lastFrame } = render(<SimpleProgressBar percent={0.3} character=">" />);
			expect(lastFrame()).toBeDefined();
		});
	});

	describe("edge cases", () => {
		it("should handle fractional percentages", () => {
			const { lastFrame } = render(<SimpleProgressBar percent={0.333} />);
			expect(lastFrame()).toBeDefined();
		});

		it("should handle very small percentages", () => {
			const { lastFrame } = render(<SimpleProgressBar percent={0.01} />);
			expect(lastFrame()).toBeDefined();
		});

		it("should handle percentages close to 1", () => {
			const { lastFrame } = render(<SimpleProgressBar percent={0.99} />);
			expect(lastFrame()).toBeDefined();
		});
	});

	describe("component lifecycle", () => {
		it("should unmount cleanly", () => {
			const { unmount } = render(<SimpleProgressBar percent={0.5} />);
			expect(() => unmount()).not.toThrow();
		});

		it("should handle multiple renders", () => {
			const { rerender } = render(<SimpleProgressBar percent={0} />);
			rerender(<SimpleProgressBar percent={0.5} />);
			rerender(<SimpleProgressBar percent={1} />);
		});
	});
});
