import { DashboardCard } from "./DashboardCard";
import { render, screen } from "@testing-library/preact";
import { Clock } from "lucide-react";
import { describe, expect, it } from "vitest";

describe("DashboardCard", () => {
	it("should render title and children", () => {
		render(
			<DashboardCard title="Test Card">
				<div>Test Content</div>
			</DashboardCard>,
		);

		expect(screen.getByText("Test Card")).toBeDefined();
		expect(screen.getByText("Test Content")).toBeDefined();
	});

	it("should render with icon", () => {
		const { container } = render(
			<DashboardCard title="Test Card" icon={Clock}>
				<div>Test Content</div>
			</DashboardCard>,
		);

		expect(container.querySelector("svg")).toBeDefined();
	});

	it("should render with action element", () => {
		const action = <button type="button">Action</button>;

		render(
			<DashboardCard title="Test Card" action={action}>
				<div>Test Content</div>
			</DashboardCard>,
		);

		expect(screen.getByText("Action")).toBeDefined();
	});

	it("should apply custom className", () => {
		const { container } = render(
			<DashboardCard title="Test Card" className="custom-class">
				<div>Test Content</div>
			</DashboardCard>,
		);

		const card = container.querySelector(".custom-class");
		expect(card).toBeDefined();
	});

	it("should render without icon", () => {
		const { container } = render(
			<DashboardCard title="Test Card">
				<div>Test Content</div>
			</DashboardCard>,
		);

		// Should have no icon wrapper
		const iconWrapper = container.querySelector(".w-10.h-10.rounded-full");
		expect(iconWrapper).toBeNull();
	});
});
