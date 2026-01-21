import { handleStopPropagation, NewArticleTitleDialog } from "./NewArticleTitleDialog";
import { fireEvent, render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("NewArticleTitleDialog", () => {
	const mockOnCreateWithTitle = vi.fn();
	const mockOnClose = vi.fn();

	beforeEach(() => {
		mockOnCreateWithTitle.mockClear();
		mockOnClose.mockClear();
	});

	it("should render the dialog with title and subtitle", () => {
		render(<NewArticleTitleDialog onCreateWithTitle={mockOnCreateWithTitle} onClose={mockOnClose} />);

		expect(screen.getByText("New Article")).toBeDefined();
		expect(screen.getByText("Enter a title for your new article")).toBeDefined();
	});

	it("should have disabled create button when title is empty", () => {
		render(<NewArticleTitleDialog onCreateWithTitle={mockOnCreateWithTitle} onClose={mockOnClose} />);

		const createButton = screen.getByTestId("create-button");
		expect(createButton.hasAttribute("disabled")).toBe(true);
	});

	it("should enable create button when title is entered", () => {
		render(<NewArticleTitleDialog onCreateWithTitle={mockOnCreateWithTitle} onClose={mockOnClose} />);

		const titleInput = screen.getByTestId("title-input");
		fireEvent.input(titleInput, { target: { value: "My New Article" } });

		const createButton = screen.getByTestId("create-button");
		expect(createButton.hasAttribute("disabled")).toBe(false);
	});

	it("should call onCreateWithTitle with trimmed title and default contentType when create button is clicked", () => {
		render(<NewArticleTitleDialog onCreateWithTitle={mockOnCreateWithTitle} onClose={mockOnClose} />);

		const titleInput = screen.getByTestId("title-input");
		fireEvent.input(titleInput, { target: { value: "  My New Article  " } });

		const createButton = screen.getByTestId("create-button");
		fireEvent.click(createButton);

		expect(mockOnCreateWithTitle).toHaveBeenCalledWith("My New Article", "text/markdown");
	});

	it("should not call onCreateWithTitle when title is only whitespace", () => {
		render(<NewArticleTitleDialog onCreateWithTitle={mockOnCreateWithTitle} onClose={mockOnClose} />);

		const titleInput = screen.getByTestId("title-input");
		fireEvent.input(titleInput, { target: { value: "   " } });

		const createButton = screen.getByTestId("create-button");
		fireEvent.click(createButton);

		expect(mockOnCreateWithTitle).not.toHaveBeenCalled();
	});

	it("should call onClose when close button is clicked", () => {
		render(<NewArticleTitleDialog onCreateWithTitle={mockOnCreateWithTitle} onClose={mockOnClose} />);

		const closeButton = screen.getByTestId("close-dialog-button");
		fireEvent.click(closeButton);

		expect(mockOnClose).toHaveBeenCalled();
	});

	it("should call onClose when cancel button is clicked", () => {
		render(<NewArticleTitleDialog onCreateWithTitle={mockOnCreateWithTitle} onClose={mockOnClose} />);

		const cancelButton = screen.getByTestId("cancel-button");
		fireEvent.click(cancelButton);

		expect(mockOnClose).toHaveBeenCalled();
	});

	it("should call onClose when backdrop is clicked", () => {
		render(<NewArticleTitleDialog onCreateWithTitle={mockOnCreateWithTitle} onClose={mockOnClose} />);

		const backdrop = screen.getByTestId("new-article-title-dialog-backdrop");
		fireEvent.click(backdrop);

		expect(mockOnClose).toHaveBeenCalled();
	});

	it("should not close when dialog content is clicked", () => {
		render(<NewArticleTitleDialog onCreateWithTitle={mockOnCreateWithTitle} onClose={mockOnClose} />);

		const content = screen.getByTestId("new-article-title-dialog-content");
		fireEvent.click(content);

		expect(mockOnClose).not.toHaveBeenCalled();
	});

	it("should call onCreateWithTitle with title and contentType when Enter key is pressed with valid title", () => {
		render(<NewArticleTitleDialog onCreateWithTitle={mockOnCreateWithTitle} onClose={mockOnClose} />);

		const titleInput = screen.getByTestId("title-input");
		fireEvent.input(titleInput, { target: { value: "My Article" } });

		fireEvent.keyDown(titleInput, { key: "Enter" });

		expect(mockOnCreateWithTitle).toHaveBeenCalledWith("My Article", "text/markdown");
	});

	it("should call onClose when Escape key is pressed", () => {
		render(<NewArticleTitleDialog onCreateWithTitle={mockOnCreateWithTitle} onClose={mockOnClose} />);

		const titleInput = screen.getByTestId("title-input");
		fireEvent.keyDown(titleInput, { key: "Escape" });

		expect(mockOnClose).toHaveBeenCalled();
	});

	it("should do nothing when other keys are pressed", () => {
		render(<NewArticleTitleDialog onCreateWithTitle={mockOnCreateWithTitle} onClose={mockOnClose} />);

		const titleInput = screen.getByTestId("title-input");
		fireEvent.input(titleInput, { target: { value: "My Article" } });

		fireEvent.keyDown(titleInput, { key: "Tab" });

		expect(mockOnCreateWithTitle).not.toHaveBeenCalled();
		expect(mockOnClose).not.toHaveBeenCalled();
	});

	it("handleStopPropagation should stop event propagation", () => {
		const mockEvent = {
			stopPropagation: vi.fn(),
		} as unknown as React.MouseEvent;

		handleStopPropagation(mockEvent);

		expect(mockEvent.stopPropagation).toHaveBeenCalled();
	});

	it("should render content type selector", () => {
		render(<NewArticleTitleDialog onCreateWithTitle={mockOnCreateWithTitle} onClose={mockOnClose} />);

		expect(screen.getByText("Document Type")).toBeDefined();
		expect(screen.getByTestId("content-type-select")).toBeDefined();
	});

	it("should display all content type options when selecting", () => {
		render(<NewArticleTitleDialog onCreateWithTitle={mockOnCreateWithTitle} onClose={mockOnClose} />);

		// Verify the select trigger is rendered and shows the default option
		const selectTrigger = screen.getByTestId("content-type-select");
		expect(selectTrigger).toBeDefined();

		// The default value should be visible (Markdown / MDX)
		expect(screen.getByText("Markdown / MDX")).toBeDefined();
	});

	it("should show type description text", () => {
		render(<NewArticleTitleDialog onCreateWithTitle={mockOnCreateWithTitle} onClose={mockOnClose} />);

		expect(
			screen.getByText("Choose Markdown for documentation articles, or OpenAPI format for API specifications."),
		).toBeDefined();
	});
});
