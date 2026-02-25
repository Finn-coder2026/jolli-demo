import { extractImageNameFromUrl, MissingImagePlaceholder } from "./MissingImagePlaceholder";
import type * as RadixTooltip from "@radix-ui/react-tooltip";
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		couldNotBeFound: "could not be found",
	}),
}));

// Mock @radix-ui/react-tooltip to work with Preact test environment
vi.mock("@radix-ui/react-tooltip", () => ({
	Provider: vi.fn(({ children }: RadixTooltip.TooltipProviderProps) => <div>{children}</div>),
	Root: vi.fn(({ children, open }: RadixTooltip.TooltipProps) => <div data-tooltip-open={open}>{children}</div>),
	Trigger: vi.fn(({ children, asChild, onMouseEnter, onMouseLeave }: RadixTooltip.TooltipTriggerProps) =>
		asChild ? (
			<span onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
				{children}
			</span>
		) : (
			<button type="button" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
				{children}
			</button>
		),
	),
	Portal: vi.fn(({ children }: RadixTooltip.TooltipPortalProps) => <div>{children}</div>),
	Content: vi.fn(({ children }: RadixTooltip.TooltipContentProps) => (
		<div data-testid="tooltip-content">{children}</div>
	)),
	Arrow: vi.fn(({ className }: RadixTooltip.TooltipArrowProps) => (
		<div className={className} data-radix-tooltip="Arrow" />
	)),
}));

describe("extractImageNameFromUrl", () => {
	it("should extract filename from simple path", () => {
		expect(extractImageNameFromUrl("/api/images/test.png")).toBe("test.png");
	});

	it("should extract filename from full URL", () => {
		expect(extractImageNameFromUrl("https://example.com/api/images/photo.jpg")).toBe("photo.jpg");
	});

	it("should extract filename from path with multiple segments", () => {
		expect(extractImageNameFromUrl("/api/images/tenant/org/_default/image.gif")).toBe("image.gif");
	});

	it("should return original URL when no segments", () => {
		expect(extractImageNameFromUrl("")).toBe("");
	});

	it("should handle URL with no path", () => {
		// When path is "/", last segment after split is empty, so returns "/" (original URL)
		expect(extractImageNameFromUrl("/")).toBe("/");
	});

	it("should handle malformed URL gracefully", () => {
		expect(extractImageNameFromUrl("not-a-url/but/has/slashes/file.png")).toBe("file.png");
	});
});

describe("MissingImagePlaceholder", () => {
	it("should render with image name", () => {
		render(<MissingImagePlaceholder imageName="test.png" />);

		expect(screen.getByTestId("missing-image-placeholder")).toBeTruthy();
		expect(screen.getByTestId("missing-image-name").textContent).toBe("test.png");
	});

	it("should apply selected class when selected is true", () => {
		render(<MissingImagePlaceholder imageName="test.png" selected={true} />);

		const placeholder = screen.getByTestId("missing-image-placeholder");
		expect(placeholder.className).toContain("selected");
	});

	it("should not apply selected class when selected is false", () => {
		render(<MissingImagePlaceholder imageName="test.png" selected={false} />);

		const placeholder = screen.getByTestId("missing-image-placeholder");
		expect(placeholder.className).not.toContain("selected");
	});

	it("should apply custom className", () => {
		render(<MissingImagePlaceholder imageName="test.png" className="custom-class" />);

		const placeholder = screen.getByTestId("missing-image-placeholder");
		expect(placeholder.className).toContain("custom-class");
	});

	it("should show tooltip content with image name and message", () => {
		render(<MissingImagePlaceholder imageName="test.png" />);

		// Tooltip content is always rendered in mock
		expect(screen.getByTestId("missing-image-tooltip")).toBeTruthy();
		expect(screen.getByTestId("missing-image-tooltip").textContent).toContain("test.png");
		expect(screen.getByTestId("missing-image-tooltip").textContent).toContain("could not be found");
	});

	it("should have mouse event handlers on trigger", () => {
		render(<MissingImagePlaceholder imageName="test.png" />);

		const trigger = screen.getByTestId("missing-image-name").parentElement?.parentElement;
		expect(trigger).toBeTruthy();

		// Verify mouse events can be triggered without errors
		if (trigger) {
			fireEvent.mouseEnter(trigger);
			fireEvent.mouseLeave(trigger);
		}
	});

	it("should render bracket notation around image name", () => {
		const { container } = render(<MissingImagePlaceholder imageName="photo.jpg" />);

		const text = container.textContent;
		expect(text).toContain("![[");
		expect(text).toContain("photo.jpg");
		expect(text).toContain("]]");
	});

	it("should handle tooltip open/close state", () => {
		render(<MissingImagePlaceholder imageName="test.png" />);

		const trigger = screen.getByTestId("missing-image-name").parentElement?.parentElement;
		expect(trigger).toBeTruthy();

		if (trigger) {
			// Trigger mouseEnter to open tooltip
			fireEvent.mouseEnter(trigger);
			// Trigger mouseLeave to close tooltip
			fireEvent.mouseLeave(trigger);
		}
	});

	it("should apply empty string className when className is not provided", () => {
		render(<MissingImagePlaceholder imageName="test.png" />);

		const placeholder = screen.getByTestId("missing-image-placeholder");
		// When className is undefined, it should add an empty string to className
		expect(placeholder.className).toContain("missing-image-placeholder");
	});

	it("should use default selected=false when not specified", () => {
		render(<MissingImagePlaceholder imageName="test.png" />);

		const placeholder = screen.getByTestId("missing-image-placeholder");
		expect(placeholder.className).not.toContain("selected");
	});

	it("should extract filename from URL with trailing slash", () => {
		// When URL ends with /, the last segment after split is empty, fallback returns original URL
		expect(extractImageNameFromUrl("/api/images/")).toBe("/api/images/");
	});

	it("should handle URL with only filename", () => {
		expect(extractImageNameFromUrl("image.png")).toBe("image.png");
	});

	it("should handle complex URL with query parameters", () => {
		// Query parameters are part of the pathname in the URL object
		expect(extractImageNameFromUrl("https://example.com/path/to/image.png?size=large")).toBe("image.png");
	});

	it("should extract from URL object construction fallback", () => {
		expect(extractImageNameFromUrl("invalid://url/with/slashes/file.gif")).toBe("file.gif");
	});

	it("should fall back to split-based extraction when URL constructor throws", () => {
		const originalURL = globalThis.URL;
		globalThis.URL = class {
			constructor() {
				throw new Error("Invalid URL");
			}
		} as unknown as typeof URL;
		try {
			expect(extractImageNameFromUrl("http://broken/path/image.png")).toBe("image.png");
		} finally {
			globalThis.URL = originalURL;
		}
	});

	it("should return original URL in catch block when last segment is empty", () => {
		const originalURL = globalThis.URL;
		globalThis.URL = class {
			constructor() {
				throw new Error("Invalid URL");
			}
		} as unknown as typeof URL;
		try {
			expect(extractImageNameFromUrl("http://broken/")).toBe("http://broken/");
		} finally {
			globalThis.URL = originalURL;
		}
	});
});
