import { Skeleton } from "./Skeleton";
import { render, screen } from "@testing-library/preact";
import { describe, expect, it } from "vitest";

describe("Skeleton", () => {
	it("should render skeleton", () => {
		render(<Skeleton data-testid="skeleton" />);

		expect(screen.getByTestId("skeleton")).toBeDefined();
	});

	it("should render skeleton with custom className", () => {
		render(<Skeleton className="custom-skeleton" data-testid="custom-skeleton" />);

		const skeleton = screen.getByTestId("custom-skeleton");
		expect(skeleton.className).toContain("custom-skeleton");
		expect(skeleton.className).toContain("animate-pulse");
	});

	it("should render skeleton with custom height", () => {
		render(<Skeleton className="h-20" data-testid="height-skeleton" />);

		const skeleton = screen.getByTestId("height-skeleton");
		expect(skeleton.className).toContain("h-20");
	});

	it("should render skeleton with custom width", () => {
		render(<Skeleton className="w-full" data-testid="width-skeleton" />);

		const skeleton = screen.getByTestId("width-skeleton");
		expect(skeleton.className).toContain("w-full");
	});

	it("should render multiple skeletons", () => {
		render(
			<div>
				<Skeleton className="h-4 w-3/4 mb-2" data-testid="skeleton-1" />
				<Skeleton className="h-4 w-1/2" data-testid="skeleton-2" />
			</div>,
		);

		expect(screen.getByTestId("skeleton-1")).toBeDefined();
		expect(screen.getByTestId("skeleton-2")).toBeDefined();
	});
});
