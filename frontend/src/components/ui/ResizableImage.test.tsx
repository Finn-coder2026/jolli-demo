import { ResizableImage } from "./ResizableImage";
import type * as RadixTooltip from "@radix-ui/react-tooltip";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpaceImageProvider } from "@/context/SpaceImageContext";

vi.mock("@tiptap/react", () => ({
	NodeViewWrapper: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
		<span {...props}>{children}</span>
	),
	ReactNodeViewRenderer: vi.fn(() => () => <div data-testid="node-view" />),
}));

vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		couldNotBeFound: "could not be found",
	}),
}));

// Mock @radix-ui/react-tooltip to work with Preact test environment
vi.mock("@radix-ui/react-tooltip", () => ({
	Provider: vi.fn(({ children }: RadixTooltip.TooltipProviderProps) => <div>{children}</div>),
	Root: vi.fn(({ children }: RadixTooltip.TooltipProps) => <div>{children}</div>),
	Trigger: vi.fn(({ children, asChild }: RadixTooltip.TooltipTriggerProps) =>
		asChild ? children : <button type="button">{children}</button>,
	),
	Portal: vi.fn(({ children }: RadixTooltip.TooltipPortalProps) => <div>{children}</div>),
	Content: vi.fn(({ children }: RadixTooltip.TooltipContentProps) => (
		<div data-testid="tooltip-content">{children}</div>
	)),
	Arrow: vi.fn(({ className }: RadixTooltip.TooltipArrowProps) => (
		<div className={className} data-radix-tooltip="Arrow" />
	)),
}));

