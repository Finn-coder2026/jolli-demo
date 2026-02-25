import { MarkdownImage } from "./MarkdownImage";
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

describe("MarkdownImage", () => {
	it("should render image with src and alt", () => {
		render(<MarkdownImage src="/api/images/test.png" alt="Test image" />);

		const img = screen.getByRole("img") as HTMLImageElement;
		expect(img.src).toContain("/api/images/test.png");
		expect(img.alt).toBe("Test image");
	});

	it("should render image with empty alt when alt is not provided", () => {
		render(<MarkdownImage src="/api/images/test.png" />);

		const img = screen.getByRole("img") as HTMLImageElement;
		expect(img.alt).toBe("");
	});

	it("should apply width style when data-width-percent is provided", () => {
		render(<MarkdownImage src="/api/images/test.png" alt="Test" data-width-percent="50" />);

		const img = screen.getByRole("img") as HTMLImageElement;
		expect(img.style.width).toBe("50%");
	});

	it("should not apply width style when data-width-percent is not provided", () => {
		render(<MarkdownImage src="/api/images/test.png" alt="Test" />);

		const img = screen.getByRole("img") as HTMLImageElement;
		expect(img.style.width).toBe("");
	});

	it("should show MissingImagePlaceholder when image fails to load", () => {
		render(<MarkdownImage src="/api/images/broken.png" alt="Broken image" />);

		const img = screen.getByRole("img");
		fireEvent.error(img);

		expect(screen.getByTestId("missing-image-placeholder")).toBeTruthy();
		expect(screen.getByTestId("missing-image-name").textContent).toBe("Broken image");
	});

	it("should show MissingImagePlaceholder with filename when alt is empty and image fails", () => {
		render(<MarkdownImage src="/api/images/test/filename.png" />);

		const img = screen.getByRole("img");
		fireEvent.error(img);

		expect(screen.getByTestId("missing-image-placeholder")).toBeTruthy();
		expect(screen.getByTestId("missing-image-name").textContent).toBe("filename.png");
	});

	it("should show MissingImagePlaceholder when src is not provided", () => {
		render(<MarkdownImage />);

		expect(screen.getByTestId("missing-image-placeholder")).toBeTruthy();
	});

	it("should show MissingImagePlaceholder when src is empty string", () => {
		render(<MarkdownImage src="" />);

		expect(screen.getByTestId("missing-image-placeholder")).toBeTruthy();
	});
});
