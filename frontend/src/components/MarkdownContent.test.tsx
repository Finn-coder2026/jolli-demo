import { MarkdownContent, MarkdownLink } from "./MarkdownContent";
import { render } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

// Mock the markdown-to-jsx library since it doesn't work well with Preact testing
vi.mock("markdown-to-jsx", () => ({
	default: ({ children }: { children: string }) => <div data-testid="markdown-mock">{children}</div>,
}));

describe("MarkdownContent", () => {
	it("should render with markdownContent class", () => {
		const { container } = render(<MarkdownContent>Test content</MarkdownContent>);
		const div = container.querySelector(".markdownContent");
		expect(div).toBeDefined();
	});

	it("should pass children to Markdown component", () => {
		const { container } = render(<MarkdownContent>Test markdown</MarkdownContent>);
		const mockDiv = container.querySelector('[data-testid="markdown-mock"]');
		expect(mockDiv).toBeDefined();
		expect(mockDiv?.textContent).toBe("Test markdown");
	});
});

describe("MarkdownLink", () => {
	it("should render link with correct attributes", () => {
		const { container } = render(<MarkdownLink href="https://example.com">Test</MarkdownLink>);

		const link = container.querySelector("a");
		expect(link).toBeDefined();
		expect(link?.getAttribute("href")).toBe("https://example.com");
		expect(link?.getAttribute("target")).toBe("_blank");
		expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
		expect(link?.textContent).toBe("Test");
	});

	it("should render link without href", () => {
		const { container } = render(<MarkdownLink>Test</MarkdownLink>);

		const link = container.querySelector("a");
		expect(link).toBeDefined();
		expect(link?.textContent).toBe("Test");
	});

	it("should render link with children", () => {
		const { container } = render(
			<MarkdownLink href="https://example.com">
				<span>Child Element</span>
			</MarkdownLink>,
		);

		const link = container.querySelector("a");
		const span = container.querySelector("span");

		expect(link).toBeDefined();
		expect(span).toBeDefined();
		expect(span?.textContent).toBe("Child Element");
	});
});
