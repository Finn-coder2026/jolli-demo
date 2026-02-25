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

	it("should preprocess images with width percentage to HTML", () => {
		const markdown = "![Test Image](/api/images/test.jpg){width=50%}";
		const { container } = render(<MarkdownContent>{markdown}</MarkdownContent>);
		const mockDiv = container.querySelector('[data-testid="markdown-mock"]');
		expect(mockDiv?.textContent).toBe(
			'<img src="/api/images/test.jpg" alt="Test Image" data-width-percent="50" />',
		);
	});

	it("should preprocess multiple images with width percentage", () => {
		const markdown = `![First](/api/images/first.jpg){width=25%}
Some text
![Second](/api/images/second.jpg){width=75%}`;
		const { container } = render(<MarkdownContent>{markdown}</MarkdownContent>);
		const mockDiv = container.querySelector('[data-testid="markdown-mock"]');
		expect(mockDiv?.textContent).toContain(
			'<img src="/api/images/first.jpg" alt="First" data-width-percent="25" />',
		);
		expect(mockDiv?.textContent).toContain(
			'<img src="/api/images/second.jpg" alt="Second" data-width-percent="75" />',
		);
	});

	it("should leave images without width percentage unchanged", () => {
		const markdown = "![Normal](/api/images/normal.jpg)";
		const { container } = render(<MarkdownContent>{markdown}</MarkdownContent>);
		const mockDiv = container.querySelector('[data-testid="markdown-mock"]');
		expect(mockDiv?.textContent).toBe("![Normal](/api/images/normal.jpg)");
	});

	it("should handle mix of images with and without width percentage", () => {
		const markdown = `![With Width](/api/images/with.jpg){width=60%}
![Without Width](/api/images/without.jpg)`;
		const { container } = render(<MarkdownContent>{markdown}</MarkdownContent>);
		const mockDiv = container.querySelector('[data-testid="markdown-mock"]');
		expect(mockDiv?.textContent).toContain(
			'<img src="/api/images/with.jpg" alt="With Width" data-width-percent="60" />',
		);
		expect(mockDiv?.textContent).toContain("![Without Width](/api/images/without.jpg)");
	});

	it("should handle empty alt text with width percentage", () => {
		const markdown = "![](/api/images/no-alt.jpg){width=80%}";
		const { container } = render(<MarkdownContent>{markdown}</MarkdownContent>);
		const mockDiv = container.querySelector('[data-testid="markdown-mock"]');
		expect(mockDiv?.textContent).toBe('<img src="/api/images/no-alt.jpg" alt="" data-width-percent="80" />');
	});

	it("should apply compact class when compact prop is true", () => {
		const { container } = render(<MarkdownContent compact>Test content</MarkdownContent>);
		const div = container.querySelector(".markdownContent--compact");
		expect(div).toBeTruthy();
		expect(div?.className).toContain("markdownContent");
	});

	it("should not apply compact class when compact prop is false", () => {
		const { container } = render(<MarkdownContent compact={false}>Test content</MarkdownContent>);
		const div = container.querySelector(".markdownContent--compact");
		expect(div).toBeNull();
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
