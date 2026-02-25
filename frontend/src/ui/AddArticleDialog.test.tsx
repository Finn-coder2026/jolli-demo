import { AddArticleDialog } from "./AddArticleDialog";
import { fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

// Mock the lucide-react icons
vi.mock("lucide-react", async importOriginal => {
	const actual = await importOriginal<typeof import("lucide-react")>();
	return {
		...actual,
		X: () => <div data-testid="x-icon" />,
	};
});

describe("AddArticleDialog", () => {
	it("should not render when isOpen is false", () => {
		const mockOnClose = vi.fn();
		const mockOnSave = vi.fn();

		render(<AddArticleDialog isOpen={false} onClose={mockOnClose} onSave={mockOnSave} />);

		expect(screen.queryByText("Add Article")).toBeNull();
	});

	it("should render when isOpen is true", () => {
		const mockOnClose = vi.fn();
		const mockOnSave = vi.fn();

		render(<AddArticleDialog isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

		expect(screen.getByText("Add Article")).toBeDefined();
		expect(screen.getByLabelText(/JRN/)).toBeDefined();
		expect(screen.getByLabelText(/Title/)).toBeDefined();
		expect(screen.getByLabelText(/Content \(Markdown\)/)).toBeDefined();
	});

	it("should show placeholder text in inputs", () => {
		const mockOnClose = vi.fn();
		const mockOnSave = vi.fn();

		render(<AddArticleDialog isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

		const arnInput = screen.getByPlaceholderText("/home/space-1/my-article.md");
		const titleInput = screen.getByPlaceholderText("My Article Title");
		const contentInput = screen.getByPlaceholderText(/Write your markdown content here/);

		expect(arnInput).toBeDefined();
		expect(titleInput).toBeDefined();
		expect(contentInput).toBeDefined();
	});

	it("should call onClose when Close button is clicked", () => {
		const mockOnClose = vi.fn();
		const mockOnSave = vi.fn();

		render(<AddArticleDialog isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

		const closeButton = screen.getByRole("button", { name: /Close/ });
		fireEvent.click(closeButton);

		expect(mockOnClose).toHaveBeenCalledTimes(1);
	});

	it("should call onClose when X button is clicked", () => {
		const mockOnClose = vi.fn();
		const mockOnSave = vi.fn();

		render(<AddArticleDialog isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

		const xButton = screen.getByTestId("x-icon").parentElement as HTMLButtonElement;
		fireEvent.click(xButton);

		expect(mockOnClose).toHaveBeenCalledTimes(1);
	});

	it("should call onClose when clicking on backdrop", () => {
		const mockOnClose = vi.fn();
		const mockOnSave = vi.fn();

		render(<AddArticleDialog isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

		const backdrop = document.querySelector(".fixed.inset-0") as HTMLElement;
		fireEvent.click(backdrop);

		expect(mockOnClose).toHaveBeenCalledTimes(1);
	});

	it("should not close when clicking inside the dialog", () => {
		const mockOnClose = vi.fn();
		const mockOnSave = vi.fn();

		render(<AddArticleDialog isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

		const dialog = document.querySelector(".bg-card") as HTMLElement;
		fireEvent.click(dialog);

		expect(mockOnClose).not.toHaveBeenCalled();
	});

	it("should show error when JRN is empty", async () => {
		const mockOnClose = vi.fn();
		const mockOnSave = vi.fn();

		render(<AddArticleDialog isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

		const saveButton = screen.getByRole("button", { name: /^Save$/ });
		fireEvent.click(saveButton);

		await waitFor(() => {
			expect(screen.getByText("JRN is required")).toBeDefined();
		});

		expect(mockOnSave).not.toHaveBeenCalled();
	});

	it("should show error when title is empty", async () => {
		const mockOnClose = vi.fn();
		const mockOnSave = vi.fn();

		render(<AddArticleDialog isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

		const arnInput = screen.getByLabelText(/JRN/) as HTMLInputElement;
		fireEvent.input(arnInput, { target: { value: "/home/space-1/test.md" } });

		const saveButton = screen.getByRole("button", { name: /^Save$/ });
		fireEvent.click(saveButton);

		await waitFor(() => {
			expect(screen.getByText("Title is required")).toBeDefined();
		});

		expect(mockOnSave).not.toHaveBeenCalled();
	});

	it("should show error when content is empty", async () => {
		const mockOnClose = vi.fn();
		const mockOnSave = vi.fn();

		render(<AddArticleDialog isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

		const arnInput = screen.getByLabelText(/JRN/) as HTMLInputElement;
		const titleInput = screen.getByLabelText(/Title/) as HTMLInputElement;

		fireEvent.input(arnInput, { target: { value: "/home/space-1/test.md" } });
		fireEvent.input(titleInput, { target: { value: "Test Title" } });

		const saveButton = screen.getByRole("button", { name: /^Save$/ });
		fireEvent.click(saveButton);

		await waitFor(() => {
			expect(screen.getByText("Content is required")).toBeDefined();
		});

		expect(mockOnSave).not.toHaveBeenCalled();
	});

	it("should call onSave with trimmed values when all fields are filled", async () => {
		const mockOnClose = vi.fn();
		const mockOnSave = vi.fn().mockResolvedValue(undefined);

		render(<AddArticleDialog isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

		const arnInput = screen.getByLabelText(/JRN/) as HTMLInputElement;
		const titleInput = screen.getByLabelText(/Title/) as HTMLInputElement;
		const contentInput = screen.getByLabelText(/Content \(Markdown\)/) as HTMLTextAreaElement;

		fireEvent.input(arnInput, { target: { value: "  /home/space-1/test.md  " } });
		fireEvent.input(titleInput, { target: { value: "  Test Title  " } });
		fireEvent.input(contentInput, { target: { value: "  # Test Content  " } });

		const saveButton = screen.getByRole("button", { name: /^Save$/ });
		fireEvent.click(saveButton);

		await waitFor(() => {
			expect(mockOnSave).toHaveBeenCalledWith({
				jrn: "/home/space-1/test.md",
				title: "Test Title",
				content: "# Test Content",
			});
		});

		expect(mockOnClose).toHaveBeenCalledTimes(1);
	});

	it("should show Saving... while saving", async () => {
		const mockOnClose = vi.fn();
		const mockOnSave = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

		render(<AddArticleDialog isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

		const arnInput = screen.getByLabelText(/JRN/) as HTMLInputElement;
		const titleInput = screen.getByLabelText(/Title/) as HTMLInputElement;
		const contentInput = screen.getByLabelText(/Content \(Markdown\)/) as HTMLTextAreaElement;

		fireEvent.input(arnInput, { target: { value: "/home/space-1/test.md" } });
		fireEvent.input(titleInput, { target: { value: "Test Title" } });
		fireEvent.input(contentInput, { target: { value: "# Test Content" } });

		const saveButton = screen.getByRole("button", { name: /^Save$/ });
		fireEvent.click(saveButton);

		await waitFor(() => {
			expect(screen.getByRole("button", { name: /Saving.../ })).toBeDefined();
		});
	});

	it("should disable buttons while saving", async () => {
		const mockOnClose = vi.fn();
		const mockOnSave = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));

		render(<AddArticleDialog isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

		const arnInput = screen.getByLabelText(/JRN/) as HTMLInputElement;
		const titleInput = screen.getByLabelText(/Title/) as HTMLInputElement;
		const contentInput = screen.getByLabelText(/Content \(Markdown\)/) as HTMLTextAreaElement;

		fireEvent.input(arnInput, { target: { value: "/home/space-1/test.md" } });
		fireEvent.input(titleInput, { target: { value: "Test Title" } });
		fireEvent.input(contentInput, { target: { value: "# Test Content" } });

		const saveButton = screen.getByRole("button", { name: /^Save$/ });
		fireEvent.click(saveButton);

		await waitFor(() => {
			const savingButton = screen.getByRole("button", { name: /Saving.../ });
			const closeButton = screen.getByRole("button", { name: /Close/ });

			expect(savingButton.hasAttribute("disabled")).toBe(true);
			expect(closeButton.hasAttribute("disabled")).toBe(true);
		});
	});

	it("should show error message when onSave throws", async () => {
		const mockOnClose = vi.fn();
		const mockOnSave = vi.fn().mockRejectedValue(new Error("Failed to save"));

		render(<AddArticleDialog isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

		const arnInput = screen.getByLabelText(/JRN/) as HTMLInputElement;
		const titleInput = screen.getByLabelText(/Title/) as HTMLInputElement;
		const contentInput = screen.getByLabelText(/Content \(Markdown\)/) as HTMLTextAreaElement;

		fireEvent.input(arnInput, { target: { value: "/home/space-1/test.md" } });
		fireEvent.input(titleInput, { target: { value: "Test Title" } });
		fireEvent.input(contentInput, { target: { value: "# Test Content" } });

		const saveButton = screen.getByRole("button", { name: /^Save$/ });
		fireEvent.click(saveButton);

		await waitFor(() => {
			expect(screen.getByText("Failed to save")).toBeDefined();
		});

		expect(mockOnClose).not.toHaveBeenCalled();
	});

	it("should show generic error message when onSave throws non-Error", async () => {
		const mockOnClose = vi.fn();
		const mockOnSave = vi.fn().mockRejectedValue("Some string error");

		render(<AddArticleDialog isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

		const arnInput = screen.getByLabelText(/JRN/) as HTMLInputElement;
		const titleInput = screen.getByLabelText(/Title/) as HTMLInputElement;
		const contentInput = screen.getByLabelText(/Content \(Markdown\)/) as HTMLTextAreaElement;

		fireEvent.input(arnInput, { target: { value: "/home/space-1/test.md" } });
		fireEvent.input(titleInput, { target: { value: "Test Title" } });
		fireEvent.input(contentInput, { target: { value: "# Test Content" } });

		const saveButton = screen.getByRole("button", { name: /^Save$/ });
		fireEvent.click(saveButton);

		await waitFor(() => {
			expect(screen.getByText("Failed to save article")).toBeDefined();
		});

		expect(mockOnClose).not.toHaveBeenCalled();
	});

	it("should clear form when save is successful", async () => {
		const mockOnClose = vi.fn();
		const mockOnSave = vi.fn().mockResolvedValue(undefined);

		const { rerender } = render(<AddArticleDialog isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

		const arnInput = screen.getByLabelText(/JRN/) as HTMLInputElement;
		const titleInput = screen.getByLabelText(/Title/) as HTMLInputElement;
		const contentInput = screen.getByLabelText(/Content \(Markdown\)/) as HTMLTextAreaElement;

		fireEvent.input(arnInput, { target: { value: "/home/space-1/test.md" } });
		fireEvent.input(titleInput, { target: { value: "Test Title" } });
		fireEvent.input(contentInput, { target: { value: "# Test Content" } });

		const saveButton = screen.getByRole("button", { name: /^Save$/ });
		fireEvent.click(saveButton);

		await waitFor(() => {
			expect(mockOnSave).toHaveBeenCalled();
			expect(mockOnClose).toHaveBeenCalled();
		});

		// Reopen the dialog
		rerender(<AddArticleDialog isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

		// Check that form is cleared
		const arnInputAfter = screen.getByLabelText(/JRN/) as HTMLInputElement;
		const titleInputAfter = screen.getByLabelText(/Title/) as HTMLInputElement;
		const contentInputAfter = screen.getByLabelText(/Content \(Markdown\)/) as HTMLTextAreaElement;

		expect(arnInputAfter.value).toBe("");
		expect(titleInputAfter.value).toBe("");
		expect(contentInputAfter.value).toBe("");
	});

	it("should clear form when closed manually", () => {
		const mockOnClose = vi.fn();
		const mockOnSave = vi.fn();

		const { rerender } = render(<AddArticleDialog isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

		const arnInput = screen.getByLabelText(/JRN/) as HTMLInputElement;
		const titleInput = screen.getByLabelText(/Title/) as HTMLInputElement;
		const contentInput = screen.getByLabelText(/Content \(Markdown\)/) as HTMLTextAreaElement;

		fireEvent.input(arnInput, { target: { value: "/home/space-1/test.md" } });
		fireEvent.input(titleInput, { target: { value: "Test Title" } });
		fireEvent.input(contentInput, { target: { value: "# Test Content" } });

		const closeButton = screen.getByRole("button", { name: /Close/ });
		fireEvent.click(closeButton);

		expect(mockOnClose).toHaveBeenCalled();

		// Reopen the dialog
		rerender(<AddArticleDialog isOpen={true} onClose={mockOnClose} onSave={mockOnSave} />);

		// Check that form is cleared
		const arnInputAfter = screen.getByLabelText(/JRN/) as HTMLInputElement;
		const titleInputAfter = screen.getByLabelText(/Title/) as HTMLInputElement;
		const contentInputAfter = screen.getByLabelText(/Content \(Markdown\)/) as HTMLTextAreaElement;

		expect(arnInputAfter.value).toBe("");
		expect(titleInputAfter.value).toBe("");
		expect(contentInputAfter.value).toBe("");
	});
});
