import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
	DialogTrigger,
} from "./Dialog";
import { fireEvent, render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

describe("Dialog", () => {
	it("should render DialogContent with title and description", () => {
		render(
			<Dialog open={true}>
				<DialogContent data-testid="dialog-content">
					<DialogHeader>
						<DialogTitle data-testid="dialog-title">Test Title</DialogTitle>
						<DialogDescription data-testid="dialog-description">Test Description</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>,
		);

		expect(screen.getByTestId("dialog-content")).toBeDefined();
		expect(screen.getByTestId("dialog-title")).toBeDefined();
		expect(screen.getByTestId("dialog-description")).toBeDefined();
		expect(screen.getByText("Test Title")).toBeDefined();
		expect(screen.getByText("Test Description")).toBeDefined();
	});

	it("should render DialogHeader", () => {
		render(
			<Dialog open={true}>
				<DialogContent>
					<DialogHeader data-testid="dialog-header">
						<DialogTitle>Header Title</DialogTitle>
					</DialogHeader>
				</DialogContent>
			</Dialog>,
		);

		expect(screen.getByTestId("dialog-header")).toBeDefined();
	});

	it("should render DialogHeader with custom className", () => {
		render(
			<Dialog open={true}>
				<DialogContent>
					<DialogHeader className="custom-header" data-testid="custom-header">
						<DialogTitle>Title</DialogTitle>
					</DialogHeader>
				</DialogContent>
			</Dialog>,
		);

		const header = screen.getByTestId("custom-header");
		expect(header.className).toContain("custom-header");
	});

	it("should render DialogFooter", () => {
		render(
			<Dialog open={true}>
				<DialogContent>
					<DialogFooter data-testid="dialog-footer">
						<button>Cancel</button>
						<button>Confirm</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>,
		);

		expect(screen.getByTestId("dialog-footer")).toBeDefined();
		expect(screen.getByText("Cancel")).toBeDefined();
		expect(screen.getByText("Confirm")).toBeDefined();
	});

	it("should render DialogFooter with custom className", () => {
		render(
			<Dialog open={true}>
				<DialogContent>
					<DialogFooter className="custom-footer" data-testid="custom-footer">
						<button>OK</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>,
		);

		const footer = screen.getByTestId("custom-footer");
		expect(footer.className).toContain("custom-footer");
	});

	it("should render DialogTitle with custom className", () => {
		render(
			<Dialog open={true}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className="custom-title" data-testid="custom-title">
							Custom Title
						</DialogTitle>
					</DialogHeader>
				</DialogContent>
			</Dialog>,
		);

		const title = screen.getByTestId("custom-title");
		expect(title.className).toContain("custom-title");
	});

	it("should render DialogDescription with custom className", () => {
		render(
			<Dialog open={true}>
				<DialogContent>
					<DialogHeader>
						<DialogDescription className="custom-desc" data-testid="custom-desc">
							Custom Description
						</DialogDescription>
					</DialogHeader>
				</DialogContent>
			</Dialog>,
		);

		const description = screen.getByTestId("custom-desc");
		expect(description.className).toContain("custom-desc");
	});

	it("should render close button", () => {
		render(
			<Dialog open={true}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Title</DialogTitle>
					</DialogHeader>
				</DialogContent>
			</Dialog>,
		);

		// The close button has sr-only text "Close"
		expect(screen.getByText("Close")).toBeDefined();
	});

	it("should render DialogOverlay", () => {
		render(
			<Dialog open={true}>
				<DialogPortal>
					<DialogOverlay data-testid="dialog-overlay" />
				</DialogPortal>
			</Dialog>,
		);

		expect(screen.getByTestId("dialog-overlay")).toBeDefined();
	});

	it("should render DialogOverlay with custom className", () => {
		render(
			<Dialog open={true}>
				<DialogPortal>
					<DialogOverlay className="custom-overlay" />
				</DialogPortal>
			</Dialog>,
		);

		// The mock always uses data-testid="dialog-overlay"
		const overlay = screen.getByTestId("dialog-overlay");
		expect(overlay.className).toContain("custom-overlay");
	});

	it("should render DialogContent with custom className", () => {
		render(
			<Dialog open={true}>
				<DialogContent className="custom-content" data-testid="custom-content">
					<DialogTitle>Title</DialogTitle>
				</DialogContent>
			</Dialog>,
		);

		const content = screen.getByTestId("custom-content");
		expect(content.className).toContain("custom-content");
	});

	it("should render complete dialog structure", () => {
		render(
			<Dialog open={true}>
				<DialogTrigger>Open</DialogTrigger>
				<DialogContent data-testid="complete-dialog">
					<DialogHeader>
						<DialogTitle>Complete Dialog</DialogTitle>
						<DialogDescription>This is a complete dialog example</DialogDescription>
					</DialogHeader>
					<div>Dialog body content</div>
					<DialogFooter>
						<button>Cancel</button>
						<button>Save</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>,
		);

		expect(screen.getByTestId("complete-dialog")).toBeDefined();
		expect(screen.getByText("Complete Dialog")).toBeDefined();
		expect(screen.getByText("This is a complete dialog example")).toBeDefined();
		expect(screen.getByText("Dialog body content")).toBeDefined();
		expect(screen.getByText("Cancel")).toBeDefined();
		expect(screen.getByText("Save")).toBeDefined();
	});

	it("should render DialogClose component", () => {
		render(
			<Dialog open={true}>
				<DialogContent>
					<DialogTitle>Title</DialogTitle>
					<DialogClose data-testid="dialog-close-button">Close</DialogClose>
				</DialogContent>
			</Dialog>,
		);

		expect(screen.getByTestId("dialog-close-button")).toBeDefined();
	});

	it("should support clicking overlay", () => {
		render(
			<Dialog open={true}>
				<DialogContent>
					<DialogTitle>Title</DialogTitle>
				</DialogContent>
			</Dialog>,
		);

		// The overlay should be rendered (from DialogContent component)
		const overlay = screen.getByTestId("dialog-overlay");
		expect(overlay).toBeDefined();

		// Simulate clicking the overlay
		fireEvent.click(overlay);
	});
});
