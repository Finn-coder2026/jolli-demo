import { extractImagesFromContent, ImageInsert } from "./ImageInsert";
import { fireEvent, render, waitFor } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock client context
const mockUploadImage = vi.fn();
vi.mock("../contexts/ClientContext", () => ({
	useClient: () => ({
		images: () => ({
			uploadImage: mockUploadImage,
		}),
	}),
}));

vi.mock("react-intlayer", () => ({
	useIntlayer: () => ({
		insertImage: "Images",
		uploadNew: "Upload new image",
		uploadHint: "PNG, JPEG, GIF, WebP (max 10MB)",
		reuseExisting: "Assets in this article",
		clickToInsert: "Click to insert",
		deleteImage: "Delete image",
		pasteHint: "Tip: You can also paste or drag images into the editor",
		addAltText: "Add Image Description",
		altTextLabel: "Description (Alt Text)",
		altTextPlaceholder: "Describe the image...",
		altTextHelp: "A brief description of the image for accessibility and SEO.",
		cancel: "Cancel",
		upload: "Upload",
		invalidFileType: { value: "Invalid file type" },
		fileTooLarge: { value: "File too large" },
		uploadFailed: { value: "Failed to upload image" },
	}),
}));

vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		Image: () => <span data-testid="image-icon">Image</span>,
		Upload: () => <span data-testid="upload-icon">Upload</span>,
		X: () => <span data-testid="x-icon">X</span>,
		Trash2: () => <span data-testid="trash-icon">Trash</span>,
	};
});

// Flag to control MockImage behavior - set to true to trigger onerror instead of onload
let shouldTriggerImageError = false;

// Mock window.Image to trigger onload/onerror immediately
const originalImage = window.Image;
beforeEach(() => {
	shouldTriggerImageError = false;
	class MockImage {
		onload: (() => void) | null = null;
		onerror: (() => void) | null = null;
		naturalWidth = 800;
		naturalHeight = 600;
		private _src = "";
		get src() {
			return this._src;
		}
		set src(value: string) {
			this._src = value;
			// Trigger onload or onerror asynchronously to simulate image loading
			setTimeout(() => {
				if (shouldTriggerImageError) {
					if (this.onerror) {
						this.onerror();
					}
				} else {
					if (this.onload) {
						this.onload();
					}
				}
			}, 0);
		}
	}
	window.Image = MockImage as unknown as typeof Image;
});

afterEach(() => {
	window.Image = originalImage;
	shouldTriggerImageError = false;
});

/**
 * Helper function to create a mock file with a specified size.
 * In jsdom, File constructor doesn't properly respect size for large files,
 * so we need to mock the size property explicitly.
 */
function createMockFile(name: string, type: string, sizeInBytes: number): File {
	const file = new File([""], name, { type });
	Object.defineProperty(file, "size", { value: sizeInBytes, writable: false });
	return file;
}

/**
 * Creates a mock FileList containing the given file.
 * FileList is not directly constructable, so we create a mock object.
 */
function createMockFileList(file: File): FileList {
	const fileList = {
		0: file,
		length: 1,
		item: (index: number) => (index === 0 ? file : null),
		*[Symbol.iterator]() {
			yield file;
		},
	};
	return fileList as unknown as FileList;
}

/**
 * Simulates a file input change event with the given file.
 * Uses Object.defineProperty to properly set the files property before dispatching.
 */
function simulateFileSelect(fileInput: HTMLInputElement, file: File): void {
	const fileList = createMockFileList(file);

	// Define files property on the input element
	Object.defineProperty(fileInput, "files", {
		value: fileList,
		configurable: true,
	});

	// Dispatch a native change event
	const event = new Event("change", { bubbles: true });
	fileInput.dispatchEvent(event);
}

