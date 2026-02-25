import {
	createImageNotFoundError,
	extractApiImageKey,
	extractImageReferences,
	isValidImageUrl,
	validateImageReferences,
} from "./ImageReferenceValidation";
import { describe, expect, it } from "vitest";

describe("ImageReferenceValidation", () => {
	describe("isValidImageUrl", () => {
		describe("valid URLs", () => {
			it("should accept https:// URLs", () => {
				expect(isValidImageUrl("https://example.com/image.png")).toBe(true);
				expect(isValidImageUrl("https://cdn.example.com/path/to/image.jpg")).toBe(true);
			});

			it("should accept http:// URLs", () => {
				expect(isValidImageUrl("http://example.com/image.png")).toBe(true);
			});

			it("should accept /api/images/ URLs", () => {
				expect(isValidImageUrl("/api/images/abc123.png")).toBe(true);
				expect(isValidImageUrl("/api/images/tenant/org/_default/uuid.png")).toBe(true);
			});
		});

		describe("invalid URLs (relative paths)", () => {
			it("should reject ./ relative paths", () => {
				expect(isValidImageUrl("./img/image.png")).toBe(false);
				expect(isValidImageUrl("./image.png")).toBe(false);
			});

			it("should reject ../ relative paths", () => {
				expect(isValidImageUrl("../img/image.png")).toBe(false);
				expect(isValidImageUrl("../../image.png")).toBe(false);
			});

			it("should reject paths without leading slash or protocol", () => {
				expect(isValidImageUrl("img/image.png")).toBe(false);
				expect(isValidImageUrl("image.png")).toBe(false);
				expect(isValidImageUrl("assets/images/photo.jpg")).toBe(false);
			});

			it("should reject root-relative paths that are not /api/images/", () => {
				expect(isValidImageUrl("/img/image.png")).toBe(false);
				expect(isValidImageUrl("/images/photo.jpg")).toBe(false);
				expect(isValidImageUrl("/assets/image.png")).toBe(false);
				expect(isValidImageUrl("/static/img/icon.png")).toBe(false);
			});

			it("should reject empty strings", () => {
				expect(isValidImageUrl("")).toBe(false);
			});

			it("should reject protocol-relative URLs (Nextra incompatible)", () => {
				expect(isValidImageUrl("//example.com/image.png")).toBe(false);
				expect(isValidImageUrl("//cdn.example.com/path/image.jpg")).toBe(false);
			});

			it("should reject data: URLs (Webpack incompatible)", () => {
				expect(isValidImageUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(false);
				expect(isValidImageUrl("data:image/jpeg;base64,/9j/4AAQ=")).toBe(false);
			});

			it("should reject uppercase protocols (not universally supported)", () => {
				expect(isValidImageUrl("HTTPS://example.com/image.png")).toBe(false);
				expect(isValidImageUrl("HTTP://example.com/image.png")).toBe(false);
				expect(isValidImageUrl("DATA:image/png;base64,abc")).toBe(false);
			});
		});
	});

	describe("extractApiImageKey", () => {
		it("should extract the key from /api/images/ URLs", () => {
			expect(extractApiImageKey("/api/images/abc123.png")).toBe("abc123.png");
			expect(extractApiImageKey("/api/images/tenant/org/_default/uuid.png")).toBe("tenant/org/_default/uuid.png");
		});

		it("should return undefined for non-api URLs", () => {
			expect(extractApiImageKey("https://example.com/image.png")).toBeUndefined();
			expect(extractApiImageKey("./img/image.png")).toBeUndefined();
			expect(extractApiImageKey("/img/image.png")).toBeUndefined();
		});
	});

	describe("extractImageReferences", () => {
		describe("markdown images", () => {
			it("should extract simple markdown images", () => {
				const content = "![alt text](https://example.com/image.png)";
				const images = extractImageReferences(content);
				expect(images).toHaveLength(1);
				expect(images[0].src).toBe("https://example.com/image.png");
				expect(images[0].alt).toBe("alt text");
			});

			it("should extract markdown images with empty alt", () => {
				const content = "![](https://example.com/image.png)";
				const images = extractImageReferences(content);
				expect(images).toHaveLength(1);
				expect(images[0].src).toBe("https://example.com/image.png");
				expect(images[0].alt).toBe("");
			});

			it("should extract markdown images with title", () => {
				const content = '![alt](https://example.com/image.png "Image title")';
				const images = extractImageReferences(content);
				expect(images).toHaveLength(1);
				expect(images[0].src).toBe("https://example.com/image.png");
			});

			it("should extract multiple markdown images", () => {
				const content = `# Document
![first](https://example.com/1.png)
Some text
![second](https://example.com/2.png)`;
				const images = extractImageReferences(content);
				expect(images).toHaveLength(2);
				expect(images[0].src).toBe("https://example.com/1.png");
				expect(images[1].src).toBe("https://example.com/2.png");
			});
		});

		describe("HTML images", () => {
			it("should extract HTML img tags with double quotes", () => {
				const content = '<img src="https://example.com/image.png" />';
				const images = extractImageReferences(content);
				expect(images).toHaveLength(1);
				expect(images[0].src).toBe("https://example.com/image.png");
			});

			it("should extract HTML img tags with single quotes", () => {
				const content = "<img src='https://example.com/image.png' />";
				const images = extractImageReferences(content);
				expect(images).toHaveLength(1);
				expect(images[0].src).toBe("https://example.com/image.png");
			});

			it("should extract alt text from HTML img tags", () => {
				const content = '<img src="https://example.com/image.png" alt="description" />';
				const images = extractImageReferences(content);
				expect(images).toHaveLength(1);
				expect(images[0].alt).toBe("description");
			});

			it("should handle img tags without self-closing slash", () => {
				const content = '<img src="https://example.com/image.png">';
				const images = extractImageReferences(content);
				expect(images).toHaveLength(1);
				expect(images[0].src).toBe("https://example.com/image.png");
			});

			it("should handle img tags with additional attributes", () => {
				const content = '<img class="photo" src="https://example.com/image.png" alt="desc" width="100" />';
				const images = extractImageReferences(content);
				expect(images).toHaveLength(1);
				expect(images[0].src).toBe("https://example.com/image.png");
				expect(images[0].alt).toBe("desc");
			});
		});

		describe("line and column tracking", () => {
			it("should report correct line number for single-line content", () => {
				const content = "![alt](https://example.com/image.png)";
				const images = extractImageReferences(content);
				expect(images[0].line).toBe(1);
				expect(images[0].column).toBe(1);
			});

			it("should report correct line numbers for multi-line content", () => {
				const content = `Line 1
Line 2
![alt](https://example.com/image.png)`;
				const images = extractImageReferences(content);
				expect(images[0].line).toBe(3);
			});

			it("should report correct column for images not at line start", () => {
				const content = "Some text ![alt](https://example.com/image.png)";
				const images = extractImageReferences(content);
				expect(images[0].column).toBe(11);
			});
		});

		describe("code block protection", () => {
			it("should ignore images in fenced code blocks", () => {
				const content = `# Document
\`\`\`markdown
![should be ignored](./img/test.png)
\`\`\`
![should be found](https://example.com/real.png)`;
				const images = extractImageReferences(content);
				expect(images).toHaveLength(1);
				expect(images[0].src).toBe("https://example.com/real.png");
			});

			it("should ignore images in inline code", () => {
				const content = "Use `![alt](./img/test.png)` for markdown images";
				const images = extractImageReferences(content);
				expect(images).toHaveLength(0);
			});

			it("should ignore HTML images in code blocks", () => {
				const content = `\`\`\`html
<img src="./img/test.png" />
\`\`\``;
				const images = extractImageReferences(content);
				expect(images).toHaveLength(0);
			});

			it("should extract images outside code blocks while ignoring those inside", () => {
				const content = `![real1](https://example.com/1.png)

\`\`\`
![fake](./img/fake.png)
\`\`\`

![real2](https://example.com/2.png)`;
				const images = extractImageReferences(content);
				expect(images).toHaveLength(2);
				expect(images[0].src).toBe("https://example.com/1.png");
				expect(images[1].src).toBe("https://example.com/2.png");
			});
		});

		describe("mixed content", () => {
			it("should extract both markdown and HTML images", () => {
				const content = `![markdown](https://example.com/1.png)
<img src="https://example.com/2.png" />`;
				const images = extractImageReferences(content);
				expect(images).toHaveLength(2);
				expect(images[0].src).toBe("https://example.com/1.png");
				expect(images[1].src).toBe("https://example.com/2.png");
			});
		});
	});

	describe("validateImageReferences", () => {
		describe("valid content", () => {
			it("should pass for content with valid absolute URLs", () => {
				const content = "![alt](https://example.com/image.png)";
				const result = validateImageReferences(content);
				expect(result.isValid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});

			it("should pass for content with /api/images/ URLs", () => {
				const content = "![alt](/api/images/tenant/org/_default/uuid.png)";
				const result = validateImageReferences(content);
				expect(result.isValid).toBe(true);
				expect(result.errors).toHaveLength(0);
				expect(result.imageIdsToVerify).toContain("tenant/org/_default/uuid.png");
			});

			it("should pass for content with no images", () => {
				const content = "# Just a heading\n\nSome text without images.";
				const result = validateImageReferences(content);
				expect(result.isValid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});
		});

		describe("Nextra-incompatible URLs (valid syntax but break builds)", () => {
			it("should fail for data URLs", () => {
				const content = "![alt](data:image/png;base64,iVBORw0KGgo=)";
				const result = validateImageReferences(content);
				expect(result.isValid).toBe(false);
				expect(result.errors).toHaveLength(1);
				expect(result.errors[0].errorCode).toBe("RELATIVE_PATH");
			});

			it("should fail for protocol-relative URLs", () => {
				const content = "![alt](//cdn.example.com/image.png)";
				const result = validateImageReferences(content);
				expect(result.isValid).toBe(false);
				expect(result.errors).toHaveLength(1);
				expect(result.errors[0].errorCode).toBe("RELATIVE_PATH");
			});

			it("should fail for uppercase protocols", () => {
				const content = "![alt](HTTPS://example.com/image.png)";
				const result = validateImageReferences(content);
				expect(result.isValid).toBe(false);
				expect(result.errors).toHaveLength(1);
			});
		});

		describe("invalid content", () => {
			it("should fail for relative ./ paths", () => {
				const content = "![alt](./img/image.png)";
				const result = validateImageReferences(content);
				expect(result.isValid).toBe(false);
				expect(result.errors).toHaveLength(1);
				expect(result.errors[0].errorCode).toBe("RELATIVE_PATH");
				expect(result.errors[0].src).toBe("./img/image.png");
			});

			it("should fail for relative ../ paths", () => {
				const content = "![alt](../img/image.png)";
				const result = validateImageReferences(content);
				expect(result.isValid).toBe(false);
				expect(result.errors).toHaveLength(1);
				expect(result.errors[0].errorCode).toBe("RELATIVE_PATH");
			});

			it("should fail for paths without leading slash or protocol", () => {
				const content = "![alt](img/image.png)";
				const result = validateImageReferences(content);
				expect(result.isValid).toBe(false);
				expect(result.errors).toHaveLength(1);
				expect(result.errors[0].errorCode).toBe("RELATIVE_PATH");
			});

			it("should fail for root-relative paths that are not /api/images/", () => {
				const content = "![alt](/img/image.png)";
				const result = validateImageReferences(content);
				expect(result.isValid).toBe(false);
				expect(result.errors).toHaveLength(1);
				expect(result.errors[0].errorCode).toBe("RELATIVE_PATH");
			});

			it("should report multiple errors for multiple invalid images", () => {
				const content = `![first](./img/1.png)
![second](../img/2.png)
![third](/img/3.png)`;
				const result = validateImageReferences(content);
				expect(result.isValid).toBe(false);
				expect(result.errors).toHaveLength(3);
			});

			it("should report correct line numbers for errors", () => {
				const content = `# Document

![valid](https://example.com/ok.png)

![invalid](./img/bad.png)`;
				const result = validateImageReferences(content);
				expect(result.isValid).toBe(false);
				expect(result.errors).toHaveLength(1);
				expect(result.errors[0].line).toBe(5);
			});
		});

		describe("mixed valid and invalid content", () => {
			it("should collect all /api/images/ keys for verification", () => {
				const content = `![img1](/api/images/tenant/org/_default/uuid1.png)
![img2](https://example.com/external.png)
![img3](/api/images/tenant/org/_default/uuid2.png)`;
				const result = validateImageReferences(content);
				expect(result.isValid).toBe(true);
				expect(result.imageIdsToVerify).toHaveLength(2);
				expect(result.imageIdsToVerify).toContain("tenant/org/_default/uuid1.png");
				expect(result.imageIdsToVerify).toContain("tenant/org/_default/uuid2.png");
			});

			it("should report errors only for invalid images while collecting valid /api/images/ keys", () => {
				const content = `![valid](/api/images/tenant/org/_default/uuid.png)
![invalid](./img/bad.png)`;
				const result = validateImageReferences(content);
				expect(result.isValid).toBe(false);
				expect(result.errors).toHaveLength(1);
				expect(result.errors[0].src).toBe("./img/bad.png");
				expect(result.imageIdsToVerify).toContain("tenant/org/_default/uuid.png");
			});
		});

		describe("code block protection", () => {
			it("should not report errors for invalid paths in code blocks", () => {
				const content = `# How to reference images

\`\`\`markdown
![example](./img/example.png)
\`\`\`

The above shows an example of an invalid path.`;
				const result = validateImageReferences(content);
				expect(result.isValid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});

			it("should not report errors for invalid paths in inline code", () => {
				const content = "Use `![alt](./img/test.png)` as the syntax.";
				const result = validateImageReferences(content);
				expect(result.isValid).toBe(true);
				expect(result.errors).toHaveLength(0);
			});
		});
	});

	describe("createImageNotFoundError", () => {
		it("should create an error with the correct structure", () => {
			const error = createImageNotFoundError("/api/images/uuid.png", 5, 10);
			expect(error.errorCode).toBe("IMAGE_NOT_FOUND");
			expect(error.src).toBe("/api/images/uuid.png");
			expect(error.line).toBe(5);
			expect(error.column).toBe(10);
			expect(error.message).toContain("Image not found");
		});
	});
});
