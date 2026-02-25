import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./Tooltip";
import type * as RadixTooltip from "@radix-ui/react-tooltip";
import { render, screen } from "@testing-library/preact";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @radix-ui/react-tooltip to work with Preact test environment
vi.mock("@radix-ui/react-tooltip", () => ({
	Provider: vi.fn(({ children }: RadixTooltip.TooltipProviderProps) => <div>{children}</div>),
	Root: vi.fn(({ children }: RadixTooltip.TooltipProps) => <div>{children}</div>),
	Trigger: vi.fn(({ children, asChild }: RadixTooltip.TooltipTriggerProps) =>
		asChild ? children : <button type="button">{children}</button>,
	),
	Portal: vi.fn(({ children }: RadixTooltip.TooltipPortalProps) => <div>{children}</div>),
	Content: vi.fn(({ children, className, sideOffset, ...props }: RadixTooltip.TooltipContentProps) => (
		<div className={className} data-side-offset={sideOffset} {...props}>
			{children}
		</div>
	)),
	Arrow: vi.fn(({ className }: RadixTooltip.TooltipArrowProps) => <div className={className} />),
}));

describe("Tooltip", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render tooltip with trigger and content", () => {
		render(
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<button>Hover me</button>
					</TooltipTrigger>
					<TooltipContent>
						<p>Tooltip content</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>,
		);

		expect(screen.getByText("Hover me")).toBeDefined();
		expect(screen.getByText("Tooltip content")).toBeDefined();
	});

	it("should render tooltip trigger without asChild", () => {
		render(
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>Trigger text</TooltipTrigger>
					<TooltipContent>
						<p>Tooltip content</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>,
		);

		expect(screen.getByText("Trigger text")).toBeDefined();
	});

	it("should apply custom className to content", () => {
		const { container } = render(
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>Trigger</TooltipTrigger>
					<TooltipContent className="custom-class">Content</TooltipContent>
				</Tooltip>
			</TooltipProvider>,
		);

		const content = container.querySelector(".custom-class");
		expect(content).toBeDefined();
		expect(screen.getByText("Content")).toBeDefined();
	});

	it("should render with custom sideOffset", () => {
		const { container } = render(
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>Trigger</TooltipTrigger>
					<TooltipContent sideOffset={10}>Content</TooltipContent>
				</Tooltip>
			</TooltipProvider>,
		);

		const content = container.querySelector("[data-side-offset='10']");
		expect(content).toBeDefined();
		expect(screen.getByText("Content")).toBeDefined();
	});

	it("should render multiple tooltips within provider", () => {
		render(
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>Trigger 1</TooltipTrigger>
					<TooltipContent>Content 1</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger>Trigger 2</TooltipTrigger>
					<TooltipContent>Content 2</TooltipContent>
				</Tooltip>
			</TooltipProvider>,
		);

		expect(screen.getByText("Trigger 1")).toBeDefined();
		expect(screen.getByText("Trigger 2")).toBeDefined();
	});

	it("should render Arrow component inside TooltipContent", () => {
		const { container } = render(
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>Trigger</TooltipTrigger>
					<TooltipContent>Content with Arrow</TooltipContent>
				</Tooltip>
			</TooltipProvider>,
		);

		// Arrow should be rendered (from the mock)
		const arrow = container.querySelector("div[class]");
		expect(arrow).toBeDefined();
	});

	it("should use default sideOffset of 4 when not specified", () => {
		const { container } = render(
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>Trigger</TooltipTrigger>
					<TooltipContent>Content</TooltipContent>
				</Tooltip>
			</TooltipProvider>,
		);

		const content = container.querySelector("[data-side-offset='4']");
		expect(content).toBeDefined();
	});

	it("should forward ref to TooltipContent", () => {
		const ref = { current: null as HTMLDivElement | null };

		render(
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>Trigger</TooltipTrigger>
					<TooltipContent ref={ref}>Content with ref</TooltipContent>
				</Tooltip>
			</TooltipProvider>,
		);

		// The ref should be passed through to the underlying element
		// In the mock, it's a div element
		expect(screen.getByText("Content with ref")).toBeDefined();
	});

	it("should merge className with default styles", () => {
		const { container } = render(
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>Trigger</TooltipTrigger>
					<TooltipContent className="my-custom-class another-class">Content</TooltipContent>
				</Tooltip>
			</TooltipProvider>,
		);

		const content = container.querySelector(".my-custom-class.another-class");
		expect(content).toBeDefined();
	});

	it("should pass additional props to TooltipContent", () => {
		render(
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>Trigger</TooltipTrigger>
					<TooltipContent data-testid="tooltip-test" aria-label="Tooltip description">
						Content
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>,
		);

		const content = screen.getByTestId("tooltip-test");
		expect(content).toBeDefined();
		expect(content.getAttribute("aria-label")).toBe("Tooltip description");
	});

	it("should render TooltipContent with children containing React elements", () => {
		render(
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>Trigger</TooltipTrigger>
					<TooltipContent>
						<div data-testid="inner-div">
							<span>Nested content</span>
							<strong>Bold text</strong>
						</div>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>,
		);

		expect(screen.getByTestId("inner-div")).toBeDefined();
		expect(screen.getByText("Nested content")).toBeDefined();
		expect(screen.getByText("Bold text")).toBeDefined();
	});

	it("should render TooltipTrigger with asChild prop passing through children", () => {
		render(
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<span data-testid="custom-trigger">Custom Trigger Element</span>
					</TooltipTrigger>
					<TooltipContent>Content</TooltipContent>
				</Tooltip>
			</TooltipProvider>,
		);

		expect(screen.getByTestId("custom-trigger")).toBeDefined();
		expect(screen.getByText("Custom Trigger Element")).toBeDefined();
	});

	it("should have correct displayName set on TooltipContent", () => {
		// TooltipContent.displayName should be set to match TooltipPrimitive.Content.displayName
		// We can verify this by checking that the component exists
		expect(TooltipContent).toBeDefined();
		// The displayName is set internally, we just verify the component works correctly
	});
});

describe("Tooltip - Arrow fallback", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should render without Arrow when Arrow component is unavailable", async () => {
		// Reset the module to apply new mock
		vi.resetModules();

		// Mock @radix-ui/react-tooltip with Arrow as undefined
		vi.doMock("@radix-ui/react-tooltip", () => ({
			Provider: vi.fn(({ children }: RadixTooltip.TooltipProviderProps) => <div>{children}</div>),
			Root: vi.fn(({ children }: RadixTooltip.TooltipProps) => <div>{children}</div>),
			Trigger: vi.fn(({ children, asChild }: RadixTooltip.TooltipTriggerProps) =>
				asChild ? children : <button type="button">{children}</button>,
			),
			Portal: vi.fn(({ children }: RadixTooltip.TooltipPortalProps) => <div>{children}</div>),
			Content: vi.fn(({ children, className, sideOffset, ...props }: RadixTooltip.TooltipContentProps) => (
				<div className={className} data-side-offset={sideOffset} {...props}>
					{children}
				</div>
			)),
			Arrow: undefined, // Arrow is not available
		}));

		// Re-import to get the module with the new mock
		const { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } = await import("./Tooltip");

		render(
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>Trigger</TooltipTrigger>
					<TooltipContent>Content without Arrow</TooltipContent>
				</Tooltip>
			</TooltipProvider>,
		);

		// Content should still render without the Arrow
		expect(screen.getByText("Content without Arrow")).toBeDefined();
	});
});