describe("ImageInsert", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUploadImage.mockResolvedValue({ url: "/api/images/test/org/_default/uploaded.png" });
	});

	it("should render insert image button", () => {
		const { getByTestId } = render(<ImageInsert articleContent="" onInsert={vi.fn()} onError={vi.fn()} />);
		expect(getByTestId("image-insert-button")).toBeDefined();
	});

	it("should open dropdown on click", () => {
		const { getByTestId } = render(<ImageInsert articleContent="" onInsert={vi.fn()} onError={vi.fn()} />);

		fireEvent.click(getByTestId("image-insert-button"));

		expect(getByTestId("upload-new-image")).toBeDefined();
	});

	it("should show existing images in dropdown", () => {
		const content = `
			![first](/api/images/t/o/d/first.png)
			![second](/api/images/t/o/d/second.png)
		`;
		const { getByTestId } = render(<ImageInsert articleContent={content} onInsert={vi.fn()} onError={vi.fn()} />);

		fireEvent.click(getByTestId("image-insert-button"));

		expect(getByTestId("reuse-image-0")).toBeDefined();
		expect(getByTestId("reuse-image-1")).toBeDefined();
	});

	it("should call onInsert when reusing existing image", async () => {
		const content = "![my alt](/api/images/t/o/d/test.png)";
		const onInsert = vi.fn();
		const { getByTestId } = render(<ImageInsert articleContent={content} onInsert={onInsert} onError={vi.fn()} />);

		fireEvent.click(getByTestId("image-insert-button"));
		fireEvent.click(getByTestId("reuse-image-0"));

		// Wait for mock Image.onload to trigger onInsert
		await waitFor(() => {
			expect(onInsert).toHaveBeenCalledWith("![my alt](/api/images/t/o/d/test.png)", {
				path: "/api/images/t/o/d/test.png",
				width: 800,
				height: 600,
			});
		});
	});

	it("should be disabled when disabled prop is true", () => {
		const { getByTestId } = render(<ImageInsert articleContent="" onInsert={vi.fn()} onError={vi.fn()} disabled />);
		const button = getByTestId("image-insert-button");
		expect(button.getAttribute("disabled")).toBe("");
	});

	it("should show alt text dialog after file selection", async () => {
		const { getByTestId } = render(<ImageInsert articleContent="" onInsert={vi.fn()} onError={vi.fn()} />);

		// Get the hidden file input
		const fileInput = getByTestId("image-file-input") as HTMLInputElement;

		// Create a mock file and simulate selection
		const file = new File(["test"], "test.png", { type: "image/png" });
		simulateFileSelect(fileInput, file);

		// Alt text dialog should appear
		await waitFor(() => {
			expect(getByTestId("alt-text-dialog")).toBeDefined();
		});
	});

	it("should upload image and call onInsert with markdown", async () => {
		const onInsert = vi.fn();
		const { getByTestId } = render(<ImageInsert articleContent="" onInsert={onInsert} onError={vi.fn()} />);

		// Simulate file selection
		const fileInput = getByTestId("image-file-input") as HTMLInputElement;
		const file = new File(["test"], "test.png", { type: "image/png" });
		simulateFileSelect(fileInput, file);

		// Wait for dialog and confirm upload
		await waitFor(() => {
			expect(getByTestId("alt-text-dialog")).toBeDefined();
		});

		fireEvent.click(getByTestId("confirm-upload"));

		await waitFor(() => {
			expect(mockUploadImage).toHaveBeenCalled();
			expect(onInsert).toHaveBeenCalledWith("![test.png](/api/images/test/org/_default/uploaded.png)", {
				path: "/api/images/test/org/_default/uploaded.png",
				width: 800,
				height: 600,
			});
		});
	});

	it("should call onError for invalid file type", () => {
		const onError = vi.fn();
		const { getByTestId } = render(<ImageInsert articleContent="" onInsert={vi.fn()} onError={onError} />);

		const fileInput = getByTestId("image-file-input") as HTMLInputElement;
		const file = new File(["test"], "test.txt", { type: "text/plain" });
		simulateFileSelect(fileInput, file);

		expect(onError).toHaveBeenCalledWith("Invalid file type");
	});

	it("should call onError for file too large", () => {
		const onError = vi.fn();
		const { getByTestId } = render(<ImageInsert articleContent="" onInsert={vi.fn()} onError={onError} />);

		const fileInput = getByTestId("image-file-input") as HTMLInputElement;
		// Create a mock file larger than 10MB with explicit size property
		const largeFile = createMockFile("large.png", "image/png", 11 * 1024 * 1024);
		simulateFileSelect(fileInput, largeFile);

		expect(onError).toHaveBeenCalledWith("File too large");
	});

	it("should cancel upload when cancel button is clicked", async () => {
		const onInsert = vi.fn();
		const { getByTestId, queryByTestId } = render(
			<ImageInsert articleContent="" onInsert={onInsert} onError={vi.fn()} />,
		);

		// Simulate file selection
		const fileInput = getByTestId("image-file-input") as HTMLInputElement;
		const file = new File(["test"], "test.png", { type: "image/png" });
		simulateFileSelect(fileInput, file);

		// Wait for dialog
		await waitFor(() => {
			expect(getByTestId("alt-text-dialog")).toBeDefined();
		});

		// Cancel
		fireEvent.click(getByTestId("cancel-upload"));

		// Dialog should close
		await waitFor(() => {
			expect(queryByTestId("alt-text-dialog")).toBeNull();
		});

		expect(onInsert).not.toHaveBeenCalled();
	});

	it("should show delete button when onDelete prop is provided", () => {
		const content = "![test](/api/images/t/o/d/test.png)";
		const onDelete = vi.fn();
		const { getByTestId } = render(
			<ImageInsert articleContent={content} onInsert={vi.fn()} onDelete={onDelete} onError={vi.fn()} />,
		);

		fireEvent.click(getByTestId("image-insert-button"));
		expect(getByTestId("delete-image-0")).toBeDefined();
	});

	it("should call onDelete when delete button is clicked", () => {
		const content = "![test](/api/images/t/o/d/test.png)";
		const onDelete = vi.fn();
		const { getByTestId } = render(
			<ImageInsert articleContent={content} onInsert={vi.fn()} onDelete={onDelete} onError={vi.fn()} />,
		);

		fireEvent.click(getByTestId("image-insert-button"));
		fireEvent.click(getByTestId("delete-image-0"));

		expect(onDelete).toHaveBeenCalledWith("/api/images/t/o/d/test.png");
	});

	it("should call onError when upload fails", async () => {
		const onError = vi.fn();
		mockUploadImage.mockRejectedValue(new Error("Upload failed"));

		const { getByTestId } = render(<ImageInsert articleContent="" onInsert={vi.fn()} onError={onError} />);

		const fileInput = getByTestId("image-file-input") as HTMLInputElement;
		const file = new File(["test"], "test.png", { type: "image/png" });
		simulateFileSelect(fileInput, file);

		await waitFor(() => {
			expect(getByTestId("alt-text-dialog")).toBeDefined();
		});

		fireEvent.click(getByTestId("confirm-upload"));

		await waitFor(() => {
			expect(onError).toHaveBeenCalledWith("Upload failed");
		});
	});

	it("should trigger file input when upload area is clicked", () => {
		const { getByTestId } = render(<ImageInsert articleContent="" onInsert={vi.fn()} onError={vi.fn()} />);

		// Open dropdown
		fireEvent.click(getByTestId("image-insert-button"));

		// Click on upload area
		const uploadArea = getByTestId("upload-new-image");
		const clickSpy = vi.fn();

		// Get the hidden file input and spy on its click method
		const fileInput = getByTestId("image-file-input") as HTMLInputElement;
		fileInput.click = clickSpy;

		fireEvent.click(uploadArea);

		expect(clickSpy).toHaveBeenCalled();
	});

	it("should handle file change event with no files selected", () => {
		const onInsert = vi.fn();
		const onError = vi.fn();
		const { getByTestId } = render(<ImageInsert articleContent="" onInsert={onInsert} onError={onError} />);

		const fileInput = getByTestId("image-file-input") as HTMLInputElement;

		// Simulate change event with empty files
		Object.defineProperty(fileInput, "files", {
			value: null,
			configurable: true,
		});
		const event = new Event("change", { bubbles: true });
		fileInput.dispatchEvent(event);

		// Nothing should happen - no error, no insert
		expect(onInsert).not.toHaveBeenCalled();
		expect(onError).not.toHaveBeenCalled();
	});

	it("should handle confirm upload with custom alt text", async () => {
		const onInsert = vi.fn();
		const { getByTestId } = render(<ImageInsert articleContent="" onInsert={onInsert} onError={vi.fn()} />);

		// Simulate file selection
		const fileInput = getByTestId("image-file-input") as HTMLInputElement;
		const file = new File(["test"], "test.png", { type: "image/png" });
		simulateFileSelect(fileInput, file);

		// Wait for dialog
		await waitFor(() => {
			expect(getByTestId("alt-text-dialog")).toBeDefined();
		});

		// Change alt text
		const altTextInput = getByTestId("alt-text-input") as HTMLInputElement;
		fireEvent.change(altTextInput, { target: { value: "My custom alt text" } });

		// Confirm upload
		fireEvent.click(getByTestId("confirm-upload"));

		await waitFor(() => {
			expect(mockUploadImage).toHaveBeenCalled();
			expect(onInsert).toHaveBeenCalledWith("![My custom alt text](/api/images/test/org/_default/uploaded.png)", {
				path: "/api/images/test/org/_default/uploaded.png",
				width: 800,
				height: 600,
			});
		});
	});

	it("should close dialog when clicking close button", async () => {
		const { getByTestId, queryByTestId } = render(
			<ImageInsert articleContent="" onInsert={vi.fn()} onError={vi.fn()} />,
		);

		// Simulate file selection
		const fileInput = getByTestId("image-file-input") as HTMLInputElement;
		const file = new File(["test"], "test.png", { type: "image/png" });
		simulateFileSelect(fileInput, file);

		// Wait for dialog
		await waitFor(() => {
			expect(getByTestId("alt-text-dialog")).toBeDefined();
		});

		// Click close button
		fireEvent.click(getByTestId("close-dialog"));

		// Dialog should close
		await waitFor(() => {
			expect(queryByTestId("alt-text-dialog")).toBeNull();
		});
	});

	it("should filter out broken images from the gallery", async () => {
		const content = "![test](/api/images/t/o/d/missing.png)";
		const { getByTestId, queryByTestId } = render(
			<ImageInsert articleContent={content} onInsert={vi.fn()} onError={vi.fn()} />,
		);

		// Open dropdown to see the gallery
		fireEvent.click(getByTestId("image-insert-button"));

		// Get the image element and trigger error
		const imageButton = getByTestId("reuse-image-0");
		const imgElement = imageButton.querySelector("img");
		expect(imgElement).not.toBeNull();
		if (!imgElement) {
			throw new Error("Image element not found");
		}

		// Trigger the onError event on the image
		fireEvent.error(imgElement);

		// The broken image should be filtered out entirely
		await waitFor(() => {
			expect(queryByTestId("reuse-image-0")).toBeNull();
		});
	});

	it("should keep working images when one fails to load", async () => {
		const content = `
			![missing](/api/images/t/o/d/missing.png)
			![valid](/api/images/t/o/d/valid.png)
		`;
		const { getByTestId, queryByTestId } = render(
			<ImageInsert articleContent={content} onInsert={vi.fn()} onError={vi.fn()} />,
		);

		// Open dropdown
		fireEvent.click(getByTestId("image-insert-button"));

		// Initially both images should be visible
		expect(getByTestId("reuse-image-0")).toBeDefined();
		expect(getByTestId("reuse-image-1")).toBeDefined();

		// Trigger error on the first image
		const firstImageButton = getByTestId("reuse-image-0");
		const firstImg = firstImageButton.querySelector("img");
		expect(firstImg).not.toBeNull();
		if (!firstImg) {
			throw new Error("First image element not found");
		}
		fireEvent.error(firstImg);

		// After filtering, only one image should remain (at index 0 now)
		await waitFor(() => {
			expect(getByTestId("reuse-image-0")).toBeDefined();
			// The second image button should no longer exist since indices shifted
			expect(queryByTestId("reuse-image-1")).toBeNull();
		});
	});
});