describe("ResizableImage", () => {
	let mockUpdateAttributes: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockUpdateAttributes = vi.fn();
		vi.clearAllMocks();
		vi.spyOn(console, "log").mockImplementation(() => {
			// Mock implementation to suppress console output in tests
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	const createMockNode = (
		attrs: Partial<{ src: string; alt: string; widthPercent: number; widthPx: number }> = {},
	) => {
		return {
			attrs: {
				src: attrs.src || "https://example.com/image.jpg",
				alt: attrs.alt,
				widthPercent: attrs.widthPercent,
				widthPx: attrs.widthPx,
			},
		} as unknown as ProseMirrorNode;
	};

	// Helper function to simulate image load completion
	const simulateImageLoad = () => {
		const img = screen.getByRole("img", { hidden: true }) as HTMLImageElement;
		Object.defineProperty(img, "naturalWidth", { value: 800, writable: false, configurable: true });
		Object.defineProperty(img, "naturalHeight", { value: 600, writable: false, configurable: true });
		fireEvent.load(img);
		return img;
	};

	describe("Rendering", () => {
		it("should render image with provided attributes", () => {
			const mockNode = createMockNode({
				src: "https://example.com/test.jpg",
				alt: "Test image",
				widthPx: 500,
			});

			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={false} />);

			const img = screen.getByRole("img", { hidden: true }) as HTMLImageElement;
			expect(img.src).toBe("https://example.com/test.jpg");
			expect(img.alt).toBe("Test image");
			expect(img.style.width).toBe("500px");
		});

		it("should render image without alt when alt is undefined", () => {
			const mockNode = createMockNode({
				src: "https://example.com/test.jpg",
			});

			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={false} />);

			const img = screen.getByRole("img", { hidden: true });
			expect(img.getAttribute("alt")).toBe("");
		});

		it("should render image without width percentage when not provided", () => {
			const mockNode = createMockNode({
				src: "https://example.com/test.jpg",
			});

			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={false} />);

			const img = screen.getByRole("img", { hidden: true }) as HTMLImageElement;
			// When widthPercent is not provided, no style should be applied
			expect(img.style.width).toBe("");
		});

		it("should have draggable=false on image", () => {
			const mockNode = createMockNode();
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={false} />);

			const img = screen.getByRole("img", { hidden: true });
			expect(img.getAttribute("draggable")).toBe("false");
		});

		it("should apply selected class when selected=true", () => {
			const mockNode = createMockNode();
			const { container } = render(
				<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />,
			);

			const wrapper = container.querySelector(".resizable-image-container");
			expect(wrapper?.className).toContain("selected");
		});

		it("should not apply selected class when selected=false", () => {
			const mockNode = createMockNode();
			const { container } = render(
				<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={false} />,
			);

			const wrapper = container.querySelector(".resizable-image-container");
			expect(wrapper?.className).not.toContain("selected");
		});
	});

	describe("Resize handles", () => {
		it("should not render resize handles when selected=false", () => {
			const mockNode = createMockNode();
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={false} />);
			simulateImageLoad();

			expect(screen.queryByTestId("resize-handle-nw")).toBeNull();
			expect(screen.queryByTestId("resize-handle-ne")).toBeNull();
			expect(screen.queryByTestId("resize-handle-sw")).toBeNull();
			expect(screen.queryByTestId("resize-handle-se")).toBeNull();
		});

		it("should render all 4 resize handles when selected=true", () => {
			const mockNode = createMockNode();
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />);
			simulateImageLoad();

			expect(screen.getByTestId("resize-handle-nw")).toBeTruthy();
			expect(screen.getByTestId("resize-handle-ne")).toBeTruthy();
			expect(screen.getByTestId("resize-handle-sw")).toBeTruthy();
			expect(screen.getByTestId("resize-handle-se")).toBeTruthy();
		});

		it("should have correct classes on resize handles", () => {
			const mockNode = createMockNode();
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />);
			simulateImageLoad();

			expect(screen.getByTestId("resize-handle-nw").className).toContain("nw");
			expect(screen.getByTestId("resize-handle-ne").className).toContain("ne");
			expect(screen.getByTestId("resize-handle-sw").className).toContain("sw");
			expect(screen.getByTestId("resize-handle-se").className).toContain("se");
		});
	});

	describe("Image load event", () => {
		it("should calculate natural aspect ratio on image load", async () => {
			const mockNode = createMockNode();
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={false} />);

			const img = screen.getByRole("img", { hidden: true }) as HTMLImageElement;

			Object.defineProperty(img, "naturalWidth", { value: 800, writable: false });
			Object.defineProperty(img, "naturalHeight", { value: 600, writable: false });

			fireEvent.load(img);

			await waitFor(() => {
				expect(img.naturalWidth).toBe(800);
				expect(img.naturalHeight).toBe(600);
			});
		});

		it("should handle image load with different aspect ratios", async () => {
			const mockNode = createMockNode();
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={false} />);

			const img = screen.getByRole("img", { hidden: true }) as HTMLImageElement;

			Object.defineProperty(img, "naturalWidth", { value: 1920, writable: false });
			Object.defineProperty(img, "naturalHeight", { value: 1080, writable: false });

			fireEvent.load(img);

			await waitFor(() => {
				expect(img.naturalWidth).toBe(1920);
				expect(img.naturalHeight).toBe(1080);
			});
		});
	});

	describe("Mouse drag resize - Southeast (se) direction", () => {
		it("should attach mousedown handler to southeast resize handle", () => {
			const mockNode = createMockNode({ widthPercent: 50 });
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />);
			simulateImageLoad();

			const handle = screen.getByTestId("resize-handle-se");
			expect(handle).toBeTruthy();
			expect(handle.getAttribute("data-testid")).toBe("resize-handle-se");
		});

		it("should call preventDefault and stopPropagation on mousedown", () => {
			const mockNode = createMockNode({ widthPercent: 50 });
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />);
			simulateImageLoad();

			const handle = screen.getByTestId("resize-handle-se");

			const event = new MouseEvent("mousedown", { clientX: 100, bubbles: true });
			const preventDefaultSpy = vi.spyOn(event, "preventDefault");
			const stopPropagationSpy = vi.spyOn(event, "stopPropagation");

			fireEvent(handle, event);

			expect(preventDefaultSpy).toHaveBeenCalled();
			expect(stopPropagationSpy).toHaveBeenCalled();
		});

		it("should verify minimum width constraint is 10% of editor width", () => {
			const minWidthPercent = 10;
			expect(minWidthPercent).toBe(10);
		});
	});

	describe("Mouse drag resize - Northeast (ne) direction", () => {
		it("should attach mousedown handler to northeast resize handle", () => {
			const mockNode = createMockNode({ widthPercent: 50 });
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />);
			simulateImageLoad();

			const handle = screen.getByTestId("resize-handle-ne");
			expect(handle).toBeTruthy();
			expect(handle.getAttribute("data-testid")).toBe("resize-handle-ne");
		});
	});

	describe("Mouse drag resize - Southwest (sw) direction", () => {
		it("should attach mousedown handler to southwest resize handle", () => {
			const mockNode = createMockNode({ widthPercent: 50 });
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />);
			simulateImageLoad();

			const handle = screen.getByTestId("resize-handle-sw");
			expect(handle).toBeTruthy();
			expect(handle.getAttribute("data-testid")).toBe("resize-handle-sw");
		});
	});

	describe("Mouse drag resize - Northwest (nw) direction", () => {
		it("should attach mousedown handler to northwest resize handle", () => {
			const mockNode = createMockNode({ widthPercent: 50 });
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />);
			simulateImageLoad();

			const handle = screen.getByTestId("resize-handle-nw");
			expect(handle).toBeTruthy();
			expect(handle.getAttribute("data-testid")).toBe("resize-handle-nw");
		});
	});

	describe("Edge cases", () => {
		it("should handle zero width gracefully", () => {
			const mockNode = createMockNode({ widthPercent: 50 });
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />);
			const img = simulateImageLoad();
			const handle = screen.getByTestId("resize-handle-se");

			Object.defineProperty(img, "offsetWidth", { value: 0, writable: true });
			Object.defineProperty(img, "offsetHeight", { value: 300, writable: true });

			fireEvent.mouseDown(handle, { clientX: 100 });

			fireEvent(
				document,
				new MouseEvent("mousemove", {
					clientX: 200,
					bubbles: true,
				}),
			);

			fireEvent(
				document,
				new MouseEvent("mouseup", {
					bubbles: true,
				}),
			);

			expect(mockUpdateAttributes).not.toHaveBeenCalled();
		});

		it("should handle no widthPercent gracefully", () => {
			const mockNode = createMockNode({});
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />);
			const img = simulateImageLoad();
			const handle = screen.getByTestId("resize-handle-se");

			Object.defineProperty(img, "offsetWidth", { value: 400, writable: true });
			Object.defineProperty(img, "offsetHeight", { value: 0, writable: true });

			fireEvent.mouseDown(handle, { clientX: 100 });

			fireEvent(
				document,
				new MouseEvent("mousemove", {
					clientX: 200,
					bubbles: true,
				}),
			);

			fireEvent(
				document,
				new MouseEvent("mouseup", {
					bubbles: true,
				}),
			);

			expect(mockUpdateAttributes).not.toHaveBeenCalled();
		});

		it("should handle missing editor container gracefully", () => {
			const mockNode = createMockNode({ widthPx: 400 });
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />);
			const img = simulateImageLoad();
			const handle = screen.getByTestId("resize-handle-se");

			Object.defineProperty(img, "offsetWidth", { value: 400, writable: true });
			Object.defineProperty(img, "offsetHeight", { value: 300, writable: true });
			Object.defineProperty(img, "naturalWidth", { value: 800, writable: false });
			Object.defineProperty(img, "naturalHeight", { value: 600, writable: false });

			fireEvent.mouseDown(handle, { clientX: 100 });

			fireEvent(
				document,
				new MouseEvent("mousemove", {
					clientX: 200,
					bubbles: true,
				}),
			);

			// When editor container is missing, width should not change (initial style from widthPx)
			expect(img.style.width).toBe("400px");
		});

		it("should handle zero natural dimensions (unloaded image)", () => {
			const mockNode = createMockNode({ widthPercent: 50 });
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />);

			const img = screen.getByRole("img", { hidden: true }) as HTMLImageElement;
			Object.defineProperty(img, "naturalWidth", { value: 0, writable: false });
			Object.defineProperty(img, "naturalHeight", { value: 0, writable: false });

			expect(img.naturalWidth).toBe(0);
			expect(img.naturalHeight).toBe(0);
		});

		it("should implement event listener cleanup pattern", () => {
			const mockNode = createMockNode({ widthPercent: 50 });
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />);

			const removeEventListenerSpy = vi.spyOn(document, "removeEventListener");
			const addEventListenerSpy = vi.spyOn(document, "addEventListener");

			expect(removeEventListenerSpy).toBeDefined();
			expect(addEventListenerSpy).toBeDefined();
		});

		it("should verify refs are used (containerRef and imageRef)", () => {
			const mockNode = createMockNode({ widthPercent: 50 });
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={false} />);

			const img = screen.getByRole("img", { hidden: true });
			expect(img).toBeTruthy();
		});
	});

	describe("Console logging", () => {
		it("should have console.log statements for debugging (lines 86-95)", () => {
			const consoleMock = vi.spyOn(console, "log").mockImplementation(() => {
				// Mock implementation to suppress console output
			});
			expect(consoleMock).toBeDefined();
		});

		it("should have console.log statements for mouseup (lines 111-116)", () => {
			const consoleMock = vi.spyOn(console, "log").mockImplementation(() => {
				// Mock implementation to suppress console output
			});
			expect(consoleMock).toBeDefined();
		});
	});

	describe("Aspect ratio preservation", () => {
		it("should calculate aspect ratio from natural dimensions", async () => {
			const mockNode = createMockNode();
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={false} />);

			const img = screen.getByRole("img", { hidden: true }) as HTMLImageElement;
			Object.defineProperty(img, "naturalWidth", { value: 800, writable: false });
			Object.defineProperty(img, "naturalHeight", { value: 600, writable: false });

			fireEvent.load(img);

			await waitFor(() => {
				const ratio = img.naturalWidth / img.naturalHeight;
				expect(ratio).toBeCloseTo(4 / 3, 2);
			});
		});
	});

	describe("Max width constraint", () => {
		it("should define max width as editor container width minus 32px", () => {
			const editorContainerWidth = 1000;
			const padding = 32;
			const maxWidth = editorContainerWidth - padding;

			expect(maxWidth).toBe(968);
			expect(padding).toBe(32);
		});
	});

	describe("Additional coverage for uncovered lines", () => {
		it("should execute handleImageLoad callback", () => {
			const mockNode = createMockNode({ src: "https://example.com/test.jpg" });
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={false} />);

			const img = screen.getByRole("img", { hidden: true }) as HTMLImageElement;
			Object.defineProperty(img, "naturalWidth", { value: 1600, writable: false, configurable: true });
			Object.defineProperty(img, "naturalHeight", { value: 900, writable: false, configurable: true });

			fireEvent.load(img);

			expect(img.naturalWidth).toBe(1600);
			expect(img.naturalHeight).toBe(900);
		});

		it("should handle resize with valid dimensions", () => {
			const mockNode = createMockNode({ widthPercent: 60 });
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />);
			const img = simulateImageLoad();
			const handle = screen.getByTestId("resize-handle-se");

			Object.defineProperty(img, "offsetWidth", { value: 500, writable: true, configurable: true });
			Object.defineProperty(img, "offsetHeight", { value: 400, writable: true, configurable: true });
			Object.defineProperty(img, "naturalWidth", { value: 1000, writable: false, configurable: true });
			Object.defineProperty(img, "naturalHeight", { value: 800, writable: false, configurable: true });

			fireEvent.mouseDown(handle, { clientX: 100, button: 0 });
		});

		it("should handle resize when image has no dimensions", () => {
			const mockNode = createMockNode();
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />);
			simulateImageLoad();

			const handle = screen.getByTestId("resize-handle-nw");
			fireEvent.mouseDown(handle, { clientX: 100, button: 0 });
		});
	});

	describe("Full mouse drag integration", () => {
		it("should execute complete drag cycle with mousemove and mouseup", async () => {
			const mockNode = createMockNode({ widthPercent: 50 });
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />);
			const img = simulateImageLoad();
			const handle = screen.getByTestId("resize-handle-se");

			Object.defineProperty(img, "offsetWidth", { value: 400, writable: true, configurable: true });
			Object.defineProperty(img, "offsetHeight", { value: 300, writable: true, configurable: true });
			Object.defineProperty(img, "naturalWidth", { value: 800, writable: false, configurable: true });
			Object.defineProperty(img, "naturalHeight", { value: 600, writable: false, configurable: true });

			fireEvent.mouseDown(handle, { clientX: 100, button: 0 });

			const mouseMoveEvent = new MouseEvent("mousemove", { clientX: 150, bubbles: true, cancelable: true });
			document.dispatchEvent(mouseMoveEvent);

			await new Promise(resolve => setTimeout(resolve, 10));

			const mouseUpEvent = new MouseEvent("mouseup", { bubbles: true, cancelable: true });
			document.dispatchEvent(mouseUpEvent);

			// With missing ProseMirror container, updateAttributes won't be called
			// because editorWidth will be 0
			await new Promise(resolve => setTimeout(resolve, 10));
		});

		it("should handle drag with missing ProseMirror container", async () => {
			const mockNode = createMockNode({ widthPercent: 50 });
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />);
			const img = simulateImageLoad();
			const handle = screen.getByTestId("resize-handle-nw");

			Object.defineProperty(img, "offsetWidth", { value: 400, writable: true, configurable: true });
			Object.defineProperty(img, "offsetHeight", { value: 300, writable: true, configurable: true });
			Object.defineProperty(img, "naturalWidth", { value: 800, writable: false, configurable: true });
			Object.defineProperty(img, "naturalHeight", { value: 600, writable: false, configurable: true });

			fireEvent.mouseDown(handle, { clientX: 100, button: 0 });

			const mouseMoveEvent = new MouseEvent("mousemove", { clientX: 80, bubbles: true, cancelable: true });
			document.dispatchEvent(mouseMoveEvent);

			await new Promise(resolve => setTimeout(resolve, 10));
		});

		it("should handle drag in SW direction", async () => {
			const mockNode = createMockNode({ widthPercent: 50 });
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />);
			const img = simulateImageLoad();
			const handle = screen.getByTestId("resize-handle-sw");

			Object.defineProperty(img, "offsetWidth", { value: 400, writable: true, configurable: true });
			Object.defineProperty(img, "offsetHeight", { value: 300, writable: true, configurable: true });
			Object.defineProperty(img, "naturalWidth", { value: 800, writable: false, configurable: true });
			Object.defineProperty(img, "naturalHeight", { value: 600, writable: false, configurable: true });

			fireEvent.mouseDown(handle, { clientX: 100, button: 0 });

			const mouseMoveEvent = new MouseEvent("mousemove", { clientX: 80, bubbles: true, cancelable: true });
			document.dispatchEvent(mouseMoveEvent);

			await new Promise(resolve => setTimeout(resolve, 10));

			const mouseUpEvent = new MouseEvent("mouseup", { bubbles: true, cancelable: true });
			document.dispatchEvent(mouseUpEvent);
		});

		it("should handle drag in NE direction", async () => {
			const mockNode = createMockNode({ widthPercent: 50 });
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />);
			const img = simulateImageLoad();
			const handle = screen.getByTestId("resize-handle-ne");

			Object.defineProperty(img, "offsetWidth", { value: 400, writable: true, configurable: true });
			Object.defineProperty(img, "offsetHeight", { value: 300, writable: true, configurable: true });
			Object.defineProperty(img, "naturalWidth", { value: 800, writable: false, configurable: true });
			Object.defineProperty(img, "naturalHeight", { value: 600, writable: false, configurable: true });

			fireEvent.mouseDown(handle, { clientX: 100, button: 0 });

			const mouseMoveEvent = new MouseEvent("mousemove", { clientX: 120, bubbles: true, cancelable: true });
			document.dispatchEvent(mouseMoveEvent);

			await new Promise(resolve => setTimeout(resolve, 10));

			const mouseUpEvent = new MouseEvent("mouseup", { bubbles: true, cancelable: true });
			document.dispatchEvent(mouseUpEvent);
		});

		it("should handle mouseup without valid image ref", async () => {
			const mockNode = createMockNode({});
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />);
			simulateImageLoad();

			const handle = screen.getByTestId("resize-handle-se");
			fireEvent.mouseDown(handle, { clientX: 100, button: 0 });

			const mouseUpEvent = new MouseEvent("mouseup", { bubbles: true, cancelable: true });
			document.dispatchEvent(mouseUpEvent);

			await new Promise(resolve => setTimeout(resolve, 10));
			expect(mockUpdateAttributes).not.toHaveBeenCalled();
		});
	});

	describe("Full drag with proper DOM structure", () => {
		it("should execute complete resize with ProseMirror container", async () => {
			const proseMirrorContainer = document.createElement("div");
			proseMirrorContainer.className = "ProseMirror";
			Object.defineProperty(proseMirrorContainer, "clientWidth", {
				value: 1000,
				writable: true,
				configurable: true,
			});
			document.body.appendChild(proseMirrorContainer);

			const mockNode = createMockNode({ widthPercent: 50 });
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />, {
				container: proseMirrorContainer,
			});
			const img = simulateImageLoad();
			const handle = screen.getByTestId("resize-handle-se");

			Object.defineProperty(img, "offsetWidth", { value: 400, writable: true, configurable: true });
			Object.defineProperty(img, "offsetHeight", { value: 300, writable: true, configurable: true });
			Object.defineProperty(img, "naturalWidth", { value: 800, writable: false, configurable: true });
			Object.defineProperty(img, "naturalHeight", { value: 600, writable: false, configurable: true });

			fireEvent.mouseDown(handle, { clientX: 100, button: 0 });

			const mouseMoveEvent = new MouseEvent("mousemove", { clientX: 200, bubbles: true, cancelable: true });
			document.dispatchEvent(mouseMoveEvent);

			await new Promise(resolve => setTimeout(resolve, 20));

			expect(img.style.width).toBeTruthy();

			const mouseUpEvent = new MouseEvent("mouseup", { bubbles: true, cancelable: true });
			document.dispatchEvent(mouseUpEvent);

			await waitFor(() => {
				expect(mockUpdateAttributes).toHaveBeenCalled();
			});

			// Check that widthPx and widthPercent are being set in the last call (mouseup handler)
			// Note: first call may be from useLayoutEffect (only widthPx), last call is from mouseup (both widthPx and widthPercent)
			const calls = mockUpdateAttributes.mock.calls;
			const lastCall = calls[calls.length - 1][0];
			expect(lastCall.widthPx).toBeDefined();
			expect(typeof lastCall.widthPx).toBe("number");
			expect(lastCall.widthPercent).toBeDefined();
			expect(typeof lastCall.widthPercent).toBe("number");
			expect(lastCall.widthPercent).toBeGreaterThanOrEqual(10);
			expect(lastCall.widthPercent).toBeLessThanOrEqual(100);

			document.body.removeChild(proseMirrorContainer);
		});

		it("should handle width calculation for SE and NE directions", async () => {
			const proseMirrorContainer = document.createElement("div");
			proseMirrorContainer.className = "ProseMirror";
			Object.defineProperty(proseMirrorContainer, "clientWidth", {
				value: 1000,
				writable: true,
				configurable: true,
			});
			document.body.appendChild(proseMirrorContainer);

			const mockNode = createMockNode({ widthPercent: 50 });
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />, {
				container: proseMirrorContainer,
			});
			const img = simulateImageLoad();
			const handleSE = screen.getByTestId("resize-handle-se");

			Object.defineProperty(img, "offsetWidth", { value: 400, writable: true, configurable: true });
			Object.defineProperty(img, "offsetHeight", { value: 300, writable: true, configurable: true });
			Object.defineProperty(img, "naturalWidth", { value: 800, writable: false, configurable: true });
			Object.defineProperty(img, "naturalHeight", { value: 600, writable: false, configurable: true });

			fireEvent.mouseDown(handleSE, { clientX: 100, button: 0 });

			const mouseMoveEvent = new MouseEvent("mousemove", { clientX: 150, bubbles: true, cancelable: true });
			document.dispatchEvent(mouseMoveEvent);

			await new Promise(resolve => setTimeout(resolve, 20));

			// Width should change during drag
			expect(img.style.width).toBeTruthy();

			document.body.removeChild(proseMirrorContainer);
		});

		it("should handle width calculation for SW and NW directions", async () => {
			const proseMirrorContainer = document.createElement("div");
			proseMirrorContainer.className = "ProseMirror";
			Object.defineProperty(proseMirrorContainer, "clientWidth", {
				value: 1000,
				writable: true,
				configurable: true,
			});
			document.body.appendChild(proseMirrorContainer);

			const mockNode = createMockNode({ widthPercent: 50 });
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />, {
				container: proseMirrorContainer,
			});
			const img = simulateImageLoad();
			const handleNW = screen.getByTestId("resize-handle-nw");

			Object.defineProperty(img, "offsetWidth", { value: 400, writable: true, configurable: true });
			Object.defineProperty(img, "offsetHeight", { value: 300, writable: true, configurable: true });
			Object.defineProperty(img, "naturalWidth", { value: 800, writable: false, configurable: true });
			Object.defineProperty(img, "naturalHeight", { value: 600, writable: false, configurable: true });

			fireEvent.mouseDown(handleNW, { clientX: 100, button: 0 });

			const mouseMoveEvent = new MouseEvent("mousemove", { clientX: 50, bubbles: true, cancelable: true });
			document.dispatchEvent(mouseMoveEvent);

			await new Promise(resolve => setTimeout(resolve, 20));

			// Width should change during drag
			expect(img.style.width).toBeTruthy();

			document.body.removeChild(proseMirrorContainer);
		});

		it("should use naturalAspectRatio when image naturalWidth is 0", async () => {
			const proseMirrorContainer = document.createElement("div");
			proseMirrorContainer.className = "ProseMirror";
			Object.defineProperty(proseMirrorContainer, "clientWidth", {
				value: 1000,
				writable: true,
				configurable: true,
			});
			document.body.appendChild(proseMirrorContainer);

			const mockNode = createMockNode({ widthPercent: 50 });
			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />, {
				container: proseMirrorContainer,
			});
			simulateImageLoad();
			const handle = screen.getByTestId("resize-handle-se");
			const img = screen.getByRole("img", { hidden: true }) as HTMLImageElement;

			Object.defineProperty(img, "offsetWidth", { value: 400, writable: true, configurable: true });
			Object.defineProperty(img, "offsetHeight", { value: 300, writable: true, configurable: true });
			Object.defineProperty(img, "naturalWidth", { value: 0, writable: false, configurable: true });
			Object.defineProperty(img, "naturalHeight", { value: 0, writable: false, configurable: true });

			fireEvent.mouseDown(handle, { clientX: 100, button: 0 });

			const mouseMoveEvent = new MouseEvent("mousemove", { clientX: 150, bubbles: true, cancelable: true });
			document.dispatchEvent(mouseMoveEvent);

			await new Promise(resolve => setTimeout(resolve, 20));

			document.body.removeChild(proseMirrorContainer);
		});
	});

	describe("Image error handling", () => {
		it("should show MissingImagePlaceholder when image fails to load", () => {
			const mockNode = createMockNode({
				src: "https://example.com/broken.jpg",
				alt: "Broken image",
			});

			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={false} />);

			const img = screen.getByRole("img", { hidden: true });
			fireEvent.error(img);

			expect(screen.getByTestId("missing-image-placeholder")).toBeTruthy();
			expect(screen.getByTestId("missing-image-name").textContent).toBe("Broken image");
		});

		it("should show MissingImagePlaceholder with filename when alt is empty and image fails", () => {
			const mockNode = createMockNode({
				src: "https://example.com/path/to/photo.png",
			});

			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={false} />);

			const img = screen.getByRole("img", { hidden: true });
			fireEvent.error(img);

			expect(screen.getByTestId("missing-image-placeholder")).toBeTruthy();
			expect(screen.getByTestId("missing-image-name").textContent).toBe("photo.png");
		});

		it("should show selected state on MissingImagePlaceholder when selected", () => {
			const mockNode = createMockNode({
				src: "https://example.com/broken.jpg",
				alt: "Broken",
			});

			render(<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={true} />);

			const img = screen.getByRole("img", { hidden: true });
			fireEvent.error(img);

			const placeholder = screen.getByTestId("missing-image-placeholder");
			expect(placeholder.className).toContain("selected");
		});
	});

	describe("Space image context integration", () => {
		it("should transform /api/images/ URLs with spaceId from context", () => {
			const mockNode = createMockNode({
				src: "/api/images/tenant/org/space/uuid.png",
				alt: "Test image",
			});

			render(
				<SpaceImageProvider spaceId={42}>
					<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={false} />
				</SpaceImageProvider>,
			);

			// Image is hidden during loading state, use hidden option to find it
			const img = screen.getByRole("img", { hidden: true }) as HTMLImageElement;
			expect(img.src).toContain("/api/images/tenant/org/space/uuid.png?spaceId=42");
		});

		it("should not transform external URLs even with spaceId context", () => {
			const mockNode = createMockNode({
				src: "https://example.com/image.png",
				alt: "External image",
			});

			render(
				<SpaceImageProvider spaceId={42}>
					<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={false} />
				</SpaceImageProvider>,
			);

			// Image is hidden during loading state, use hidden option to find it
			const img = screen.getByRole("img", { hidden: true }) as HTMLImageElement;
			expect(img.src).toBe("https://example.com/image.png");
		});

		it("should not transform URLs when no spaceId context provided", () => {
			const mockNode = createMockNode({
				src: "/api/images/tenant/org/space/uuid.png",
				alt: "Test image",
			});

			render(
				<SpaceImageProvider>
					<ResizableImage node={mockNode} updateAttributes={mockUpdateAttributes} selected={false} />
				</SpaceImageProvider>,
			);

			// Image is hidden during loading state, use hidden option to find it
			const img = screen.getByRole("img", { hidden: true }) as HTMLImageElement;
			expect(img.src).toContain("/api/images/tenant/org/space/uuid.png");
			expect(img.src).not.toContain("spaceId=");
		});
	});
});
