import { handleStopPropagation, NewArticleTitleDialog } from "./NewArticleTitleDialog";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { act } from "preact/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

let capturedOnValueChange: ((value: string) => void) | null = null;

vi.mock("../../components/ui/SelectBox", () => {
	return {
		SelectBox: ({
			value,
			onValueChange,
			options,
			...props
		}: {
			value: string;
			onValueChange: (value: string) => void;
			options: Array<{ value: string; label: string }>;
			width?: string;
			className?: string;
			"data-testid"?: string;
		}) => {
			capturedOnValueChange = onValueChange;
			return (
				<select
					data-testid={props["data-testid"]}
					value={value}
					onChange={e => {
						const target = e.target as HTMLSelectElement;
						onValueChange(target.value);
					}}
				>
					{options.map(opt => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
				</select>
			);
		},
	};
});

describe("NewArticleTitleDialog", () => {
	const mockOnCreateWithTitle = vi.fn();
	const mockOnClose = vi.fn();

	beforeEach(() => {
		mockOnCreateWithTitle.mockClear();
		mockOnClose.mockClear();
		capturedOnValueChange = null;
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

		// The default value should be visible (Markdown)
		expect(screen.getByText("Markdown")).toBeDefined();
	});

	it("should show type description text", () => {
		render(<NewArticleTitleDialog onCreateWithTitle={mockOnCreateWithTitle} onClose={mockOnClose} />);

		expect(
			screen.getByText("Choose Markdown for documentation articles, or OpenAPI format for API specifications."),
		).toBeDefined();
	});

	it("should call onCreateWithTitle with JSON contentType when changed", async () => {
		render(<NewArticleTitleDialog onCreateWithTitle={mockOnCreateWithTitle} onClose={mockOnClose} />);

		const titleInput = screen.getByTestId("title-input");
		fireEvent.input(titleInput, { target: { value: "API Documentation" } });

		const onChange = capturedOnValueChange;
		if (onChange) {
			await act(() => {
				onChange("application/json");
			});
		}

		const createButton = screen.getByTestId("create-button");
		fireEvent.click(createButton);

		await waitFor(() => {
			expect(mockOnCreateWithTitle).toHaveBeenCalledWith("API Documentation", "application/json");
		});
	});

	it("should call onCreateWithTitle with YAML contentType when changed", async () => {
		render(<NewArticleTitleDialog onCreateWithTitle={mockOnCreateWithTitle} onClose={mockOnClose} />);

		const titleInput = screen.getByTestId("title-input");
		fireEvent.input(titleInput, { target: { value: "Config File" } });

		const onChange = capturedOnValueChange;
		if (onChange) {
			act(() => {
				onChange("application/yaml");
			});
		}

		const createButton = screen.getByTestId("create-button");
		fireEvent.click(createButton);

		await waitFor(() => {
			expect(mockOnCreateWithTitle).toHaveBeenCalledWith("Config File", "application/yaml");
		});
	});

	it("should trigger onCreateWithTitle with JSON type when pressing Enter after changing contentType", async () => {
		render(<NewArticleTitleDialog onCreateWithTitle={mockOnCreateWithTitle} onClose={mockOnClose} />);

		const titleInput = screen.getByTestId("title-input");
		fireEvent.input(titleInput, { target: { value: "API Spec" } });

		const onChange = capturedOnValueChange;
		if (onChange) {
			act(() => {
				onChange("application/json");
			});
		}

		fireEvent.keyDown(titleInput, { key: "Enter" });

		await waitFor(() => {
			expect(mockOnCreateWithTitle).toHaveBeenCalledWith("API Spec", "application/json");
		});
	});
});
