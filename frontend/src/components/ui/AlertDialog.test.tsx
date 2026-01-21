import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogOverlay,
	AlertDialogPortal,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "./AlertDialog";
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

describe("AlertDialog", () => {
	it("should render AlertDialogContent with title and description", () => {
		render(
			<AlertDialog open={true}>
				<AlertDialogContent data-testid="alert-content">
					<AlertDialogHeader>
						<AlertDialogTitle>Are you sure?</AlertDialogTitle>
						<AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction>Continue</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>,
		);

		expect(screen.getByTestId("alert-content")).toBeDefined();
		expect(screen.getByText("Are you sure?")).toBeDefined();
		expect(screen.getByText("This action cannot be undone.")).toBeDefined();
		expect(screen.getByText("Cancel")).toBeDefined();
		expect(screen.getByText("Continue")).toBeDefined();
	});

	it("should render AlertDialogTitle with custom className", () => {
		render(
			<AlertDialog open={true}>
				<AlertDialogContent>
					<AlertDialogTitle className="custom-title" data-testid="custom-title">
						Custom Title
					</AlertDialogTitle>
				</AlertDialogContent>
			</AlertDialog>,
		);

		const title = screen.getByTestId("custom-title");
		expect(title.className).toContain("custom-title");
	});

	it("should render AlertDialogDescription with custom className", () => {
		render(
			<AlertDialog open={true}>
				<AlertDialogContent>
					<AlertDialogDescription className="custom-desc" data-testid="custom-desc">
						Custom Description
					</AlertDialogDescription>
				</AlertDialogContent>
			</AlertDialog>,
		);

		const description = screen.getByTestId("custom-desc");
		expect(description.className).toContain("custom-desc");
	});

	it("should render AlertDialogAction with custom className", () => {
		render(
			<AlertDialog open={true}>
				<AlertDialogContent>
					<AlertDialogAction className="custom-action" data-testid="custom-action">
						Custom Action
					</AlertDialogAction>
				</AlertDialogContent>
			</AlertDialog>,
		);

		const action = screen.getByTestId("custom-action");
		expect(action.className).toContain("custom-action");
	});

	it("should render AlertDialogCancel with custom className", () => {
		render(
			<AlertDialog open={true}>
				<AlertDialogContent>
					<AlertDialogCancel className="custom-cancel" data-testid="custom-cancel">
						Custom Cancel
					</AlertDialogCancel>
				</AlertDialogContent>
			</AlertDialog>,
		);

		const cancel = screen.getByTestId("custom-cancel");
		expect(cancel.className).toContain("custom-cancel");
	});

	it("should render AlertDialogHeader with custom className", () => {
		render(
			<AlertDialog open={true}>
				<AlertDialogContent>
					<AlertDialogHeader className="custom-header" data-testid="custom-header">
						<AlertDialogTitle>Title</AlertDialogTitle>
					</AlertDialogHeader>
				</AlertDialogContent>
			</AlertDialog>,
		);

		const header = screen.getByTestId("custom-header");
		expect(header.className).toContain("custom-header");
	});

	it("should render AlertDialogFooter with custom className", () => {
		render(
			<AlertDialog open={true}>
				<AlertDialogContent>
					<AlertDialogFooter className="custom-footer" data-testid="custom-footer">
						<button>OK</button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>,
		);

		const footer = screen.getByTestId("custom-footer");
		expect(footer.className).toContain("custom-footer");
	});

	it("should render AlertDialogOverlay", () => {
		render(
			<AlertDialog open={true}>
				<AlertDialogPortal>
					<AlertDialogOverlay data-testid="alert-overlay" />
				</AlertDialogPortal>
			</AlertDialog>,
		);

		expect(screen.getByTestId("alert-overlay")).toBeDefined();
	});

	it("should render AlertDialogOverlay with custom className", () => {
		render(
			<AlertDialog open={true}>
				<AlertDialogPortal>
					<AlertDialogOverlay className="custom-overlay" data-testid="custom-overlay" />
				</AlertDialogPortal>
			</AlertDialog>,
		);

		const overlay = screen.getByTestId("custom-overlay");
		expect(overlay.className).toContain("custom-overlay");
	});

	it("should render AlertDialogContent with custom className", () => {
		render(
			<AlertDialog open={true}>
				<AlertDialogContent className="custom-content" data-testid="custom-content">
					<AlertDialogTitle>Title</AlertDialogTitle>
				</AlertDialogContent>
			</AlertDialog>,
		);

		const content = screen.getByTestId("custom-content");
		expect(content.className).toContain("custom-content");
	});

	it("should render complete AlertDialog structure", () => {
		render(
			<AlertDialog open={true}>
				<AlertDialogTrigger>Open Alert</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete File?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete the file. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction>Delete</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>,
		);

		expect(screen.getByText("Delete File?")).toBeDefined();
		expect(screen.getByText("This will permanently delete the file. This action cannot be undone.")).toBeDefined();
		expect(screen.getByText("Cancel")).toBeDefined();
		expect(screen.getByText("Delete")).toBeDefined();
	});
});
