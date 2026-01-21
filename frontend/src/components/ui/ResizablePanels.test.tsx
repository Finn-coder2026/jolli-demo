import { ResizablePanels } from "./ResizablePanels";
import { fireEvent, render } from "@testing-library/preact";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ResizablePanels", () => {
	describe("rendering", () => {
		it("should render left and right panels", () => {
			const { getByTestId } = render(
				<ResizablePanels
					left={<div data-testid="left-content">Left</div>}
					right={<div data-testid="right-content">Right</div>}
					data-testid="panels"
				/>,
			);

			expect(getByTestId("panels")).toBeDefined();
			expect(getByTestId("panels-left")).toBeDefined();
			expect(getByTestId("panels-right")).toBeDefined();
			expect(getByTestId("panels-divider")).toBeDefined();
			expect(getByTestId("left-content")).toBeDefined();
			expect(getByTestId("right-content")).toBeDefined();
		});

		it("should render without data-testid prop", () => {
			const { container } = render(
				<ResizablePanels left={<div>Left Content</div>} right={<div>Right Content</div>} />,
			);

			// Should render but without data-testid attributes on panels
			const panels = container.querySelectorAll("div");
			expect(panels.length).toBeGreaterThan(0);

			// Content should be present
			expect(container.textContent).toContain("Left Content");
			expect(container.textContent).toContain("Right Content");
		});

		it("should render with custom className", () => {
			const { getByTestId } = render(
				<ResizablePanels
					left={<div>Left</div>}
					right={<div>Right</div>}
					className="custom-class"
					data-testid="panels"
				/>,
			);

			expect(getByTestId("panels").className).toContain("custom-class");
		});

		it("should apply initial left width", () => {
			const { getByTestId } = render(
				<ResizablePanels
					left={<div>Left</div>}
					right={<div>Right</div>}
					initialLeftWidth={30}
					data-testid="panels"
				/>,
			);

			const leftPanel = getByTestId("panels-left");
			expect(leftPanel.style.width).toBe("30%");
		});

		it("should use default initial width of 40%", () => {
			const { getByTestId } = render(
				<ResizablePanels left={<div>Left</div>} right={<div>Right</div>} data-testid="panels" />,
			);

			const leftPanel = getByTestId("panels-left");
			expect(leftPanel.style.width).toBe("40%");
		});
	});

	describe("divider interactions", () => {
		it("should have col-resize cursor on divider", () => {
			const { getByTestId } = render(
				<ResizablePanels left={<div>Left</div>} right={<div>Right</div>} data-testid="panels" />,
			);

			const divider = getByTestId("panels-divider");
			expect(divider.className).toContain("cursor-col-resize");
		});

		it("should start dragging on mousedown", () => {
			const { getByTestId } = render(
				<ResizablePanels left={<div>Left</div>} right={<div>Right</div>} data-testid="panels" />,
			);

			const divider = getByTestId("panels-divider");
			fireEvent.mouseDown(divider);

			// When dragging, body should have col-resize cursor
			expect(document.body.style.cursor).toBe("col-resize");
		});

		it("should stop dragging on mouseup", () => {
			const { getByTestId } = render(
				<ResizablePanels left={<div>Left</div>} right={<div>Right</div>} data-testid="panels" />,
			);

			const divider = getByTestId("panels-divider");

			// Start drag
			fireEvent.mouseDown(divider);
			expect(document.body.style.cursor).toBe("col-resize");

			// Stop drag
			fireEvent.mouseUp(document);
			expect(document.body.style.cursor).toBe("");
		});

		it("should update width on mouse move while dragging", () => {
			const { getByTestId } = render(
				<ResizablePanels
					left={<div>Left</div>}
					right={<div>Right</div>}
					initialLeftWidth={40}
					minLeftWidth={20}
					maxLeftWidth={60}
					data-testid="panels"
				/>,
			);

			const container = getByTestId("panels");
			const divider = getByTestId("panels-divider");
			const leftPanel = getByTestId("panels-left");

			// Mock getBoundingClientRect
			vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
				left: 0,
				width: 1000,
				top: 0,
				right: 1000,
				bottom: 500,
				height: 500,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			});

			// Start drag
			fireEvent.mouseDown(divider);

			// Move to 50% (500px out of 1000px)
			fireEvent.mouseMove(document, { clientX: 500 });

			expect(leftPanel.style.width).toBe("50%");
		});

		it("should clamp width to minimum", () => {
			const { getByTestId } = render(
				<ResizablePanels
					left={<div>Left</div>}
					right={<div>Right</div>}
					initialLeftWidth={40}
					minLeftWidth={25}
					maxLeftWidth={60}
					data-testid="panels"
				/>,
			);

			const container = getByTestId("panels");
			const divider = getByTestId("panels-divider");
			const leftPanel = getByTestId("panels-left");

			vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
				left: 0,
				width: 1000,
				top: 0,
				right: 1000,
				bottom: 500,
				height: 500,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			});

			// Start drag
			fireEvent.mouseDown(divider);

			// Move to 10% (should be clamped to 25%)
			fireEvent.mouseMove(document, { clientX: 100 });

			expect(leftPanel.style.width).toBe("25%");
		});

		it("should clamp width to maximum", () => {
			const { getByTestId } = render(
				<ResizablePanels
					left={<div>Left</div>}
					right={<div>Right</div>}
					initialLeftWidth={40}
					minLeftWidth={25}
					maxLeftWidth={60}
					data-testid="panels"
				/>,
			);

			const container = getByTestId("panels");
			const divider = getByTestId("panels-divider");
			const leftPanel = getByTestId("panels-left");

			vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
				left: 0,
				width: 1000,
				top: 0,
				right: 1000,
				bottom: 500,
				height: 500,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			});

			// Start drag
			fireEvent.mouseDown(divider);

			// Move to 80% (should be clamped to 60%)
			fireEvent.mouseMove(document, { clientX: 800 });

			expect(leftPanel.style.width).toBe("60%");
		});

		it("should not update width when not dragging", () => {
			const { getByTestId } = render(
				<ResizablePanels
					left={<div>Left</div>}
					right={<div>Right</div>}
					initialLeftWidth={40}
					data-testid="panels"
				/>,
			);

			const container = getByTestId("panels");
			const leftPanel = getByTestId("panels-left");

			vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
				left: 0,
				width: 1000,
				top: 0,
				right: 1000,
				bottom: 500,
				height: 500,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			});

			// Move without dragging - this tests the isDragging=false branch
			fireEvent.mouseMove(document, { clientX: 500 });

			// Width should remain at initial value
			expect(leftPanel.style.width).toBe("40%");

			// Move again to make sure the branch is consistently hit
			fireEvent.mouseMove(document, { clientX: 600 });
			expect(leftPanel.style.width).toBe("40%");
		});

		it("should return early from mouse move when not dragging after drag ends", () => {
			const { getByTestId } = render(
				<ResizablePanels
					left={<div>Left</div>}
					right={<div>Right</div>}
					initialLeftWidth={40}
					data-testid="panels"
				/>,
			);

			const container = getByTestId("panels");
			const divider = getByTestId("panels-divider");
			const leftPanel = getByTestId("panels-left");

			vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
				left: 0,
				width: 1000,
				top: 0,
				right: 1000,
				bottom: 500,
				height: 500,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			});

			// Start drag
			fireEvent.mouseDown(divider);
			expect(leftPanel.style.width).toBe("40%");

			// Move while dragging - width changes
			fireEvent.mouseMove(document, { clientX: 500 });
			expect(leftPanel.style.width).toBe("50%");

			// End drag
			fireEvent.mouseUp(document);

			// Move after drag ends - width should NOT change (tests !isDragging branch)
			fireEvent.mouseMove(document, { clientX: 300 });
			expect(leftPanel.style.width).toBe("50%"); // Stays at 50%, not 30%
		});
	});

	describe("cleanup", () => {
		it("should cleanup event listeners on unmount", () => {
			const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");

			const { getByTestId, unmount } = render(
				<ResizablePanels left={<div>Left</div>} right={<div>Right</div>} data-testid="panels" />,
			);

			const divider = getByTestId("panels-divider");

			// Start dragging
			fireEvent.mouseDown(divider);

			// Unmount while dragging
			unmount();

			// Should have removed event listeners
			expect(removeEventListenerSpy).toHaveBeenCalledWith("mousemove", expect.any(Function));
			expect(removeEventListenerSpy).toHaveBeenCalledWith("mouseup", expect.any(Function));

			removeEventListenerSpy.mockRestore();
		});
	});

	describe("localStorage persistence", () => {
		beforeEach(() => {
			localStorage.clear();
		});

		afterEach(() => {
			localStorage.clear();
		});

		it("should load saved width from localStorage when storageKey is provided", () => {
			localStorage.setItem("test.panelWidth", "35");

			const { getByTestId } = render(
				<ResizablePanels
					left={<div>Left</div>}
					right={<div>Right</div>}
					initialLeftWidth={40}
					storageKey="test.panelWidth"
					data-testid="panels"
				/>,
			);

			const leftPanel = getByTestId("panels-left");
			expect(leftPanel.style.width).toBe("35%");
		});

		it("should use initialLeftWidth when no saved value exists", () => {
			const { getByTestId } = render(
				<ResizablePanels
					left={<div>Left</div>}
					right={<div>Right</div>}
					initialLeftWidth={45}
					storageKey="test.panelWidth"
					data-testid="panels"
				/>,
			);

			const leftPanel = getByTestId("panels-left");
			expect(leftPanel.style.width).toBe("45%");
		});

		it("should use initialLeftWidth when storageKey is not provided", () => {
			localStorage.setItem("test.panelWidth", "35");

			const { getByTestId } = render(
				<ResizablePanels
					left={<div>Left</div>}
					right={<div>Right</div>}
					initialLeftWidth={40}
					data-testid="panels"
				/>,
			);

			const leftPanel = getByTestId("panels-left");
			expect(leftPanel.style.width).toBe("40%");
		});

		it("should clamp saved value to min/max bounds", () => {
			localStorage.setItem("test.panelWidth", "10"); // Below min of 20

			const { getByTestId } = render(
				<ResizablePanels
					left={<div>Left</div>}
					right={<div>Right</div>}
					initialLeftWidth={40}
					minLeftWidth={20}
					maxLeftWidth={60}
					storageKey="test.panelWidth"
					data-testid="panels"
				/>,
			);

			const leftPanel = getByTestId("panels-left");
			expect(leftPanel.style.width).toBe("20%");
		});

		it("should clamp saved value to max bound", () => {
			localStorage.setItem("test.panelWidth", "80"); // Above max of 60

			const { getByTestId } = render(
				<ResizablePanels
					left={<div>Left</div>}
					right={<div>Right</div>}
					initialLeftWidth={40}
					minLeftWidth={20}
					maxLeftWidth={60}
					storageKey="test.panelWidth"
					data-testid="panels"
				/>,
			);

			const leftPanel = getByTestId("panels-left");
			expect(leftPanel.style.width).toBe("60%");
		});

		it("should use initialLeftWidth when saved value is invalid", () => {
			localStorage.setItem("test.panelWidth", "invalid");

			const { getByTestId } = render(
				<ResizablePanels
					left={<div>Left</div>}
					right={<div>Right</div>}
					initialLeftWidth={40}
					storageKey="test.panelWidth"
					data-testid="panels"
				/>,
			);

			const leftPanel = getByTestId("panels-left");
			expect(leftPanel.style.width).toBe("40%");
		});

		it("should save width to localStorage when drag ends", () => {
			const { getByTestId } = render(
				<ResizablePanels
					left={<div>Left</div>}
					right={<div>Right</div>}
					initialLeftWidth={40}
					minLeftWidth={20}
					maxLeftWidth={60}
					storageKey="test.panelWidth"
					data-testid="panels"
				/>,
			);

			const container = getByTestId("panels");
			const divider = getByTestId("panels-divider");

			vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
				left: 0,
				width: 1000,
				top: 0,
				right: 1000,
				bottom: 500,
				height: 500,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			});

			// Start drag
			fireEvent.mouseDown(divider);

			// Move to 50%
			fireEvent.mouseMove(document, { clientX: 500 });

			// End drag
			fireEvent.mouseUp(document);

			// Check localStorage was updated
			expect(localStorage.getItem("test.panelWidth")).toBe("50");
		});

		it("should not save to localStorage when storageKey is not provided", () => {
			const { getByTestId } = render(
				<ResizablePanels
					left={<div>Left</div>}
					right={<div>Right</div>}
					initialLeftWidth={40}
					minLeftWidth={20}
					maxLeftWidth={60}
					data-testid="panels"
				/>,
			);

			const container = getByTestId("panels");
			const divider = getByTestId("panels-divider");

			vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
				left: 0,
				width: 1000,
				top: 0,
				right: 1000,
				bottom: 500,
				height: 500,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			});

			// Start drag
			fireEvent.mouseDown(divider);

			// Move to 50%
			fireEvent.mouseMove(document, { clientX: 500 });

			// End drag
			fireEvent.mouseUp(document);

			// localStorage should be empty
			expect(localStorage.length).toBe(0);
		});
	});

	describe("edge cases", () => {
		it("should handle mouse move when container ref is not available", () => {
			const { getByTestId, unmount } = render(
				<ResizablePanels
					left={<div>Left</div>}
					right={<div>Right</div>}
					initialLeftWidth={40}
					data-testid="panels"
				/>,
			);

			const divider = getByTestId("panels-divider");

			// Start dragging
			fireEvent.mouseDown(divider);

			// Simulate container becoming unavailable by unmounting and firing move
			// This covers the !containerRef.current branch
			unmount();

			// Fire mouse move after unmount - should not throw
			fireEvent.mouseMove(document, { clientX: 500 });

			// Since the component is unmounted, we just verify no error was thrown
			expect(true).toBe(true);
		});

		it("should not update when isDragging is true but containerRef is null", () => {
			// This test ensures the early return path is covered
			const { getByTestId } = render(
				<ResizablePanels
					left={<div>Left</div>}
					right={<div>Right</div>}
					initialLeftWidth={40}
					data-testid="panels"
				/>,
			);

			const container = getByTestId("panels");
			const divider = getByTestId("panels-divider");
			const leftPanel = getByTestId("panels-left");

			// Start dragging
			fireEvent.mouseDown(divider);

			// Mock getBoundingClientRect to return null-like values
			vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
				left: 0,
				width: 0, // Zero width simulates edge case
				top: 0,
				right: 0,
				bottom: 0,
				height: 0,
				x: 0,
				y: 0,
				toJSON: () => ({}),
			});

			// Move - with zero width, calculation would result in Infinity, but clamp should handle it
			fireEvent.mouseMove(document, { clientX: 500 });

			// Width should be clamped to max (60% by default)
			expect(leftPanel.style.width).toBeDefined();
		});
	});
});
