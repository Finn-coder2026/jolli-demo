import { DiffDialog } from "./DiffDialog";
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";

// Mock diff2html
vi.mock("diff2html", () => ({
	html: vi.fn((diff: string) => `<div class="mock-diff">${diff}</div>`),
}));

// Mock the CSS import
vi.mock("diff2html/bundles/css/diff2html.min.css", () => ({}));

describe("DiffDialog", () => {
	const mockOnClose = vi.fn();
	const mockOnConfirm = vi.fn();
	const mockDiffContent = `--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
 line 1
-line 2
+line 2 modified
 line 3`;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should not render when isOpen is false", () => {
		render(<DiffDialog isOpen={false} title="test.txt" diffContent={mockDiffContent} onClose={mockOnClose} />);

		expect(screen.queryByTestId("diff-dialog")).toBe(null);
	});

	it("should render when isOpen is true", () => {
		render(
			<DiffDialog
				isOpen={true}
				title="file_v1.txt vs file_v2.txt"
				diffContent={mockDiffContent}
				onClose={mockOnClose}
			/>,
		);

		expect(screen.getByTestId("diff-dialog")).toBeDefined();
		expect(screen.getByTestId("diff-dialog-title")).toBeDefined();
		expect(screen.getByText("file_v1.txt vs file_v2.txt")).toBeDefined();
	});

	it("should display diff content", () => {
		render(<DiffDialog isOpen={true} title="test.txt" diffContent={mockDiffContent} onClose={mockOnClose} />);

		expect(screen.getByTestId("diff-dialog-content")).toBeDefined();
	});

	it("should call onClose when close button is clicked", () => {
		render(<DiffDialog isOpen={true} title="test.txt" diffContent={mockDiffContent} onClose={mockOnClose} />);

		fireEvent.click(screen.getByTestId("diff-dialog-close"));
		expect(mockOnClose).toHaveBeenCalledTimes(1);
	});

	it("should call onClose when cancel button is clicked", () => {
		render(<DiffDialog isOpen={true} title="test.txt" diffContent={mockDiffContent} onClose={mockOnClose} />);

		fireEvent.click(screen.getByTestId("diff-dialog-cancel"));
		expect(mockOnClose).toHaveBeenCalledTimes(1);
	});

	it("should call onClose when backdrop is clicked", () => {
		render(<DiffDialog isOpen={true} title="test.txt" diffContent={mockDiffContent} onClose={mockOnClose} />);

		fireEvent.click(screen.getByTestId("diff-dialog"));
		expect(mockOnClose).toHaveBeenCalledTimes(1);
	});

	it("should not call onClose when dialog content is clicked", () => {
		render(<DiffDialog isOpen={true} title="test.txt" diffContent={mockDiffContent} onClose={mockOnClose} />);

		fireEvent.click(screen.getByTestId("diff-dialog-title"));
		expect(mockOnClose).not.toHaveBeenCalled();
	});

	it("should call onConfirm when confirm button is clicked", () => {
		render(
			<DiffDialog
				isOpen={true}
				title="test.txt"
				diffContent={mockDiffContent}
				onClose={mockOnClose}
				onConfirm={mockOnConfirm}
			/>,
		);

		fireEvent.click(screen.getByTestId("diff-dialog-confirm"));
		expect(mockOnConfirm).toHaveBeenCalledTimes(1);
		// onClose should NOT be called automatically - caller controls dialog closure
		expect(mockOnClose).not.toHaveBeenCalled();
	});

	it("should hide confirm button when showConfirm is false", () => {
		render(
			<DiffDialog
				isOpen={true}
				title="test.txt"
				diffContent={mockDiffContent}
				onClose={mockOnClose}
				showConfirm={false}
			/>,
		);

		expect(screen.queryByTestId("diff-dialog-confirm")).toBe(null);
		expect(screen.getByTestId("diff-dialog-cancel")).toBeDefined();
	});

	it("should apply correct size classes for sm size", () => {
		const { container } = render(
			<DiffDialog isOpen={true} title="test.txt" diffContent={mockDiffContent} onClose={mockOnClose} size="sm" />,
		);

		const dialog = container.querySelector('[data-testid="diff-dialog"] > div');
		expect(dialog?.className).toContain("w-[50vw]");
		expect(dialog?.className).toContain("h-[50vh]");
	});

	it("should apply correct size classes for md size", () => {
		const { container } = render(
			<DiffDialog isOpen={true} title="test.txt" diffContent={mockDiffContent} onClose={mockOnClose} size="md" />,
		);

		const dialog = container.querySelector('[data-testid="diff-dialog"] > div');
		expect(dialog?.className).toContain("w-[60vw]");
		expect(dialog?.className).toContain("h-[60vh]");
	});

	it("should apply correct size classes for lg size (default)", () => {
		const { container } = render(
			<DiffDialog isOpen={true} title="test.txt" diffContent={mockDiffContent} onClose={mockOnClose} />,
		);

		const dialog = container.querySelector('[data-testid="diff-dialog"] > div');
		expect(dialog?.className).toContain("w-[70vw]");
		expect(dialog?.className).toContain("h-[70vh]");
	});

	it("should apply correct size classes for xl size", () => {
		const { container } = render(
			<DiffDialog isOpen={true} title="test.txt" diffContent={mockDiffContent} onClose={mockOnClose} size="xl" />,
		);

		const dialog = container.querySelector('[data-testid="diff-dialog"] > div');
		expect(dialog?.className).toContain("w-[80vw]");
		expect(dialog?.className).toContain("h-[80vh]");
	});

	it("should apply correct size classes for full size", () => {
		const { container } = render(
			<DiffDialog
				isOpen={true}
				title="test.txt"
				diffContent={mockDiffContent}
				onClose={mockOnClose}
				size="full"
			/>,
		);

		const dialog = container.querySelector('[data-testid="diff-dialog"] > div');
		expect(dialog?.className).toContain("w-[90vw]");
		expect(dialog?.className).toContain("h-[90vh]");
	});

	it("should display no diff message when diffContent is empty", () => {
		render(<DiffDialog isOpen={true} title="test.txt" diffContent="" onClose={mockOnClose} />);

		expect(screen.getByText("No differences to display")).toBeDefined();
	});

	it("should have z-index higher than z-50", () => {
		const { container } = render(
			<DiffDialog isOpen={true} title="test.txt" diffContent={mockDiffContent} onClose={mockOnClose} />,
		);

		const backdrop = container.querySelector('[data-testid="diff-dialog"]');
		expect(backdrop?.className).toContain("z-[60]");
	});

	it("should work without onConfirm callback", () => {
		render(<DiffDialog isOpen={true} title="test.txt" diffContent={mockDiffContent} onClose={mockOnClose} />);

		// Should not throw when clicking confirm without onConfirm
		fireEvent.click(screen.getByTestId("diff-dialog-confirm"));
		// onClose is not called - caller must handle dialog closure
		expect(mockOnClose).not.toHaveBeenCalled();
	});
});