describe("extractImagesFromContent", () => {
	it("should extract markdown images", () => {
		const content = "![alt text](/api/images/t/o/d/image.png)";
		const images = extractImagesFromContent(content);
		expect(images).toHaveLength(1);
		expect(images[0]).toEqual({ src: "/api/images/t/o/d/image.png", alt: "alt text" });
	});

	it("should extract HTML images", () => {
		const content = '<img src="/api/images/t/o/d/image.png" alt="html alt" />';
		const images = extractImagesFromContent(content);
		expect(images).toHaveLength(1);
		expect(images[0]).toEqual({ src: "/api/images/t/o/d/image.png", alt: "html alt" });
	});

	it("should extract HTML images without alt text", () => {
		const content = '<img src="/api/images/t/o/d/image.png" />';
		const images = extractImagesFromContent(content);
		expect(images).toHaveLength(1);
		expect(images[0]).toEqual({ src: "/api/images/t/o/d/image.png", alt: "" });
	});

	it("should extract multiple images", () => {
		const content = `
			![first](/api/images/t/o/d/first.png)
			<img src="/api/images/t/o/d/second.png" alt="second" />
			![third](/api/images/t/o/d/third.png)
		`;
		const images = extractImagesFromContent(content);
		expect(images).toHaveLength(3);
	});

	it("should deduplicate images with same URL", () => {
		const content = `
			![first](/api/images/t/o/d/same.png)
			![second](/api/images/t/o/d/same.png)
		`;
		const images = extractImagesFromContent(content);
		expect(images).toHaveLength(1);
	});

	it("should only extract /api/images/ URLs", () => {
		const content = `
			![valid](/api/images/t/o/d/valid.png)
			![external](https://example.com/image.png)
		`;
		const images = extractImagesFromContent(content);
		expect(images).toHaveLength(1);
		expect(images[0].src).toBe("/api/images/t/o/d/valid.png");
	});

	it("should return empty array for content without images", () => {
		const content = "No images here, just text.";
		const images = extractImagesFromContent(content);
		expect(images).toHaveLength(0);
	});

	it("should handle empty alt text in markdown", () => {
		const content = "![](/api/images/t/o/d/noalt.png)";
		const images = extractImagesFromContent(content);
		expect(images).toHaveLength(1);
		expect(images[0]).toEqual({ src: "/api/images/t/o/d/noalt.png", alt: "" });
	});
});

