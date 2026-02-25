import { ResizableImageExtension } from "./ResizableImageExtension";
import { describe, expect, it } from "vitest";

const mockContext = { parent: () => ({ src: {}, alt: {}, title: {} }) };

describe("ResizableImageExtension", () => {
	it("should have name 'image'", () => {
		expect(ResizableImageExtension.name).toBe("image");
	});

	it("should be a node type extension", () => {
		expect(ResizableImageExtension.type).toBe("node");
	});

	it("should have addAttributes method defined", () => {
		expect(ResizableImageExtension.config.addAttributes).toBeDefined();
	});

	it("should have addNodeView method defined", () => {
		expect(ResizableImageExtension.config.addNodeView).toBeDefined();
	});

	it("should execute addAttributes", () => {
		const addAttrs = ResizableImageExtension.config.addAttributes;
		if (addAttrs) {
			const attrs = addAttrs.call(mockContext as never) as never;
			expect(attrs).toBeDefined();
		}
	});

	it("should execute addNodeView", () => {
		const addNodeView = ResizableImageExtension.config.addNodeView;
		if (addNodeView) {
			const result = addNodeView.call(ResizableImageExtension as never);
			expect(result).toBeDefined();
		}
	});

	describe("Attribute parsing and rendering", () => {
		it("should parse widthPx from style attribute", () => {
			const addAttrs = ResizableImageExtension.config.addAttributes;
			if (addAttrs) {
				const attrs: { widthPx: { parseHTML: (el: HTMLElement) => unknown } } = addAttrs.call(
					mockContext as never,
				) as never;
				const element = document.createElement("img");
				element.setAttribute("style", "width: 300px");
				const result = attrs.widthPx.parseHTML(element);
				expect(result).toBe(300);
			}
		});

		it("should return null when style has no width in px", () => {
			const addAttrs = ResizableImageExtension.config.addAttributes;
			if (addAttrs) {
				const attrs: { widthPx: { parseHTML: (el: HTMLElement) => unknown } } = addAttrs.call(
					mockContext as never,
				) as never;
				const element = document.createElement("img");
				element.setAttribute("style", "width: 50%");
				const result = attrs.widthPx.parseHTML(element);
				expect(result).toBeNull();
			}
		});

		it("should return null when style attribute is missing for widthPx", () => {
			const addAttrs = ResizableImageExtension.config.addAttributes;
			if (addAttrs) {
				const attrs: { widthPx: { parseHTML: (el: HTMLElement) => unknown } } = addAttrs.call(
					mockContext as never,
				) as never;
				const element = document.createElement("img");
				const result = attrs.widthPx.parseHTML(element);
				expect(result).toBeNull();
			}
		});

		it("should render widthPx to style attribute", () => {
			const addAttrs = ResizableImageExtension.config.addAttributes;
			if (addAttrs) {
				const attrs: { widthPx: { renderHTML: (attrs: { widthPx: number }) => object } } = addAttrs.call(
					mockContext as never,
				) as never;
				const result = attrs.widthPx.renderHTML({ widthPx: 400 });
				expect(result).toEqual({ style: "width: 400px" });
			}
		});

		it("should return empty object when widthPx is null in renderHTML", () => {
			const addAttrs = ResizableImageExtension.config.addAttributes;
			if (addAttrs) {
				const attrs: { widthPx: { renderHTML: (attrs: { widthPx: null }) => object } } = addAttrs.call(
					mockContext as never,
				) as never;
				const result = attrs.widthPx.renderHTML({ widthPx: null });
				expect(result).toEqual({});
			}
		});

		it("should parse widthPercent from style attribute", () => {
			const addAttrs = ResizableImageExtension.config.addAttributes;
			if (addAttrs) {
				const attrs: { widthPercent: { parseHTML: (el: HTMLElement) => unknown } } = addAttrs.call(
					mockContext as never,
				) as never;
				const element = document.createElement("img");
				element.setAttribute("style", "width: 50%");
				const result = attrs.widthPercent.parseHTML(element);
				expect(result).toBe(50);
			}
		});

		it("should return null when style has no width percentage", () => {
			const addAttrs = ResizableImageExtension.config.addAttributes;
			if (addAttrs) {
				const attrs: { widthPercent: { parseHTML: (el: HTMLElement) => unknown } } = addAttrs.call(
					mockContext as never,
				) as never;
				const element = document.createElement("img");
				element.setAttribute("style", "height: 100px");
				const result = attrs.widthPercent.parseHTML(element);
				expect(result).toBeNull();
			}
		});

		it("should return null when style attribute is missing", () => {
			const addAttrs = ResizableImageExtension.config.addAttributes;
			if (addAttrs) {
				const attrs: { widthPercent: { parseHTML: (el: HTMLElement) => unknown } } = addAttrs.call(
					mockContext as never,
				) as never;
				const element = document.createElement("img");
				const result = attrs.widthPercent.parseHTML(element);
				expect(result).toBeNull();
			}
		});

		it("should render widthPercent to empty object (widthPx is used for rendering)", () => {
			const addAttrs = ResizableImageExtension.config.addAttributes;
			if (addAttrs) {
				const attrs: { widthPercent: { renderHTML: (attrs: { widthPercent: number }) => object } } =
					addAttrs.call(mockContext as never) as never;
				const result = attrs.widthPercent.renderHTML({ widthPercent: 75 });
				// widthPercent.renderHTML returns empty object since widthPx is used for actual rendering
				expect(result).toEqual({});
			}
		});

		it("should return empty object when widthPercent is null in renderHTML", () => {
			const addAttrs = ResizableImageExtension.config.addAttributes;
			if (addAttrs) {
				const attrs: { widthPercent: { renderHTML: (attrs: { widthPercent: null }) => object } } =
					addAttrs.call(mockContext as never) as never;
				const result = attrs.widthPercent.renderHTML({ widthPercent: null });
				expect(result).toEqual({});
			}
		});
	});

	describe("Markdown parsing and rendering", () => {
		it("should render markdown with width percentage", () => {
			const renderMarkdown = ResizableImageExtension.config.renderMarkdown;
			if (renderMarkdown) {
				// Cast to bypass strict type checking for test purposes
				const renderFn = renderMarkdown as (node: unknown) => string;
				const result = renderFn.call(ResizableImageExtension, {
					type: "image",
					attrs: { src: "/api/images/test.jpg", alt: "Test", widthPercent: 50 },
				});
				expect(result).toBe("![Test](/api/images/test.jpg){width=50%}");
			}
		});

		it("should render markdown without width when widthPercent is null", () => {
			const renderMarkdown = ResizableImageExtension.config.renderMarkdown;
			if (renderMarkdown) {
				// Cast to bypass strict type checking for test purposes
				const renderFn = renderMarkdown as (node: unknown) => string;
				const result = renderFn.call(ResizableImageExtension, {
					type: "image",
					attrs: { src: "/api/images/test.jpg", alt: "Test" },
				});
				expect(result).toBe("![Test](/api/images/test.jpg)");
			}
		});

		it("should parse markdown with width percentage", () => {
			const parseMarkdown = ResizableImageExtension.config.parseMarkdown;
			if (parseMarkdown) {
				// Cast to bypass strict type checking for test purposes
				const parseFn = parseMarkdown as (token: unknown) => unknown;
				const result = parseFn.call(ResizableImageExtension, {
					type: "image",
					href: "/api/images/test.jpg",
					text: "Test",
					raw: "![Test](/api/images/test.jpg){width=50%}",
				});
				expect(result).toEqual({
					type: "image",
					attrs: { src: "/api/images/test.jpg", alt: "Test", widthPercent: 50 },
				});
			}
		});

		it("should parse markdown without width percentage", () => {
			const parseMarkdown = ResizableImageExtension.config.parseMarkdown;
			if (parseMarkdown) {
				// Cast to bypass strict type checking for test purposes
				const parseFn = parseMarkdown as (token: unknown) => unknown;
				const result = parseFn.call(ResizableImageExtension, {
					type: "image",
					href: "/api/images/test.jpg",
					text: "Test",
					raw: "![Test](/api/images/test.jpg)",
				});
				expect(result).toEqual({
					type: "image",
					attrs: { src: "/api/images/test.jpg", alt: "Test", widthPercent: undefined },
				});
			}
		});

		it("should use widthPercent from token when available", () => {
			const parseMarkdown = ResizableImageExtension.config.parseMarkdown;
			if (parseMarkdown) {
				// Cast to bypass strict type checking for test purposes
				const parseFn = parseMarkdown as (token: unknown) => unknown;
				const result = parseFn.call(ResizableImageExtension, {
					type: "image",
					href: "/api/images/test.jpg",
					text: "Test",
					raw: "![Test](/api/images/test.jpg)",
					widthPercent: 75,
				});
				expect(result).toEqual({
					type: "image",
					attrs: { src: "/api/images/test.jpg", alt: "Test", widthPercent: 75 },
				});
			}
		});
	});

	describe("Markdown tokenizer", () => {
		it("should tokenize image with width percentage", () => {
			const tokenizer = ResizableImageExtension.config.markdownTokenizer;
			if (tokenizer?.tokenize) {
				// Cast tokenize to bypass strict type checking - actual implementation only uses first arg
				const tokenizeFn = tokenizer.tokenize as (src: string) => unknown;
				const result = tokenizeFn("![Test](/api/images/test.jpg){width=50%}");
				expect(result).toEqual({
					type: "image",
					raw: "![Test](/api/images/test.jpg){width=50%}",
					text: "Test",
					href: "/api/images/test.jpg",
					widthPercent: 50,
				});
			}
		});

		it("should return undefined for image without width percentage", () => {
			const tokenizer = ResizableImageExtension.config.markdownTokenizer;
			if (tokenizer?.tokenize) {
				// Cast tokenize to bypass strict type checking - actual implementation only uses first arg
				const tokenizeFn = tokenizer.tokenize as (src: string) => unknown;
				const result = tokenizeFn("![Test](/api/images/test.jpg)");
				expect(result).toBeUndefined();
			}
		});

		it("should have correct tokenizer properties", () => {
			const tokenizer = ResizableImageExtension.config.markdownTokenizer;
			expect(tokenizer).toBeDefined();
			expect(tokenizer?.name).toBe("resizableImage");
			expect(tokenizer?.level).toBe("inline");
		});

		it("should find start position of image syntax", () => {
			const tokenizer = ResizableImageExtension.config.markdownTokenizer;
			if (tokenizer?.start && typeof tokenizer.start === "function") {
				const startFn = tokenizer.start as (src: string) => number;
				expect(startFn("some text ![image](url) more text")).toBe(10);
				expect(startFn("no image here")).toBe(-1);
			}
		});

		it("should tokenize image with empty alt text", () => {
			const tokenizer = ResizableImageExtension.config.markdownTokenizer;
			if (tokenizer?.tokenize) {
				const tokenizeFn = tokenizer.tokenize as (src: string) => unknown;
				const result = tokenizeFn("![](/api/images/test.jpg){width=75%}");
				expect(result).toEqual({
					type: "image",
					raw: "![](/api/images/test.jpg){width=75%}",
					text: "",
					href: "/api/images/test.jpg",
					widthPercent: 75,
				});
			}
		});

		it("should tokenize image with 100% width", () => {
			const tokenizer = ResizableImageExtension.config.markdownTokenizer;
			if (tokenizer?.tokenize) {
				const tokenizeFn = tokenizer.tokenize as (src: string) => unknown;
				const result = tokenizeFn("![Full Width](/images/full.png){width=100%}");
				expect(result).toEqual({
					type: "image",
					raw: "![Full Width](/images/full.png){width=100%}",
					text: "Full Width",
					href: "/images/full.png",
					widthPercent: 100,
				});
			}
		});

		it("should return undefined for malformed image syntax", () => {
			const tokenizer = ResizableImageExtension.config.markdownTokenizer;
			if (tokenizer?.tokenize) {
				const tokenizeFn = tokenizer.tokenize as (src: string) => unknown;

				// Missing exclamation mark
				expect(tokenizeFn("[Test](/api/images/test.jpg){width=50%}")).toBeUndefined();

				// Missing closing bracket
				expect(tokenizeFn("![Test(/api/images/test.jpg){width=50%}")).toBeUndefined();

				// No width value
				expect(tokenizeFn("![Test](/api/images/test.jpg){width=%}")).toBeUndefined();

				// Plain text
				expect(tokenizeFn("just some text")).toBeUndefined();
			}
		});

		it("should find start position at beginning of string", () => {
			const tokenizer = ResizableImageExtension.config.markdownTokenizer;
			if (tokenizer?.start && typeof tokenizer.start === "function") {
				const startFn = tokenizer.start as (src: string) => number;
				expect(startFn("![image](url) text after")).toBe(0);
			}
		});

		it("should find start position with multiple images", () => {
			const tokenizer = ResizableImageExtension.config.markdownTokenizer;
			if (tokenizer?.start && typeof tokenizer.start === "function") {
				const startFn = tokenizer.start as (src: string) => number;
				// Should return position of first ![
				expect(startFn("text ![first](url1) and ![second](url2)")).toBe(5);
			}
		});
	});

	describe("Edge cases for parseMarkdown", () => {
		it("should handle missing href in token", () => {
			const parseMarkdown = ResizableImageExtension.config.parseMarkdown;
			if (parseMarkdown) {
				const parseFn = parseMarkdown as (token: unknown) => unknown;
				const result = parseFn({
					type: "image",
					text: "Test",
					raw: "![Test](){width=50%}",
				});
				expect(result).toEqual({
					type: "image",
					attrs: { src: "", alt: "Test", widthPercent: 50 },
				});
			}
		});

		it("should handle missing text in token", () => {
			const parseMarkdown = ResizableImageExtension.config.parseMarkdown;
			if (parseMarkdown) {
				const parseFn = parseMarkdown as (token: unknown) => unknown;
				const result = parseFn({
					type: "image",
					href: "/api/images/test.jpg",
					raw: "![](/api/images/test.jpg)",
				});
				expect(result).toEqual({
					type: "image",
					attrs: { src: "/api/images/test.jpg", alt: "", widthPercent: undefined },
				});
			}
		});

		it("should handle missing raw in token", () => {
			const parseMarkdown = ResizableImageExtension.config.parseMarkdown;
			if (parseMarkdown) {
				const parseFn = parseMarkdown as (token: unknown) => unknown;
				const result = parseFn({
					type: "image",
					href: "/api/images/test.jpg",
					text: "Test",
				});
				expect(result).toEqual({
					type: "image",
					attrs: { src: "/api/images/test.jpg", alt: "Test", widthPercent: undefined },
				});
			}
		});

		it("should prioritize widthPercent from token over raw string", () => {
			const parseMarkdown = ResizableImageExtension.config.parseMarkdown;
			if (parseMarkdown) {
				const parseFn = parseMarkdown as (token: unknown) => unknown;
				const result = parseFn({
					type: "image",
					href: "/api/images/test.jpg",
					text: "Test",
					raw: "![Test](/api/images/test.jpg){width=30%}",
					widthPercent: 60,
				});
				// widthPercent from token should override the one from raw
				expect(result).toEqual({
					type: "image",
					attrs: { src: "/api/images/test.jpg", alt: "Test", widthPercent: 60 },
				});
			}
		});
	});

	describe("Edge cases for renderMarkdown", () => {
		it("should handle missing attrs", () => {
			const renderMarkdown = ResizableImageExtension.config.renderMarkdown;
			if (renderMarkdown) {
				const renderFn = renderMarkdown as (node: unknown) => string;
				const result = renderFn.call(ResizableImageExtension, {
					type: "image",
				});
				expect(result).toBe("![]()");
			}
		});

		it("should handle empty attrs", () => {
			const renderMarkdown = ResizableImageExtension.config.renderMarkdown;
			if (renderMarkdown) {
				const renderFn = renderMarkdown as (node: unknown) => string;
				const result = renderFn.call(ResizableImageExtension, {
					type: "image",
					attrs: {},
				});
				expect(result).toBe("![]()");
			}
		});

		it("should handle widthPercent of 0", () => {
			const renderMarkdown = ResizableImageExtension.config.renderMarkdown;
			if (renderMarkdown) {
				const renderFn = renderMarkdown as (node: unknown) => string;
				const result = renderFn.call(ResizableImageExtension, {
					type: "image",
					attrs: { src: "/test.jpg", alt: "Test", widthPercent: 0 },
				});
				// widthPercent of 0 should still be rendered
				expect(result).toBe("![Test](/test.jpg){width=0%}");
			}
		});

		it("should not include width when widthPercent is undefined", () => {
			const renderMarkdown = ResizableImageExtension.config.renderMarkdown;
			if (renderMarkdown) {
				const renderFn = renderMarkdown as (node: unknown) => string;
				const result = renderFn.call(ResizableImageExtension, {
					type: "image",
					attrs: { src: "/test.jpg", alt: "Test", widthPercent: undefined },
				});
				expect(result).toBe("![Test](/test.jpg)");
			}
		});

		it("should handle special characters in alt text", () => {
			const renderMarkdown = ResizableImageExtension.config.renderMarkdown;
			if (renderMarkdown) {
				const renderFn = renderMarkdown as (node: unknown) => string;
				const result = renderFn.call(ResizableImageExtension, {
					type: "image",
					attrs: { src: "/test.jpg", alt: "Test [with] special (chars)", widthPercent: 50 },
				});
				expect(result).toBe("![Test [with] special (chars)](/test.jpg){width=50%}");
			}
		});
	});

	describe("Additional attribute tests", () => {
		it("should return parent attributes when calling addAttributes", () => {
			const addAttrs = ResizableImageExtension.config.addAttributes;
			if (addAttrs) {
				const attrs = addAttrs.call(mockContext as never) as Record<string, unknown>;
				// Should include parent attributes (src, alt, title) plus custom ones
				expect(attrs.src).toBeDefined();
				expect(attrs.alt).toBeDefined();
				expect(attrs.title).toBeDefined();
				expect(attrs.widthPx).toBeDefined();
				expect(attrs.widthPercent).toBeDefined();
			}
		});

		it("should have default value of null for widthPx", () => {
			const addAttrs = ResizableImageExtension.config.addAttributes;
			if (addAttrs) {
				const attrs = addAttrs.call(mockContext as never) as {
					widthPx: { default: unknown };
				};
				expect(attrs.widthPx.default).toBeNull();
			}
		});

		it("should have default value of null for widthPercent", () => {
			const addAttrs = ResizableImageExtension.config.addAttributes;
			if (addAttrs) {
				const attrs = addAttrs.call(mockContext as never) as {
					widthPercent: { default: unknown };
				};
				expect(attrs.widthPercent.default).toBeNull();
			}
		});
	});
});