describe("ImageInsert image load error handling", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUploadImage.mockResolvedValue({ url: "/api/images/test/org/_default/uploaded.png" });
	});

	it("should call onInsert without metadata when uploaded image fails to load", async () => {
		shouldTriggerImageError = true;
		const onInsert = vi.fn();
		const { getByTestId } = render(<ImageInsert articleContent="" onInsert={onInsert} onError={vi.fn()} />);

		// Simulate file selection
		const fileInput = getByTestId("image-file-input") as HTMLInputElement;
		const file = new File(["test"], "test.png", { type: "image/png" });
		simulateFileSelect(fileInput, file);

		// Wait for dialog and confirm upload
		await waitFor(() => {
			expect(getByTestId("alt-text-dialog")).toBeDefined();
		});

		fireEvent.click(getByTestId("confirm-upload"));

		await waitFor(() => {
			expect(mockUploadImage).toHaveBeenCalled();
			// Should be called with only markdown, no metadata (because image load failed)
			expect(onInsert).toHaveBeenCalledWith("![test.png](/api/images/test/org/_default/uploaded.png)");
		});
	});

	it("should call onInsert without metadata when reused image fails to load", async () => {
		shouldTriggerImageError = true;
		const content = "![my alt](/api/images/t/o/d/test.png)";
		const onInsert = vi.fn();
		const { getByTestId } = render(<ImageInsert articleContent={content} onInsert={onInsert} onError={vi.fn()} />);

		fireEvent.click(getByTestId("image-insert-button"));
		fireEvent.click(getByTestId("reuse-image-0"));

		// Wait for onInsert to be called (without metadata because image load failed)
		await waitFor(() => {
			expect(onInsert).toHaveBeenCalledWith("![my alt](/api/images/t/o/d/test.png)");
		});
	});
});
